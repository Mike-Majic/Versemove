import { supabase } from './supabaseClient';
import { cardSuit, cardValue } from './scopa';

// Trentuno (31): stesso mazzo italiano da 40 carte di Scopa, stessa
// codifica "SemeValore" server-side. Qui solo lettura dello stato pubblico/
// della propria mano/dei risultati e le 3 scritture possibili (pescare,
// bussare, scartare): turno, bussata, 31 e punteggio (vite perse) restano
// tutti nel database — un client modificato non può barare né dichiararsi
// vincitore da solo.

export { cardSuit, cardValue };

export function trentunoValore(card) {
  const v = card.slice(1);
  if (v === '1') return 11;
  if (v === '8' || v === '9' || v === '10') return 10;
  return Number(v);
}

function mapPublicState(row) {
  if (!row) return null;
  return {
    roomId: row.room_id,
    turnoUserId: row.turno_user_id,
    fase: row.fase, // 'pesca' | 'scarta'
    bussatoDa: row.bussato_da,
    carteRimaste: row.carte_rimaste,
    scartoCima: row.scarto_cima,
    carteInMano: row.carte_in_mano ?? {},
    updatedAt: row.updated_at,
  };
}

export async function fetchTrentunoState(roomId) {
  const { data, error } = await supabase.from('trentuno_games_public').select('*').eq('room_id', roomId).maybeSingle();
  if (error) return null;
  return mapPublicState(data);
}

export async function fetchMyHand(roomId) {
  const { data, error } = await supabase.from('trentuno_hands').select('carte').eq('room_id', roomId).maybeSingle();
  if (error || !data) return [];
  return data.carte ?? [];
}

export async function fetchHandResults(roomId) {
  const { data, error } = await supabase
    .from('trentuno_hand_results')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, dettaglio: r.dettaglio, createdAt: r.created_at }));
}

export async function startTrentunoHand(roomId) {
  const { error } = await supabase.rpc('start_trentuno_hand', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

// da: 'mazzo' | 'scarti'
export async function drawCard(roomId, da) {
  const { error } = await supabase.rpc('trentuno_draw', { p_room_id: roomId, p_da: da });
  if (error) return { error: error.message };
  return {};
}

// Bussa: solo prima di pescare, solo se nessuno ha già bussato in questa
// mano. L'avversario fa un ultimo giro, poi si confrontano le mani.
export async function knock(roomId) {
  const { error } = await supabase.rpc('trentuno_knock', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

export async function discardCard(roomId, carta) {
  const { error } = await supabase.rpc('trentuno_discard', { p_room_id: roomId, p_carta: carta });
  if (error) return { error: error.message };
  return {};
}
