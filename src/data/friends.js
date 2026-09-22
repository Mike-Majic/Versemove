import { supabase } from './supabaseClient';
import { fetchProfilesMap, displayName } from './posts';
import { translateInteractionError } from './errors';

function mapProfileRow(row) {
  return { id: row.id, name: displayName(row), avatar: row.avatar_url || '' };
}

// Cerca persone reali per nickname o nome utente (vista public_profiles,
// gli unici campi pubblici di profiles) — sostituisce la vecchia ricerca
// su MOCK_USERS, ormai vuoto.
export async function searchProfiles(query, { excludeIds = [] } = {}) {
  try {
    // "," e "()" hanno un significato speciale nel filtro .or() di
    // PostgREST: tolti, altrimenti un testo digitato con quei caratteri
    // spezzerebbe il filtro invece di essere cercato alla lettera.
    const q = query.trim().replace(/[,()]/g, ' ');
    if (!q) return [];
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth?.user?.id ?? null;
    const exclude = new Set([...excludeIds, myId].filter(Boolean));

    const { data, error } = await supabase
      .from('public_profiles')
      .select('id, nickname, username, avatar_url')
      .or(`nickname.ilike.%${q}%,username.ilike.%${q}%`)
      .limit(20);
    if (error || !data) return [];
    return data.filter((p) => !exclude.has(p.id)).map(mapProfileRow);
  } catch {
    return [];
  }
}

export async function sendFriendRequest(toId) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    if (auth.user.id === toId) return { error: 'Non puoi inviare una richiesta a te stesso.' };

    // Evita di duplicare una richiesta già in sospeso (nessun vincolo unico
    // a livello di tabella per questo).
    const { data: existing } = await supabase
      .from('friend_requests')
      .select('id')
      .eq('from_id', auth.user.id)
      .eq('to_id', toId)
      .eq('stato', 'in_attesa')
      .maybeSingle();
    if (existing) return {};

    const { error } = await supabase.from('friend_requests').insert({ from_id: auth.user.id, to_id: toId });
    if (error) return { error: translateInteractionError(error) };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

async function mapRequestsWithProfiles(rows, otherIdKey) {
  const profilesMap = await fetchProfilesMap(rows.map((r) => r[otherIdKey]));
  return rows.map((r) => ({
    id: r.id,
    fromId: r.from_id,
    toId: r.to_id,
    stato: r.stato,
    data: r.created_at,
    other: profilesMap.get(r[otherIdKey]) ?? { id: r[otherIdKey], name: 'Utente', avatar: '' },
  }));
}

// Richieste ricevute ancora in sospeso, con il profilo di chi le ha mandate.
export async function getReceivedRequests() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('to_id', auth.user.id)
      .eq('stato', 'in_attesa')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return mapRequestsWithProfiles(data, 'from_id');
  } catch {
    return [];
  }
}

// Richieste mandate ancora in sospeso, con il profilo di chi dovrebbe risponderci.
export async function getSentRequests() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('from_id', auth.user.id)
      .eq('stato', 'in_attesa')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return mapRequestsWithProfiles(data, 'to_id');
  } catch {
    return [];
  }
}

// Accetta/rifiuta (dal lato di chi riceve) o annulla (dal lato di chi
// manda) una richiesta: un'unica funzione lato server già gestisce tutti
// e tre i casi in base a chi chiama.
export async function respondToRequest(requestId, accept) {
  try {
    const { error } = await supabase.rpc('respond_friend_request', { p_request_id: requestId, p_accetta: accept });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Lista amici reali (tabella friendships, coppia canonica user_a < user_b):
// per ogni riga si risolve "l'altro" rispetto a chi chiama.
export async function getFriends() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const myId = auth.user.id;
    const { data, error } = await supabase.from('friendships').select('*').or(`user_a.eq.${myId},user_b.eq.${myId}`);
    if (error || !data) return [];

    const otherIds = data.map((r) => (r.user_a === myId ? r.user_b : r.user_a));
    const profilesMap = await fetchProfilesMap(otherIds);
    return otherIds.map((id) => profilesMap.get(id) ?? { id, name: 'Utente', avatar: '' });
  } catch {
    return [];
  }
}

// true se si è amici o si ha un match con l'altra persona (RPC lato server
// are_connected): decide se mostrare il pulsante 📹 videochiamata nella
// chat, ed è la stessa condizione richiesta dalla RLS per il canale della
// chiamata — qui serve solo per l'interfaccia, non è un controllo di
// sicurezza (quello lo fa comunque il server).
export async function areConnected(otherId) {
  try {
    const { data, error } = await supabase.rpc('are_connected', { p_other: otherId });
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function removeFriend(otherId) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const myId = auth.user.id;
    const { error } = await supabase
      .from('friendships')
      .delete()
      .or(`and(user_a.eq.${myId},user_b.eq.${otherId}),and(user_a.eq.${otherId},user_b.eq.${myId})`);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}
