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
      });
    }
    return map;
  } catch {
    return new Map();
  }
}
