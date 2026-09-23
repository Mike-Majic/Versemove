import { supabase } from './supabaseClient';

// Scopa: una carta è una stringa di 2-3 caratteri "SemeValore" (es. "D7",
// "C10") — stessa codifica usata lato server (vedi le RPC scopa_* nel
// database). Qui solo lettura dello stato pubblico/della propria mano/delle
// prese e l'unica scrittura possibile (giocare una carta): tutte le regole
// (turno, combinazioni di presa valide, punteggio) sono validate nel
// database, mai qui — un client modificato non può barare.

export const SUITS = {
  D: { nome: 'Denari', simbolo: '◆', colore: '#e0a800' },
  C: { nome: 'Coppe', simbolo: '♥', colore: '#c62828' },
  S: { nome: 'Spade', simbolo: '♠', colore: '#1565c0' },
  B: { nome: 'Bastoni', simbolo: '♣', colore: '#2e7d32' },
};

const FIGURE_LABEL = { 8: 'Fante', 9: 'Cavallo', 10: 'Re' };

export function cardSuit(card) {
  return card[0];
}
export function cardValue(card) {
  return parseInt(card.slice(1), 10);
}
export function cardLabel(card) {
  const v = cardValue(card);
  return FIGURE_LABEL[v] ?? String(v);
}

function mapPublicState(row) {
  if (!row) return null;
  return {
    roomId: row.room_id,
    tavolo: row.tavolo ?? [],
    turnoUserId: row.turno_user_id,
    ultimaPresaUserId: row.ultima_presa_user_id,
    scope: row.scope ?? {},
    carteRimaste: row.carte_rimaste,
    carteInMano: row.carte_in_mano ?? {},
    updatedAt: row.updated_at,
  };
}

// Stato pubblico della mano in corso (tavolo, di chi è il turno, quante
// carte restano nel mazzo — mai il contenuto del mazzo): null se in questa
// stanza non c'è una mano in corso (partita non ancora iniziata, o appena
// finita e non ancora ridistribuita).
export async function fetchScopaState(roomId) {
  const { data, error } = await supabase.from('scopa_games_public').select('*').eq('room_id', roomId).maybeSingle();
  if (error) return null;
  return mapPublicState(data);
}

// La propria mano: la RLS restituisce solo la riga di chi chiama, quindi
// qui non serve (e non si può) chiedere quella dell'avversario.
export async function fetchMyHand(roomId) {
  const { data, error } = await supabase.from('scopa_hands').select('carte').eq('room_id', roomId).maybeSingle();
  if (error || !data) return [];
  return data.carte ?? [];
}

// Le prese di entrambi i giocatori: carte già giocate, nessun segreto,
// visibili a chi è nella stanza.
export async function fetchCaptures(roomId) {
  const { data, error } = await supabase.from('scopa_captures').select('user_id, carte').eq('room_id', roomId);
  if (error || !data) return {};
  return Object.fromEntries(data.map((r) => [r.user_id, r.carte ?? []]));
}

// Cronologia dei punteggi mano per mano, più recente per prima — usata per
// il riepilogo a fine mano e per un eventuale storico della partita.
export async function fetchHandResults(roomId) {
  const { data, error } = await supabase
    .from('scopa_hand_results')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, dettaglio: r.dettaglio, createdAt: r.created_at }));
}

export async function startScopaHand(roomId) {
  const { error } = await supabase.rpc('start_scopa_hand', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

// prese: array di carte del tavolo da prendere (somma = valore di carta),
// vuoto/omesso se la carta va solo scoperta sul tavolo.
export async function playCard(roomId, carta, prese = []) {
  const { error } = await supabase.rpc('scopa_play_card', { p_room_id: roomId, p_carta: carta, p_prese: prese });
  if (error) return { error: error.message };
  return {};
}

// Combinazioni di carte del tavolo che sommano esattamente al valore
// cercato: usata dal client SOLO per suggerire/abilitare le prese possibili
// nell'interfaccia (click sulle carte del tavolo) — la validazione vera
// resta comunque quella server-side in scopa_play_card, questa è solo UX.
export function findCaptureCombinations(tableCards, targetValue) {
  const results = [];
  const n = tableCards.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0;
    const combo = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += cardValue(tableCards[i]);
        combo.push(tableCards[i]);
      }
    }
    if (sum === targetValue) results.push(combo);
  }
  return results;
}
