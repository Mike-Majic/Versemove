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

const MOD_ROOM_SELECT = 'id, author_id, testo, riferimento_tipo, riferimento_id, created_at, allegati, menzioni';
export const MOD_ROOM_PAGE = 50;

// Autori con nome, avatar e ruolo (OWNER/MOD): lo staff può leggere
// profiles per intero (profiles_select_own_or_staff), la vista pubblica non
// ha il ruolo. Piccola cache per i messaggi che arrivano da Realtime.
const staffCache = new Map();
async function fetchStaffProfiles(ids) {
  const missing = Array.from(new Set(ids.filter((id) => id && !staffCache.has(id))));
  if (missing.length) {
    const { data } = await supabase.from('profiles').select('id, nickname, username, avatar_url, ruolo').in('id', missing);
    (data ?? []).forEach((p) =>
      staffCache.set(p.id, { id: p.id, name: displayName(p, 'Utente'), avatar: p.avatar_url || '', ruolo: p.ruolo })
    );
    if (!data) {
      const fallback = await fetchProfilesMap(missing);
      fallback.forEach((p, id) => staffCache.set(id, { ...p, ruolo: null }));
    }
  }
  return staffCache;
}

function mapModRoomMessage(row, profiles) {
  const author = profiles.get(row.author_id);
  return {
    id: row.id,
    authorId: row.author_id,
    author: author ?? { id: row.author_id, name: 'Utente', avatar: '', ruolo: null },
    authorName: author?.name ?? 'Utente',
    authorAvatar: author?.avatar ?? '',
    testo: row.testo ?? '',
    allegati: Array.isArray(row.allegati) ? row.allegati : [],
    menzioni: row.menzioni ?? [],
    riferimentoTipo: row.riferimento_tipo,
    riferimentoId: row.riferimento_id,
    data: row.created_at,
  };
}

// Pagina di messaggi (i 50 più recenti, oppure i 50 prima di `before`), in
// ordine dal più vecchio. hasMore: ce ne sono ancora di più vecchi.
export async function listModRoomMessages({ before = null, limit = MOD_ROOM_PAGE } = {}) {
  let query = supabase
    .from('mod_room_messages')
    .select(MOD_ROOM_SELECT)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error || !data) return { messages: [], hasMore: false, error: error?.message };
  const page = data.slice(0, limit).reverse();
  const profiles = await fetchStaffProfiles(page.map((r) => r.author_id));
  return { messages: page.map((row) => mapModRoomMessage(row, profiles)), hasMore: data.length > limit };
}

// Riga arrivata da Realtime -> messaggio con l'autore risolto.
export async function resolveModRoomRow(row) {
  const profiles = await fetchStaffProfiles([row.author_id]);
  return mapModRoomMessage(row, profiles);
}

// testo può essere vuoto se ci sono allegati (es. un vocale). allegati:
// [{ tipo: 'immagine'|'audio'|'documento'|'video', path, nome, mime,
// dimensione, durata? }]; menzioni: id scelti col suggerimento "@".
export async function sendModRoomMessage({ testo = '', allegati = [], menzioni = [], riferimentoTipo, riferimentoId } = {}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato.' };
  if (!testo.trim() && !allegati.length) return { error: 'Scrivi un messaggio.' };
  const { data, error } = await supabase
    .from('mod_room_messages')
    .insert({
      author_id: auth.user.id,
      testo: testo.trim(),
      allegati,
      menzioni,
      riferimento_tipo: riferimentoTipo ?? null,
      riferimento_id: riferimentoId ? String(riferimentoId) : null,
    })
    .select(MOD_ROOM_SELECT)
    .single();
  if (error) return { error: error.message };
  return { message: await resolveModRoomRow(data) };
}

// File dello staff: modroom/<mio id>/<uuid>-<nome> nel bucket chat-media
// (solo owner e moderatori caricano e leggono, ognuno cancella i propri).
export function modRoomFilePath(userId, fileName, uuid) {
  const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file';
  return `modroom/${userId}/${uuid}-${safe}`;
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
    voti: stats?.voti ?? 0,
    votiSu: stats?.voti_su ?? 0,
    votiGiu: stats?.voti_giu ?? 0,
    mioVoto: myVotes?.get(row.id) ?? null, // 'su' | 'giu' | null
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
  const { data, error } = await supabase
    .from('faq_suggestion_stats')
    .select('suggestion_id, voti, voti_su, voti_giu')
    .in('suggestion_id', ids);
  if (error || !data) return map;
  data.forEach((row) => map.set(row.suggestion_id, { voti: row.voti, voti_su: row.voti_su, voti_giu: row.voti_giu }));
  return map;
}

async function fetchMySuggestionVotes(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return map;
  const { data, error } = await supabase
    .from('faq_suggestion_votes')
    .select('suggestion_id, voto')
    .eq('user_id', auth.user.id)
    .in('suggestion_id', ids);
  if (error || !data) return map;
  data.forEach((row) => map.set(row.suggestion_id, row.voto === 1 ? 'su' : 'giu'));
  return map;
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

// Voto 👍/👎: un solo voto per utente per suggerimento (PK suggestion_id+
// user_id). Ricliccare lo stesso verso lo toglie (come un like); cliccare
// il verso opposto lo ribalta (upsert sostituisce la riga).
export async function toggleFaqSuggestionVote(suggestionId, direzione, mioVotoAttuale) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per votare.' };
  if (mioVotoAttuale === direzione) {
    const { error } = await supabase
      .from('faq_suggestion_votes')
      .delete()
      .eq('suggestion_id', suggestionId)
      .eq('user_id', auth.user.id);
    if (error) return { error: error.message };
    return { mioVoto: null };
  }
  const { error } = await supabase
    .from('faq_suggestion_votes')
    .upsert({ suggestion_id: suggestionId, user_id: auth.user.id, voto: direzione === 'su' ? 1 : -1 });
  if (error) return { error: error.message };
  return { mioVoto: direzione };
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
