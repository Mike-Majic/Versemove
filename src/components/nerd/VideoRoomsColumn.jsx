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
  waitVideoRoomSlot,
  cancelVideoRoomWait,
  fetchMyRoomWaits,
  takePendingRoomFocus,
} from '../../data/videoRooms';
import { displayName } from '../../data/posts';
import { getLavoroProfiles, lavoroBirthLabel } from '../../data/lavoro';
import { useMeshCall } from '../../hooks/useMeshCall';
import { useCalls } from '../../calls/CallProvider';
import CallSurface, { MinimizeCallButton, RemoteAudio, ScreenShareButton } from '../../calls/CallSurface';
import DevicePicker from '../../calls/DevicePicker';
import Icon from '../shared/Icon';
import { useBackLayer } from '../../hooks/useBackLayer';
import { useGlobeCover } from '../../fx/globeCover';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import ModalOverlay from '../ModalOverlay';
import './videoRooms.css';
import AvatarImg from '../shared/AvatarImg';

// Live del mondo Nerd: stanze video di gruppo gratuite (fino a 8 persone,
// WebRTC mesh con hooks/useMeshCall), pubbliche o private con password.
// Regole, posti, fascia d'età, password e poteri del proprietario li
// controlla il server (data/videoRooms.js): qui si mostra lo stato e si
// avvisano gli altri client con send('mod', ...). La stanza in corso vive
// in calls/CallProvider (resta attiva cambiando mondo, mini-monitor).

const LIST_REFRESH_MS = 15000;
const HEARTBEAT_MS = 20000;
const TITLE_MIN = 3;
const TITLE_MAX = 80;
const PW_MIN = 4;
const PW_MAX = 32;

// Stesso componente per le stanze video del Nerd (Videochiamata, party del
// Gaming) e per la Stanza conferenze del mondo Lavoro: cambiano solo mondo/
// categoria delle RPC, i testi e — nel Lavoro — i nomi mostrati (nome e
// cognome al posto del nickname, visibili dopo il consenso Lavoro). La
// chiave è la "source" con cui la stanza viene aperta in CallProvider.
const ROOM_PRESETS = {
  live: {
    mondo: 'nerd',
    categoria: 'live',
    realNames: false,
    createButton: '＋ Apri stanza',
    modalTitle: 'Apri una stanza video',
    titleLabel: 'Titolo della stanza',
    titlePlaceholder: 'es. Serata D&D, Chiacchiere sugli anime…',
    createAction: 'Apri stanza',
    emptyIcon: '🎥',
    emptyTitle: 'Nessuna stanza aperta — aprine una tu',
    emptySubtitle: 'Fino a 8 persone in video, gratis.',
    fallbackTitle: 'Stanza video',
  },
  conferenze: {
    mondo: 'lavoro',
    categoria: 'conferenze',
    realNames: true,
    createButton: '＋ Crea stanza conferenze',
    modalTitle: 'Crea stanza conferenze',
    titleLabel: 'Titolo della conferenza',
    titlePlaceholder: 'Riunione di progetto',
    createAction: 'Crea stanza',
    emptyIcon: '💼',
    emptyTitle: 'Nessuna conferenza attiva: creane una',
    emptySubtitle: 'Fino a 8 persone, con condivisione dello schermo.',
    fallbackTitle: 'Stanza conferenze',
  },
};
ROOM_PRESETS.incontri = {
  mondo: 'incontri',
  categoria: 'videochiamata',
  realNames: false,
  createButton: '＋ Apri stanza',
  modalTitle: 'Apri una videochiamata',
  titleLabel: 'Titolo della stanza',
  titlePlaceholder: 'es. Due chiacchiere prima di cena',
  createAction: 'Apri stanza',
  emptyIcon: '🎥',
  emptyTitle: 'Nessuna videochiamata aperta: aprine una',
  emptySubtitle: 'Fino a 8 persone in video, gratis.',
  fallbackTitle: 'Videochiamata',
};
ROOM_PRESETS.gaming = ROOM_PRESETS.live;
const presetFor = (source) => ROOM_PRESETS[source] ?? ROOM_PRESETS.live;

// Il server risponde così a chi non ha accesso al mondo (Lavoro: niente
// consenso o minorenne): la colonna mostra il consenso Lavoro.
const NO_ACCESS_RE = /non hai accesso a questo mondo/i;

// Nome e cognome (mondo Lavoro) per una lista di utenti: la RPC li dà solo
// se entrambe le parti hanno il consenso Lavoro, altrimenti resta il
// nickname. enabled = false (Nerd): mappe vuote, nessuna chiamata.
// births: data di nascita ed età (lavoroBirthLabel), presente solo se chi
// guarda è un account azienda.
function useRealNames(ids, enabled) {
  const [data, setData] = useState(() => ({ names: new Map(), births: new Map() }));
  const key = enabled ? Array.from(new Set(ids.filter(Boolean))).sort().join(',') : '';
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    getLavoroProfiles(key.split(',')).then((map) => {
      if (cancelled) return;
      const names = new Map();
      const births = new Map();
      map.forEach((p, id) => {
        const full = `${p.nome} ${p.cognome}`.trim();
        if (full) names.set(id, full);
        const birth = lavoroBirthLabel(p.dataNascita);
        if (birth) births.set(id, birth);
      });
      setData({ names, births });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return data;
}

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
    <AvatarImg className="rb-vroom-avatar" src={profile.avatar} name={profile?.name || profile?.nickname} seed={profile?.id} alt="" style={{ width: size, height: size }} />
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

// Campo password con l'occhio per mostrarla/nasconderla.
function PasswordField({ id, value, onChange, onEnter, autoFocus = false }) {
  const [show, setShow] = useState(false);
  return (
    <div className="rb-vroom-pw">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        maxLength={PW_MAX}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        className="rb-vroom-pw-eye"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Nascondi password' : 'Mostra password'}
        title={show ? 'Nascondi password' : 'Mostra password'}
      >
        <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  );
}

// Finestra "Apri stanza": titolo, Pubblica / Privata e, se privata, la
// password (obbligatoria, 4-32 caratteri).
function CreateRoomModal({ preset, busy, error, onCreate, onClose }) {
  const [title, setTitle] = useState('');
  const [privata, setPrivata] = useState(false);
  const [password, setPassword] = useState('');
  const titleLen = title.trim().length;
  const pwOk = !privata || (password.length >= PW_MIN && password.length <= PW_MAX);
  const canCreate = titleLen >= TITLE_MIN && pwOk && !busy;
  const submit = () => {
    if (canCreate) onCreate({ title: title.trim(), privata, password });
  };
  return (
    <ModalOverlay onClose={onClose} hasUnsavedChanges={titleLen > 0 || password.length > 0}>
      <div className="rb-vroom-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={preset.modalTitle}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h3>{preset.modalTitle}</h3>
        <label className="rb-vroom-create-label" htmlFor="rb-vroom-title">{preset.titleLabel}</label>
        <input
          id="rb-vroom-title"
          className="rb-vroom-modal-input"
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          placeholder={preset.titlePlaceholder}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          autoFocus
        />
        <span className={`rb-vroom-counter ${titleLen > 0 && titleLen < TITLE_MIN ? 'is-short' : ''}`}>
          {titleLen}/{TITLE_MAX} · minimo {TITLE_MIN} caratteri
        </span>

        <div className="rb-vroom-privacy" role="radiogroup" aria-label="Chi può entrare">
          <button type="button" role="radio" aria-checked={!privata} className={!privata ? 'is-active' : ''} onClick={() => setPrivata(false)}>
            🌐 Pubblica
            <small>Chiunque può entrare</small>
          </button>
          <button type="button" role="radio" aria-checked={privata} className={privata ? 'is-active' : ''} onClick={() => setPrivata(true)}>
            <Icon name="lock" size={16} /> Privata
            <small>Si entra con la password</small>
          </button>
        </div>

        {privata && (
          <>
            <label className="rb-vroom-create-label" htmlFor="rb-vroom-pw">Password</label>
            <PasswordField id="rb-vroom-pw" value={password} onChange={setPassword} onEnter={submit} />
            <span className={`rb-vroom-counter ${password.length > 0 && password.length < PW_MIN ? 'is-short' : ''}`}>
              da {PW_MIN} a {PW_MAX} caratteri
            </span>
            <p className="rb-vroom-pw-hint">🔑 Comunica tu la password alle persone che vuoi far entrare.</p>
          </>
        )}

        {error && <p className="rb-vroom-error" role="alert">{error}</p>}
        <div className="rb-vroom-modal-actions">
          <button type="button" className="rb-vroom-btn" onClick={onClose}>Annulla</button>
          <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={submit} disabled={!canCreate}>
            {busy ? 'Apertura…' : preset.createAction}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// Password per entrare in una stanza privata.
function JoinPasswordModal({ room, busy, error, onSubmit, onClose }) {
  const [password, setPassword] = useState('');
  const submit = () => {
    if (password.length > 0 && !busy) onSubmit(password);
  };
  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-vroom-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Password della stanza">
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h3>
          <Icon name="lock" size={18} /> {room.titolo}
        </h3>
        <p className="rb-vroom-pw-hint">Questa stanza è privata: inserisci la password che ti ha dato chi l’ha aperta.</p>
        <label className="rb-vroom-create-label" htmlFor="rb-vroom-join-pw">Password</label>
        <PasswordField id="rb-vroom-join-pw" value={password} onChange={setPassword} onEnter={submit} autoFocus />
        {error && <p className="rb-vroom-error" role="alert">{error}</p>}
        <div className="rb-vroom-modal-actions">
          <button type="button" className="rb-vroom-btn" onClick={onClose}>Annulla</button>
          <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={submit} disabled={!password || busy}>
            {busy ? 'Controllo…' : 'Entra'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function RoomsList({ preset, user, onOpenAuth, onEnter, onNoAccess, notice, onDismissNotice, inRoomId }) {
  const [rooms, setRooms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createError, setCreateError] = useState('');
  const [pwRoom, setPwRoom] = useState(null); // stanza privata di cui chiedere la password
  const [pwError, setPwError] = useState('');
  // "Cerca" accanto a "Crea stanza": filtra per titolo o per nome di chi
  // l'ha aperta (in memoria: l'elenco è già tutto qui).
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Stanze piene per cui ho chiesto l'avviso "posto libero".
  const [waits, setWaits] = useState(() => new Set());
  // Arrivati dalla notifica "posto libero": quella stanza in evidenza.
  const [focusId] = useState(() => takePendingRoomFocus());
  const focusRef = useRef(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [rooms]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await listVideoRooms(preset.mondo, preset.categoria);
    setLoading(false);
    if (res.error && NO_ACCESS_RE.test(res.error)) {
      onNoAccess?.();
      return;
    }
    setRooms(res.rooms);
    if (user) setWaits(await fetchMyRoomWaits());
  }, [preset.mondo, preset.categoria, onNoAccess, user]);
  const { names: realNames, births: realBirths } = useRealNames((rooms ?? []).map((r) => r.ownerId), preset.realNames);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, LIST_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh, user?.id]);

  const enter = async (room, password = null) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    if (room.id === inRoomId) {
      onEnter(room.id);
      return;
    }
    if (inRoomId) {
      setError('Sei già in una stanza video: esci da quella prima di entrare in un’altra.');
      return;
    }
    if (busy) return;
    setBusy(true);
    setError('');
    setPwError('');
    const res = await joinVideoRoom(room.id, password);
    setBusy(false);
    if (res.needPassword) {
      setPwRoom(room);
      return;
    }
    if (res.wrongPassword || res.tooMany) {
      setPwRoom(room);
      setPwError(res.error);
      return;
    }
    if (res.error) {
      if (NO_ACCESS_RE.test(res.error)) {
        onNoAccess?.();
        return;
      }
      setPwRoom(null);
      setError(res.error);
      refresh();
      return;
    }
    setPwRoom(null);
    onEnter(room.id);
  };

  const toggleWait = async (room) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const waiting = waits.has(room.id);
    setWaits((prev) => {
      const next = new Set(prev);
      if (waiting) next.delete(room.id);
      else next.add(room.id);
      return next;
    });
    const res = waiting ? await cancelVideoRoomWait(room.id) : await waitVideoRoomSlot(room.id);
    if (res.error) {
      setWaits((prev) => {
        const next = new Set(prev);
        if (waiting) next.add(room.id);
        else next.delete(room.id);
        return next;
      });
      setError(res.error);
    }
  };

  const q = query.trim().toLowerCase();
  const nameOfOwner = (r) => realNames.get(r.ownerId) ?? displayName(r.owner, 'Utente');
  const shownRooms = rooms && q ? rooms.filter((r) => r.titolo.toLowerCase().includes(q) || nameOfOwner(r).toLowerCase().includes(q)) : rooms;

  const create = async ({ title, privata, password }) => {
    if (busy) return;
    if (inRoomId) {
      setCreateError('Sei già in una stanza video: esci da quella prima di aprirne un’altra.');
      return;
    }
    setBusy(true);
    setCreateError('');
    const { id, error: err } = await createVideoRoom(title, preset.mondo, preset.categoria, { privata, password });
    setBusy(false);
    if (err && NO_ACCESS_RE.test(err)) {
      onNoAccess?.();
      return;
    }
    if (err) {
      setCreateError(err);
      return;
    }
    setShowCreate(false);
    onEnter(id);
  };

  return (
    <div className="rb-vroom-list-wrap">
      <div className="rb-vroom-toolbar">
        {user ? (
          <button
            type="button"
            className="rb-vroom-btn rb-vroom-btn--primary"
            onClick={() => {
              setCreateError('');
              setShowCreate(true);
            }}
          >
            {preset.createButton}
          </button>
        ) : (
          <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => onOpenAuth?.()}>
            Accedi per entrare
          </button>
        )}
        <button
          type="button"
          className={`rb-vroom-btn ${searchOpen ? 'is-active' : ''}`}
          onClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setQuery('');
          }}
          aria-expanded={searchOpen}
        >
          <Icon name="search" size={16} className="rb-icon--inline" /> Cerca
        </button>
        <button type="button" className="rb-vroom-btn rb-vroom-btn--push" onClick={refresh} disabled={loading}>↻ Aggiorna</button>
      </div>
      {searchOpen && (
        <input
          type="search"
          className="rb-vroom-search"
          placeholder="Cerca per titolo o per nome…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Cerca stanze"
          autoFocus
        />
      )}

      {showCreate && user && <CreateRoomModal preset={preset} busy={busy} error={createError} onCreate={create} onClose={() => setShowCreate(false)} />}
      {pwRoom && (
        <JoinPasswordModal
          room={pwRoom}
          busy={busy}
          error={pwError}
          onSubmit={(pw) => enter(pwRoom, pw)}
          onClose={() => {
            setPwRoom(null);
            setPwError('');
          }}
        />
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
        <EmptyState icon={preset.emptyIcon} title={preset.emptyTitle} subtitle={preset.emptySubtitle} />
      ) : shownRooms.length === 0 ? (
        <p className="rb-vroom-empty-search">Nessuna stanza per “{query.trim()}”.</p>
      ) : (
        <ul className="rb-vroom-list">
          {shownRooms.map((r) => {
            const full = r.partecipanti >= r.maxPartecipanti;
            const mine = r.id === inRoomId;
            const label = !user ? 'Accedi per entrare' : mine ? 'Torna' : r.bloccato ? 'Bloccato' : full ? 'Piena' : 'Entra';
            return (
              <li key={r.id} ref={r.id === focusId ? focusRef : null} className={`rb-vroom-item ${r.id === focusId ? 'is-focus' : ''}`}>
                <div className="rb-vroom-item-main">
                  <p className="rb-vroom-item-title">
                    {r.privata && (
                      <span className="rb-vroom-lock" title="Stanza privata: serve la password" aria-label="Stanza privata">
                        <Icon name="lock" size={15} />
                      </span>
                    )}
                    {r.titolo}
                  </p>
                  <p className="rb-vroom-item-meta">
                    <Avatar profile={r.owner} size={20} />
                    <span>{nameOfOwner(r)}</span>
                    {realBirths.get(r.ownerId) && <span>· {realBirths.get(r.ownerId)}</span>}
                    <span className="rb-vroom-dot">·</span>
                    <span>{openSince(r.createdAt)}</span>
                  </p>
                </div>
                <span className={`rb-vroom-count ${full ? 'is-full' : ''}`}>{r.partecipanti}/{r.maxPartecipanti}</span>
                {user && full && !mine && !r.bloccato ? (
                  <button
                    type="button"
                    className={`rb-vroom-btn ${waits.has(r.id) ? 'is-active' : 'rb-vroom-btn--primary'}`}
                    onClick={() => toggleWait(r)}
                    aria-pressed={waits.has(r.id)}
                    title={waits.has(r.id) ? 'Ti avvisiamo appena si libera un posto (clic per annullare)' : 'Stanza piena: ricevi una notifica appena si libera un posto'}
                  >
                    <Icon name={waits.has(r.id) ? 'check' : 'bell'} size={15} className="rb-icon--inline" />{' '}
                    {waits.has(r.id) ? 'Ti avviseremo' : 'Avvisami'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rb-vroom-btn rb-vroom-btn--primary"
                    onClick={() => enter(r)}
                    disabled={Boolean(user) && !mine && (r.bloccato || full || busy)}
                  >
                    {label}
                  </button>
                )}
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

function VideoTile({ stream, name, profile, isOwner, muted, speaking, failed, pending, menu }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== stream) videoRef.current.srcObject = stream ?? null;
  }, [stream]);
  return (
    <div className={`rb-vroom-tile ${speaking ? 'is-speaking' : ''} ${failed ? 'is-failed' : ''}`}>
      {stream && !failed ? (
        // Sempre muto: l'audio degli altri lo suona RemoteAudio, che resta
        // acceso anche col mini-monitor.
        <video ref={videoRef} autoPlay playsInline muted />
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

// Sessione della stanza: montata da calls/CallProvider (non dalla colonna),
// così resta attiva cambiando mondo. La vista completa va nella colonna
// che la ospita (Live o Gaming), altrimenti mini-monitor.
export function RoomView({ roomId, source, user, onExit }) {
  const preset = presetFor(source);
  const { views, setView } = useCalls();
  const fullOpen = views.room === 'full';
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState(null);
  const [bans, setBans] = useState([]);
  const [error, setError] = useState('');
  // Pannello microfono/fotocamera (DevicePicker).
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [menuFor, setMenuFor] = useState(null);
  // Lavoro: nome e cognome al posto del nickname (anche il mio).
  const { names: realNames, births: realBirths } = useRealNames([...(members ?? []).map((m) => m.userId), ...bans.map((b) => b.userId)], preset.realNames);
  const myRealName = preset.realNames ? `${user?.nome ?? ''} ${user?.cognome ?? ''}`.trim() : '';
  const nameOf = (id, profile, fallback = 'Utente') => (id === user?.id && myRealName) || realNames.get(id) || displayName(profile, fallback);
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

  const realNamesOn = preset.realNames;
  const startCall = useCallback(async () => {
    setStarted(true);
    const full = realNamesOn ? `${user?.nome ?? ''} ${user?.cognome ?? ''}`.trim() : '';
    await callJoin({ name: full || displayName(user, 'Utente'), avatar: user?.avatar || '' });
  }, [callJoin, user, realNamesOn]);

  useEffect(() => {
    if (room && members && !started) startCall();
  }, [room, members, started, startCall]);

  useEffect(() => {
    if (isOwner) refreshBans();
  }, [isOwner, refreshBans]);

  // Proprietario attuale: se esce, la stanza passa a chi è dentro da più
  // tempo (lo decide il server) — qui si rilegge la stanza per saperlo.
  const refreshRoom = useCallback(async () => {
    const r = await fetchVideoRoom(roomId);
    if (exitingRef.current) return;
    if (!r || r.endedAt) {
      exitRoom(MSG_CLOSED);
      return;
    }
    setRoom((prev) => (prev && prev.ownerId === r.ownerId && prev.titolo === r.titolo ? prev : r));
  }, [roomId, exitRoom]);

  // Chi entra o esce dal canale: si rilegge chi è davvero membro (e chi
  // è il proprietario, che potrebbe essere appena uscito).
  const presenceKey = call.members.map((m) => m.userId).sort().join(',');
  const roomLoaded = Boolean(room);
  useEffect(() => {
    if (!roomLoaded) return undefined;
    refreshMembers();
    // il server passa la proprietà un attimo dopo l'uscita: si rilegge poco dopo
    const t = setTimeout(refreshRoom, 1500);
    return () => clearTimeout(t);
  }, [presenceKey, roomLoaded, refreshMembers, refreshRoom]);

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
      refreshRoom();
      if (isOwner) refreshBans();
    };
    const timer = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [room, roomId, isOwner, exitRoom, refreshMembers, refreshBans, refreshRoom]);

  // Chiusura della scheda o del browser: si libera il posto (se era il
  // proprietario, la stanza passa a chi resta).
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
      if (action === 'owner_left') {
        setTimeout(refreshRoom, 800);
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
  }, [room, user?.id, onEvent, exitRoom, lockMic, closePeer, refreshMembers, refreshRoom]);

  // Il mio stato "mutato" dal DB (vale anche se l'evento è andato perso o
  // se sono entrato dopo).
  const meMuted = Boolean(members?.find((m) => m.userId === user?.id)?.muted);
  useEffect(() => {
    if (!call.joined) return;
    if (meMuted !== call.micLocked) lockMic(meMuted);
  }, [meMuted, call.joined, call.micLocked, lockMic]);

  // Esci: anche il proprietario può uscire senza chiudere la stanza agli
  // altri (passa a chi è dentro da più tempo). "Chiudi per tutti" è una
  // scelta a parte, solo per il proprietario.
  const leave = () => {
    setConfirm(null);
    if (isOwner) send('mod', { action: 'owner_left' });
    exitRoom('', { callServer: true });
  };

  const closeForAll = async () => {
    setConfirm(null);
    const { error: err } = await endVideoRoom(roomId);
    if (err) {
      setError(err);
      return;
    }
    send('mod', { action: 'close' });
    exitRoom('');
  };

  const othersCount = (members ?? []).filter((m) => m.userId !== user?.id).length;
  const askLeave = () =>
    setConfirm(
      isOwner && othersCount > 0
        ? { text: 'Uscire dalla stanza? Resta aperta per gli altri: la gestirà chi è dentro da più tempo.', label: 'Esci', action: leave }
        : isOwner
          ? { text: 'Uscire? Sei l’ultimo: la stanza si chiuderà.', label: 'Esci', action: leave }
          : { text: 'Uscire dalla stanza?', label: 'Esci', action: leave }
    );

  const askCloseForAll = () =>
    setConfirm({ text: 'Chiudere la stanza per tutti? Usciranno tutti.', label: 'Chiudi per tutti', action: closeForAll });

  // Indietro con la stanza a tutto schermo: si riduce a mini-monitor (la
  // chiamata continua), non si esce.
  useBackLayer(fullOpen, () => setView('room', 'mini'), 'subpage:video-room', {
    onBack: () => {
      setView('room', 'mini');
      return true;
    },
  });

  useGlobeCover(fullOpen ? 'paused' : null);

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
  const remoteStreams = useMemo(() => call.remoteTiles.map((t) => t.stream), [call.remoteTiles]);
  const myVideo = call.screenStream ?? call.localStream;

  // Mini-monitor: chi sta parlando, altrimenti il primo partecipante con
  // video, altrimenti io.
  const speakingTile = call.remoteTiles.find((t) => t.stream && speaking.has(t.userId));
  const firstTile = call.remoteTiles.find((t) => t.stream && !t.failed);
  const miniTile = speakingTile ?? firstTile ?? null;
  const miniProfile = miniTile ? members?.find((m) => m.userId === miniTile.userId)?.profilo : user;
  const mini = {
    title: room ? `${room.titolo}${miniTile ? ` · ${nameOf(miniTile.userId, miniProfile, miniTile.name || 'Utente')}` : ''}` : preset.fallbackTitle,
    stream: miniTile?.stream ?? myVideo,
    placeholder: <Avatar profile={miniProfile} size={56} />,
    micOn: call.micOn,
    micLocked: call.micLocked,
    onToggleMic: call.joined ? call.toggleMic : null,
    onHangup: askLeave,
    sharing: call.sharingScreen,
    onStartShare: call.joined ? call.startScreenShare : null,
    onStopShare: call.stopScreenShare,
  };

  const surface = (content) => (
    <>
      <RemoteAudio streams={remoteStreams} />
      <CallSurface kind="room" full={<div className="rb-vroom-panel rb-vroom-panel--room">{content}</div>} mini={mini} />
      {confirm && <Confirm text={confirm.text} confirmLabel={confirm.label} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />}
    </>
  );

  if (!room || !members) {
    return surface(
      <div className="rb-vroom-room">
        <Skeleton lines={4} />
      </div>
    );
  }

  const count = Math.max(1, members.length);
  const ownerProfile = members.find((m) => m.userId === room.ownerId)?.profilo;
  const micLocked = call.micLocked;

  return surface(
    <div className="rb-vroom-room">
      <header className="rb-vroom-room-head">
        <div className="rb-vroom-room-title">
          <h3>{room.titolo}</h3>
          <p>
            <span>👑 {isOwner ? 'Tu' : nameOf(room.ownerId, ownerProfile, 'Proprietario')}{!isOwner && realBirths.get(room.ownerId) ? ` · ${realBirths.get(room.ownerId)}` : ''}</span>
            <span className="rb-vroom-dot">·</span>
            <span>{count}/{room.maxPartecipanti} persone</span>
          </p>
        </div>
        <div className="rb-vroom-room-actions">
          <MinimizeCallButton kind="room" />
          <button type="button" className="rb-vroom-btn" onClick={askLeave}>
            Esci
          </button>
          {isOwner && (
            <button type="button" className="rb-vroom-btn rb-vroom-btn--danger" onClick={askCloseForAll}>
              Chiudi per tutti
            </button>
          )}
        </div>
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
          stream={myVideo}
          name={call.sharingScreen ? 'Tu · schermo condiviso' : 'Tu'}
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
              name={nameOf(m.userId, m.profilo, tile?.name || 'Utente')}
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
                      aria-label={`Azioni su ${nameOf(m.userId, m.profilo)}`}
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
                              text: `Bloccare ${nameOf(m.userId, m.profilo, 'questa persona')}? Non potrà più rientrare in questa stanza.`,
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
        {call.joined && (
          <ScreenShareButton className="rb-vroom-ctrl" sharing={call.sharingScreen} onStart={call.startScreenShare} onStop={call.stopScreenShare} />
        )}
        {call.joined && (
          <button
            type="button"
            className={`rb-vroom-ctrl ${devicesOpen ? 'is-on' : ''}`}
            onClick={() => setDevicesOpen((v) => !v)}
            aria-expanded={devicesOpen}
            aria-label="Microfono e fotocamera"
            title="Scegli microfono e fotocamera"
          >
            ⚙️
          </button>
        )}
        <button type="button" className="rb-vroom-ctrl rb-vroom-ctrl--leave" onClick={askLeave} aria-label="Esci dalla stanza">
          📞
        </button>
      </div>
      {micLocked && <p className="rb-vroom-locked">Mutato dal proprietario</p>}
      {call.joined && call.mediaWarning && !devicesOpen && <p className="rb-vroom-locked">⚠️ {call.mediaWarning}</p>}
      {call.joined && devicesOpen && (
        <div className="rb-vroom-devices">
          <DevicePicker stream={call.localStream} onSwitch={call.switchDevice} version={call.localStream?.id} warning={call.mediaWarning} />
        </div>
      )}

      {isOwner && bans.length > 0 && (
        <section className="rb-vroom-bans">
          <h4>Bloccati</h4>
          <ul>
            {bans.map((b) => (
              <li key={b.userId}>
                <Avatar profile={b.profilo} size={24} />
                <span>{nameOf(b.userId, b.profilo)}</span>
                <button type="button" className="rb-vroom-btn" onClick={() => unban(b.userId)}>Sblocca</button>
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}

// ---------------------------------------------------------------------------

// Colonna delle stanze: Videochiamata del mondo Nerd (preset 'live') o
// Stanza conferenze del mondo Lavoro (preset 'conferenze'). La stanza in
// corso vive in calls/CallProvider: qui c'è il contenitore (host) dove
// entra la sua vista completa; se la stanza è ridotta a mini-monitor si
// rivede l'elenco. onNoAccess: il server ha risposto "Non hai accesso a
// questo mondo" (Lavoro senza consenso): chi monta la colonna mostra il
// consenso.
export default function VideoRoomsColumn({ user, onOpenAuth, preset: presetKey = 'live', onNoAccess }) {
  const calls = useCalls();
  const { room, views, roomExit, consumeRoomExit, openRoom, setView, hostRef } = calls;
  const preset = presetFor(presetKey);
  const [notice, setNotice] = useState('');
  // La vista completa entra qui solo se la stanza in corso è di questa
  // colonna (una conferenza non si apre dentro la colonna del Nerd).
  const roomHere = Boolean(room && presetFor(room.source) === preset);
  const showingRoom = Boolean(roomHere && user && views.room === 'full');

  // Uscita dalla stanza (per scelta, espulsione, chiusura): il motivo qui.
  useEffect(() => {
    if (!roomExit || presetFor(roomExit.source) !== preset || roomExit.source === 'gaming') return;
    setNotice(roomExit.message);
    consumeRoomExit();
  }, [roomExit, consumeRoomExit, preset]);

  return (
    <>
      {(roomHere || !room) && <div ref={hostRef('room')} className="rb-vroom-host" />}
      {!showingRoom && (
        <div className="rb-vroom-panel">
          <RoomsList
            preset={preset}
            user={user}
            onOpenAuth={onOpenAuth}
            onNoAccess={onNoAccess}
            notice={notice}
            inRoomId={room?.roomId ?? null}
            onDismissNotice={() => setNotice('')}
            onEnter={(id) => {
              setNotice('');
              if (room?.roomId === id) setView('room', 'full');
              else openRoom(id, presetKey);
            }}
          />
        </div>
      )}
    </>
  );
}
