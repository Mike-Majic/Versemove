import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../components/shared/Icon';
import { canShareScreen } from '../hooks/useMeshCall';
import { useCalls } from './CallProvider';
import './calls.css';

// Dove si disegna una chiamata (vedi CallProvider): vista completa dentro
// la colonna che la ospita (portal nel contenitore registrato), o in un
// pannello flottante se la colonna non c'è; altrimenti mini-monitor.
// full: la vista completa; mini: le props del mini-monitor.
export default function CallSurface({ kind, full, mini, floatClassName = '' }) {
  const { views, hosts } = useCalls();
  const view = views[kind] ?? 'full';
  const host = hosts[kind];
  if (view === 'mini') return <MiniCallMonitor kind={kind} {...mini} />;
  if (host) return createPortal(full, host);
  // Stesso sistema di coordinate della colonna (fixed, inset 0): i pannelli
  // della vista completa si posizionano come dentro la colonna.
  return <div className={`rb-callfloat-layer ${floatClassName}`}>{full}</div>;
}

// Pulsante "Riduci" da mettere nella vista completa di ogni chiamata.
export function MinimizeCallButton({ kind, className = '' }) {
  const { setView } = useCalls();
  return (
    <button
      type="button"
      className={`rb-call-minimize-btn ${className}`}
      onClick={() => setView(kind, 'mini')}
      aria-label="Riduci a mini-monitor"
      title="Riduci a mini-monitor (la chiamata continua)"
    >
      <Icon name="minimize" size={17} />
    </button>
  );
}

// Pulsante condivisione schermo (nascosto dove getDisplayMedia non c'è).
export function ScreenShareButton({ sharing, onStart, onStop, className = '', size = 18 }) {
  if (!canShareScreen()) return null;
  return (
    <button
      type="button"
      className={`${className} ${sharing ? 'is-on' : ''}`}
      onClick={sharing ? onStop : onStart}
      aria-pressed={sharing}
      aria-label={sharing ? 'Interrompi condivisione schermo' : 'Condividi lo schermo'}
      title={sharing ? 'Interrompi condivisione schermo' : 'Condividi lo schermo'}
    >
      <Icon name="screen" size={size} />
    </button>
  );
}

const POS_KEY = 'rb-mini-call-pos';
const MARGIN = 10;

function readPos(kind) {
  try {
    const all = JSON.parse(sessionStorage.getItem(POS_KEY) || '{}');
    return all[kind] ?? null;
  } catch {
    return null;
  }
}

function savePos(kind, pos) {
  try {
    const all = JSON.parse(sessionStorage.getItem(POS_KEY) || '{}');
    all[kind] = pos;
    sessionStorage.setItem(POS_KEY, JSON.stringify(all));
  } catch {
    // posizione non salvata: si riparte da quella predefinita
  }
}

// Posizione predefinita: in basso al centro (lì non ci sono comandi: la
// topbar è in alto, l'elenco categorie in basso a sinistra, il selettore
// dei mondi in basso a destra); le tre chiamate possibili si affiancano.
const OFFSET_BY_KIND = { room: 0, modroom: 1, direct: 2 };
function defaultPos(kind, w, h) {
  const shift = (OFFSET_BY_KIND[kind] ?? 0) * 24;
  return { x: Math.round(window.innerWidth / 2 - w / 2 + shift), y: Math.round(window.innerHeight - h - 24 - shift) };
}

function clamp(pos, w, h) {
  return {
    x: Math.min(Math.max(MARGIN, pos.x), Math.max(MARGIN, window.innerWidth - w - MARGIN)),
    y: Math.min(Math.max(MARGIN + 56, pos.y), Math.max(MARGIN, window.innerHeight - h - MARGIN)),
  };
}

// Mini-monitor flottante stile Discord: anteprima di chi parla (o del
// primo partecipante), Ingrandisci, Muto, Condividi schermo, Chiudi
// chiamata. Trascinabile (mouse o dito), resta sopra a tutto.
export function MiniCallMonitor({
  kind,
  title,
  stream,
  videoMuted = true,
  placeholder = null,
  micOn,
  micLocked = false,
  onToggleMic,
  onHangup,
  sharing = false,
  onStartShare,
  onStopShare,
  onExpand,
}) {
  const { setView } = useCalls();
  const boxRef = useRef(null);
  const videoRef = useRef(null);
  const dragRef = useRef(null);
  const [pos, setPos] = useState(() => readPos(kind));

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const fit = () => {
      const { width, height } = el.getBoundingClientRect();
      setPos((p) => clamp(p ?? defaultPos(kind, width, height), width, height));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [kind]);

  useEffect(() => {
    if (videoRef.current && videoRef.current.srcObject !== (stream ?? null)) videoRef.current.srcObject = stream ?? null;
  }, [stream]);

  const onPointerDown = (e) => {
    if (e.target.closest('button')) return;
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top, w: rect.width, h: rect.height };
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    setPos(clamp({ x: e.clientX - d.dx, y: e.clientY - d.dy }, d.w, d.h));
  };
  const onPointerUp = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (pos) savePos(kind, pos);
  };

  const expand = onExpand ?? (() => setView(kind, 'full'));

  return (
    <div
      ref={boxRef}
      className="rb-minicall"
      style={pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="region"
      aria-label={`Chiamata in corso: ${title}`}
    >
      <div className="rb-minicall-video">
        {stream ? <video ref={videoRef} autoPlay playsInline muted={videoMuted} /> : <div className="rb-minicall-placeholder">{placeholder}</div>}
        <span className="rb-minicall-title">{title}</span>
      </div>
      <div className="rb-minicall-controls">
        <button type="button" className="rb-minicall-btn" onClick={expand} aria-label="Ingrandisci" title="Ingrandisci">
          <Icon name="maximize" size={17} />
        </button>
        {onToggleMic && (
          <button
            type="button"
            className={`rb-minicall-btn ${micOn ? '' : 'is-off'}`}
            onClick={onToggleMic}
            disabled={micLocked}
            aria-label={micLocked ? 'Mutato dal proprietario' : micOn ? 'Muto' : 'Riattiva microfono'}
            title={micLocked ? 'Mutato dal proprietario' : micOn ? 'Muto' : 'Riattiva microfono'}
          >
            <Icon name={micOn ? 'mic' : 'micOff'} size={17} />
          </button>
        )}
        {onStartShare && <ScreenShareButton className="rb-minicall-btn" sharing={sharing} onStart={onStartShare} onStop={onStopShare} size={17} />}
        <button type="button" className="rb-minicall-btn rb-minicall-hangup" onClick={onHangup} aria-label="Chiudi chiamata" title="Chiudi chiamata">
          <Icon name="phoneOff" size={18} />
        </button>
      </div>
    </div>
  );
}

// Audio degli altri partecipanti: sempre montato nella sessione, qualunque
// sia la vista (i <video> sono tutti muti), così riducendo la chiamata a
// mini-monitor o spostando la vista in un'altra colonna non si interrompe.
export function RemoteAudio({ streams }) {
  return (
    <div className="rb-call-remote-audio" aria-hidden="true">
      {streams.filter(Boolean).map((s) => (
        <AudioSink key={s.id} stream={s} />
      ))}
    </div>
  );
}

function AudioSink({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play?.().catch(() => {});
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}
