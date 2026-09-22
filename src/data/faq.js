import { supabase } from './supabaseClient';
import { fetchProfilesMap, displayName } from './posts';

// Mondo FAQ (nero): Stanza MOD (chat interna staff), Segnalazioni (vedi
// anche data/reports.js, già esistente e riusato qui), Suggerimenti (voto
// della community) e Informazioni (guida dell'app). Backend Supabase
// (mod_room_messages/faq_suggestions/faq_suggestion_votes/faq_articles +
// viste faq_suggestion_stats, RLS) da Cowork — qui solo lettura/scrittura
// con i nomi già decisi. Come dogWorld.js/vetrinaDeals.js: finché le
// tabelle non esistono le funzioni sotto restituiscono liste vuote/errori
// gestiti, mai un'eccezione.

// --- Stanza MOD (solo owner/moderatori, la RLS lo impone comunque anche
// se questo file venisse chiamato da chi non ha i permessi) ---

function mapModRoomMessage(row, profilesMap) {
  const author = profilesMap.get(row.author_id);
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: displayName(author, 'Utente'),
    authorAvatar: author?.avatar ?? '',
    testo: row.testo,
    riferimentoTipo: row.riferimento_tipo,
    riferimentoId: row.riferimento_id,
    data: row.created_at,
  };
}

export async function listModRoomMessages() {
  const { data, error } = await supabase
    .from('mod_room_messages')
    .select('id, author_id, testo, riferimento_tipo, riferimento_id, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  const profilesMap = await fetchProfilesMap(data.map((r) => r.author_id));
  return data.map((row) => mapModRoomMessage(row, profilesMap));
}

export async function sendModRoomMessage({ testo, riferimentoTipo, riferimentoId } = {}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato.' };
  if (!testo?.trim()) return { error: 'Scrivi un messaggio.' };
  const { error } = await supabase.from('mod_room_messages').insert({
    author_id: auth.user.id,
    testo: testo.trim(),
    riferimento_tipo: riferimentoTipo ?? null,
    riferimento_id: riferimentoId ? String(riferimentoId) : null,
  });
  if (error) return { error: error.message };
  return {};
}

export function subscribeToModRoomMessages(onInsert) {
  return supabase
    .channel('mod-room-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mod_room_messages' }, (payload) => onInsert(payload.new))
    .subscribe();
}

// --- Suggerimenti (idee della community, votabili) ---

function mapSuggestion(row, statsByRow, myVotes) {
  const stats = statsByRow?.get(row.id);
  return {
    id: row.id,
    titolo: row.titolo,
    testo: row.testo,
    mondo: row.mondo,
    stato: row.stato,
    rispostaStaff: row.risposta_staff,
    authorId: row.author_id,
    data: row.created_at,
    voti: stats?.n_voti ?? 0,
    hoVotato: myVotes?.has(row.id) ?? false,
  };
}

const SUGGESTION_ORDER = {
  votati: null, // riordinato lato client dopo aver unito le stats, vedi sotto
  recenti: 'created_at',
};

export async function listFaqSuggestions({ ordinamento = 'votati', stato } = {}) {
  let query = supabase.from('faq_suggestions').select('*');
  if (stato) query = query.eq('stato', stato);
  const orderColumn = SUGGESTION_ORDER[ordinamento];
  if (orderColumn) query = query.order(orderColumn, { ascending: false });

  const { data, error } = await query;
  if (error || !data) return [];

  const ids = data.map((r) => r.id);
  const [statsByRow, myVotes] = await Promise.all([fetchSuggestionStats(ids), fetchMySuggestionVotes(ids)]);
  const list = data.map((row) => mapSuggestion(row, statsByRow, myVotes));
  if (ordinamento === 'votati') list.sort((a, b) => b.voti - a.voti);
  return list;
}

async function fetchSuggestionStats(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data, error } = await supabase.from('faq_suggestion_stats').select('suggestion_id, n_voti').in('suggestion_id', ids);
  if (error || !data) return map;
  data.forEach((row) => map.set(row.suggestion_id, { n_voti: row.n_voti }));
  return map;
}

async function fetchMySuggestionVotes(ids) {
  const set = new Set();
  if (!ids.length) return set;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return set;
  const { data, error } = await supabase
    .from('faq_suggestion_votes')
    .select('suggestion_id')
    .eq('user_id', auth.user.id)
    .in('suggestion_id', ids);
  if (error || !data) return set;
  data.forEach((row) => set.add(row.suggestion_id));
  return set;
}

export async function createFaqSuggestion({ titolo, testo, mondo }) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per proporre un suggerimento.' };
  if (!titolo?.trim()) return { error: 'Manca il titolo.' };
  const { data, error } = await supabase
    .from('faq_suggestions')
    .insert({ author_id: auth.user.id, titolo: titolo.trim(), testo: testo?.trim() || null, mondo: mondo || null, stato: 'aperto' })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

// Voto 👍 semplice: un secondo click sullo stesso suggerimento lo toglie
// (come un like), niente voto negativo (richiesta della specifica).
export async function toggleFaqSuggestionVote(suggestionId, currentlyVoted) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per votare.' };
  if (currentlyVoted) {
    const { error } = await supabase
      .from('faq_suggestion_votes')
      .delete()
      .eq('suggestion_id', suggestionId)
      .eq('user_id', auth.user.id);
    if (error) return { error: error.message };
    return { voted: false };
  }
  const { error } = await supabase.from('faq_suggestion_votes').insert({ suggestion_id: suggestionId, user_id: auth.user.id });
  if (error) return { error: error.message };
  return { voted: true };
}

// Solo staff: lo impone la RLS, qui non serve controllare il ruolo.
export async function updateFaqSuggestionStatus(suggestionId, stato, rispostaStaff) {
  const patch = { stato };
  if (rispostaStaff !== undefined) patch.risposta_staff = rispostaStaff?.trim() || null;
  const { error } = await supabase.from('faq_suggestions').update(patch).eq('id', suggestionId);
  if (error) return { error: error.message };
  return {};
}

// --- Informazioni (guida dell'app) ---

function mapArticle(row) {
  return {
    id: row.id,
    sezione: row.sezione,
    titolo: row.titolo,
    corpo: row.corpo,
    ordine: row.ordine ?? 0,
    pubblicato: row.pubblicato !== false,
  };
}

// Chi non è staff vede solo gli articoli pubblicati (lo filtra comunque la
// RLS lato server): qui il filtro pubblicato=true è ridondante per un
// utente normale ma esplicito, per chiarezza del contratto della funzione.
export async function listFaqArticles({ includeUnpublished = false } = {}) {
  let query = supabase.from('faq_articles').select('*').order('sezione', { ascending: true }).order('ordine', { ascending: true });
  if (!includeUnpublished) query = query.eq('pubblicato', true);
  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(mapArticle);
}

export async function createFaqArticle({ sezione, titolo, corpo, ordine = 0 }) {
  const { data, error } = await supabase
    .from('faq_articles')
    .insert({ sezione, titolo, corpo, ordine, pubblicato: true })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function updateFaqArticle(articleId, patch) {
  const { error } = await supabase.from('faq_articles').update(patch).eq('id', articleId);
  if (error) return { error: error.message };
  return {};
}

export async function setFaqArticleVisibility(articleId, pubblicato) {
  return updateFaqArticle(articleId, { pubblicato });
}
