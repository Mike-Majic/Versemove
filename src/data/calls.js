import { supabase } from './supabaseClient';

// Videochiamata 1:1 via WebRTC: nessun server proprio, solo un canale
// Realtime privato per lo scambio dei messaggi di segnalazione (ring/
// accept/decline/offer/answer/ice/hangup). Il DB autorizza il canale
// "call:<conversationId>" ai soli 2 partecipanti della conversazione
// diretta (vedi can_join_call lato server, non toccato): qui c'è solo la
// creazione del canale, la vera logica sta in components/CallModal.jsx.
export function openCallChannel(conversationId) {
  return supabase.channel(`call:${conversationId}`, {
    config: { broadcast: { self: false }, private: true },
  });
}

// Videochiamata di gruppo nella Stanza MOD: stesso meccanismo (canale
// Realtime privato, autorizzato solo a owner/moderatori da can_join_call
// lato server), ma un solo topic fisso condiviso da tutto lo staff invece
// di uno per conversazione, più la presence per sapere chi è già dentro.
export function openModRoomCallChannel() {
  return openPrivateChannel('call:modroom');
}

// Canale privato generico per le chiamate di gruppo (useMeshCall): la
// Stanza MOD usa "call:modroom", le stanze video del mondo Nerd
// "vroom:<room_id>"; can_join_call lato server decide chi può entrare.
export function openPrivateChannel(topic) {
  return supabase.channel(topic, {
    config: { broadcast: { self: false }, private: true },
  });
}

// Server ICE (STUN/TURN) da usare per una chiamata. Le credenziali TURN
// sono temporanee (4 ore) e le genera l'edge function turn-credentials
// con la chiave Cloudflare nel Vault: mai nel sito né in variabili
// d'ambiente. Qui si tengono in memoria e si riusano finché mancano più di
// 10 minuti alla scadenza; se la funzione risponde solo STUN (TURN non
// configurato o Cloudflare giù) non si mette in cache e si riprova alla
// chiamata dopo. Errore o 6 secondi senza risposta: STUN pubblico e la
// chiamata parte lo stesso. Senza TURN, con alcune reti (4G, reti
// aziendali) il collegamento diretto fra due persone può non riuscire.
const STUN_FALLBACK = [{ urls: 'stun:stun.l.google.com:19302' }];
const ICE_TIMEOUT_MS = 6000;
const ICE_REFRESH_MARGIN_MS = 10 * 60 * 1000;
let iceCache = null; // { servers, source, expiresAt }
let iceInflight = null;
let lastIceSource = 'stun';

export const getIceSource = () => lastIceSource;

export function getIceServers() {
  if (iceCache && Date.now() < iceCache.expiresAt - ICE_REFRESH_MARGIN_MS) {
    lastIceSource = iceCache.source;
    return Promise.resolve(iceCache.servers);
  }
  if (iceInflight) return iceInflight;
  iceInflight = (async () => {
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ICE_TIMEOUT_MS);
      });
      const { data, error } = await Promise.race([supabase.functions.invoke('turn-credentials', { body: {} }), timeout]);
      if (error || !Array.isArray(data?.iceServers) || !data.iceServers.length) throw error ?? new Error('risposta vuota');
      lastIceSource = data.source === 'cloudflare' ? 'cloudflare' : 'stun';
      if (import.meta.env.DEV) console.info(`[ice] server da turn-credentials: ${lastIceSource}`);
      if (lastIceSource === 'cloudflare' && Number(data.ttl) > 0) {
        iceCache = { servers: data.iceServers, source: lastIceSource, expiresAt: Date.now() + Number(data.ttl) * 1000 };
      } else {
        iceCache = null;
      }
      return data.iceServers;
    } catch {
      lastIceSource = 'stun';
      return STUN_FALLBACK;
    } finally {
      clearTimeout(timer);
      iceInflight = null;
    }
  })();
  return iceInflight;
}

// Diagnostica (solo in sviluppo): da dove arrivano i server ICE e, a
// collegamento avvenuto, che strada ha preso la chiamata. "relay" = passa
// dal TURN; "srflx"/"host" = diretta.
export async function logIceRoute(pc, label = 'chiamata') {
  if (!import.meta.env.DEV) return;
  try {
    const stats = await pc.getStats();
    let pair = null;
    stats.forEach((r) => {
      if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
    });
    if (!pair) stats.forEach((r) => {
      if (!pair && r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) pair = r;
    });
    const local = pair ? stats.get(pair.localCandidateId) : null;
    const remote = pair ? stats.get(pair.remoteCandidateId) : null;
    console.info(`[ice] ${label}: server ${lastIceSource}, candidato locale ${local?.candidateType ?? '?'}, remoto ${remote?.candidateType ?? '?'}`);
  } catch {
    // statistiche non disponibili: niente diagnostica.
  }
}
// Oltre questo tempo senza collegamento con una persona, il suo riquadro
// dice "Connessione non riuscita" (vedi useMeshCall).
export const PEER_CONNECT_TIMEOUT_MS = 15000;
export const RING_TIMEOUT_MS = 30000;
export const CONNECT_TIMEOUT_MS = 20000;

// Squilli (tabella call_rings): permettono di ricevere una chiamata in
// qualunque punto dell'app, non solo con la chat aperta. Chi chiama crea
// lo squillo (ring_call: stesse regole del canale della chiamata), chi
// riceve lo vede in tempo reale (IncomingCallToast) e ne segna l'esito.
export async function ringCall(conversationId) {
  const { data, error } = await supabase.rpc('ring_call', { p_conversation: conversationId });
  return error ? { error: error.message } : { id: data };
}

// stato: 'annullata' | 'persa' (chi chiama), 'accettata' | 'rifiutata'
// (chi riceve). Uno squillo già chiuso resta com'è.
export async function setRingState(ringId, stato) {
  if (!ringId) return;
  await supabase.rpc('set_call_ring_state', { p_id: ringId, p_stato: stato });
}

// Esito dello squillo attivo più recente di una conversazione, dal lato di
// chi riceve (CallModal non conosce l'id dello squillo).
export async function answerLatestRing(conversationId, userId, stato) {
  const { data } = await supabase
    .from('call_rings')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('callee_id', userId)
    .eq('stato', 'squilla')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.id) await setRingState(data.id, stato);
}

// Squilli per me: nuovi (INSERT) e cambi di stato (UPDATE, es. chi chiama
// ha annullato). La RLS fa arrivare solo le righe in cui sono coinvolto.
export function subscribeIncomingRings(userId, onChange) {
  const channel = supabase
    .channel(`call-rings:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'call_rings', filter: `callee_id=eq.${userId}` }, (msg) => {
      if (msg.new?.id) onChange(msg.new);
    })
    .subscribe();
  return channel;
}

// Invia un solo evento sul canale di una chiamata senza montare CallModal
// (es. "Rifiuta" dall'avviso globale): si iscrive, invia, chiude.
export function sendCallSignal(conversationId, event, payload = {}) {
  const channel = openCallChannel(conversationId);
  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    channel.send({ type: 'broadcast', event, payload }).finally(() => setTimeout(() => supabase.removeChannel(channel), 500));
  });
}

export const RING_REPEAT_MS = 3000;

// Breve suoneria sintetizzata (stessa tecnica delle melodie del mondo
// Bambini, Web Audio nativo): niente file audio da scaricare/ospitare.
export function playRingtone() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const beep = (t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    };
    beep(ctx.currentTime);
    beep(ctx.currentTime + 0.35);
    setTimeout(() => ctx.close(), 900);
  } catch {
    // Web Audio non disponibile: niente suoneria, non blocca la chiamata.
  }
}
