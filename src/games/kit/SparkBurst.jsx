import { useMemo } from 'react';
import { KIT_PALETTE, prefersReducedMotion } from './palette';

const MAX_SPARKS = 40;

// Esplosione di scintille colorate in un punto (x/y in px rispetto al
// genitore, che deve essere position: relative): usata alla mossa vincente.
// Le proprietà casuali si calcolano una volta per `burstKey` (mai ad ogni
// render, altrimenti le scintille "salterebbero" a metà animazione). Con
// "riduci animazioni" non mette nulla nel DOM.
export default function SparkBurst({ x, y, burstKey, count = 32, colors = KIT_PALETTE }) {
  const sparks = useMemo(() => {
    if (prefersReducedMotion()) return [];
    const n = Math.min(MAX_SPARKS, count);
    return Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const distance = 40 + Math.random() * 90;
      return {
        key: i,
        dx: `${(Math.cos(angle) * distance).toFixed(1)}px`,
        dy: `${(Math.sin(angle) * distance - 20).toFixed(1)}px`,
        rot: `${Math.round(Math.random() * 360)}deg`,
        delay: `${Math.round(Math.random() * 80)}ms`,
        size: 5 + Math.random() * 6,
        color: colors[i % colors.length],
        round: i % 3 === 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstKey]);
  if (sparks.length === 0) return null;
  return (
    <div className="gk-sparks" style={{ left: x, top: y }} aria-hidden="true">
      {sparks.map((s) => (
        <span
          key={s.key}
          className={`gk-spark ${s.round ? 'round' : ''}`}
          style={{
            width: s.size,
            height: s.size,
            background: s.color,
            '--dx': s.dx,
            '--dy': s.dy,
            '--rot': s.rot,
            '--delay': s.delay,
          }}
        />
      ))}
    </div>
  );
}
