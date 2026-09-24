import { useState } from 'react';

// Copertina di un gioco, o un riquadro col colore del mondo e le iniziali
// del nome quando manca (o non si carica).
function initials(name = '') {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
}

export default function GameCover({ title, size = 'md', className = '' }) {
  const [failed, setFailed] = useState(false);
  const cls = `rb-game-cover ${size === 'lg' ? 'rb-game-cover--lg' : size === 'sm' ? 'rb-game-cover--sm' : ''} ${className}`;
  const src = title?.copertina;
  if (src && !failed) {
    return <img className={cls} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <span className={cls} aria-hidden="true">
      {initials(title?.nome)}
    </span>
  );
}
