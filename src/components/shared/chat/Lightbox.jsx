import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBackLayer } from '../../../hooks/useBackLayer';

// Foto a schermo intero. Livello "viewer" della pila di Indietro: sul
// telefono la freccia indietro chiude prima la foto, poi la chat.
export default function Lightbox({ src, nome, onClose }) {
  useBackLayer(true, onClose, 'viewer:chat-image');
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return createPortal(
    <div className="rb-lightbox" role="dialog" aria-label={nome || 'Foto'} onClick={onClose}>
      <img src={src} alt={nome || 'Foto'} onClick={(e) => e.stopPropagation()} />
      <div className="rb-lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span>{nome}</span>
        <a href={src} target="_blank" rel="noopener noreferrer" download={nome || true}>Scarica</a>
        <button type="button" onClick={onClose} aria-label="Chiudi">✕</button>
      </div>
    </div>,
    document.body
  );
}
