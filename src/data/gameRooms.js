import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Stanze multiplayer generiche (game_rooms/game_room_players), pensate per
// essere riusate da qualunque gioco (Scopa per primo, poi altri): qui solo
// lobby/presenza, mai lo stato di gioco vero (mazzo, mani...), che vive in
// tabelle dedicate per gioco (vedi data/scopa.js). Tutte le scritture
// passano da RPC lato server (mai insert/update diretti): controllano posti
// liberi, turni, stato partita — nessun client può forzare lo stato.

function mapRoom(row) {
  return {
    id: row.id,
    gioco: row.gioco,
    stato: row.stato,
    maxGiocatori: row.max_giocatori,
    creatoDa: row.creato_da,
    vincitoreId: row.vincitore_id,
    createdAt: row.created_at,
  };
}

// Elenco stanze aperte per un gioco, con chi le ha create già risolto — la
// lista NON si aggiorna da sola in tempo reale (richiede un refresh
// manuale, vedi commento in AppNerd/GiochiTavoloColumn): evita di dover
// mettere le stanze in pubblicazione realtime solo per la lobby pubblica.
export async function listOpenRooms(gioco) {
  const { data, error } = await supabase
    .from('game_rooms')
    .select('*')
    .eq('gioco', gioco)
    .eq('stato', 'in_attesa')
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  const profilesMap = await fetchProfilesMap(data.map((r) => r.creato_da));
  return data.map((row) => ({ ...mapRoom(row), creatore: profilesMap.get(row.creato_da) ?? null }));
}

export async function createRoom(gioco, maxGiocatori = 2) {
  const { data, error } = await supabase.rpc('create_game_room', { p_gioco: gioco, p_max_giocatori: maxGiocatori });
  if (error) return { error: error.message };
  return { id: data };
}

export async function joinRoom(roomId) {
  const { error } = await supabase.rpc('join_game_room', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

export async function leaveRoom(roomId) {
  const { error } = await supabase.rpc('leave_game_room', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

export async function setRoomReady(roomId, pronto) {
  const { error } = await supabase.rpc('set_room_ready', { p_room_id: roomId, p_pronto: pronto });
  if (error) return { error: error.message };
  return {};
}

// Stato di una stanza + chi c'è dentro (posizione, punteggio, pronto), con
// i profili già risolti per mostrare nickname/avatar.
export async function fetchRoom(roomId) {
  const [{ data: room, error: roomError }, { data: players }] = await Promise.all([
    supabase.from('game_rooms').select('*').eq('id', roomId).maybeSingle(),
    supabase.from('game_room_players').select('*').eq('room_id', roomId).order('posizione', { ascending: true }),
  ]);
  if (roomError || !room) return null;
  const profilesMap = await fetchProfilesMap((players ?? []).map((p) => p.user_id));
  return {
    ...mapRoom(room),
    giocatori: (players ?? []).map((p) => ({
      userId: p.user_id,
      posizione: p.posizione,
      punteggio: p.punteggio,
      pronto: p.pronto,
      profilo: profilesMap.get(p.user_id) ?? { id: p.user_id, name: 'Utente', avatar: '' },
    })),
  };
}

// Un solo canale per tutto quel che riguarda una stanza (join/pronto/mosse/
// fine mano...): il payload non porta mai dati, solo "qualcosa è cambiato,
// rileggi" — il client rilegge poi con query normali, che passano dalla RLS.
export function subscribeToGameEvents(roomId, onEvent) {
  return supabase
    .channel(`game-events-${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'game_events', filter: `room_id=eq.${roomId}` },
      (payload) => onEvent(payload.new)
    )
    .subscribe();
}

export function unsubscribe(channel) {
  if (channel) supabase.removeChannel(channel);
}
