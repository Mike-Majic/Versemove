import { useState } from 'react';
import { letterAvatarUrl } from './letterAvatar';

// Foto profilo uguale in tutta l'app: se la persona non ha una foto (o il
// link non si carica più) al posto dell'immagine rotta compare sempre lo
// stesso cerchio colorato con l'iniziale del nickname, lo stesso colore per
// la stessa persona in ogni scheda. Resta un <img>, così valgono le classi
// e le regole CSS già scritte per le foto profilo.
export default function AvatarImg({ src, name = '', seed, alt = '', ...rest }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const fallback = letterAvatarUrl(name, seed ?? name);
  const real = src && src !== failedSrc ? src : null;
  return (
    <img
      {...rest}
      src={real ?? fallback}
      alt={alt}
      onError={(e) => {
        if (real) setFailedSrc(real);
        rest.onError?.(e);
      }}
    />
  );
}
