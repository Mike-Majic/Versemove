import { useEffect, useRef, useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import { useFormDirty, useReportUnsaved } from '../../hooks/useUnsavedChanges';
import './MediaEditor.css';

// Editor gratuito "scalato" (non un vero CapCut, l'utente lo sapeva già
// prima che lo costruissimo): per le foto, ritaglio con un rettangolo
// trascinabile + un filtro CSS/canvas preimpostato + una scritta
// sovrimpressa, tutto applicato "sul serio" (canvas -> nuova immagine); per
// i video solo il taglio inizio/fine, salvato come metadato (trimStart/
// trimEnd) e applicato in riproduzione: senza un motore di encoding lato
// client non si può tagliare davvero il file, sarebbe disonesto fingerlo.
const PHOTO_FILTERS = [
  { id: 'none', label: 'Originale', css: 'none' },
  { id: 'bn', label: 'B&N', css: 'grayscale(1) contrast(1.05)' },
  { id: 'seppia', label: 'Seppia', css: 'sepia(0.75) contrast(1.05)' },
  { id: 'vivace', label: 'Vivace', css: 'saturate(1.6) contrast(1.08)' },
  { id: 'contrasto', label: 'Contrasto+', css: 'contrast(1.35) brightness(1.03)' },
];

const TEXT_POSITIONS = [
  { id: 'top', label: 'Alto' },
  { id: 'center', label: 'Centro' },
  { id: 'bottom', label: 'Basso' },
];

function PhotoEditor({ src, onCancel, onSave }) {
  const imgRef = useRef(null);
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [naturalSize, setNaturalSize] = useState(null);
  // Rettangolo di ritaglio in percentuale (0-100) rispetto all'immagine mostrata.
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 100, h: 100 });
  const [filterId, setFilterId] = useState('none');
  const [text, setText] = useState('');
  const [textPos, setTextPos] = useState('bottom');
  useFormDirty({ crop, filterId, text, textPos });
  const filter = PHOTO_FILTERS.find((f) => f.id === filterId) ?? PHOTO_FILTERS[0];

  const startDrag = (e) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const startX = ((e.clientX - rect.left) / rect.width) * 100;
    const startY = ((e.clientY - rect.top) / rect.height) * 100;
    dragRef.current = { startX, startY };
    setCrop({ x: startX, y: startY, w: 0, h: 0 });

    const onMove = (moveEvent) => {
      const curX = Math.min(100, Math.max(0, ((moveEvent.clientX - rect.left) / rect.width) * 100));
      const curY = Math.min(100, Math.max(0, ((moveEvent.clientY - rect.top) / rect.height) * 100));
      const { startX: sx, startY: sy } = dragRef.current;
      setCrop({
        x: Math.min(sx, curX),
        y: Math.min(sy, curY),
        w: Math.abs(curX - sx),
        h: Math.abs(curY - sy),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const resetCrop = () => setCrop({ x: 0, y: 0, w: 100, h: 100 });

  const apply = () => {
    const img = imgRef.current;
    if (!img || !naturalSize) return;
    const useFull = crop.w < 2 || crop.h < 2;
    const cropPx = useFull
      ? { x: 0, y: 0, w: naturalSize.w, h: naturalSize.h }
      : {
          x: (crop.x / 100) * naturalSize.w,
          y: (crop.y / 100) * naturalSize.h,
          w: (crop.w / 100) * naturalSize.w,
          h: (crop.h / 100) * naturalSize.h,
        };

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(cropPx.w));
    canvas.height = Math.max(1, Math.round(cropPx.h));
    const ctx = canvas.getContext('2d');
    ctx.filter = filter.css;
    ctx.drawImage(img, cropPx.x, cropPx.y, cropPx.w, cropPx.h, 0, 0, canvas.width, canvas.height);

    if (text.trim()) {
      ctx.filter = 'none';
      const fontSize = Math.max(18, Math.round(canvas.width / 14));
      ctx.font = `700 ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      const y = textPos === 'top' ? fontSize * 1.4 : textPos === 'bottom' ? canvas.height - fontSize * 0.8 : canvas.height / 2;
      ctx.lineWidth = fontSize / 6;
      ctx.fillStyle = '#fff';
      ctx.strokeText(text.trim(), canvas.width / 2, y);
      ctx.fillText(text.trim(), canvas.width / 2, y);
    }

    onSave(canvas.toDataURL('image/jpeg', 0.88));
  };

  return (
    <div className="rb-media-editor-body">
      <div
        className="rb-media-editor-frame"
        ref={frameRef}
        onMouseDown={startDrag}
        style={{ filter: filter.css }}
      >
        <img
          ref={imgRef}
          src={src}
          alt="Da modificare"
          draggable={false}
          onLoad={(e) => setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
        />
        {crop.w > 2 && crop.h > 2 && (
          <div
            className="rb-media-editor-crop-box"
            style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }}
          />
        )}
        {text.trim() && <div className={`rb-media-editor-text-preview pos-${textPos}`}>{text}</div>}
      </div>

      <p className="rb-media-editor-hint">Trascina sull'immagine per ritagliare (facoltativo).</p>
      {(crop.w > 2 && crop.h > 2) && (
        <button type="button" className="rb-media-editor-reset-btn" onClick={resetCrop}>
          Annulla ritaglio
        </button>
      )}

      <div className="rb-media-editor-filters">
        {PHOTO_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`rb-media-editor-filter-btn ${filterId === f.id ? 'active' : ''}`}
            onClick={() => setFilterId(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rb-media-editor-text-row">
        <input
          type="text"
          placeholder="Scritta sovrimpressa (facoltativa)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={60}
        />
        <select value={textPos} onChange={(e) => setTextPos(e.target.value)}>
          {TEXT_POSITIONS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="rb-media-editor-actions">
        <button type="button" className="rb-media-editor-cancel-btn" onClick={onCancel}>Annulla</button>
        <button type="button" className="rb-media-editor-apply-btn" onClick={apply}>Applica</button>
      </div>
    </div>
  );
}

function VideoEditor({ src, onCancel, onSave }) {
  const videoRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  // trimEnd parte da 0 e diventa la durata solo a metadati caricati: il
  // confronto va fatto con la durata, non col primo render.
  useReportUnsaved(duration > 0 && (trimStart > 0 || trimEnd < duration));

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const onLoaded = () => {
      setDuration(v.duration);
      setTrimEnd(v.duration);
    };
    v.addEventListener('loadedmetadata', onLoaded);
    return () => v.removeEventListener('loadedmetadata', onLoaded);
  }, [src]);

  const previewFrom = (t) => {
    const v = videoRef.current;
    if (v) v.currentTime = t;
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="rb-media-editor-body">
      <video ref={videoRef} className="rb-media-editor-video" src={src} controls />

      <p className="rb-media-editor-hint">
        Taglio semplice: scegli inizio e fine, senza montaggio pesante — nessun re-encoding lato client, il file resta lo stesso, solo la riproduzione rispetterà i limiti scelti.
      </p>

      <div className="rb-media-editor-trim-row">
        <label>
          Inizio: {fmt(trimStart)}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={trimStart}
            onChange={(e) => {
              const v = Math.min(Number(e.target.value), trimEnd - 0.2);
              setTrimStart(Math.max(0, v));
              previewFrom(v);
            }}
          />
        </label>
        <label>
          Fine: {fmt(trimEnd)}
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={trimEnd}
            onChange={(e) => {
              const v = Math.max(Number(e.target.value), trimStart + 0.2);
              setTrimEnd(Math.min(duration, v));
            }}
          />
        </label>
      </div>

      <div className="rb-media-editor-actions">
        <button type="button" className="rb-media-editor-cancel-btn" onClick={onCancel}>Annulla</button>
        <button type="button" className="rb-media-editor-apply-btn" onClick={() => onSave({ src, trimStart, trimEnd })}>
          Applica
        </button>
      </div>
    </div>
  );
}

// type: 'photo' | 'video'. onSave riceve una dataURL (foto) o
// {src, trimStart, trimEnd} (video).
export default function MediaEditor({ type, src, onCancel, onSave }) {
  return (
    <ModalOverlay onClose={onCancel} className="rb-media-editor-overlay">
      <div className="rb-media-editor-panel" onClick={(e) => e.stopPropagation()}>
        <h3 className="rb-media-editor-title">{type === 'video' ? 'Modifica video' : 'Modifica foto'}</h3>
        {type === 'video' ? (
          <VideoEditor src={src} onCancel={onCancel} onSave={onSave} />
        ) : (
          <PhotoEditor src={src} onCancel={onCancel} onSave={onSave} />
        )}
      </div>
    </ModalOverlay>
  );
}
