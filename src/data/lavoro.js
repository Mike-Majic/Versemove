import { supabase } from './supabaseClient';

// Consenso al mondo Lavoro (bianco): dentro Lavoro nome e cognome reali
// diventano visibili agli altri utenti di Lavoro (aziende e candidati), a
// differenza di tutti gli altri mondi dove si vede solo il nickname — per
// questo serve un consenso esplicito, separato dai Termini generali, dato
// solo da chi è già maggiorenne (stesso requisito di can_access_world).
// Le tre RPC sotto sono già pronte lato server (migrazione
// nickname_required_lavoro_consent_match_recycle).

export async function hasLavoroConsent() {
  try {
    const { data, error } = await supabase.rpc('has_lavoro_consent');
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function setLavoroConsent(consenso) {
  try {
    const { error } = await supabase.rpc('set_lavoro_consent', { p_consenso: Boolean(consenso) });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Nome e cognome reali di alcuni profili, ma SOLO se entrambe le parti
// hanno dato il consenso Lavoro (lo garantisce la RPC lato server, non un
// filtro qui): per chi non ha consentito arriva comunque nickname/avatar,
// semplicemente senza nome/cognome, mai un errore che romperebbe la UI.
// Data di nascita completa (gg/mm/aaaa) ed età, per le aziende del mondo
// Lavoro: '' se la data non c'è (la RPC la manda solo agli account azienda).
export function lavoroBirthLabel(dataNascita, now = new Date()) {
  const m = String(dataNascita ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  return `${m[3]}/${m[2]}/${m[1]} · ${age} anni`;
}

export async function getLavoroProfiles(ids) {
  const unique = Array.from(new Set((ids ?? []).filter(Boolean)));
  if (!unique.length) return new Map();
  try {
    const { data, error } = await supabase.rpc('get_lavoro_profiles', { p_ids: unique });
    if (error || !data) return new Map();
    const map = new Map();
    for (const row of data) {
      map.set(row.id, {
        id: row.id,
        nickname: row.nickname,
        nome: row.nome || '',
        cognome: row.cognome || '',
        avatar: row.avatar_url || '',
        citta: row.citta || '',
        tipoAccount: row.tipo_account,
        ragioneSociale: row.ragione_sociale || '',
        // Solo per chi chiama da account azienda (per tutti gli altri null).
        dataNascita: row.data_nascita ?? null,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

// --- Cerca candidati (aziende verificate) ----------------------------------
// Il server decide chi può cercare (is_lavoro_recruiter: azienda verificata o
// owner) e chi compare (candidati con "Visibile alle aziende" acceso e
// consenso Lavoro): qui solo le chiamate e la forma dei dati.

export const TITOLI_STUDIO = [
  { id: 'licenza_media', label: 'Licenza media' },
  { id: 'diploma_superiore', label: 'Diploma superiore' },
  { id: 'laurea_triennale', label: 'Laurea triennale' },
  { id: 'laurea_magistrale', label: 'Laurea magistrale' },
  { id: 'master', label: 'Master' },
  { id: 'dottorato', label: 'Dottorato' },
];

export function titoloStudioLabel(id) {
  return TITOLI_STUDIO.find((t) => t.id === id)?.label ?? id ?? '';
}

// "aaaa-mm-gg" -> "gg/mm/aaaa" ('' se manca).
export function formatDataIt(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function mapCandidato(row) {
  return {
    id: row.id,
    nome: row.nome ?? '',
    cognome: row.cognome ?? '',
    avatar: row.avatar_url ?? '',
    citta: row.citta ?? '',
    paese: row.paese ?? '',
    distanzaKm: row.distanza_km ?? null,
    dataNascita: row.data_nascita ?? null,
    eta: row.eta ?? null,
    titoloStudio: row.titolo_studio ?? '',
    lingueParlate: row.lingue_parlate ?? [],
    bio: row.bio ?? '',
    ultimaPosizione: row.ultima_posizione ?? '',
    ultimaAzienda: row.ultima_azienda ?? '',
    anniEsperienza: row.anni_esperienza ?? null,
    haCv: Boolean(row.ha_cv),
    lastSeenAt: row.last_seen_at ?? null,
  };
}

export const CANDIDATI_PAGE_SIZE = 30;

// filtri: { q, geonameId, raggioKm, titoloMin, lingue, esperienzaMin, soloConCv }
export async function cercaCandidati(filtri, offset = 0) {
  try {
    const { data, error } = await supabase.rpc('cerca_candidati_lavoro', {
      p_q: filtri.q?.trim() || null,
      p_geoname_id: filtri.geonameId ?? null,
      p_raggio_km: filtri.raggioKm ?? 50,
      p_titolo_min: filtri.titoloMin || null,
      p_lingue: filtri.lingue?.length ? filtri.lingue : null,
      p_esperienza_min: filtri.esperienzaMin === '' || filtri.esperienzaMin == null ? null : Number(filtri.esperienzaMin),
      p_solo_con_cv: Boolean(filtri.soloConCv),
      p_limit: CANDIDATI_PAGE_SIZE,
      p_offset: offset,
    });
    if (error) return { error: error.message, rows: [], totale: 0 };
    const rows = data ?? [];
    return { rows: rows.map(mapCandidato), totale: rows.length ? Number(rows[0].totale) : offset };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.', rows: [], totale: 0 };
  }
}

// Scheda completa di un candidato. OGNI chiamata viene registrata dal server
// (lavoro_candidati_viste): chiamarla solo quando l'azienda apre la scheda.
export async function getCandidato(id) {
  try {
    const { data, error } = await supabase.rpc('get_candidato_lavoro', { p_id: id });
    if (error) return { error: error.message };
    const d = data ?? {};
    return {
      candidato: {
        ...mapCandidato(d),
        email: d.email ?? '',
        telefono: d.telefono ?? '',
        telefonoSecondario: d.telefono_secondario ?? '',
        cv: d.cv?.path ? { name: d.cv.name ?? 'Curriculum', path: d.cv.path } : null,
        esperienze: (d.esperienze ?? []).map((e) => ({
          azienda: e.azienda ?? '',
          posizione: e.posizione ?? '',
          citta: e.citta ?? '',
          descrizione: e.descrizione ?? '',
          annoDa: e.anno_da ?? null,
          annoA: e.anno_a ?? null,
          attuale: Boolean(e.attuale),
        })),
      },
    };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Curriculum nel bucket privato "attachments": link firmato valido 60 s.
export async function candidatoCvUrl(path) {
  try {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 60);
    if (error || !data?.signedUrl) return { error: error?.message ?? 'Curriculum non disponibile.' };
    return { url: data.signedUrl };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Lato candidato: "Visibile alle aziende (cerco lavoro)". Il server rifiuta
// se manca il consenso Lavoro, col suo messaggio.
export async function setOwnLavoroVisibilita(visibile) {
  try {
    const { error } = await supabase.rpc('set_own_lavoro_visibilita', { p_visibile: Boolean(visibile) });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// --- Verifica azienda (partita IVA sul registro europeo VIES) --------------
// richiedi_verifica_azienda avvia il controllo (stato 'in_corso'),
// esito_verifica_azienda ne legge il risultato: { stato, nome_registro, ... }.

export async function richiediVerificaAzienda() {
  try {
    const { data, error } = await supabase.rpc('richiedi_verifica_azienda');
    if (error) return { error: error.message };
    return { esito: data ?? null };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function esitoVerificaAzienda() {
  try {
    const { data, error } = await supabase.rpc('esito_verifica_azienda');
    if (error) return { error: error.message };
    return { esito: data ?? null };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export function aziendaVerificaTesto(stato, nomeRegistro) {
  switch (stato) {
    case 'verificata':
      return 'Azienda verificata';
    case 'in_corso':
      return 'Controllo in corso...';
    case 'nome_diverso':
      return `La ragione sociale non coincide con il registro: ${nomeRegistro || '—'}. Correggila o attendi la verifica manuale.`;
    case 'da_controllare':
      return 'Partita IVA attiva, in attesa di verifica manuale.';
    case 'non_valida':
      return 'Partita IVA non trovata nel registro europeo VIES.';
    case 'piva_gia_usata':
      return 'Questa partita IVA è già collegata a un altro account.';
    case 'formato_non_valido':
      return 'Formato della partita IVA non valido.';
    case 'riprova':
      return 'Registro non raggiungibile, riprova tra poco.';
    default:
      return '';
  }
}
