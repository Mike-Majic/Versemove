import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listVideoRooms,
  createVideoRoom,
  joinVideoRoom,
  touchVideoRoom,
  leaveVideoRoom,
  leaveVideoRoomOnUnload,
  endVideoRoom,
  kickVideoMember,
  unbanVideoMember,
  setVideoMemberMuted,
  fetchVideoRoom,
  fetchRoomMembers,
  fetchRoomBans,
} from '../../data/videoRooms';
import { displayName } from '../../data/posts';
import { useMeshCall } from '../../hooks/useMeshCall';
import { useBackLayer } from '../../hooks/useBackLayer';
import { useGlobeCover } from '../../fx/globeCover';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import ModalOverlay from '../ModalOverlay';
import './videoRooms.css';

// Live del mondo Nerd: stanze video di gruppo gratuite (fino a 8 persone,
// WebRTC mesh con hooks/useMeshCall) più, nella seconda scheda, gli eventi
// della community come negli altri mondi. Regole, posti, fascia d'età e
// poteri del proprietario li controlla il server (data/videoRooms.js): qui
// si mostra lo stato e si avvisano gli altri client con send('mod', ...).

const LIST_REFRESH_MS = 15000;
const HEARTBEAT_MS = 20000;
const TITLE_MIN = 3;
const TITLE_MAX = 80;

const MSG_KICKED = 'Sei stato espulso dalla stanza';
const MSG_BANNED = 'Il proprietario ti ha bloccato';
const MSG_CLOSED = 'La stanza è stata chiusa';

function openSince(iso) {
  if (!iso) return '';
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'aperta ora';
  if (min < 60) return `aperta da ${min} min`;
  const h = Math.floor(min / 60);
  return `aperta da ${h} ${h === 1 ? 'ora' : 'ore'}`;
}

function Avatar({ profile, size = 28 }) {
  const name = displayName(profile, 'Utente');
  return profile?.avatar ? (
    <img className="rb-vroom-avatar" src={profile.avatar} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="rb-vroom-avatar rb-vroom-avatar--letter" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

// Chi sta parlando: un solo AudioContext per la stanza, un AnalyserNode per
// flusso, letto 5 volte al secondo (niente requestAnimationFrame: basta
// per accendere un bordo). streams: [[id, MediaStream], ...].
function useSpeaking(streams) {
  const [speaking, setSpeaking] = useState(() => new Set());
  const ctxRef = useRef(null);
  const nodesRef = useRef(new Map()); // id -> { stream, source, analyser, buf }

  useEffect(() => {
    const nodes = nodesRef.current;
    const wanted = new Map(streams.filter(([, s]) => s && s.getAudioTracks().length > 0));
    nodes.forEach((n, id) => {
      if (wanted.get(id) !== n.stream) {
        n.source.disconnect();
        nodes.delete(id);
      }
    });
    if (wanted.size === 0) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!ctxRef.current) ctxRef.current = new AudioCtx();
    const ctx = ctxRef.current;
    wanted.forEach((stream, id) => {
      if (nodes.has(id)) return;
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        nodes.set(id, { stream, source, analyser, buf: new Uint8Array(analyser.fftSize) });
      } catch {
        // flusso senza audio utilizzabile: niente bordo, nient'altro.
      }
    });
  }, [streams]);

  useEffect(() => {
    const timer = setInterval(() => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const next = new Set();
      nodesRef.current.forEach((n, id) => {
        if (!n.stream.getAudioTracks().some((t) => t.enabled && t.readyState === 'live')) return;
        n.analyser.getByteTimeDomainData(n.buf);
        let sum = 0;
        for (let i = 0; i < n.buf.length; i += 1) {
          const v = (n.buf[i] - 128) / 128;
          sum += v * v;
        }
        if (Math.sqrt(sum / n.buf.length) > 0.04) next.add(id);
      });
      setSpeaking((prev) => (prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next));
    }, 200);
    const nodes = nodesRef.current;
    return () => {
      clearInterval(timer);
      nodes.forEach((n) => n.source.disconnect());
      nodes.clear();
      ctxRef.current?.close().catch(() => {});
      ctxRef.current = null;
    };
  }, []);

  return speaking;
}

function Confirm({ text, confirmLabel, onConfirm, onCancel }) {
  return (
    <ModalOverlay onClose={onCancel}>
      <div className="rb-modal-unsaved-confirm" onClick={(e) => e.stopPropagation()}>
        <p>{text}</p>
        <div className="rb-modal-unsaved-actions">
          <button type="button" className="rb-modal-unsaved-close" onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" onClick={onCancel} autoFocus>Resta</button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ---------------------------------------------------------------------------
// Elenco stanze

function RoomsList({ user, onOpenAuth, onEnter, notice, onDismissNotice }) {
  const [rooms, setRooms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const list = await listVideoRooms('nerd', 'live');
    setRooms(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, LIST_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, user?.id]);

  const enter = async (room) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    if (busy) return;
    setBusy(true);
    setError('');
    const { error: err } = await joinVideoRoom(room.id);
    setBusy(false);
    if (err) {
      setError(err);
      refresh();
      return;
    }
    onEnter(room.id);
  };

  const create = async () => {
    const clean = title.trim();
    if (clean.length < TITLE_MIN || busy) return;
    setBusy(true);
    setError('');
    const { id, error: err } = await createVideoRoom(clean);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setTitle('');
    setShowCreate(false);
    onEnter(id);
  };

  const titleLen = title.trim().length;

  return (
    <div className="rb-vroom-list-wrap">
      <div className="rb-vroom-toolbar">
        {user ? (
          <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => setShowCreate((v) => !v)}>
            ＋ Apri stanza
          </button>
        ) : (
          <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => onOpenAuth?.()}>
            Accedi per entrare
          </button>
        )}
        <button type="button" className="rb-vroom-btn" onClick={refresh} disabled={loading}>↻ Aggiorna</button>
      </div>

      {showCreate && user && (
        <div className="rb-vroom-create">
          <label className="rb-vroom-create-label" htmlFor="rb-vroom-title">Titolo della stanza</label>
          <div className="rb-vroom-create-row">
            <input
              id="rb-vroom-title"
              type="text"
              value={title}
              maxLength={TITLE_MAX}
              placeholder="es. Serata D&D, Chiacchiere sugli anime…"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') create();
              }}
              autoFocus
            />
            <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={create} disabled={titleLen < TITLE_MIN || busy}>
              {busy ? 'Apertura…' : 'Apri'}
            </button>
          </div>
          <span className={`rb-vroom-counter ${titleLen > 0 && titleLen < TITLE_MIN ? 'is-short' : ''}`}>
            {titleLen}/{TITLE_MAX} · minimo {TITLE_MIN} caratteri
          </span>
        </div>
      )}

      {notice && (
        <p className="rb-vroom-notice" role="status">
          {notice}
          <button type="button" onClick={onDismissNotice} aria-label="Chiudi avviso">✕</button>
        </p>
      )}
      {error && <p className="rb-vroom-error" role="alert">{error}</p>}

      {rooms === null ? (
        <Skeleton lines={3} />
      ) : rooms.length === 0 ? (
        <EmptyState icon="🎥" title="Nessuna stanza aperta — aprine una tu" subtitle="Fino a 8 persone in video, gratis." />
      ) : (
        <ul className="rb-vroom-list">
          {rooms.map((r) => {
            const full = r.partecipanti >= r.maxPartecipanti;
            const label = !user ? 'Accedi per entrare' : r.bloccato ? 'Bloccato' : full ? 'Piena' : 'Entra';
            return (
              <li key={r.id} className="rb-vroom-item">
                <div className="rb-vroom-item-main">
                  <p className="rb-vroom-item-title">{r.titolo}</p>
                  <p className="rb-vroom-item-meta">
                    <Avatar profile={r.owner} size={20} />
                    <span>{displayName(r.owner, 'Utente')}</span>
                    <span className="rb-vroom-dot">·</span>
                    <span>{openSince(r.createdAt)}</span>
                  </p>
                </div>
                <span className={`rb-vroom-count ${full ? 'is-full' : ''}`}>{r.partecipanti}/{r.maxPartecipanti}</span>
                <button
                  type="button"
                  className="rb-vroom-btn rb-vroom-btn--primary"
                  onClick={() => enter(r)}
                  disabled={Boolean(user) && (r.bloccato || full || busy)}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dentro la stanza

function VideoTile({ stream, name, profile, isMe, isOwner, muted, speaking, failed, pending, menu }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) videoRef.current.srcObject = stream ?? null;
  }, [stream]);
  return (
    <div className={`rb-vroom-tile ${speaking ? 'is-speaking' : ''} ${failed ? 'is-failed' : ''}`}>
      {stream && !failed ? (
        <video ref={videoRef} autoPlay playsInline muted={isMe} />
      ) : (
        <div className="rb-vroom-tile-placeholder">
          <Avatar profile={profile} size={56} />
          <span>{failed ? 'Connessione non riuscita con questa persona' : pending ? 'Collegamento…' : ''}</span>
        </div>
      )}
      <span className="rb-vroom-tile-name">
        {isOwner && <span title="Proprietario">👑 </span>}
        {name}
        {muted && <span className="rb-vroom-tile-muted" title="Microfono spento"> 🔇</span>}
      </span>
      {menu}
    </div>
  );
}

// Identità stabile per un Set costruito da una lista di id: cambia solo se
// cambia il contenuto (useMeshCall reagisce a ogni nuovo Set).
function useIdSet(ids) {
  const key = ids.slice().sort().join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => new Set(ids), [key]);
}

function RoomView({ roomId, user, onExit }) {
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState(null);
  const [bans, setBans] = useState([]);
  const [error, setError] = useState('');
  const [menuFor, setMenuFor] = useState(null);
  const [confirm, setConfirm] = useState(null); // { text, label, action }
  const [started, setStarted] = useState(false);
  const exitingRef = useRef(false);

  const isOwner = Boolean(room && user && room.ownerId === user.id);
  const allowedUserIds = useIdSet((members ?? []).map((m) => m.userId));
  const mutedUserIds = useIdSet((members ?? []).filter((m) => m.muted).map((m) => m.userId));

  const call = useMeshCall({
    topic: `vroom:${roomId}`,
    user,
    allowedUserIds: members ? allowedUserIds : null,
    mutedUserIds,
  });
  const { join: callJoin, leave: callLeave, lockMic, closePeer, send, onEvent } = call;

  const refreshMembers = useCallback(async () => {
    const list = await fetchRoomMembers(roomId);
    if (list) setMembers(list);
  }, [roomId]);

  const refreshBans = useCallback(async () => {
    setBans(await fetchRoomBans(roomId));
  }, [roomId]);

  // Uscita (per scelta, espulsione, chiusura): chiude media e canale una
  // volta sola e torna all'elenco con il motivo, se c'è.
  const exitRoom = useCallback(
    (message, { callServer = false } = {}) => {
      if (exitingRef.current) return;
      exitingRef.current = true;
      callLeave();
      if (callServer) leaveVideoRoom(roomId);
      onExit(message || '');
    },
    [callLeave, onExit, roomId]
  );

  // Primo caricamento: stanza e membri, poi fotocamera e canale.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, list] = await Promise.all([fetchVideoRoom(roomId), fetchRoomMembers(roomId)]);
      if (cancelled) return;
      if (!r || r.endedAt) {
        exitRoom(MSG_CLOSED);
        return;
      }
      setRoom(r);
      setMembers(list ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, exitRoom]);

  const startCall = useCallback(async () => {
    setStarted(true);
    await callJoin({ name: displayName(user, 'Utente'), avatar: user?.avatar || '' });
  }, [callJoin, user]);

  useEffect(() => {
    if (room && members && !started) startCall();
  }, [room, members, started, startCall]);

  useEffect(() => {
    if (isOwner) refreshBans();
  }, [isOwner, refreshBans]);

  // Chi entra o esce dal canale: si rilegge chi è davvero membro.
  const presenceKey = call.members.map((m) => m.userId).sort().join(',');
  useEffect(() => {
    if (room) refreshMembers();
  }, [presenceKey, room, refreshMembers]);

  // Battito ogni 20 s: tiene vivo il posto e scopre espulsioni/chiusure
  // perse (evento non arrivato, scheda in background).
  useEffect(() => {
    if (!room) return undefined;
    const beat = async () => {
      const { active, error: err } = await touchVideoRoom(roomId);
      if (err || exitingRef.current) return;
      if (!active) {
        const r = await fetchVideoRoom(roomId);
        exitRoom(!r || r.endedAt ? MSG_CLOSED : MSG_KICKED);
        return;
      }
      refreshMembers();
      if (isOwner) refreshBans();
    };
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [room, roomId, isOwner, exitRoom, refreshMembers, refreshBans]);

  // Chiusura della scheda o del browser: si libera il posto (per il
  // proprietario il server chiude anche la stanza).
  useEffect(() => {
    const onPageHide = () => {
      if (!exitingRef.current) leaveVideoRoomOnUnload(roomId);
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [roomId]);

  // Azioni del proprietario viste dagli altri.
  useEffect(() => {
    if (!room) return undefined;
    return onEvent('mod', (payload, from) => {
      if (from !== room.ownerId || !payload) return;
      const { action, userId } = payload;
      if (action === 'close') {
        exitRoom(MSG_CLOSED);
        return;
      }
      if (userId === user?.id) {
        if (action === 'kick') exitRoom(MSG_KICKED);
        else if (action === 'ban') exitRoom(MSG_BANNED);
        else if (action === 'mute') lockMic(true);
        else if (action === 'unmute') lockMic(false);
      } else if (action === 'kick' || action === 'ban') {
        closePeer(userId);
      }
      refreshMembers();
    });
  }, [room, user?.id, onEvent, exitRoom, lockMic, closePeer, refreshMembers]);

  // Il mio stato "mutato" dal DB (vale anche se l'evento è andato perso o
  // se sono entrato dopo).
  const meMuted = Boolean(members?.find((m) => m.userId === user?.id)?.muted);
  useEffect(() => {
    if (!call.joined) return;
    if (meMuted !== call.micLocked) lockMic(meMuted);
  }, [meMuted, call.joined, call.micLocked, lockMic]);

  const leaveOrClose = async () => {
    setConfirm(null);
    if (isOwner) {
      const { error: err } = await endVideoRoom(roomId);
      if (err) {
        setError(err);
        return;
      }
      send('mod', { action: 'close' });
      exitRoom('');
    } else {
      exitRoom('', { callServer: true });
    }
  };

  const askLeave = () =>
    setConfirm(
      isOwner
        ? { text: 'Chiudere la stanza? Usciranno tutti.', label: 'Chiudi stanza', action: leaveOrClose }
        : { text: 'Uscire dalla stanza?', label: 'Esci', action: leaveOrClose }
    );

  useBackLayer(true, () => exitRoom('', { callServer: true }), 'subpage:video-room', {
    onBack: () => {
      setConfirm({
        text: isOwner ? 'Uscire dalla stanza? Si chiuderà per tutti.' : 'Uscire dalla stanza?',
        label: 'Esci',
        action: leaveOrClose,
      });
      return false;
    },
  });

  useGlobeCover('paused');

  const moderate = async (target, action) => {
    setMenuFor(null);
    setError('');
    let res;
    if (action === 'mute' || action === 'unmute') res = await setVideoMemberMuted(roomId, target.userId, action === 'mute');
    else res = await kickVideoMember(roomId, target.userId, action === 'ban');
    if (res.error) {
      setError(res.error);
      return;
    }
    send('mod', { action, userId: target.userId });
    if (action === 'kick' || action === 'ban') closePeer(target.userId);
    refreshMembers();
    if (action === 'ban') refreshBans();
  };

  const unban = async (userId) => {
    const { error: err } = await unbanVideoMember(roomId, userId);
    if (err) setError(err);
    refreshBans();
  };

  const tilesById = useMemo(() => new Map(call.remoteTiles.map((t) => [t.userId, t])), [call.remoteTiles]);
  const others = (members ?? []).filter((m) => m.userId !== user?.id);
  const speakingStreams = useMemo(
    () => [[user?.id, call.localStream], ...call.remoteTiles.map((t) => [t.userId, t.stream])],
    [user?.id, call.localStream, call.remoteTiles]
  );
  const speaking = useSpeaking(speakingStreams);

  if (!room || !members) {
    return (
      <div className="rb-vroom-room">
        <Skeleton lines={4} />
      </div>
    );
  }

  const count = Math.max(1, members.length);
  const ownerProfile = members.find((m) => m.userId === room.ownerId)?.profilo;
  const micLocked = call.micLocked;

  return (
    <div className="rb-vroom-room">
      <header className="rb-vroom-room-head">
        <div className="rb-vroom-room-title">
          <h3>{room.titolo}</h3>
          <p>
            <span>👑 {isOwner ? 'Tu' : displayName(ownerProfile, 'Proprietario')}</span>
            <span className="rb-vroom-dot">·</span>
            <span>{count}/{room.maxPartecipanti} persone</span>
          </p>
        </div>
        <button type="button" className={`rb-vroom-btn ${isOwner ? 'rb-vroom-btn--danger' : ''}`} onClick={askLeave}>
          {isOwner ? 'Chiudi stanza' : 'Esci'}
        </button>
      </header>

      {call.error && (
        <div className="rb-vroom-error" role="alert">
          {call.error}
          <button type="button" className="rb-vroom-btn" onClick={startCall} disabled={call.joining}>Riprova</button>
        </div>
      )}
      {error && <p className="rb-vroom-error" role="alert">{error}</p>}

      <div className={`rb-vroom-grid rb-vroom-grid--${Math.min(8, others.length + 1)}`}>
        <VideoTile
          stream={call.localStream}
          name="Tu"
          profile={user}
          isMe
          isOwner={isOwner}
          muted={!call.micOn}
          speaking={speaking.has(user?.id)}
          pending={call.joining}
        />
        {others.map((m) => {
          const tile = tilesById.get(m.userId);
          return (
            <VideoTile
              key={m.userId}
              stream={tile?.stream}
              name={displayName(m.profilo, tile?.name || 'Utente')}
              profile={m.profilo}
              isOwner={m.userId === room.ownerId}
              muted={m.muted}
              speaking={speaking.has(m.userId)}
              failed={tile?.failed}
              pending={!tile}
              menu={
                isOwner && (
                  <div className="rb-vroom-menu">
                    <button
                      type="button"
                      className="rb-vroom-menu-btn"
                      aria-label={`Azioni su ${displayName(m.profilo, 'Utente')}`}
                      aria-expanded={menuFor === m.userId}
                      onClick={() => setMenuFor((v) => (v === m.userId ? null : m.userId))}
                    >
                      ⋯
                    </button>
                    {menuFor === m.userId && (
                      <div className="rb-vroom-menu-list" role="menu">
                        <button type="button" role="menuitem" onClick={() => moderate(m, m.muted ? 'unmute' : 'mute')}>
                          {m.muted ? 'Riattiva microfono' : 'Muta microfono'}
                        </button>
                        <button type="button" role="menuitem" onClick={() => moderate(m, 'kick')}>Espelli</button>
                        <button
                          type="button"
                          role="menuitem"
                          className="is-danger"
                          onClick={() => {
                            setMenuFor(null);
                            setConfirm({
                              text: `Bloccare ${displayName(m.profilo, 'questa persona')}? Non potrà più rientrare in questa stanza.`,
                              label: 'Blocca',
                              action: () => {
                                setConfirm(null);
                                moderate(m, 'ban');
                              },
                            });
                          }}
                        >
                          Blocca
                        </button>
                      </div>
                    )}
                  </div>
                )
              }
            />
          );
        })}
      </div>

      <div className="rb-vroom-controls">
        <button
          type="button"
          className={`rb-vroom-ctrl ${!call.micOn ? 'is-off' : ''}`}
          onClick={call.toggleMic}
          disabled={micLocked || !call.joined}
          title={micLocked ? 'Mutato dal proprietario' : call.micOn ? 'Spegni microfono' : 'Accendi microfono'}
          aria-label={micLocked ? 'Mutato dal proprietario' : 'Microfono'}
        >
          {call.micOn ? '🎙️' : '🔇'}
        </button>
        <button
          type="button"
          className={`rb-vroom-ctrl ${!call.cameraOn ? 'is-off' : ''}`}
          onClick={call.toggleCamera}
          disabled={!call.joined}
          title={call.cameraOn ? 'Spegni fotocamera' : 'Accendi fotocamera'}
          aria-label="Fotocamera"
        >
          {call.cameraOn ? '📷' : '🚫'}
        </button>
        <button type="button" className="rb-vroom-ctrl rb-vroom-ctrl--leave" onClick={askLeave} aria-label={isOwner ? 'Chiudi stanza' : 'Esci dalla stanza'}>
          📞
        </button>
      </div>
      {micLocked && <p className="rb-vroom-locked">Mutato dal proprietario</p>}

      {isOwner && bans.length > 0 && (
        <section className="rb-vroom-bans">
          <h4>Bloccati</h4>
          <ul>
            {bans.map((b) => (
              <li key={b.userId}>
                <Avatar profile={b.profilo} size={24} />
                <span>{displayName(b.profilo, 'Utente')}</span>
                <button type="button" className="rb-vroom-btn" onClick={() => unban(b.userId)}>Sblocca</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {confirm && <Confirm text={confirm.text} confirmLabel={confirm.label} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

// events: la colonna che la categoria mostrava prima (CategoryColumn a due
// pannelli), resa così com'è nella scheda "Eventi". Per questo le schede non
// stanno dentro un pannello ma in una barra a sé, sotto la X e la stellina:
// così valgono sia sopra le stanze sia sopra i due pannelli degli eventi.
export default function VideoRoomsColumn({ user, onOpenAuth, events }) {
  const [tab, setTab] = useState('rooms');
  const [roomId, setRoomId] = useState(null);
  const [notice, setNotice] = useState('');

  // Senza login (o cambiando account) non si resta dentro una stanza.
  useEffect(() => {
    if (!user) setRoomId(null);
  }, [user]);

  if (roomId && user) {
    return (
      <div className="rb-vroom-panel rb-vroom-panel--room">
        <RoomView
          key={roomId}
          roomId={roomId}
          user={user}
          onExit={(message) => {
            setRoomId(null);
            setNotice(message);
          }}
        />
      </div>
    );
  }

  return (
    <>
      <div className="rb-vroom-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'rooms'} className={tab === 'rooms' ? 'is-active' : ''} onClick={() => setTab('rooms')}>
          Stanze video
        </button>
        <button type="button" role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'is-active' : ''} onClick={() => setTab('events')}>
          Eventi
        </button>
      </div>
      {tab === 'rooms' ? (
        <div className="rb-vroom-panel">
          <RoomsList
            user={user}
            onOpenAuth={onOpenAuth}
            notice={notice}
            onDismissNotice={() => setNotice('')}
            onEnter={(id) => {
              setNotice('');
              setRoomId(id);
            }}
          />
        </div>
      ) : (
        events
      )}
    </>
  );
}
