import { supabase } from './supabaseClient';

// Chat INFO BAN (mondo FAQ): l'utente bloccato scrive allo staff, solo
// testo, al massimo 3 messaggi prima di una risposta; lo staff risponde da
// "Info ban" (Backend o dentro la categoria). Backend già pronto (tabella
// ban_chat_messages + RPC): qui solo le chiamate.
// - get_ban_chat(p_user_id?) -> id, da_staff, autore, testo, created_at,
//   dal più vecchio. Senza p_user_id: la propria chat; lo staff passa
//   p_user_id per leggere quella di un utente.
// - send_ban_chat_message(p_testo) -> { id, rimasti } (solo bloccati).
// - ban_chat_rimasti() -> quanti messaggi si possono ancora mandare.
// - list_ban_chats() (staff) -> una riga per utente, chi aspetta in cima.
// - reply_ban_chat(p_user_id, p_testo) (staff) -> id.
// Gli errori del server sono già frasi in italiano per l'utente.

export const BAN_CHAT_MAX = 3;

function mapMessage(row) {
  return {
    id: row.id,
    daStaff: Boolean(row.da_staff),
    autore: row.autore || (row.da_staff ? 'Staff' : 'Utente'),
    testo: row.testo ?? '',
    data: row.created_at,
  };
}

function fail(error, fallback) {
  return error?.message || fallback;
}

export async function getBanChat(userId = null) {
  try {
    const { data, error } = await supabase.rpc('get_ban_chat', userId ? { p_user_id: userId } : {});
    if (error || !Array.isArray(data)) return { messages: [], error: fail(error, 'Non riesco a caricare la chat.') };
    return { messages: data.map(mapMessage) };
  } catch (err) {
    return { messages: [], error: err?.message ?? 'Errore di rete.' };
  }
}

export async function sendBanChatMessage(testo) {
  try {
    const { data, error } = await supabase.rpc('send_ban_chat_message', { p_testo: testo });
    if (error) return { error: fail(error, 'Messaggio non inviato.') };
    return { id: data?.id ?? null, rimasti: typeof data?.rimasti === 'number' ? data.rimasti : null };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function getBanChatRemaining() {
  try {
    const { data, error } = await supabase.rpc('ban_chat_rimasti');
    if (error || typeof data !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export async function listBanChats() {
  try {
    const { data, error } = await supabase.rpc('list_ban_chats');
    if (error || !Array.isArray(data)) return { chats: [], error: fail(error, 'Non riesco a caricare le chat.') };
    return {
      chats: data.map((r) => ({
        userId: r.user_id,
        nickname: r.nickname || 'Utente',
        avatar: r.avatar_url || '',
        bannato: Boolean(r.bannato),
        banMotivo: r.ban_motivo || '',
        banFinoAl: r.ban_fino_al || null,
        ultimoTesto: r.ultimo_testo || '',
        ultimoAt: r.ultimo_at,
        inAttesa: Boolean(r.in_attesa),
        messaggi: r.messaggi ?? 0,
      })),
    };
  } catch (err) {
    return { chats: [], error: err?.message ?? 'Errore di rete.' };
  }
}

export async function replyBanChat(userId, testo) {
  try {
    const { data, error } = await supabase.rpc('reply_ban_chat', { p_user_id: userId, p_testo: testo });
    if (error) return { error: fail(error, 'Risposta non inviata.') };
    return { id: data };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Riga grezza da Realtime -> messaggio. La riga non ha il nickname: per lo
// staff vale "Staff", per l'utente si usa quello passato da chi ascolta.
export function mapBanChatRow(row, nickname = 'Utente') {
  return mapMessage({ ...row, autore: row.da_staff ? 'Staff' : nickname });
}

// Nuovi messaggi in tempo reale. La RLS manda all'utente solo le righe
// della propria chat, allo staff tutte; userId filtra una sola chat.
export function subscribeToBanChat({ userId = null, onInsert, onReconnect } = {}) {
  let subscribedOnce = false;
  const filter = userId ? { filter: `user_id=eq.${userId}` } : {};
  return supabase
    .channel(`ban-chat-${userId ?? 'all'}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ban_chat_messages', ...filter }, (payload) => onInsert?.(payload.new))
    .subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      if (subscribedOnce) onReconnect?.();
      subscribedOnce = true;
    });
}
