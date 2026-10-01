import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Chat del mondo FAQ: una stanza unica, stile gruppo, fra utenti e staff.
// Backend già pronto (tabella faq_chat_messages + RPC): qui solo le
// chiamate, con i nomi decisi lato server.
// - Lettura: get_faq_chat(p_before, p_limit) restituisce i messaggi dal più
//   recente, già con nickname/avatar/staff dell'autore e già filtrati per
//   chi legge (propri, dello staff, della stessa fascia d'età).
// - Invio: send_faq_chat_message(p_testo, p_allegato, p_risposta_a) -> id.
//   Un allegato per messaggio; il percorso deve stare in faqchat/<mio id>/.
// - Eliminazione: delete_faq_chat_message(p_id): il proprio, oppure
//   qualunque se staff. Resta la riga con "Messaggio eliminato".
// - Tempo reale: INSERT e UPDATE su faq_chat_messages (la RLS manda solo le
//   righe che chi ascolta può leggere).

export const FAQ_CHAT_PAGE = 50;

function mapRow(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    author: { id: row.author_id, name: row.nickname || 'Utente', avatar: row.avatar_url || '' },
    staff: Boolean(row.staff),
    testo: row.testo ?? '',
    allegato: row.allegato ?? null,
    rispostaA: row.risposta_a ?? null,
    data: row.created_at,
    eliminato: Boolean(row.eliminato),
  };
}

// Il messaggio di errore del server ("Stai scrivendo troppo in fretta…",
// "Allegato non valido", "Account sospeso"...) è già in italiano e pensato
// per l'utente: si mostra così com'è.
function serverMessage(error, fallback) {
  return error?.message || fallback;
}

// Pagina di messaggi in ordine dal più vecchio. hasMore: ce ne sono altri
// più vecchi (se ne chiede uno in più per saperlo).
export async function listFaqChat({ before = null, limit = FAQ_CHAT_PAGE } = {}) {
  try {
    const { data, error } = await supabase.rpc('get_faq_chat', { p_before: before, p_limit: limit + 1 });
    if (error || !Array.isArray(data)) return { messages: [], hasMore: false, error: serverMessage(error, 'Non riesco a caricare la chat.') };
    const page = data.slice(0, limit).reverse();
    return { messages: page.map(mapRow), hasMore: data.length > limit };
  } catch (err) {
    return { messages: [], hasMore: false, error: err?.message ?? 'Errore di rete.' };
  }
}

export async function sendFaqChatMessage({ testo = '', allegato = null, rispostaA = null } = {}) {
  try {
    const { data, error } = await supabase.rpc('send_faq_chat_message', {
      p_testo: testo,
      p_allegato: allegato,
      p_risposta_a: rispostaA,
    });
    if (error) return { error: serverMessage(error, 'Messaggio non inviato.') };
    return { id: data };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function deleteFaqChatMessage(id) {
  try {
    const { error } = await supabase.rpc('delete_faq_chat_message', { p_id: id });
    if (error) return { error: serverMessage(error, 'Messaggio non eliminato.') };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Riga grezza da Realtime (colonne della tabella, senza nickname/avatar)
// -> messaggio con l'autore risolto dalla vista pubblica dei profili.
const authorCache = new Map();
export async function resolveFaqChatRow(row) {
  if (row.author_id && !authorCache.has(row.author_id)) {
    const map = await fetchProfilesMap([row.author_id]);
    const p = map.get(row.author_id);
    if (p) authorCache.set(row.author_id, p);
  }
  const p = authorCache.get(row.author_id);
  return mapRow({
    id: row.id,
    author_id: row.author_id,
    nickname: p?.name,
    avatar_url: p?.avatar,
    staff: row.author_staff,
    testo: row.testo,
    allegato: row.allegato,
    risposta_a: row.risposta_a,
    created_at: row.created_at,
    eliminato: Boolean(row.deleted_at),
  });
}

export function subscribeToFaqChat({ onInsert, onUpdate, onReconnect } = {}) {
  let subscribedOnce = false;
  return supabase
    .channel('faq-chat-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'faq_chat_messages' }, (payload) => onInsert?.(payload.new))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'faq_chat_messages' }, (payload) => onUpdate?.(payload.new))
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (subscribedOnce) onReconnect?.();
      subscribedOnce = true;
    });
}

// File della chat FAQ nel bucket chat-media: faqchat/<mio id>/<uuid>-<nome>
// (il server rifiuta un allegato con un percorso diverso).
export function faqChatFilePath(userId, fileName, uuid) {
  const safe = (fileName || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file';
  return `faqchat/${userId}/${uuid}-${safe}`;
}

// Staff: apre (o ritrova) la chat privata con un utente. -> { conversationId } | { error }
export async function startStaffConversation(otherId) {
  try {
    const { data, error } = await supabase.rpc('start_staff_conversation', { p_other_id: otherId });
    if (error) return { error: serverMessage(error, 'Non riesco ad aprire la chat privata.') };
    return { conversationId: data };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}
