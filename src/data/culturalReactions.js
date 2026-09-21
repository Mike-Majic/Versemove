import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Reazioni "Lo voglio vedere"/"Mi è piaciuto" condivise da Cinema (film
// TMDB, identificati da movie_id) e dagli eventi caricati dalla community
// (Teatro, Arte, Live — community_events, identificati dal loro id): stessa
// forma dei dati (chi ha reagito, cosa), così i componenti che li mostrano
// non devono sapere da dove viene l'elemento. Pubbliche (select true) per
// vedere chi altro ha reagito e poterlo contattare per andarci insieme.
async function getReactionsSummary(table, idColumn, ids) {
  if (!ids.length) return new Map();
  try {
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth?.user?.id ?? null;
    const { data, error } = await supabase.from(table).select(`${idColumn}, owner_id, reazione`).in(idColumn, ids);
    if (error || !data) return new Map();
    const profilesMap = await fetchProfilesMap(data.map((r) => r.owner_id));
    const map = new Map();
    for (const row of data) {
      const key = row[idColumn];
      if (!map.has(key)) map.set(key, { vuole: [], piaciuto: [], myReactions: new Set() });
      const entry = map.get(key);
      const person = profilesMap.get(row.owner_id) ?? { id: row.owner_id, name: 'Utente', avatar: '' };
      entry[row.reazione].push(person);
      if (row.owner_id === myId) entry.myReactions.add(row.reazione);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function toggleReaction(table, idColumn, id, reazione, currentlyActive) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    if (currentlyActive) {
      const { error } = await supabase.from(table).delete().eq(idColumn, id).eq('owner_id', auth.user.id).eq('reazione', reazione);
      if (error) return { error: error.message };
      return { active: false };
    }
    const { error } = await supabase.from(table).insert({ [idColumn]: id, owner_id: auth.user.id, reazione });
    if (error) return { error: error.message };
    return { active: true };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export const getTmdbReactionsSummary = (movieIds) => getReactionsSummary('tmdb_reactions', 'movie_id', movieIds);
export const toggleTmdbReaction = (movieId, reazione, currentlyActive) =>
  toggleReaction('tmdb_reactions', 'movie_id', movieId, reazione, currentlyActive);

export const getCommunityReactionsSummary = (eventIds) => getReactionsSummary('community_event_reactions', 'event_id', eventIds);
export const toggleCommunityReaction = (eventId, reazione, currentlyActive) =>
  toggleReaction('community_event_reactions', 'event_id', eventId, reazione, currentlyActive);
