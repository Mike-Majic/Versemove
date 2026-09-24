// Quanto è coperto il mappamondo dai pannelli sopra (letto da WorldGlobe
// per decidere quanto spesso ridisegnare):
// - 'paused': partita in corso a un tavolo, il globo si ferma del tutto
//   (pauseAnimation) finché la partita resta aperta;
// - 'covered': colonna/categoria o ModalOverlay aperti, il globo gira ma
//   con un tetto basso di fotogrammi (vedi COVERED_FRAME_MS in WorldGlobe);
// - null: mappamondo pulito, regola normale.
// Ogni componente registra la sua copertura con una chiave propria (vedi
// useGlobeCover): vince la più forte fra quelle attive.
import { useEffect, useState } from 'react';

const covers = new Map();
const listeners = new Set();

function notify() {
  const level = getGlobeCover();
  listeners.forEach((fn) => fn(level));
}

export function setGlobeCover(key, level) {
  const prev = covers.get(key) ?? null;
  if (prev === level) return;
  if (level) covers.set(key, level);
  else covers.delete(key);
  notify();
}

export function getGlobeCover() {
  let level = null;
  for (const l of covers.values()) {
    if (l === 'paused') return 'paused';
    level = 'covered';
  }
  return level;
}

export function subscribeGlobeCover(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Registra la copertura del componente finché è montato (level null =
// nessuna copertura).
export function useGlobeCover(level) {
  const [key] = useState(() => Symbol('globe-cover'));
  useEffect(() => {
    setGlobeCover(key, level);
    return () => setGlobeCover(key, null);
  }, [key, level]);
}
