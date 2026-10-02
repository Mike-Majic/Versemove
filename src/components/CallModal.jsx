import { useEffect, useRef, useState } from 'react';
import { openCallChannel, getIceServers, logIceRoute, RING_TIMEOUT_MS, CONNECT_TIMEOUT_MS, RING_REPEAT_MS, ringCall, setRingState, answerLatestRing, playRingtone } from '../data/calls';
import { supabase } from '../data/supabaseClient';
import { displayName } from '../data/posts';
import { useCalls } from '../calls/CallProvider';
import { MiniCallMonitor, MinimizeCallButton, RemoteAudio, ScreenShareButton } from '../calls/CallSurface';
import './CallModal.css';
import AvatarImg from './shared/AvatarImg';
import { acquireLocalMedia, switchLocalDevice } from '../calls/localMedia';
import DevicePicker from '../calls/DevicePicker';

// Videochiamata 1:1 via WebRTC, senza server proprio: il canale Realtime
// privato "call:<conversationId>" (autorizzato dal DB ai soli 2
// partecipanti) porta solo la segnalazione, i video passano diretti
// (peer-to-peer) una volta stabilita la connessione. Montato da
// calls/CallProvider quando una chat è aperta (serve a ricevere una
// chiamata in arrivo anche se non l'ho avviata io) e tenuto montato finché
// la chiamata è in corso, anche chiudendo la chat o cambiando mondo
// (mini-monitor). Fuori dalla chat la chiamata arriva con lo squillo
// (call_rings, vedi IncomingCallToast): "Rispondi" apre la chat con
// autoAnswer, e al primo "ring" ricevuto qui la chiamata viene accettata
// da sola. Vale anche per le videochiamate fra match di Incontri.
export default function CallModal({ conversationId, user, friend, registerStart, autoAnswer = false, onPhaseChange }) {
  const { views, setView } = useCalls();
  const mini = views.direct === 'mini';
  const [phase, setPhase] = useState('idle'); // idle | calling | ringing | connecting | active | ended
  const [endMessage, setEndMessage] = useState('');
  const [incomingFrom, setIncomingFrom] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  // Microfono/fotocamera: si entra anche con uno solo (calls/localMedia.js).
  const [hasAudio, setHasAudio] = useState(true);
  const [hasVideo, setHasVideo] = useState(true);
  const [mediaWarning, setMediaWarning] = useState('');
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [mediaVersion, setMediaVersion] = useState(0);
  // Stream dell'altra persona in stato (non solo nel ref): serve all'audio
  // sempre acceso (RemoteAudio) e al mini-monitor.
  const [remoteStream, setRemoteStream] = useState(null);
  // Condivisione schermo: traccia che sostituisce la webcam sulla connessione.
  const [screenStream, setScreenStream] = useState(null);
  const screenTrackRef = useRef(null);

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
  // Offerta arrivata mentre chi risponde prepara ancora media e server ICE:
  // si tiene da parte e si usa appena la connessione esiste.
  const pendingOfferRef = useRef(null);
  // Server ICE chiesti in anticipo (a "Chiama" o allo squillo): la stessa
  // richiesta vale per tutta la chiamata, anche quando non va in cache
  // (risposta solo STUN o errore).
  const icePromiseRef = useRef(null);
  const preloadIce = () => {
    if (!icePromiseRef.current) icePromiseRef.current = getIceServers();
    return icePromiseRef.current;
  };
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
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);
  // Smontata (altra conversazione, uscita dall'account): chiamata ferma.
  const onPhaseChangeRef = useRef(onPhaseChange);
  useEffect(() => {
    onPhaseChangeRef.current = onPhaseChange;
  }, [onPhaseChange]);
  useEffect(() => () => onPhaseChangeRef.current?.('idle'), []);

  const send = (event, payload) => {
    channelRef.current?.send({ type: 'broadcast', event, payload: payload ?? {} });
  };

  const clearTimers = () => {
    clearTimeout(ringTimeoutRef.current);
    clearTimeout(connectTimeoutRef.current);
    clearInterval(ringRepeatRef.current);
  };

  const stopScreenTrack = () => {
    const screen = screenTrackRef.current;
    if (!screen) return;
    screenTrackRef.current = null;
    screen.onended = null;
    screen.stop();
    setScreenStream(null);
  };

  const cleanupPeer = () => {
    clearTimers();
    stopScreenTrack();
    setRemoteStream(null);
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
    setMediaWarning('');
    setDevicesOpen(false);
    pendingIceRef.current = [];
    pendingOfferRef.current = null;
    icePromiseRef.current = null;
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
  const createPeerConnection = (iceServers) => {
    const pc = new RTCPeerConnection({ iceServers });
    pc.onicecandidate = (e) => {
      if (e.candidate) send('ice', { candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      remoteStreamRef.current = e.streams[0];
      setRemoteStream(e.streams[0]);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(connectTimeoutRef.current);
        setPhase('active');
        logIceRoute(pc, 'chiamata 1:1');
      } else if (pc.connectionState === 'failed' && phaseRef.current !== 'idle' && phaseRef.current !== 'ended') {
        endWithMessage('Connessione persa.');
      }
    };
    pcRef.current = pc;
    return pc;
  };

  // Audio e video chiesti separatamente: basta uno dei due. Al posto di
  // quello che manca c'è una traccia segnaposto (vedi localMedia.js).
  const getLocalStream = async () => {
    const media = await acquireLocalMedia();
    const stream = media.stream;
    localStreamRef.current = stream;
    setHasAudio(media.hasAudio);
    setHasVideo(media.hasVideo);
    setMuted(!media.hasAudio);
    setCameraOff(!media.hasVideo);
    setMediaWarning(media.warnings.join(' '));
    setMediaVersion((n) => n + 1);
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  };

  // Cambio di microfono o fotocamera durante la chiamata.
  const switchDevice = async (kind, deviceId) => {
    const stream = localStreamRef.current;
    if (!stream) return { error: 'Nessuna chiamata in corso.' };
    const res = await switchLocalDevice(stream, kind, deviceId, pcRef.current?.getSenders() ?? [], {
      skipSenders: kind === 'video' && Boolean(screenTrackRef.current),
    });
    if (res.error) return res;
    if (kind === 'audio') {
      res.track.enabled = hasAudio ? !muted : true;
      setHasAudio(true);
      setMuted(!res.track.enabled);
    } else {
      res.track.enabled = hasVideo ? !cameraOff : true;
      setHasVideo(true);
      setCameraOff(!res.track.enabled);
    }
    setMediaWarning('');
    setMediaVersion((n) => n + 1);
    if (localVideoRef.current && !screenTrackRef.current) {
      localVideoRef.current.srcObject = null;
      localVideoRef.current.srcObject = stream;
    }
    return {};
  };

  // Chi risponde e chi chiama fanno la stessa cosa una volta accettata la
  // chiamata: media locale, peer connection, tracce aggiunte; cambia solo
  // chi crea l'offerta (chi ha chiamato) e chi la riceve.
  // I server ICE (credenziali TURN temporanee, vedi data/calls.js) si
  // chiedono insieme a fotocamera/microfono, così non aggiungono attesa;
  // una volta per chiamata, prima di creare la connessione.
  const setupMediaAndPeer = async () => {
    const [stream, iceServers] = await Promise.all([getLocalStream(), preloadIce()]);
    const pc = createPeerConnection(iceServers);
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

  const answerOffer = async (pc, sdp) => {
    await pc.setRemoteDescription(sdp);
    await flushPendingIce(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send('answer', { sdp: answer });
  };

  const startCall = async () => {
    if (phaseRef.current !== 'idle') return;
    roleRef.current = 'caller';
    setPhase('calling');
    preloadIce(); // precarica mentre squilla
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
    let pc;
    try {
      pc = await setupMediaAndPeer();
    } catch (err) {
      send('hangup');
      endWithMessage(err?.message || 'Non riesco ad accedere a fotocamera/microfono.');
      return;
    }
    const early = pendingOfferRef.current;
    pendingOfferRef.current = null;
    if (early) await answerOffer(pc, early);
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
      preloadIce(); // precarica mentre squilla
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
      } catch (err) {
        send('hangup');
        endWithMessage(err?.message || 'Non riesco ad accedere a fotocamera/microfono.');
      }
    });

    channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
      if (roleRef.current !== 'callee' || !payload?.sdp) return;
      if (!pcRef.current) {
        pendingOfferRef.current = payload.sdp;
        return;
      }
      await answerOffer(pcRef.current, payload.sdp);
    });

    channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
      const pc = pcRef.current;
      if (roleRef.current !== 'caller' || !pc || !payload?.sdp) return;
      await pc.setRemoteDescription(payload.sdp);
      await flushPendingIce(pc);
    });

    channel.on('broadcast', { event: 'ice' }, async ({ payload }) => {
      const pc = pcRef.current;
      if (!payload?.candidate) return;
      if (pc?.remoteDescription) {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch {
          // ignorato: un candidato ICE arrivato in ritardo non è fatale.
        }
      } else if (phaseRef.current === 'connecting' || phaseRef.current === 'active') {
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
    if (phase !== 'active' || mini) return;
    const mine = screenStream ?? localStreamRef.current;
    if (localVideoRef.current && mine) localVideoRef.current.srcObject = mine;
    if (remoteVideoRef.current && remoteStreamRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
  }, [phase, mini, screenStream]);

  // Condivisione schermo: la traccia dello schermo prende il posto della
  // webcam (replaceTrack); finita (anche dal pulsante del browser) si torna
  // alla webcam.
  const stopScreenShare = () => {
    if (!screenTrackRef.current) return;
    stopScreenTrack();
    const cam = localStreamRef.current?.getVideoTracks()[0] ?? null;
    const sender = pcRef.current?.getSenders().find((sd) => sd.track?.kind === 'video');
    if (sender) sender.replaceTrack(cam).catch(() => {});
  };

  const startScreenShare = async () => {
    if (screenTrackRef.current || !pcRef.current) return;
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      return;
    }
    const track = stream.getVideoTracks()[0];
    const sender = pcRef.current?.getSenders().find((sd) => sd.track?.kind === 'video');
    if (!track || !sender) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    screenTrackRef.current = track;
    track.onended = () => stopScreenShare();
    await sender.replaceTrack(track).catch(() => {});
    setScreenStream(stream);
  };

  const toggleMuted = () => {
    const stream = localStreamRef.current;
    if (!stream || !hasAudio) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream || !hasVideo) return;
    const next = !cameraOff;
    stream.getVideoTracks().forEach((t) => { t.enabled = !next; });
    setCameraOff(next);
  };

  if (phase === 'idle') return null;

  const remoteAudio = <RemoteAudio streams={[remoteStream]} />;

  if (phase === 'active' && mini) {
    return (
      <>
        {remoteAudio}
        <MiniCallMonitor
          kind="direct"
          title={friend?.name ?? 'Videochiamata'}
          stream={remoteStream}
          placeholder={friend?.avatar ? <img src={friend.avatar} alt="" /> : <span>{friend?.name}</span>}
          micOn={!muted}
          onToggleMic={toggleMuted}
          onHangup={hangup}
          sharing={Boolean(screenStream)}
          onStartShare={startScreenShare}
          onStopShare={stopScreenShare}
          onExpand={() => setView('direct', 'full')}
        />
      </>
    );
  }

  return (
    <div className="rb-call-overlay" onClick={(e) => e.stopPropagation()}>
      {remoteAudio}
      {phase === 'calling' && (
        <div className="rb-call-panel">
          <AvatarImg className="rb-call-avatar" src={friend?.avatar} name={friend?.name || friend?.nickname} seed={friend?.id} alt="" />
          <p className="rb-call-title">Chiamata a {friend?.name}...</p>
          <p className="rb-call-hint">In attesa di risposta</p>
          <button type="button" className="rb-call-btn-decline" onClick={hangup}>Annulla</button>
        </div>
      )}

      {phase === 'ringing' && (
        <div className="rb-call-panel rb-call-ringing">
          <AvatarImg className="rb-call-avatar" src={incomingFrom?.avatar} name={incomingFrom?.name || incomingFrom?.nickname} seed={incomingFrom?.id} alt="" />
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
          {/* Muto: l'audio passa da RemoteAudio, che resta col mini-monitor. */}
          <video ref={remoteVideoRef} className="rb-call-remote-video" autoPlay playsInline muted />
          <video ref={localVideoRef} className={`rb-call-local-video ${screenStream ? 'is-screen' : ''}`} autoPlay playsInline muted />
          <MinimizeCallButton kind="direct" className="rb-call-minimize" />
          {mediaWarning && !devicesOpen && <p className="rb-call-media-warning">⚠️ {mediaWarning}</p>}
          {devicesOpen && (
            <div className="rb-call-devices">
              <DevicePicker stream={localStreamRef.current} onSwitch={switchDevice} version={mediaVersion} warning={mediaWarning} />
            </div>
          )}
          <div className="rb-call-controls">
            <button type="button" className={`rb-call-ctrl-btn ${muted ? 'active' : ''}`} onClick={toggleMuted} aria-label="Muto">
              {muted ? '🔇' : '🎙️'}
            </button>
            <button type="button" className="rb-call-ctrl-btn rb-call-hangup" onClick={hangup} aria-label="Riaggancia">📞</button>
            <button type="button" className={`rb-call-ctrl-btn ${cameraOff ? 'active' : ''}`} onClick={toggleCamera} aria-label="Camera">
              {cameraOff ? '🚫' : '📷'}
            </button>
            <ScreenShareButton className="rb-call-ctrl-btn" sharing={Boolean(screenStream)} onStart={startScreenShare} onStop={stopScreenShare} size={22} />
            <button
              type="button"
              className={`rb-call-ctrl-btn ${devicesOpen ? 'active' : ''}`}
              onClick={() => setDevicesOpen((v) => !v)}
              aria-expanded={devicesOpen}
              aria-label="Microfono e fotocamera"
              title="Scegli microfono e fotocamera"
            >
              ⚙️
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
