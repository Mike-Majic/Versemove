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

// Server ICE: STUN pubblico di Google sempre; un TURN solo se configurato
// con VITE_TURN_URLS (separati da virgola), VITE_TURN_USERNAME e
// VITE_TURN_CREDENTIAL. Senza TURN, con alcune reti (4G, reti aziendali)
// il collegamento diretto fra due persone può non riuscire.
export function iceServers() {
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  const turnUrls = (import.meta.env.VITE_TURN_URLS ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  if (turnUrls.length) {
    servers.push({
      urls: turnUrls,
      username: import.meta.env.VITE_TURN_USERNAME ?? '',
      credential: import.meta.env.VITE_TURN_CREDENTIAL ?? '',
    });
  }
  return servers;
}

export const ICE_SERVERS = iceServers();
// Oltre questo tempo senza collegamento con una persona, il suo riquadro
// dice "Connessione non riuscita" (vedi useMeshCall).
export const PEER_CONNECT_TIMEOUT_MS = 15000;
export const RING_TIMEOUT_MS = 30000;
export const CONNECT_TIMEOUT_MS = 20000;
