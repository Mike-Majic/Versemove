import { supabase } from './supabaseClient';
import { continentOfCountry } from './geo';

// Utenti veri sui marker rotondi del globo (al posto di MOCK_USERS, vuoto):
// RPC globe_users(p_mondo) sul database. La posizione è SOLO il centro
// della città pubblica del profilo (citta_social, quando coincide con la
// città scelta dall'elenco GeoNames), mai la posizione reale; niente
// utenti nel mondo Bambini. Serve essere loggati (come public_profiles).
//
// Chi sta nella stessa città ha le stesse coordinate (il centro della
// città): niente scostamenti casuali, che sulle città di costa potevano
// finire in mare. Da vicino il raggruppamento del globo li apre a
// ventaglio (vedi clusterUsers in WorldGlobe).

let regionNames = null;
function countryName(code) {
  if (!code) return '';
  try {
    regionNames ??= new Intl.DisplayNames(['it'], { type: 'region' });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export async function fetchGlobeUsers(mondo) {
  const { data, error } = await supabase.rpc('globe_users', { p_mondo: mondo });
  if (error || !Array.isArray(data)) return [];
  return data
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .map((r) => ({
      id: r.id,
      name: r.nickname || 'Utente',
      avatar: r.avatar_url || '',
      city: r.citta || '',
      country: countryName(r.paese),
      // Per i filtri "Continente" / "Regione" delle Impostazioni: la regione
      // vale sia come regione italiana (GeoNames la dà già in italiano) sia
      // come nome del paese (le voci estere del filtro sono paesi).
      continent: continentOfCountry(r.paese),
      regions: [r.regione, countryName(r.paese)].filter(Boolean),
      cityLat: r.lat,
      cityLng: r.lng,
      gender: r.genere || '',
      bio: r.bio || '',
      lat: r.lat,
      lng: r.lng,
      fromDb: true,
    }));
}
