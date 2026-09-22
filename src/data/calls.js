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
  return supabase.channel('call:modroom', {
    config: { broadcast: { self: false }, private: true },
  });
}

export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
export const RING_TIMEOUT_MS = 30000;
export const CONNECT_TIMEOUT_MS = 20000;
