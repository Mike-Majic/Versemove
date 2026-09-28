import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Stanze video di gruppo (mondo Nerd, Videochiamata; mondo Lavoro, Stanza
// conferenze: stesse RPC con p_mondo/p_categoria diversi): video_rooms,
// video_room_members, video_room_bans. Tutto passa da RPC lato server,
// che controllano fascia d'età, blocchi, posti (massimo 8) e chi è il
// proprietario; le tabelle si leggono soltanto (RLS). Gli errori delle RPC
// sono già frasi in italiano da mostrare così come sono ("Stanza piena
// (massimo 8 persone)", "Il proprietario ti ha bloccato in questa stanza",
// "La stanza è chiusa"...). Il video passa peer-to-peer (hooks/useMeshCall),
// qui niente media.

const rpc = async (name, args) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { error: error.message };
  return { data };
};

// { rooms, error }: rooms è sempre un array (vuoto se errore); error serve
// alla colonna per riconoscere "Non hai accesso a questo mondo" (Lavoro
// senza consenso) e mostrare il consenso invece di una lista vuota.
export async function listVideoRooms(mondo = 'nerd', categoria = 'live') {
  const { data, error } = await rpc('list_video_rooms', { p_mondo: mondo, p_categoria: categoria });
  if (error || !data) return { rooms: [], error: error ?? null };
  const owners = await fetchProfilesMap(data.map((r) => r.owner_id));
  const rooms = data.map((r) => ({
    id: r.id,
    titolo: r.titolo,
    ownerId: r.owner_id,
    owner: owners.get(r.owner_id) ?? { id: r.owner_id, name: 'Utente', avatar: '' },
    createdAt: r.created_at,
    maxPartecipanti: r.max_partecipanti,
    partecipanti: r.partecipanti,
    bloccato: r.sono_bloccato,
    privata: Boolean(r.privata),
  }));
  return { rooms, error: null };
}

// privata: la password (4-32 caratteri) la controlla il server, che ne
// salva solo l'hash; chi crea la stanza la comunica lui agli invitati.
export async function createVideoRoom(titolo, mondo = 'nerd', categoria = 'live', { privata = false, password = null } = {}) {
  const { data, error } = await rpc('create_video_room', {
    p_titolo: titolo,
    p_mondo: mondo,
    p_categoria: categoria,
    p_privata: privata,
    p_password: privata ? password : null,
  });
  if (error) return { error };
  return { id: data };
}

// Esito dell'ingresso: {} = entrato; { needPassword } = stanza privata, va
// chiesta la password; { error, wrongPassword | tooMany } = password
// sbagliata o troppi tentativi (5 ogni 10 minuti, contati dal server).
// Gli altri errori (stanza chiusa, piena, bloccato) arrivano come { error }.
export const JOIN_MESSAGES = {
  password_richiesta: 'Questa stanza è privata: serve la password.',
  password_errata: 'Password errata',
  troppi_tentativi: 'Troppi tentativi, riprova tra qualche minuto',
};

export async function joinVideoRoom(roomId, password = null) {
  const { data, error } = await rpc('join_video_room', { p_room_id: roomId, p_password: password });
  if (error) return { error };
  if (data === 'ok' || data == null) return {};
  if (data === 'password_richiesta') return { needPassword: true, error: JOIN_MESSAGES.password_richiesta };
  if (data === 'password_errata') return { wrongPassword: true, error: JOIN_MESSAGES.password_errata };
  if (data === 'troppi_tentativi') return { tooMany: true, error: JOIN_MESSAGES.troppi_tentativi };
  return { error: String(data) };
}

// true finché si è dentro; false = espulso, bloccato o stanza chiusa.
export async function touchVideoRoom(roomId) {
  const { data, error } = await rpc('touch_video_room', { p_room_id: roomId });
  if (error) return { error };
  return { active: data === true };
}

export async function leaveVideoRoom(roomId) {
  const { error } = await rpc('leave_video_room', { p_room_id: roomId });
  return error ? { error } : {};
}

// Uscita alla chiusura della scheda: la pagina sta morendo, niente await.
export function leaveVideoRoomOnUnload(roomId) {
  supabase.rpc('leave_video_room', { p_room_id: roomId }).then(
    () => {},
    () => {}
  );
}

export async function endVideoRoom(roomId) {
  const { error } = await rpc('end_video_room', { p_room_id: roomId });
  return error ? { error } : {};
}

// blocca = false: espelli (può rientrare); true: blocca (non può rientrare).
export async function kickVideoMember(roomId, userId, blocca) {
  const { error } = await rpc('kick_video_member', { p_room_id: roomId, p_user_id: userId, p_blocca: blocca });
  return error ? { error } : {};
}

export async function unbanVideoMember(roomId, userId) {
  const { error } = await rpc('unban_video_member', { p_room_id: roomId, p_user_id: userId });
  return error ? { error } : {};
}

export async function setVideoMemberMuted(roomId, userId, muted) {
  const { error } = await rpc('set_video_member_muted', { p_room_id: roomId, p_user_id: userId, p_muted: muted });
  return error ? { error } : {};
}

// La stanza (titolo, proprietario, se è ancora aperta).
export async function fetchVideoRoom(roomId) {
  const { data, error } = await supabase
    .from('video_rooms')
    .select('id, titolo, owner_id, max_partecipanti, created_at, ended_at')
    .eq('id', roomId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    titolo: data.titolo,
    ownerId: data.owner_id,
    maxPartecipanti: data.max_partecipanti,
    createdAt: data.created_at,
    endedAt: data.ended_at,
  };
}

// Membri attivi (non usciti), con nome e avatar.
export async function fetchRoomMembers(roomId) {
  const { data, error } = await supabase
    .from('video_room_members')
    .select('user_id, joined_at, last_seen, muted')
    .eq('room_id', roomId)
    .is('left_at', null)
    .order('joined_at', { ascending: true });
  if (error || !data) return null;
  const profiles = await fetchProfilesMap(data.map((m) => m.user_id));
  return data.map((m) => ({
    userId: m.user_id,
    joinedAt: m.joined_at,
    lastSeen: m.last_seen,
    muted: m.muted,
    profilo: profiles.get(m.user_id) ?? { id: m.user_id, name: 'Utente', avatar: '' },
  }));
}

// Bloccati della stanza: la RLS li mostra solo al proprietario.
export async function fetchRoomBans(roomId) {
  const { data, error } = await supabase.from('video_room_bans').select('user_id').eq('room_id', roomId);
  if (error || !data) return [];
  const profiles = await fetchProfilesMap(data.map((b) => b.user_id));
  return data.map((b) => ({ userId: b.user_id, profilo: profiles.get(b.user_id) ?? { id: b.user_id, name: 'Utente', avatar: '' } }));
}
