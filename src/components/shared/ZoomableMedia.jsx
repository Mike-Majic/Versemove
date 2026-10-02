import { useState } from 'react';
import Lightbox from './chat/Lightbox';
import './ZoomableMedia.css';

// Foto o video di un contenuto (post, puntata, evento, luogo...) che al
// clic si apre a tutto schermo nel Lightbox. Il video qui è solo
// un'anteprima (fotogramma iniziale + ▶): si guarda nel Lightbox.
// onError: per chi mostra un avviso se il file non si carica (PostCard).
export default function ZoomableMedia({ src, kind = 'image', alt = '', caption = null, className = '', onError, loading }) {
  const [open, setOpen] = useState(false);
  if (!src) return null;
  const isVideo = kind === 'video';
  return (
    <>
      <button
        type="button"
        className={`rb-zoom-media ${isVideo ? 'is-video' : ''} ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={isVideo ? 'Guarda il video a schermo intero' : 'Apri la foto a schermo intero'}
      >
        {isVideo ? (
          <>
            <video src={src} muted playsInline preload="metadata" onError={onError} />
            <span className="rb-zoom-media-play" aria-hidden="true">▶</span>
          </>
        ) : (
          <img src={src} alt={alt} loading={loading} onError={onError} />
        )}
      </button>
      {open && <Lightbox src={src} kind={isVideo ? 'video' : 'image'} nome={alt || (isVideo ? 'Video' : 'Foto')} caption={caption} onClose={() => setOpen(false)} />}
    </>
  );
}
