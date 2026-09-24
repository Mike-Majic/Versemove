import { supabase } from './supabaseClient';

// Burraco: mazzo doppio da 108 carte (52x2 + 4 jolly), stessa codifica
// server-side "SemeValore" delle RPC nel database (es. "H7", "S2", "JK" per
// il jolly). Qui solo lettura dello stato pubblico/della propria mano/delle
// combinazioni sul tavolo e le uniche scritture possibili (pescare, calare,
// scartare): tutte le regole (turno, fase, validità delle combinazioni,
// punteggio) restano nel database — un client modificato non può barare.

export const FRENCH_SUITS = {
  H: { nome: 'Cuori', simbolo: '♥', colore: '#c62828' },
  D: { nome: 'Quadri', simbolo: '♦', colore: '#c62828' },
  C: { nome: 'Fiori', simbolo: '♣', colore: '#1a1a1a' },
  S: { nome: 'Picche', simbolo: '♠', colore: '#1a1a1a' },
};

export function isJoker(card) {
  return card === 'JK';
}
export function cardSuit(card) {
  return isJoker(card) ? null : card[0];
}
export function cardRankCode(card) {
  return isJoker(card) ? null : card.slice(1);
}
export function isWild(card) {
  return isJoker(card) || cardRankCode(card) === '2';
}

function mapPublicState(row) {
  if (!row) return null;
  return {
    roomId: row.room_id,
    turnoUserId: row.turno_user_id,
    fase: row.fase, // 'pesca' | 'gioco'
    carteRimaste: row.carte_rimaste,
    scartoCima: row.scarto_cima,
    carteInMano: row.carte_in_mano ?? {},
    updatedAt: row.updated_at,
    // Tutto il monte degli scarti, dal più vecchio al più recente (chi
    // pesca dagli scarti li prende tutti).
    pilaScarti: row.pila_scarti ?? [],
    // Pozzetti per squadra (chiave = squadra come burraco_team_of: posto % 2
    // a coppie, altrimenti il posto): { carte, preso }.
    pozzetti: row.pozzetti ?? {},
    // Carta che in questo turno non si può riscartare (l'unica raccolta).
    vincoloScarto: row.vincolo_scarto ?? null,
  };
}

export async function fetchBurracoState(roomId) {
  const { data, error } = await supabase.from('burraco_games_public').select('*').eq('room_id', roomId).maybeSingle();
  if (error) return null;
  return mapPublicState(data);
}

export async function fetchMyHand(roomId) {
  const { data, error } = await supabase.from('burraco_hands').select('carte').eq('room_id', roomId).maybeSingle();
  if (error || !data) return [];
  return data.carte ?? [];
}

// Le combinazioni sono scoperte sul tavolo (come nel gioco vero): visibili
// a entrambi i giocatori della stanza, nessun segreto.
export async function fetchMelds(roomId) {
  const { data, error } = await supabase
    .from('burraco_melds')
    .select('id, owner_id, tipo, carte')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, ownerId: r.owner_id, tipo: r.tipo, carte: r.carte ?? [] }));
}

export async function fetchHandResults(roomId) {
  const { data, error } = await supabase
    .from('burraco_hand_results')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, dettaglio: r.dettaglio, createdAt: r.created_at }));
}

export async function startBurracoHand(roomId) {
  const { error } = await supabase.rpc('start_burraco_hand', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

// da: 'mazzo' | 'scarti'
export async function drawCard(roomId, da) {
  const { error } = await supabase.rpc('burraco_draw', { p_room_id: roomId, p_da: da });
  if (error) return { error: error.message };
  return {};
}

// meldId: null per una nuova combinazione, altrimenti l'id di una propria
// combinazione già calata a cui aggiungere le carte.
export async function layCards(roomId, meldId, carte) {
  const { error } = await supabase.rpc('burraco_lay_cards', { p_room_id: roomId, p_meld_id: meldId, p_carte: carte });
  if (error) return { error: error.message };
  return {};
}

export async function discardCard(roomId, carta) {
  const { error } = await supabase.rpc('burraco_discard', { p_room_id: roomId, p_carta: carta });
  if (error) return { error: error.message };
  return {};
}

// Anteprima senza scrivere niente: meldId null valuta una combinazione
// nuova, altrimenti l'attacco a quella colonna. { ok, tipo, pulizia,
// errore } (tipo 'scala' | 'tris', pulizia 'pulito' | 'semipulito' |
// 'sporco'; per il tris anche valore).
export async function checkMeld(roomId, meldId, carte) {
  const { data, error } = await supabase.rpc('burraco_check_meld', { p_room_id: roomId, p_meld_id: meldId, p_carte: carte });
  if (error) return { ok: false, errore: error.message };
  return {
    ok: data?.ok === true,
    tipo: data?.tipo ?? null,
    pulizia: data?.pulizia ?? null,
    valore: data?.valore ?? null,
    errore: data?.errore ?? null,
  };
}
