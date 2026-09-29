import { supabase } from './supabaseClient';

// Utenti veri sui marker rotondi del globo (al posto di MOCK_USERS, vuoto):
// RPC globe_users(p_mondo) sul database. La posizione è SOLO il centro
// della città pubblica del profilo (citta_social, quando coincide con la
// città scelta dall'elenco GeoNames), mai la posizione reale; niente
// utenti nel mondo Bambini. Serve essere loggati (come public_profiles).
//
// Più persone nella stessa città avrebbero coordinate identiche e i marker
// finirebbero uno sopra l'altro quando il grumo della città si apre: un
// piccolo scostamento fisso (dall'id, ~5 km al massimo) li separa.
function jitter(id, salt) {
  let h = 2166136261 ^ salt;
  const s = String(id);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 0.09;
}

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
      gender: r.genere || '',
      bio: r.bio || '',
      lat: r.lat + jitter(r.id, 1),
      lng: r.lng + jitter(r.id, 2),
      fromDb: true,
    }));
}
