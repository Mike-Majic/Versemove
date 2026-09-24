import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Stanze multiplayer generiche (game_rooms/game_room_players), pensate per
// essere riusate da qualunque gioco (Scopa per primo, poi altri): qui solo
// lobby/presenza, mai lo stato di gioco vero (mazzo, mani...), che vive in
// tabelle dedicate per gioco (vedi data/scopa.js). Tutte le scritture
// passano da RPC lato server (mai insert/update diretti): controllano posti
// liberi, turni, stato partita — nessun client può forzare lo stato.

// L'umano con la posizione più bassa fa partire la mano/la nuova partita:
// con posti scelti a piacere (moveSeat) e bot che possono occupare
// qualunque posto, non c'è più garanzia che qualcuno stia proprio al
// posto 0. Se non c'è nessun umano (non dovrebbe succedere: una stanza di
// soli bot viene cancellata da leave_game_room) restituisce null.
export function firstHumanHostId(giocatori) {
  const humans = (giocatori ?? []).filter((g) => !g.isBot).sort((a, b) => a.posizione - b.posizione);
  return humans[0]?.userId ?? null;
}

function mapRoom(row) {
  return {
    id: row.id,
    gioco: row.gioco,
    stato: row.stato,
    maxGiocatori: row.max_giocatori,
    modalita: row.modalita,
    creatoDa: row.creato_da,
    vincitoreId: row.vincitore_id,
    createdAt: row.created_at,
  };
}

// I bot (game_bots) sono solo 3, sempre gli stessi, leggibili da tutti: non
// sono utenti reali quindi non esistono in public_profiles. Risolti una
// volta sola e tenuti in cache per il resto della sessione (solo se la
// lettura riesce: un errore di rete non deve restare "in cache" per
// sempre, si ritenta al prossimo fetchRoom).
let botsCache = null;
async function fetchBotsMap() {
  if (botsCache) return botsCache;
  const { data, error } = await supabase.from('game_bots').select('id, nome, avatar');
  if (error || !data) return new Map();
  botsCache = new Map(data.map((b) => [b.id, { id: b.id, name: b.nome, avatar: b.avatar || '', isBot: true }]));
  return botsCache;
}

// Elenco stanze aperte per un gioco, con chi le ha create già risolto e i
// posti ancora liberi (max_giocatori meno quanti ci sono già dentro) — la
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
  if (error || !data || !data.length) return [];

  const roomIds = data.map((r) => r.id);
  const [profilesMap, { data: playerRows }] = await Promise.all([
    fetchProfilesMap(data.map((r) => r.creato_da)),
    supabase.from('game_room_players').select('room_id').in('room_id', roomIds),
  ]);
  const countByRoom = new Map();
  for (const p of playerRows ?? []) countByRoom.set(p.room_id, (countByRoom.get(p.room_id) ?? 0) + 1);

  return data.map((row) => ({
    ...mapRoom(row),
    creatore: profilesMap.get(row.creato_da) ?? null,
    postiLiberi: Math.max(row.max_giocatori - (countByRoom.get(row.id) ?? 0), 0),
  }));
}

export async function createRoom(gioco, maxGiocatori = 2, modalita = null) {
  const { data, error } = await supabase.rpc('create_game_room', {
    p_gioco: gioco,
    p_max_giocatori: maxGiocatori,
    p_modalita: modalita,
  });
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

// posizione: null lascia scegliere al server il primo posto libero.
export async function addBot(roomId, difficolta, posizione = null) {
  const { data, error } = await supabase.rpc('add_game_bot', {
    p_room_id: roomId,
    p_difficolta: difficolta,
    p_posizione: posizione,
  });
  if (error) return { error: error.message };
  return { botId: data };
}

export async function removeBot(roomId, botId) {
  const { error } = await supabase.rpc('remove_game_bot', { p_room_id: roomId, p_bot_id: botId });
  if (error) return { error: error.message };
  return {};
}

export async function setBotDifficulty(roomId, botId, difficolta) {
  const { error } = await supabase.rpc('set_game_bot_difficulty', {
    p_room_id: roomId,
    p_bot_id: botId,
    p_difficolta: difficolta,
  });
  if (error) return { error: error.message };
  return {};
}

// L'umano si sposta su un posto libero (serve per scegliere il compagno a
// coppie nel Burraco: i posti 0/2 fanno squadra, come 1/3).
export async function moveSeat(roomId, posizione) {
  const { error } = await supabase.rpc('move_game_seat', { p_room_id: roomId, p_posizione: posizione });
  if (error) return { error: error.message };
  return {};
}

// Fa giocare al bot di turno un turno completo, tutto lato server (regole
// comprese). true se il bot ha davvero mosso, false se non toccava a lui.
export async function botStep(roomId) {
  const { data, error } = await supabase.rpc('game_bot_step', { p_room_id: roomId });
  if (error) return { error: error.message };
  return { moved: data };
}

// Stato di una stanza + chi c'è dentro (posizione, punteggio, pronto), con
// i profili già risolti per mostrare nickname/avatar — dalla vista
// pubblica per gli umani, da game_bots per i bot (mai da public_profiles,
// che i bot non hanno perché non sono utenti).
export async function fetchRoom(roomId) {
  const [{ data: room, error: roomError }, { data: players }] = await Promise.all([
    supabase.from('game_rooms').select('*').eq('id', roomId).maybeSingle(),
    supabase.from('game_room_players').select('*').eq('room_id', roomId).order('posizione', { ascending: true }),
  ]);
  if (roomError || !room) return null;

  const humanIds = (players ?? []).filter((p) => !p.is_bot).map((p) => p.user_id);
  const [profilesMap, botsMap] = await Promise.all([fetchProfilesMap(humanIds), fetchBotsMap()]);

  return {
    ...mapRoom(room),
    giocatori: (players ?? []).map((p) => ({
      userId: p.user_id,
      posizione: p.posizione,
      punteggio: p.punteggio,
      pronto: p.pronto,
      isBot: p.is_bot,
      botDifficolta: p.bot_difficolta,
      profilo: p.is_bot
        ? botsMap.get(p.user_id) ?? { id: p.user_id, name: 'CPU', avatar: '', isBot: true }
        : profilesMap.get(p.user_id) ?? { id: p.user_id, name: 'Utente', avatar: '' },
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
