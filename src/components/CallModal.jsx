import { useEffect, useRef, useState } from 'react';
import { openCallChannel, ICE_SERVERS, RING_TIMEOUT_MS, CONNECT_TIMEOUT_MS, RING_REPEAT_MS, ringCall, setRingState, answerLatestRing, playRingtone } from '../data/calls';
import { supabase } from '../data/supabaseClient';
import { displayName } from '../data/posts';
import './CallModal.css';

// Videochiamata 1:1 via WebRTC, senza server proprio: il canale Realtime
// privato "call:<conversationId>" (autorizzato dal DB ai soli 2
// partecipanti) porta solo la segnalazione, i video passano diretti
// (peer-to-peer) una volta stabilita la connessione. Montato sempre
// insieme a FriendChatModal (non solo mentre si chiama): serve a
// ricevere una chiamata in arrivo anche se non l'ho avviata io. Fuori
// dalla chat la chiamata arriva con lo squillo (call_rings, vedi
// IncomingCallToast): "Rispondi" apre la chat con autoAnswer, e al primo
// "ring" ricevuto qui la chiamata viene accettata da sola.
export default function CallModal({ conversationId, user, friend, registerStart, autoAnswer = false }) {
  const [phase, setPhase] = useState('idle'); // idle | calling | ringing | connecting | active | ended
  const [endMessage, setEndMessage] = useState('');
  const [incomingFrom, setIncomingFrom] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const phaseRef = useRef('idle');
  const roleRef = useRef(null); // 'caller' | 'callee'
  const channelRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const connectTimeoutRef = useRef(null);
  const pendingIceRef = useRef([]);
  // Chi chiama ripete "ring" ogni 3 s (chi apre la chat in ritardo lo
  // riceve comunque) e tiene l'id dello squillo per segnarne l'esito.
  const ringRepeatRef = useRef(null);
  const ringIdRef = useRef(null);
  // Dopo un "Rifiuta" si ignorano per qualche secondo i ring ripetuti.
  const declinedUntilRef = useRef(0);
  // Vale una volta sola: consumato dal primo ring (vedi sotto).
  const autoAnswerRef = useRef(autoAnswer);
  useEffect(() => {
    autoAnswerRef.current = autoAnswer;
  }, [autoAnswer]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const send = (event, payload) => {
    channelRef.current?.send({ type: 'broadcast', event, payload: payload ?? {} });
  };

  const clearTimers = () => {
    clearTimeout(ringTimeoutRef.current);
    clearTimeout(connectTimeoutRef.current);
    clearInterval(ringRepeatRef.current);
  };

  const cleanupPeer = () => {
    clearTimers();
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    pendingIceRef.current = [];
    roleRef.current = null;
    setMuted(false);
    setCameraOff(false);
  };

  const goIdle = () => {
    cleanupPeer();
    setPhase('idle');
  };

  const endWithMessage = (message) => {
    cleanupPeer();
    setEndMessage(message);
    setPhase('ended');
  };

  // Crea la RTCPeerConnection (uguale per chi chiama e chi risponde):
  // invia ogni candidato ICE non appena pronto, riceve le tracce audio/
  // video dell'altra parte, e segue lo stato della connessione per il
  // timeout dei 20 secondi e per accorgersi se la chiamata cade.
  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) send('ice', { candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      remoteStreamRef.current = e.streams[0];
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(connectTimeoutRef.current);
        setPhase('active');
      } else if (pc.connectionState === 'failed' && phaseRef.current !== 'idle' && phaseRef.current !== 'ended') {
        endWithMessage('Connessione persa.');
      }
    };
    pcRef.current = pc;
    return pc;
  };

  const getLocalStream = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  };

  // Chi risponde e chi chiama fanno la stessa cosa una volta accettata la
  // chiamata: media locale, peer connection, tracce aggiunte; cambia solo
  // chi crea l'offerta (chi ha chiamato) e chi la riceve.
  const setupMediaAndPeer = async () => {
    const stream = await getLocalStream();
    const pc = createPeerConnection();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    connectTimeoutRef.current = setTimeout(() => {
      if (phaseRef.current === 'connecting') {
        send('hangup');
        endWithMessage('Impossibile collegarsi da questa rete, riprova più tardi.');
      }
    }, CONNECT_TIMEOUT_MS);
    return pc;
  };

  const flushPendingIce = async (pc) => {
    for (const candidate of pendingIceRef.current) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // candidato non più valido: non blocca il resto della chiamata.
      }
    }
    pendingIceRef.current = [];
  };

  const startCall = async () => {
    if (phaseRef.current !== 'idle') return;
    roleRef.current = 'caller';
    setPhase('calling');
    const ringPayload = { fromName: displayName(user), fromAvatar: user.avatar || '' };
    send('ring', ringPayload);
    ringRepeatRef.current = setInterval(() => {
      if (phaseRef.current === 'calling') send('ring', ringPayload);
    }, RING_REPEAT_MS);
    ringIdRef.current = null;
    ringCall(conversationId).then(({ id, error }) => {
      if (error && phaseRef.current === 'calling') {
        send('hangup');
        endWithMessage(error);
        return;
      }
      ringIdRef.current = id ?? null;
      // Annullata prima che lo squillo fosse registrato.
      if (id && phaseRef.current !== 'calling' && phaseRef.current !== 'connecting' && phaseRef.current !== 'active') setRingState(id, 'annullata');
    });
    ringTimeoutRef.current = setTimeout(() => {
      if (phaseRef.current === 'calling') {
        send('hangup');
        setRingState(ringIdRef.current, 'persa');
        endWithMessage('Nessuna risposta.');
      }
    }, RING_TIMEOUT_MS);
  };

  const acceptCall = async () => {
    clearTimeout(ringTimeoutRef.current);
    roleRef.current = 'callee';
    setPhase('connecting');
    send('accept');
    answerLatestRing(conversationId, user.id, 'accettata');
    try {
      await setupMediaAndPeer();
    } catch {
      send('hangup');
      endWithMessage('Non riesco ad accedere a fotocamera/microfono.');
    }
  };

  const declineCall = () => {
    send('decline');
    answerLatestRing(conversationId, user.id, 'rifiutata');
    declinedUntilRef.current = Date.now() + 2 * RING_REPEAT_MS;
    goIdle();
  };

  const hangup = () => {
    if (roleRef.current === 'caller' && phaseRef.current === 'calling') setRingState(ringIdRef.current, 'annullata');
    send('hangup');
    goIdle();
  };

  // Canale sempre sottoscritto mentre la chat è aperta (non solo durante
  // una chiamata): è l'unico modo di sapere che sta arrivando una
  // chiamata. Le callback leggono phaseRef/roleRef (non "phase" chiuso
  // nella closure di montaggio) perché il canale si apre una sola volta.
  useEffect(() => {
    if (!conversationId) return undefined;
    const channel = openCallChannel(conversationId);
    channelRef.current = channel;

    channel.on('broadcast', { event: 'ring' }, ({ payload }) => {
      if (phaseRef.current !== 'idle') return; // già in chiamata: ignora (l'altro riceverà "nessuna risposta")
      if (Date.now() < declinedUntilRef.current) return;
      roleRef.current = 'callee';
      setIncomingFrom({ name: payload?.fromName || friend?.name || 'Utente', avatar: payload?.fromAvatar || friend?.avatar || '' });
      if (autoAnswerRef.current) {
        // "Rispondi" già toccato nell'avviso globale.
        autoAnswerRef.current = false;
        phaseRef.current = 'ringing';
        acceptCall();
        return;
      }
      setPhase('ringing');
    });

    channel.on('broadcast', { event: 'accept' }, async () => {
      if (roleRef.current !== 'caller' || phaseRef.current !== 'calling') return;
      clearTimeout(ringTimeoutRef.current);
      setPhase('connecting');
      try {
        const pc = await setupMediaAndPeer();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send('offer', { sdp: offer });
      } catch {
        send('hangup');
        endWithMessage('Non riesco ad accedere a fotocamera/microfono.');
      }
    });

    channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      const pc = pcRef.current;
      if (roleRef.current !== 'callee' || !pc || !payload?.sdp) return;
      await pc.setRemoteDescription(payload.sdp);
      await flushPendingIce(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send('answer', { sdp: answer });
    });

    channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      const pc = pcRef.current;
      if (roleRef.current !== 'caller' || !pc || !payload?.sdp) return;
      await pc.setRemoteDescription(payload.sdp);
      await flushPendingIce(pc);
    });

    channel.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      const pc = pcRef.current;
      if (!pc || !payload?.candidate) return;
      if (pc.remoteDescription) {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch {
          // ignorato: un candidato ICE arrivato in ritardo non è fatale.
        }
      } else {
        pendingIceRef.current.push(payload.candidate);
      }
    });

    channel.on('broadcast', { event: 'decline' }, () => {
      if (roleRef.current === 'caller' && phaseRef.current === 'calling') {
        clearTimeout(ringTimeoutRef.current);
        endWithMessage('Chiamata rifiutata.');
      }
    });

    channel.on('broadcast', { event: 'hangup' }, () => {
      if (phaseRef.current === 'idle') return;
      const wasConnecting = phaseRef.current === 'connecting' || phaseRef.current === 'active';
      cleanupPeer();
      if (wasConnecting) {
        setEndMessage('Chiamata terminata.');
        setPhase('ended');
      } else {
        setPhase('idle');
      }
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      cleanupPeer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Suoneria ripetuta finché squilla.
  useEffect(() => {
    if (phase !== 'ringing') return undefined;
    playRingtone();
    const t = setInterval(playRingtone, 2500);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    registerStart?.(startCall);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerStart]);

  // I tag <video> esistono nel markup solo durante "active" (prima non c'è
  // niente da mostrare): appena montano, si riattaccano gli stream già in
  // mano ai ref, altrimenti resterebbero a schermo nero — ontrack/
  // getUserMedia possono essere scattati mentre i tag non erano ancora nel DOM.
  useEffect(() => {
    if (phase !== 'active') return;
    if (localVideoRef.current && localStreamRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    if (remoteVideoRef.current && remoteStreamRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
  }, [phase]);

  const toggleMuted = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((t) => { t.enabled = !next; });
    setCameraOff(next);
  };

  if (phase === 'idle') return null;

  return (
    <div className="rb-call-overlay" onClick={(e) => e.stopPropagation()}>
      {phase === 'calling' && (
        <div className="rb-call-panel">
          <img className="rb-call-avatar" src={friend?.avatar} alt="" />
          <p className="rb-call-title">Chiamata a {friend?.name}...</p>
          <p className="rb-call-hint">In attesa di risposta</p>
          <button type="button" className="rb-call-btn-decline" onClick={hangup}>Annulla</button>
        </div>
      )}

      {phase === 'ringing' && (
        <div className="rb-call-panel rb-call-ringing">
          <img className="rb-call-avatar" src={incomingFrom?.avatar} alt="" />
          <p className="rb-call-title">{incomingFrom?.name} ti sta chiamando</p>
          <div className="rb-call-actions">
            <button type="button" className="rb-call-btn-decline" onClick={declineCall}>✕ Rifiuta</button>
            <button type="button" className="rb-call-btn-accept" onClick={acceptCall}>📹 Accetta</button>
          </div>
        </div>
      )}

      {phase === 'connecting' && (
        <div className="rb-call-panel">
          <p className="rb-call-title">Connessione in corso...</p>
          <button type="button" className="rb-call-btn-decline" onClick={hangup}>Annulla</button>
        </div>
      )}

      {phase === 'active' && (
        <div className="rb-call-active">
          <video ref={remoteVideoRef} className="rb-call-remote-video" autoPlay playsInline />
          <video ref={localVideoRef} className="rb-call-local-video" autoPlay playsInline muted />
          <div className="rb-call-controls">
            <button type="button" className={`rb-call-ctrl-btn ${muted ? 'active' : ''}`} onClick={toggleMuted} aria-label="Muto">
              {muted ? '🔇' : '🎙️'}
            </button>
            <button type="button" className="rb-call-ctrl-btn rb-call-hangup" onClick={hangup} aria-label="Riaggancia">📞</button>
            <button type="button" className={`rb-call-ctrl-btn ${cameraOff ? 'active' : ''}`} onClick={toggleCamera} aria-label="Camera">
              {cameraOff ? '🚫' : '📷'}
            </button>
          </div>
        </div>
      )}

      {phase === 'ended' && (
        <div className="rb-call-panel">
          <p className="rb-call-title">{endMessage}</p>
          <button type="button" className="rb-call-btn-decline" onClick={goIdle}>Chiudi</button>
        </div>
      )}
    </div>
  );
}
