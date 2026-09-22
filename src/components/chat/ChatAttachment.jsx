import { useEffect, useState } from 'react';
import { getChatAttachmentUrl } from '../../data/directChat';

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime = '') {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📕';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.includes('sheet') || mime.includes('excel')) return '📊';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📽️';
  if (mime.includes('zip')) return '🗜️';
  return '📄';
}

// Tile OpenStreetMap che contiene il punto (zoom 15) + posizione del punto
// dentro la tile in percentuale, per disegnare il segnaposto sopra.
function osmTile(lat, lng, zoom = 15) {
  const n = 2 ** zoom;
  const xf = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.floor(xf);
  const y = Math.floor(yf);
  return {
    url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
    left: (xf - x) * 100,
    top: (yf - y) * 100,
  };
}

function PhotoAttachment({ allegato }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getChatAttachmentUrl(allegato.path).then((u) => {
      if (cancelled) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [allegato.path]);

  if (failed) return <span className="rb-chat-att-missing">📷 Foto non disponibile</span>;
  if (!url) return <span className="rb-chat-att-photo rb-chat-att-loading" aria-label="Caricamento foto" />;
  return (
    <a className="rb-chat-att-photo" href={url} target="_blank" rel="noopener noreferrer" title="Apri a schermo intero">
      <img src={url} alt={allegato.nome || 'Foto'} loading="lazy" />
    </a>
  );
}

function FileAttachment({ allegato }) {
  const [opening, setOpening] = useState(false);
  const open = async () => {
    setOpening(true);
    const u = await getChatAttachmentUrl(allegato.path, { download: true });
    setOpening(false);
    if (u) window.open(u, '_blank', 'noopener');
  };
  return (
    <button type="button" className="rb-chat-att-file" onClick={open} disabled={opening}>
      <span className="rb-chat-att-file-icon">{fileIcon(allegato.mime)}</span>
      <span className="rb-chat-att-file-info">
        <strong>{allegato.nome}</strong>
        <small>{opening ? 'Apertura…' : `${formatSize(allegato.size)} · Scarica`}</small>
      </span>
    </button>
  );
}

function LocationAttachment({ allegato }) {
  const lat = Number(allegato.lat);
  const lng = Number(allegato.lng);
  const tile = osmTile(lat, lng);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  return (
    <div className="rb-chat-att-location">
      <a className="rb-chat-att-map" href={osmUrl} target="_blank" rel="noopener noreferrer" title="Apri la mappa">
        <img src={tile.url} alt="Mappa della posizione" loading="lazy" />
        <span className="rb-chat-att-pin" style={{ left: `${tile.left}%`, top: `${tile.top}%` }}>📍</span>
        <span className="rb-chat-att-osm">© OpenStreetMap</span>
      </a>
      <div className="rb-chat-att-location-row">
        <span>
          📍 Posizione
          {allegato.precisione ? <small> · ±{Math.round(allegato.precisione)} m</small> : null}
        </span>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer">Portami qui</a>
      </div>
    </div>
  );
}

// Contenuto di un messaggio con allegato (foto, file o posizione).
export default function ChatAttachment({ tipo, allegato }) {
  if (!allegato) return null;
  if (tipo === 'foto') return <PhotoAttachment allegato={allegato} />;
  if (tipo === 'file') return <FileAttachment allegato={allegato} />;
  if (tipo === 'posizione') return <LocationAttachment allegato={allegato} />;
  return null;
}
