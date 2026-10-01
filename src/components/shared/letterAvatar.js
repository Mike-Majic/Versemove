// Foto profilo "di riserva": cerchio con l'iniziale del nickname, colore
// ricavato dall'id (o dal nome) così la stessa persona ha sempre lo stesso
// colore. È un'immagine SVG in data URI: funziona dentro <img>, nei marker
// della mappa e ovunque serva un URL.
const PALETTE = ['#e0457b', '#7c5cff', '#2f9bff', '#16b39a', '#f59e0b', '#ef4444', '#8b5cf6', '#0ea5e9', '#22c55e', '#f97316'];

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const cache = new Map();

export function letterAvatarUrl(name, seed) {
  const letter = (String(name || '').trim().charAt(0) || '?').toUpperCase();
  const key = `${letter}|${seed ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const color = PALETTE[hash(String(seed ?? name ?? '')) % PALETTE.length];
  const safe = letter.replace(/[<>&"']/g, '?');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${color}"/><text x="32" y="33" dy=".35em" text-anchor="middle" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="30" font-weight="700" fill="#fff">${safe}</text></svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(key, url);
  return url;
}

// URL da usare per la foto profilo: quella vera se c'è, altrimenti l'iniziale.
export function avatarSrc(avatar, name, seed) {
  return avatar || letterAvatarUrl(name, seed);
}
