import { supabase } from './supabaseClient';
import { translateInteractionError } from './errors';
import { displayName } from './posts';

// Backend reale del mondo Incontri (RPC dedicate, vedi le funzioni SQL
// corrispondenti — is_incontri_eligible richiede mondo "incontri" abilitato
// e 18+, come isAdult()/mondiAbilitati lato client). Le RPC rispondono già
// in italiano sugli errori attesi, qui va solo evitato di lasciar passare
// un errore di rete grezzo.
function mapProfileRow(row) {
  return {
    id: row.id,
    name: displayName(row),
    avatar: row.avatar_url || `https://i.pravatar.cc/150?u=${row.id}`,
    age: row.eta ?? null,
    city: row.citta || '',
    bio: row.bio || '',
    attivita: row.attivita ?? null,
    giaVisto: Boolean(row.gia_visto),
  };
}

// Chiamata periodica (App.jsx: al login, ogni 2 minuti a pagina visibile, e
// quando torna visibile) per aggiornare profiles.last_seen_at, da cui le
// RPC sotto derivano il campo "attivita" (online/oggi/questa_settimana) di
// ogni profilo mostrato in Incontri.
export async function touchLastSeen() {
  try {
    const { error } = await supabase.rpc('touch_last_seen');
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// I filtri passati sono quelli attivi dell'utente (Impostazioni -> Luogo e
// Mostrami: città ed età), passati come parametri RPC così il database
// filtra anche il secondo giro (i profili "passo" recuperati quando i mai
// visti finiscono) e non solo i primi p_limit mai visti — se restassero
// lato client, il limite di 20 righe potrebbe tagliare fuori risultati
// validi della zona scelta.
export async function getMatchCandidates(limit = 20, { citta, etaMin, etaMax } = {}) {
  try {
    const { data, error } = await supabase.rpc('get_match_candidates', {
      p_limit: limit,
      p_citta: citta || null,
      p_eta_min: etaMin ?? null,
      p_eta_max: etaMax ?? null,
    });
    if (error) return { error: error.message };
    return { candidates: (data ?? []).map(mapProfileRow) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// true = è nato un match reciproco: chi chiama deve mostrare il toast solo
// in quel caso, non ad ogni "mi piace".
export async function recordSwipe(targetId, decisione) {
  try {
    const { data, error } = await supabase.rpc('record_swipe', { p_target_id: targetId, p_decisione: decisione });
    if (error) return { error: error.message };
    return { matched: Boolean(data) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function getLikesReceived() {
  try {
    const { data, error } = await supabase.rpc('get_likes_received');
    if (error) return { error: error.message };
    return {
      likes: (data ?? []).map((row) => ({ ...mapProfileRow(row), super: Boolean(row.super), createdAt: row.created_at })),
    };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function getMyMatches() {
  try {
    const { data, error } = await supabase.rpc('get_my_matches');
    if (error) return { error: error.message };
    return { matches: (data ?? []).map((row) => ({ ...mapProfileRow(row), matchedAt: row.matched_at })) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function getMyFavorites() {
  try {
    const { data, error } = await supabase.rpc('get_my_favorites');
    if (error) return { error: error.message };
    return { favorites: (data ?? []).map(mapProfileRow) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function unmatch(otherId) {
  try {
    const { error } = await supabase.rpc('unmatch', { p_other: otherId });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function updateOwnDatingProfile(citta, bio) {
  try {
    const { error } = await supabase.rpc('update_own_dating_profile', { p_citta: citta, p_bio: bio });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Preferiti: nessuna RPC dedicata, insert/delete diretti su match_favorites
// (RLS: solo le proprie righe, e solo su profili idonei/non bloccati per
// l'insert — un tentativo su un profilo non più disponibile arriva come un
// generico errore di row-level security, qui tradotto).
export async function addFavorite(favoriteId) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error } = await supabase.from('match_favorites').insert({ user_id: auth.user.id, favorite_id: favoriteId });
    if (error) return { error: translateInteractionError(error) };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function removeFavorite(favoriteId) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error } = await supabase
      .from('match_favorites')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('favorite_id', favoriteId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Canale realtime per i propri match (RLS di "matches" limita già alle
// righe dove si è user_a o user_b): notifica ogni nuovo match, anche quello
// creato dallo swipe reciproco dell'altra persona mentre non si è nella
// scheda "Mi piaci a...".
export function subscribeToOwnMatches(onInsert) {
  return supabase
    .channel('matches-own')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (payload) => onInsert(payload.new))
    .subscribe();
}
