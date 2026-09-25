import { supabase } from './supabaseClient';

// Città con coordinate (tabella citta da GeoNames, RPC cerca_citta): serve
// al filtro "Dove" delle Impostazioni e ai form che chiedono una città
// (eventi e annunci Cosplay). Una riga: { geonameId, nome, nomeMostrato,
// regione, paese (ISO-2), lat, lng, popolazione }.
export const CITY_MIN_CHARS = 2;
export const CITY_DEBOUNCE_MS = 250;
export const CITY_DATA_CREDIT = 'Dati città: GeoNames (CC BY 4.0)';

function mapCity(row) {
  return {
    geonameId: row.geoname_id,
    nome: row.nome,
    nomeMostrato: row.nome_mostrato ?? row.nome,
    regione: row.regione ?? '',
    paese: (row.paese ?? '').trim(),
    lat: row.lat,
    lng: row.lng,
    popolazione: row.popolazione ?? 0,
  };
}

export async function searchCities(q, { paese = null, limit = 8, signal } = {}) {
  const clean = String(q ?? '').trim();
  if (clean.length < CITY_MIN_CHARS) return [];
  try {
    let query = supabase.rpc('cerca_citta', { q: clean, p_paese: paese, p_limit: limit });
    if (signal && typeof query.abortSignal === 'function') query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) return [];
    return (data ?? []).map(mapCity);
  } catch {
    return [];
  }
}

// Città del profilo (profiles.citta_geoname_id), solo da loggati: gli
// errori non bloccano nulla, il filtro locale resta valido lo stesso.
export async function setMyCittaGeo(geonameId) {
  try {
    const { error } = await supabase.rpc('set_my_citta_geo', { p_geoname_id: geonameId ?? null });
    return error ? { error: error.message } : {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

let displayNames = null;
export function countryName(code) {
  const c = String(code ?? '').trim().toUpperCase();
  if (!c) return '';
  try {
    displayNames = displayNames ?? new Intl.DisplayNames(['it'], { type: 'region' });
    return displayNames.of(c) ?? c;
  } catch {
    return c;
  }
}

// 🇮🇹 dal codice ISO-2 (due lettere → due "regional indicator").
export function countryFlag(code) {
  const c = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// Il filtro "Dove" salvato in rb-location-filters: la città vale per la
// distanza solo se ha le coordinate (quelle vecchie, solo testo, no).
export function locationHasCoords(filters) {
  return Boolean(filters?.city) && Number.isFinite(filters?.lat) && Number.isFinite(filters?.lng);
}
