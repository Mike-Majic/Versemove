import { supabase } from './supabaseClient';

// Spazi sponsorizzati: nessuna rete esterna (AdSense ecc., serve un dominio
// proprio e un banner cookie completo, si valuta dopo il lancio), nessun
// tracciamento della persona — get_sponsorships esclude da sola i mondi
// Bambini/FAQ e le campagne "solo maggiorenni" per i minorenni, quindi qui
// non c'è altro filtro da rifare lato client. track_sponsorship incrementa
// solo contatori aggregati sulla campagna, non salva chi ha visto/cliccato.

// Converte la riga (snake_case) restituita da get_sponsorships nella forma
// camelCase che SponsorCard si aspetta.
function mapSponsorship(row) {
  return {
    id: row.id,
    titolo: row.titolo,
    testo: row.testo ?? '',
    immagine: row.immagine ?? null,
    url: row.url,
    inserzionista: row.inserzionista,
    formato: row.formato,
  };
}

// mondo/categoria/formato/citta sono gli stessi filtri della RPC (vedi
// firma get_sponsorships): categoria e citta facoltativi, limit di default
// 1 (una sola card per punto d'inserzione, mai un blocco di più campagne
// insieme).
export async function getSponsorships({ mondo, categoria = null, formato, citta = null, limit = 1 }) {
  const { data, error } = await supabase.rpc('get_sponsorships', {
    p_mondo: mondo,
    p_categoria: categoria,
    p_formato: formato,
    p_citta: citta,
    p_limit: limit,
  });
  if (error) {
    console.error('Errore nel caricare le campagne sponsorizzate', error);
    return [];
  }
  return (data ?? []).map(mapSponsorship);
}

// evento: 'view' (solo la prima volta che la card diventa davvero visibile,
// vedi SponsorCard/IntersectionObserver) o 'click'.
export async function trackSponsorship(id, evento) {
  const { error } = await supabase.rpc('track_sponsorship', { p_id: id, p_evento: evento });
  if (error) console.error('Errore nel registrare l\'evento sponsorizzazione', error);
}

// --- Pannello Backend (solo owner/moderatori, la RLS sponsorships_staff_write
// lo impone comunque): CRUD diretto sulla tabella, qui vediamo anche le
// campagne non ancora attive/scadute (get_sponsorships le nasconderebbe). ---

function mapSponsorshipAdmin(row) {
  return {
    id: row.id,
    mondo: row.mondo,
    categoria: row.categoria ?? '',
    formato: row.formato,
    titolo: row.titolo,
    testo: row.testo ?? '',
    immagine: row.immagine ?? '',
    url: row.url,
    inserzionista: row.inserzionista,
    citta: row.citta ?? '',
    raggioKm: row.raggio_km ?? '',
    soloMaggiorenni: row.solo_maggiorenni,
    peso: row.peso,
    inizio: row.inizio,
    fine: row.fine,
    stato: row.stato,
    visualizzazioni: row.visualizzazioni,
    clic: row.clic,
    createdAt: row.created_at,
  };
}

export async function listAllSponsorships() {
  const { data, error } = await supabase.from('sponsorships').select('*').order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(mapSponsorshipAdmin);
}

// fields è già in snake_case pronto per l'insert/update (vedi il form in
// AdminPanel): qui si limita a ripulire le stringhe vuote in null dove la
// colonna è nullable, senza reinventare la validazione già imposta dai
// CHECK del database (titolo/url/inserzionista ecc.).
function cleanFields(fields) {
  const out = { ...fields };
  ['categoria', 'testo', 'immagine', 'citta', 'fine'].forEach((k) => {
    if (out[k] === '') out[k] = null;
  });
  if (out.raggio_km === '' || out.raggio_km === null) out.raggio_km = null;
  else out.raggio_km = Number(out.raggio_km);
  out.peso = Number(out.peso) || 1;
  return out;
}

export async function createSponsorship(fields) {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('sponsorships')
    .insert({ ...cleanFields(fields), created_by: auth?.user?.id ?? null })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function updateSponsorship(id, fields) {
  const { error } = await supabase.from('sponsorships').update(cleanFields(fields)).eq('id', id);
  if (error) return { error: error.message };
  return {};
}
