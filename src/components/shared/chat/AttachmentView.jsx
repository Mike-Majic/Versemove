import { useEffect, useState } from 'react';
import { getChatAttachmentUrl } from '../../../data/directChat';
import { docBadge, formatSize } from './chatMedia';
import VoicePlayer from './VoicePlayer';

// Allegato di un messaggio: { tipo: 'immagine'|'video'|'audio'|'documento',
// path, nome, mime, dimensione, durata? }. Il file è privato: si legge con
// un URL firmato (1 ora). Immagini come miniatura (clic = schermo intero
// con onOpenImage), video col player, vocali col player a onda, documenti
// come scheda con icona per tipo, nome e dimensione (clic = apri/scarica).
function useSignedUrl(path, download = false) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!path) return undefined;
    let cancelled = false;
    getChatAttachmentUrl(path, { download }).then((u) => {
      if (cancelled) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [path, download]);
  return { url, failed };
}

function ImageAttachment({ a, onOpenImage }) {
  const { url, failed } = useSignedUrl(a.path);
  if (failed) return <span className="rb-att-missing">🖼️ Foto non disponibile</span>;
  if (!url) return <span className="rb-att-img rb-att-loading" aria-label="Caricamento foto" />;
  return (
    <button type="button" className="rb-att-img" onClick={() => onOpenImage?.(url, a.nome)} title="Apri a schermo intero">
      <img src={url} alt={a.nome || 'Foto'} loading="lazy" />
      {a.nome && <span className="rb-att-img-name">{a.nome}</span>}
    </button>
  );
}

function VideoAttachment({ a }) {
  const { url, failed } = useSignedUrl(a.path);
  if (failed) return <span className="rb-att-missing">🎬 Video non disponibile</span>;
  if (!url) return <span className="rb-att-img rb-att-loading" aria-label="Caricamento video" />;
  return <video className="rb-att-video" src={url} controls preload="metadata" playsInline />;
}

function AudioAttachment({ a }) {
  const { url, failed } = useSignedUrl(a.path);
  if (failed) return <span className="rb-att-missing">🎤 Vocale non disponibile</span>;
  return <VoicePlayer src={url} durata={a.durata} />;
}

function DocAttachment({ a }) {
  const [opening, setOpening] = useState(false);
  const badge = docBadge(a.mime, a.nome);
  // PDF e testo si aprono nel browser, il resto si scarica.
  const inline = a.mime === 'application/pdf' || a.mime === 'text/plain';
  const open = async () => {
    setOpening(true);
    const u = await getChatAttachmentUrl(a.path, { download: !inline });
    setOpening(false);
    if (u) window.open(u, '_blank', 'noopener');
  };
  return (
    <button type="button" className="rb-att-doc" onClick={open} disabled={opening}>
      <span className="rb-att-doc-icon" style={{ background: badge.color }}>{badge.label}</span>
      <span className="rb-att-doc-info">
        <strong>{a.nome}</strong>
        <small>{opening ? 'Apertura…' : `${formatSize(a.dimensione ?? a.size)} · ${inline ? 'Apri' : 'Scarica'}`}</small>
      </span>
    </button>
  );
}

export default function AttachmentView({ allegato, onOpenImage }) {
  if (!allegato?.path) return null;
  switch (allegato.tipo) {
    case 'immagine':
      return <ImageAttachment a={allegato} onOpenImage={onOpenImage} />;
    case 'video':
      return <VideoAttachment a={allegato} />;
    case 'audio':
      return <AudioAttachment a={allegato} />;
    default:
      return <DocAttachment a={allegato} />;
  }
}

