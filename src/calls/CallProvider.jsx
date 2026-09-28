import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// Chiamate che restano attive mentre si naviga (tutto Versemove): lo stato
// di ogni chiamata (stream, RTCPeerConnection, canale Realtime) vive nei
// componenti "sessione" montati QUI, alla radice dell'app, non dentro la
// colonna o la chat da cui la chiamata è partita. Cambiare mondo, chiudere
// la categoria o la chat non smonta la sessione.
//
// Tre slot indipendenti:
// - room: stanza video di gruppo (vroom:<id>, mondo Nerd Live e party
//   Gaming) — RoomView;
// - modroom: videochiamata della Stanza MOD (call:modroom) — ModRoomCallSession;
// - direct: chiamata 1:1 dalla chat (call:<conversation>), anche fra match
//   di Incontri — CallModal.
//
// Vista completa o mini-monitor: la vista completa va "dentro" la colonna
// che la ospita (la colonna registra un contenitore con hostRef(kind), la
// sessione ci entra con un portal); se la colonna non c'è (chiusa, altro
// mondo) la chiamata passa da sola al mini-monitor flottante. Da lì
// "Ingrandisci" la riporta nella colonna, o in un pannello flottante se la
// colonna non è aperta.

const RoomView = lazy(() => import('../components/nerd/VideoRoomsColumn').then((m) => ({ default: m.RoomView })));
const ModRoomCallSession = lazy(() => import('./ModRoomCallSession'));
const CallModal = lazy(() => import('../components/CallModal'));

const CallContext = createContext(null);

export function useCalls() {
  return useContext(CallContext);
}

export function CallProvider({ user, children }) {
  // --- contenitori delle viste complete (registrati dalle colonne) -------
  const [hosts, setHosts] = useState({});
  const hostSetters = useRef({});
  const hostRef = useCallback((kind) => {
    if (!hostSetters.current[kind]) {
      hostSetters.current[kind] = (node) => setHosts((prev) => (prev[kind] === node ? prev : { ...prev, [kind]: node }));
    }
    return hostSetters.current[kind];
  }, []);

  // --- vista per slot: 'full' | 'mini' ---------------------------------
  const [views, setViews] = useState({ room: 'full', modroom: 'full', direct: 'full' });
  const setView = useCallback((kind, view) => setViews((prev) => (prev[kind] === view ? prev : { ...prev, [kind]: view })), []);

  // La colonna che ospitava la vista completa si chiude: mini-monitor.
  const prevHosts = useRef(hosts);
  useEffect(() => {
    const before = prevHosts.current;
    Object.keys(before).forEach((kind) => {
      if (before[kind] && !hosts[kind]) setView(kind, 'mini');
    });
    prevHosts.current = hosts;
  }, [hosts, setView]);

  // --- stanza video ----------------------------------------------------
  const [room, setRoom] = useState(null); // { roomId, source }
  const [roomExit, setRoomExit] = useState(null); // { source, message, seq }
  const openRoom = useCallback(
    (roomId, source = 'live') => {
      setRoom({ roomId, source });
      setView('room', 'full');
    },
    [setView]
  );
  const onRoomExit = useCallback(
    (message) => {
      setRoom((current) => {
        if (current) setRoomExit({ source: current.source, message: message || '', seq: Date.now() });
        return null;
      });
    },
    []
  );
  const consumeRoomExit = useCallback(() => setRoomExit(null), []);

  // --- Stanza MOD --------------------------------------------------------
  // Il pannello della Stanza MOD aperto "prepara" il canale (per vedere chi
  // è già in chiamata prima di entrare); entrati, la sessione resta anche
  // chiudendo il pannello.
  const [modroomPrepared, setModroomPrepared] = useState(0);
  const [modroomJoined, setModroomJoined] = useState(false);
  const [modroomApi, setModroomApi] = useState(null);
  const prepareModroom = useCallback(() => {
    setModroomPrepared((n) => n + 1);
    return () => setModroomPrepared((n) => Math.max(0, n - 1));
  }, []);
  const modroomActive = modroomPrepared > 0 || modroomJoined;
  useEffect(() => {
    if (!modroomActive) setModroomApi(null);
  }, [modroomActive]);

  // --- chiamata 1:1 -------------------------------------------------------
  // direct: { conversationId, friend, autoAnswer, attached }. La chat
  // aperta la "aggancia" (serve anche a ricevere lo squillo mentre è aperta);
  // chiudendo la chat la sessione resta finché la chiamata non torna ferma.
  const [direct, setDirect] = useState(null);
  const [directPhase, setDirectPhase] = useState('idle');
  const directStartRef = useRef(null);
  const directBusy = directPhase !== 'idle' && directPhase !== 'ended';

  const attachDirect = useCallback(
    ({ conversationId, friend, autoAnswer = false }) => {
      setDirect((current) => {
        // Un'altra chiamata 1:1 in corso: non si sostituisce.
        if (current && current.conversationId !== conversationId && directBusy) return current;
        if (current?.conversationId === conversationId) return { ...current, friend: friend ?? current.friend, autoAnswer, attached: true };
        return { conversationId, friend, autoAnswer, attached: true };
      });
    },
    [directBusy]
  );
  const detachDirect = useCallback((conversationId) => {
    setDirect((current) => (current?.conversationId === conversationId ? { ...current, attached: false, autoAnswer: false } : current));
  }, []);
  // Chat chiusa e chiamata finita: la sessione si smonta.
  useEffect(() => {
    if (direct && !direct.attached && !directBusy && directPhase !== 'ended') setDirect(null);
  }, [direct, directBusy, directPhase]);
  const startDirectCall = useCallback(() => directStartRef.current?.(), []);
  const onDirectPhase = useCallback(
    (phase) => {
      setDirectPhase(phase);
      if (phase === 'idle') setView('direct', 'full');
    },
    [setView]
  );

  // Uscita dall'account: niente chiamate appese.
  useEffect(() => {
    if (user) return;
    setRoom(null);
    setDirect(null);
    setDirectPhase('idle');
    setModroomJoined(false);
  }, [user]);

  const value = useMemo(
    () => ({
      hostRef,
      hosts,
      views,
      setView,
      // stanza video
      room,
      openRoom,
      onRoomExit,
      roomExit,
      consumeRoomExit,
      // Stanza MOD
      prepareModroom,
      modroomApi,
      setModroomApi,
      modroomJoined,
      setModroomJoined,
      // 1:1
      direct,
      directPhase,
      directBusy,
      attachDirect,
      detachDirect,
      startDirectCall,
    }),
    [hostRef, hosts, views, setView, room, openRoom, onRoomExit, roomExit, consumeRoomExit, prepareModroom, modroomApi, modroomJoined, direct, directPhase, directBusy, attachDirect, detachDirect, startDirectCall]
  );

  return (
    <CallContext.Provider value={value}>
      {children}
      {user && (
        <Suspense fallback={null}>
          {room && <RoomView key={room.roomId} roomId={room.roomId} user={user} onExit={onRoomExit} />}
          {modroomActive && <ModRoomCallSession user={user} />}
          {direct && (
            <CallModal
              key={direct.conversationId}
              conversationId={direct.conversationId}
              user={user}
              friend={direct.friend}
              autoAnswer={direct.autoAnswer}
              registerStart={(fn) => {
                directStartRef.current = fn;
              }}
              onPhaseChange={onDirectPhase}
            />
          )}
        </Suspense>
      )}
    </CallContext.Provider>
  );
}
