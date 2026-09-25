import { useEffect, useRef } from 'react';
import { isCoarsePointer, prefersReducedMotion } from './palette';

// Parallasse del vassoio (.gk-tray): su desktop il tabellone si inclina di
// ±maxDeg gradi seguendo il mouse, scrivendo solo due variabili CSS
// (--tilt-x/--tilt-y) sull'elemento — nessun render React, nessuno stato.
// Su touch o con "riduci animazioni" non fa nulla: il vassoio resta fermo
// alla sua inclinazione di base (rotateX 8deg, vedi gameKit.css).
export function useTrayTilt(maxDeg = 4) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || isCoarsePointer() || prefersReducedMotion()) return undefined;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--tilt-y', `${(px * maxDeg * 2).toFixed(2)}deg`);
      el.style.setProperty('--tilt-x', `${(-py * maxDeg * 2).toFixed(2)}deg`);
    };
    const onLeave = () => {
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [maxDeg]);
  return ref;
}
