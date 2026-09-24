import { useCallback, useEffect, useRef, useState } from 'react';
import { openPrivateChannel, iceServers, PEER_CONNECT_TIMEOUT_MS } from '../data/calls';
import { supabase } from '../data/supabaseClient';

// Videochiamata di gruppo "mesh" WebRTC: una RTCPeerConnection per ogni
// coppia di partecipanti, niente server media. Un canale Realtime privato
// (topic, autorizzato lato server da can_join_call) porta solo la
// segnalazione (offer/answer/ice) più la presence per sapere chi è dentro;
// audio e video passano diretti fra i browser.
//
// Anti-"glare": fra due partecipanti manda l'offerta sempre chi ha lo user
// id più grande (confronto stringa), l'altro aspetta. Vale sia quando arrivo
// e trovo altri già dentro (presence "sync") sia quando qualcuno arriva dopo
// di me: ogni coppia ha un solo iniziatore possibile.
//
// allowedUserIds (Set, facoltativo): chi non c'è non riceve né manda
// segnali (offerte/risposte/ICE/eventi da lui si ignorano, la connessione
// con lui si chiude). mutedUserIds (Set, facoltativo): il loro audio in
// arrivo si spegne sempre in locale, qualunque cosa faccia il loro client.
//
// Eventi applicativi (es. le azioni del proprietario di una stanza) passano
// dallo stesso canale: send(event, payload) e onEvent(event, handler).
const SIGNAL_EVENT = 'app';

export function useMeshCall({ topic, user, allowedUserIds = null, mutedUserIds = null }) {
  const [members, setMembers] = useState([]); // presence: [{ userId, name, avatar }]
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [remoteTiles, setRemoteTiles] = useState([]); // [{ userId, name, avatar, stream, failed, muted }]
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [micLocked, setMicLocked] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [error, setError] = useState('');

  const channelRef = useRef(null);
  const subscribedRef = useRef(null); // Promise risolta a SUBSCRIBED
  const joinedRef = useRef(false);
  const peersRef = useRef(new Map()); // userId -> { pc, name, avatar, stream, failed, pendingIce, timer }
  const localStreamRef = useRef(null);
  const handlersRef = useRef(new Map()); // event -> Set(handler)
  const allowedRef = useRef(allowedUserIds);
  const mutedRef = useRef(mutedUserIds);
  const userId = user?.id;

  const isAllowed = (id) => !allowedRef.current || allowedRef.current.has(id);

  const refreshTiles = useCallback(() => {
    setRemoteTiles(
      Array.from(peersRef.current.entries())
        .filter(([, e]) => e.stream || e.failed)
        .map(([id, e]) => ({
          userId: id,
          name: e.name,
          avatar: e.avatar,
          stream: e.stream,
          failed: e.failed,
          muted: Boolean(mutedRef.current?.has(id)),
        }))
    );
  }, []);

  // Audio in arrivo da un mutato: spento sulla traccia ricevuta, non solo
  // nel <video>, così non si sente comunque.
  const applyRemoteMute = (id, entry) => {
    const muted = Boolean(mutedRef.current?.has(id));
    entry.stream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  };

  const sendRaw = (event, payload) => {
    channelRef.current?.send({ type: 'broadcast', event, payload });
  };

  const send = useCallback(
    (event, payload) => {
      channelRef.current?.send({ type: 'broadcast', event: SIGNAL_EVENT, payload: { event, payload, from: userId } });
    },
    [userId]
  );

  const onEvent = useCallback((event, handler) => {
    const map = handlersRef.current;
    if (!map.has(event)) map.set(event, new Set());
    map.get(event).add(handler);
    return () => map.get(event)?.delete(handler);
  }, []);

  const flushPendingIce = async (entry) => {
    for (const candidate of entry.pendingIce) {
      try {
        await entry.pc.addIceCandidate(candidate);
      } catch {
        // candidato non più valido: non blocca il resto della chiamata.
      }
    }
    entry.pendingIce = [];
  };

  const closePeer = useCallback(
    (id) => {
      const entry = peersRef.current.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      entry.pc.close();
      peersRef.current.delete(id);
      refreshTiles();
    },
    [refreshTiles]
  );

  const ensurePeer = (id, meta) => {
    let entry = peersRef.current.get(id);
    if (entry) {
      if (meta?.name) entry.name = meta.name;
      if (meta?.avatar !== undefined) entry.avatar = meta.avatar;
      return entry;
    }
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    entry = { pc, name: meta?.name || 'Utente', avatar: meta?.avatar || '', stream: null, failed: false, pendingIce: [], timer: null };
    pc.onicecandidate = (e) => {
      if (e.candidate) sendRaw('ice', { to: id, from: userId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      entry.stream = e.streams[0];
      applyRemoteMute(id, entry);
      refreshTiles();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(entry.timer);
        if (entry.failed) {
          entry.failed = false;
          refreshTiles();
        }
      } else if (pc.connectionState === 'failed') {
        entry.failed = true;
        refreshTiles();
      } else if (pc.connectionState === 'closed') {
        closePeer(id);
      }
    };
    // Se entro PEER_CONNECT_TIMEOUT_MS il collegamento non riesce (rete che
    // blocca il peer-to-peer, senza TURN), il riquadro lo dice invece di
    // restare nero per sempre.
    entry.timer = setTimeout(() => {
      if (pc.connectionState !== 'connected') {
        entry.failed = true;
        refreshTiles();
      }
    }, PEER_CONNECT_TIMEOUT_MS);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
    }
    peersRef.current.set(id, entry);
    return entry;
  };

  const makeOfferTo = async (id, meta) => {
    const entry = ensurePeer(id, meta);
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    sendRaw('offer', { to: id, from: userId, sdp: offer });
  };

  // Per ogni presente non ancora collegato decide chi dei due offre (vedi
  // in cima); chi non è fra gli ammessi si salta.
  const reconcilePeers = (others) => {
    others.forEach((m) => {
      if (m.userId === userId || peersRef.current.has(m.userId) || !isAllowed(m.userId)) return;
      if (userId > m.userId) makeOfferTo(m.userId, m);
      else ensurePeer(m.userId, m);
    });
  };

  const readPresence = () => {
    const channel = channelRef.current;
    if (!channel) return [];
    return Object.values(channel.presenceState())
      .flat()
      .map((p) => ({ userId: p.user_id, name: p.name, avatar: p.avatar }));
  };

  // Canale: si apre quando c'è un topic (per le stanze video solo dopo
  // essere entrati, perché il server lo autorizza solo ai membri).
  useEffect(() => {
    if (!topic || !userId) return undefined;
    const channel = openPrivateChannel(topic);
    channelRef.current = channel;
    let resolveSubscribed;
    let rejectSubscribed;
    subscribedRef.current = new Promise((resolve, reject) => {
      resolveSubscribed = resolve;
      rejectSubscribed = reject;
    });
    subscribedRef.current.catch(() => {});

    const syncMembers = () => {
      const list = readPresence();
      setMembers(list);
      if (joinedRef.current) reconcilePeers(list.filter((m) => m.userId !== userId));
    };
    channel.on('presence', { event: 'sync' }, syncMembers);
    channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      leftPresences.forEach((p) => closePeer(p.user_id));
    });

    channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      if (payload.to !== userId || !joinedRef.current || !isAllowed(payload.from)) return;
      const entry = ensurePeer(payload.from, null);
      await entry.pc.setRemoteDescription(payload.sdp);
      await flushPendingIce(entry);
      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
      sendRaw('answer', { to: payload.from, from: userId, sdp: answer });
    });
    channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      if (payload.to !== userId || !isAllowed(payload.from)) return;
      const entry = peersRef.current.get(payload.from);
      if (!entry || entry.pc.signalingState !== 'have-local-offer') return;
      await entry.pc.setRemoteDescription(payload.sdp);
      await flushPendingIce(entry);
    });
    channel.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      if (payload.to !== userId || !isAllowed(payload.from)) return;
      const entry = peersRef.current.get(payload.from);
      if (!entry) return;
      if (entry.pc.remoteDescription) {
        try {
          await entry.pc.addIceCandidate(payload.candidate);
        } catch {
          // ignorato: un candidato ICE arrivato in ritardo non è fatale.
        }
      } else {
        entry.pendingIce.push(payload.candidate);
      }
    });
    channel.on('broadcast', { event: SIGNAL_EVENT }, ({ payload }) => {
      if (!payload?.event || !isAllowed(payload.from)) return;
      handlersRef.current.get(payload.event)?.forEach((h) => h(payload.payload, payload.from));
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolveSubscribed();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') rejectSubscribed(new Error(status));
    });

    const peers = peersRef.current;
    return () => {
      peers.forEach((entry) => {
        clearTimeout(entry.timer);
        entry.pc.close();
      });
      peers.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      joinedRef.current = false;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, userId]);

  // Ammessi cambiati: si chiude chi non c'è più e si collega chi è entrato.
  useEffect(() => {
    allowedRef.current = allowedUserIds;
    if (!allowedUserIds) return;
    Array.from(peersRef.current.keys()).forEach((id) => {
      if (!allowedUserIds.has(id)) closePeer(id);
    });
    if (joinedRef.current) reconcilePeers(readPresence().filter((m) => m.userId !== userId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedUserIds]);

  useEffect(() => {
    mutedRef.current = mutedUserIds;
    peersRef.current.forEach((entry, id) => applyRemoteMute(id, entry));
    refreshTiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutedUserIds]);

  const join = useCallback(
    async (meta) => {
      if (joinedRef.current || !channelRef.current) return false;
      setJoining(true);
      setError('');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
      } catch {
        setError('Non riesco ad accedere a fotocamera/microfono.');
        setJoining(false);
        return false;
      }
      try {
        await Promise.race([
          subscribedRef.current,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
        ]);
        await channelRef.current.track({ user_id: userId, name: meta?.name ?? '', avatar: meta?.avatar ?? '' });
      } catch {
        localStreamRef.current?.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
        setLocalStream(null);
        setError('Non riesco a collegarmi alla chiamata.');
        setJoining(false);
        return false;
      }
      joinedRef.current = true;
      setJoined(true);
      setJoining(false);
      reconcilePeers(readPresence().filter((m) => m.userId !== userId));
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId]
  );

  const leave = useCallback(() => {
    channelRef.current?.untrack();
    peersRef.current.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.pc.close();
    });
    peersRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    joinedRef.current = false;
    setLocalStream(null);
    setRemoteTiles([]);
    setJoined(false);
    setMicOn(true);
    setCameraOn(true);
  }, []);

  const setMicEnabled = (on) => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = on;
    });
    setMicOn(on);
  };

  const toggleMic = () => {
    if (micLocked) return;
    setMicEnabled(!micOn);
  };

  const toggleCamera = () => {
    const next = !cameraOn;
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
    setCameraOn(next);
  };

  // Microfono bloccato da fuori (es. mutato dal proprietario della stanza):
  // spento e non riattivabile finché non si sblocca.
  const lockMic = useCallback((locked) => {
    setMicLocked(locked);
    if (locked) {
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });
      setMicOn(false);
    }
  }, []);

  return {
    members,
    joined,
    joining,
    error,
    localStream,
    remoteTiles,
    micOn,
    micLocked,
    cameraOn,
    join,
    leave,
    toggleMic,
    toggleCamera,
    lockMic,
    closePeer,
    send,
    onEvent,
  };
}
