// Kit comune dei minigiochi del mondo Bambini (vedi gameKit.css): stessa
// palette delle forme sul globo (categoryShell.js KIDS_PALETTE), così i
// pezzi dentro a un gioco richiamano il colore della sua forma fuori.
export const KIT_COLORS = {
  fragola: '#FF4D6D',
  arancio: '#FF9F1C',
  limone: '#FFD60A',
  menta: '#2EE59D',
  azzurro: '#3A86FF',
  viola: '#9D4EDD',
  rosa: '#FF5DCF',
};

export const KIT_PALETTE = Object.values(KIT_COLORS);

// "Riduci animazioni" di sistema: niente tilt, scosse o particelle (volume,
// luci e ombre restano, sono solo CSS statico).
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// Telefono/tablet: il vassoio non segue il dito (non c'è un "passare sopra").
export function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
}
