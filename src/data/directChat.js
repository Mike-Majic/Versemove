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
// risolto (vista public_profiles).
export async function fetchMessages(conversationId) {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) return { error: error.message };
    if (!data) return { messages: [] };

    const profilesMap = await fetchProfilesMap(data.map((m) => m.sender_id));
    const messages = data.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      author: profilesMap.get(row.sender_id) ?? { id: row.sender_id, name: 'Utente', avatar: '' },
      testo: row.testo,
      tipo: row.tipo ?? 'testo',
      allegato: row.allegato ?? null,
      lingua: row.lingua ?? null,
      mondo: row.mondo ?? null,
      menzioni: row.menzioni ?? [],
      data: row.created_at,
    }));
    return { messages };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// tipo: 'testo' | 'foto' | 'file' | 'posizione'. Per gli allegati `testo`
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
// (components/DMHub.jsx): niente RPC dedicata, si compone da tabelle già
// esistenti (poche righe per utente, va bene lato client).
export async function listMyConversations() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const myId = auth.user.id;

    const { data: myRows, error } = await supabase
      .from('chat_participants')
      .select('conversation_id, archived')
      .eq('user_id', myId);
    if (error || !myRows?.length) return [];

    const convIds = myRows.map((r) => r.conversation_id);
    const archivedMap = new Map(myRows.map((r) => [r.conversation_id, r.archived]));

    const { data: allParticipants } = await supabase
      .from('chat_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', convIds);
    const otherIdByConv = new Map();
    for (const row of allParticipants ?? []) {
      if (row.user_id !== myId) otherIdByConv.set(row.conversation_id, row.user_id);
    }

    const { data: recentMessages } = await supabase
      .from('chat_messages')
      .select('conversation_id, testo, created_at, mondo')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });
    const lastMsgByConv = new Map();
    for (const m of recentMessages ?? []) {
      if (!lastMsgByConv.has(m.conversation_id)) lastMsgByConv.set(m.conversation_id, m);
    }

    const [unreadCounts, profilesMap] = await Promise.all([
      getUnreadCounts(),
      fetchProfilesMap([...otherIdByConv.values()]),
    ]);

    return convIds
      .filter((convId) => otherIdByConv.has(convId))
      .map((convId) => {
        const otherId = otherIdByConv.get(convId);
        const lastMsg = lastMsgByConv.get(convId) ?? null;
        return {
          conversationId: convId,
          other: profilesMap.get(otherId) ?? { id: otherId, name: 'Utente', avatar: '' },
          lastMessage: lastMsg?.testo ?? null,
          lastMessageAt: lastMsg?.created_at ?? null,
          lastMessageMondo: lastMsg?.mondo ?? null,
          unread: unreadCounts.get(convId) ?? 0,
          archived: archivedMap.get(convId) ?? false,
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
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return new Map();
    const myId = auth.user.id;
    const { data, error } = await supabase.from('chat_participants').select('conversation_id, user_id');
    if (error || !data) return new Map();
    const myConvIds = new Set(data.filter((r) => r.user_id === myId).map((r) => r.conversation_id));
    const map = new Map();
    for (const row of data) {
      if (row.user_id !== myId && myConvIds.has(row.conversation_id)) map.set(row.user_id, row.conversation_id);
    }
    return map;
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
