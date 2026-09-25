import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';
import { translateInteractionError } from './errors';
import i18n from '../i18n';

// Apre (o riusa, se già esiste) la conversazione diretta con un altro
// utente reale — la funzione lato server aggiunge entrambi come
// partecipanti, qui non serve nient'altro.
export async function startDirectConversation(otherId) {
  try {
    const { data, error } = await supabase.rpc('start_direct_conversation', { p_other_id: otherId });
    if (error) return { error: error.message };
    return { conversationId: data };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Messaggi di una conversazione, più vecchi prima, con il mittente già
// risolto (vista public_profiles). Con `limit` legge solo gli ultimi
// `limit` (prima di `before`, se dato) e dice se ce ne sono altri più
// vecchi: la chat li carica a 50 alla volta salendo.
export async function fetchMessages(conversationId, { before = null, limit = null } = {}) {
  try {
    let query = supabase.from('chat_messages').select('*').eq('conversation_id', conversationId);
    if (before) query = query.lt('created_at', before);
    query = limit ? query.order('created_at', { ascending: false }).limit(limit + 1) : query.order('created_at', { ascending: true });
    const { data, error } = await query;
    if (error) return { error: error.message };
    if (!data) return { messages: [], hasMore: false };
    let rows = data;
    let hasMore = false;
    if (limit) {
      hasMore = rows.length > limit;
      rows = rows.slice(0, limit).reverse();
    }

    const profilesMap = await fetchProfilesMap(rows.map((m) => m.sender_id));
    const messages = rows.map((row) => mapMessageRow(row, profilesMap.get(row.sender_id)));
    return { messages, hasMore };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export function mapMessageRow(row, author) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    author: author ?? { id: row.sender_id, name: 'Utente', avatar: '' },
    testo: row.testo,
    tipo: row.tipo ?? 'testo',
    allegato: row.allegato ?? null,
    lingua: row.lingua ?? null,
    mondo: row.mondo ?? null,
    menzioni: row.menzioni ?? [],
    data: row.created_at,
  };
}

// Testo breve di un messaggio per le anteprime (hub 💬): i vocali con la
// durata, i video con l'etichetta, il resto col testo salvato.
export function messagePreviewText({ tipo, testo, allegato } = {}) {
  if (tipo === 'audio') {
    const s = Math.max(0, Math.round(Number(allegato?.durata) || 0));
    return s ? `🎤 Messaggio vocale · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '🎤 Messaggio vocale';
  }
  if (tipo === 'video') return '🎬 Video';
  if (tipo === 'foto') return testo || '📷 Foto';
  if (tipo === 'file') return testo || `📎 ${allegato?.nome ?? 'File'}`;
  if (tipo === 'posizione') return '📍 Posizione';
  return testo ?? '';
}

// tipo: 'testo' | 'foto' | 'file' | 'posizione' | 'audio' | 'video'. Per gli allegati `testo`
// contiene comunque un'etichetta breve ("📷 Foto", "📎 nome.pdf", "📍
// Posizione") così le anteprime delle conversazioni e le notifiche, che
// leggono solo il testo, restano leggibili. `mondo` è il mondo attivo al
// momento dell'invio (non quello in cui è nata la conversazione): serve solo
// a colorare la card dell'ultimo messaggio nell'hub, vedi listMyConversations.
// `lingua` è sempre quella attiva di chi scrive: serve solo a decidere lato
// client se mostrare "Traduci messaggio" a chi legge (confronto con la sua
// lingua), niente traduzione automatica — vedi TranslateHint.
// menzioni: id scelti col suggerimento "@" (il server tiene solo quelli validi).
export async function sendMessage(conversationId, testo, { tipo = 'testo', allegato = null, mondo = null, menzioni = [] } = {}) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ conversation_id: conversationId, sender_id: auth.user.id, testo, tipo, allegato, mondo, lingua: i18n.language, menzioni })
      .select()
      .single();
    if (error) return { error: translateInteractionError(error) };
    return { id: data.id, createdAt: data.created_at, menzioni: data.menzioni ?? [] };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Segna la conversazione come letta fino ad ora, per il badge "non letti"
// (RPC lato server: aggiorna solo la propria riga e solo se si è davvero
// partecipanti, vedi mark_conversation_read).
export async function markConversationRead(conversationId) {
  try {
    const { error } = await supabase.rpc('mark_conversation_read', { p_conv: conversationId });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Non letti per conversazione (mappa conversationId -> numero), per i badge.
export async function getUnreadCounts() {
  try {
    const { data, error } = await supabase.rpc('get_unread_counts');
    if (error || !data) return new Map();
    return new Map(data.map((row) => [row.conversation_id, row.non_letti]));
  } catch {
    return new Map();
  }
}

// last_read_at dell'altro partecipante di una conversazione diretta (per
// "Visualizzato"/"Inviato" sotto il mio ultimo messaggio): la RLS
// (chat_participants_select_participant) lascia leggere la riga solo a chi
// partecipa già alla stessa conversazione.
export async function getOtherParticipantLastRead(conversationId, myId) {
  try {
    const { data, error } = await supabase
      .from('chat_participants')
      .select('user_id, last_read_at')
      .eq('conversation_id', conversationId)
      .neq('user_id', myId)
      .maybeSingle();
    if (error || !data) return null;
    return data.last_read_at;
  } catch {
    return null;
  }
}

// Canale realtime sugli aggiornamenti di chat_participants per la
// conversazione aperta: l'altra persona che apre la chat (mark_conversation_read)
// aggiorna la propria riga, qui basta ricontrollare il suo last_read_at.
export function subscribeToParticipantUpdates(conversationId, onUpdate) {
  return supabase
    .channel(`chat-participants-${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_participants', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onUpdate(payload.new)
    )
    .subscribe();
}

// Un canale per chat aperta: notifica ogni nuovo messaggio di quella
// conversazione (mia o dell'altro), e onReconnect se la connessione realtime
// cade e si ristabilisce (per ricaricare i messaggi dal DB e non perderne).
// Va rimosso con supabase.removeChannel alla chiusura/cambio chat, altrimenti
// resta appeso.
export function subscribeToConversationMessages(conversationId, onInsert, onReconnect) {
  let everSubscribed = false;
  return supabase
    .channel(`chat-messages-${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (everSubscribed) onReconnect?.();
      everSubscribed = true;
    });
}

// Presenza nella chat aperta (Realtime presence, niente tabelle): ognuno
// dei due segnala "sono qui" finché tiene aperta la conversazione, così la
// testata mostra "online" quando anche l'altra persona è nella chat.
// onChange(Set degli user_id presenti). Va rimosso con removeChannel.
export function subscribeToConversationPresence(conversationId, myId, onChange) {
  const channel = supabase.channel(`chat-presence-${conversationId}`, { config: { presence: { key: myId } } });
  const emit = () => onChange(new Set(Object.keys(channel.presenceState())));
  channel
    .on('presence', { event: 'sync' }, emit)
    .on('presence', { event: 'leave' }, emit)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') channel.track({ at: Date.now() });
    });
  return channel;
}

// Un canale globale senza filtro (RLS limita già ai messaggi delle proprie
// conversazioni) per aggiornare i badge "non letti" anche a chat chiusa.
export function subscribeToOwnMessages(onInsert) {
  return supabase
    .channel('chat-messages-own')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => onInsert(payload.new))
    .subscribe();
}

// Tutte le mie conversazioni dirette, con l'altro partecipante, l'anteprima
// dell'ultimo messaggio e i non letti — per l'hub DM stile WhatsApp
// (components/DMHub.jsx). L'ultimo messaggio di ogni chat lo trova il DB
// (RPC conversazioni_ultimo_msg): prima si scaricavano tutti i messaggi di
// tutte le chat per prenderne uno.
export async function listMyConversations() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];

    const { data: rows, error } = await supabase.rpc('conversazioni_ultimo_msg');
    if (error || !rows?.length) return [];

    const [unreadCounts, profilesMap] = await Promise.all([
      getUnreadCounts(),
      fetchProfilesMap(rows.map((r) => r.other_id)),
    ]);

    return rows
      .map((r) => {
        const lastMsg = r.created_at ? { testo: r.testo, tipo: r.tipo, allegato: r.allegato, created_at: r.created_at, mondo: r.mondo } : null;
        return {
          conversationId: r.conversation_id,
          other: profilesMap.get(r.other_id) ?? { id: r.other_id, name: 'Utente', avatar: '' },
          lastMessage: lastMsg ? messagePreviewText(lastMsg) : null,
          lastMessageAt: lastMsg?.created_at ?? null,
          lastMessageMondo: lastMsg?.mondo ?? null,
          unread: unreadCounts.get(r.conversation_id) ?? 0,
          archived: Boolean(r.archived),
        };
      })
      .sort((a, b) => new Date(b.lastMessageAt ?? 0) - new Date(a.lastMessageAt ?? 0));
  } catch {
    return [];
  }
}

export async function setConversationArchived(conversationId, archived) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error } = await supabase
      .from('chat_participants')
      .update({ archived })
      .eq('conversation_id', conversationId)
      .eq('user_id', auth.user.id);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Mappa amico -> conversazione diretta già esistente (non ne crea di nuove:
// serve solo ad abbinare i conteggi di getUnreadCounts, per conversation_id,
// alla riga giusta nella lista amici, che è per friendId).
export async function getDirectConversationsMap() {
  try {
    const { data, error } = await supabase.rpc('conversazioni_ultimo_msg');
    if (error || !data) return new Map();
    return new Map(data.map((r) => [r.other_id, r.conversation_id]));
  } catch {
    return new Map();
  }
}


// --- Allegati (bucket privato chat-media) -------------------------------
// Percorso: <conversation_id>/<uid mittente>/<timestamp>-<nome>. La RLS di
// storage lascia caricare solo nella propria cartella di una conversazione
// di cui si fa parte, e leggere solo ai partecipanti: i file non sono mai
// pubblici, si aprono con URL firmati a scadenza.
export const CHAT_MAX_FILE_BYTES = 20 * 1024 * 1024;

export async function uploadChatAttachment(conversationId, file) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    if (file.size > CHAT_MAX_FILE_BYTES) return { error: 'Il file supera i 20 MB.' };
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file';
    const path = `${conversationId}/${auth.user.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from('chat-media')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (error) {
      if (/mime|type/i.test(error.message)) return { error: 'Tipo di file non supportato.' };
      return { error: error.message };
    }
    return { path, nome: file.name, mime: file.type || '', size: file.size };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

const signedUrlCache = new Map();
export async function getChatAttachmentUrl(path, { download = false } = {}) {
  const key = `${path}|${download}`;
  const cached = signedUrlCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;
  try {
    const { data, error } = await supabase.storage
      .from('chat-media')
      .createSignedUrl(path, 3600, download ? { download: true } : undefined);
    if (error || !data?.signedUrl) return null;
    signedUrlCache.set(key, { url: data.signedUrl, expires: Date.now() + 55 * 60 * 1000 });
    return data.signedUrl;
  } catch {
    return null;
  }
}
