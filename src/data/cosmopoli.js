import { supabase } from './supabaseClient';

// Cosmopoli: qui solo lettura dello stato pubblico (nessun segreto — a
// differenza di Scopa/Burraco/Trentuno, in un gioco da tavolo di
// compravendita immobiliare denaro/posizione/proprietà sono informazioni
// pubbliche per costruzione) e le scritture verso le RPC. L'unica cosa
// privata è l'ORDINE di pesca dei mazzi Probabilità/Imprevisti (mai
// esposto, solo il conteggio — vedi monoverse_games_public): tutte le
// regole vere (turno, affitti, costruzioni, bancarotta) restano nel
// database, un client modificato non può barare.

function mapPublicState(row) {
  if (!row) return null;
  return {
    roomId: row.room_id,
    turnoUserId: row.turno_user_id,
    fase: row.fase, // 'tira_dadi' | 'puo_comprare' | 'azione'
    ultimoDado1: row.ultimo_dado1,
    ultimoDado2: row.ultimo_dado2,
    ultimoTiroDoppio: row.ultimo_tiro_doppio,
    doppiConsecutivi: row.doppi_consecutivi,
    probabilitaRimaste: row.probabilita_rimaste,
    imprevistiRimaste: row.imprevisti_rimaste,
    updatedAt: row.updated_at,
  };
}

export async function fetchCosmopoliState(roomId) {
  const { data, error } = await supabase.from('monoverse_games_public').select('*').eq('room_id', roomId).maybeSingle();
  if (error) return null;
  return mapPublicState(data);
}

export async function fetchPlayers(roomId) {
  const { data, error } = await supabase.from('monoverse_players').select('*').eq('room_id', roomId);
  if (error || !data) return [];
  return data.map((r) => ({
    userId: r.user_id,
    denaro: r.denaro,
    posizione: r.posizione,
    inQuarantena: r.in_quarantena,
    turniInQuarantena: r.turni_in_quarantena,
    carteLiberta: r.carte_liberta,
    bancarotta: r.bancarotta,
  }));
}

export async function fetchProperties(roomId) {
  const { data, error } = await supabase.from('monoverse_properties').select('*').eq('room_id', roomId);
  if (error || !data) return [];
  return data.map((r) => ({
    casella: r.casella,
    proprietarioId: r.proprietario_id,
    caseCostruite: r.case_costruite,
    ipotecata: r.ipotecata,
  }));
}

export async function fetchTrades(roomId) {
  const { data, error } = await supabase
    .from('monoverse_trades')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    daUserId: r.da_user_id,
    aUserId: r.a_user_id,
    offerta: r.offerta,
    richiesta: r.richiesta,
    stato: r.stato,
    createdAt: r.created_at,
  }));
}

export async function fetchLog(roomId, limit = 40) {
  const { data, error } = await supabase
    .from('monoverse_log')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((r) => ({ id: r.id, messaggio: r.messaggio, createdAt: r.created_at })).reverse();
}

export async function startCosmopoliGame(roomId) {
  const { error } = await supabase.rpc('start_monoverse_game', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

export async function rollDice(roomId) {
  const { error } = await supabase.rpc('monoverse_roll_dice', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

export async function buyProperty(roomId) {
  const { error } = await supabase.rpc('monoverse_buy_property', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

export async function skipPurchase(roomId) {
  const { error } = await supabase.rpc('monoverse_skip_purchase', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

export async function buildHouse(roomId, casella) {
  const { error } = await supabase.rpc('monoverse_build_house', { p_room_id: roomId, p_casella: casella });
  if (error) return { error: error.message };
  return {};
}

export async function sellHouse(roomId, casella) {
  const { error } = await supabase.rpc('monoverse_sell_house', { p_room_id: roomId, p_casella: casella });
  if (error) return { error: error.message };
  return {};
}

export async function mortgageProperty(roomId, casella) {
  const { error } = await supabase.rpc('monoverse_mortgage', { p_room_id: roomId, p_casella: casella });
  if (error) return { error: error.message };
  return {};
}

export async function unmortgageProperty(roomId, casella) {
  const { error } = await supabase.rpc('monoverse_unmortgage', { p_room_id: roomId, p_casella: casella });
  if (error) return { error: error.message };
  return {};
}

export async function payJailFine(roomId) {
  const { error } = await supabase.rpc('monoverse_pay_jail_fine', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

export async function useJailCard(roomId) {
  const { error } = await supabase.rpc('monoverse_use_jail_card', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

export async function endTurn(roomId) {
  const { error } = await supabase.rpc('monoverse_end_turn', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

export async function declareBankruptcy(roomId) {
  const { error } = await supabase.rpc('monoverse_declare_bankruptcy', { p_room_id: roomId });
  if (error) return { error: error.message };
  return {};
}

// offerta/richiesta: { denaro: number, proprieta: number[] (caselle) }
export async function proposeTrade(roomId, aUserId, offerta, richiesta) {
  const { data, error } = await supabase.rpc('monoverse_propose_trade', {
    p_room_id: roomId,
    p_a_user_id: aUserId,
    p_offerta: offerta,
    p_richiesta: richiesta,
  });
  if (error) return { error: error.message };
  return { id: data };
}

export async function respondTrade(roomId, tradeId, accetta) {
  const { error } = await supabase.rpc('monoverse_respond_trade', { p_room_id: roomId, p_trade_id: tradeId, p_accetta: accetta });
  if (error) return { error: error.message };
  return {};
}

export async function cancelTrade(roomId, tradeId) {
  const { error } = await supabase.rpc('monoverse_cancel_trade', { p_room_id: roomId, p_trade_id: tradeId });
  if (error) return { error: error.message };
  return {};
}
