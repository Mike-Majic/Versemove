// Disegni originali dei tre mazzi regionali per Scopa e Trentuno
// (napoletane, piacentine, siciliane): semi di tipo spagnolo (denari,
// coppe, spade dritte, bastoni nodosi), valori 1-7 con la disposizione
// tradizionale (denari e coppe in file, spade e bastoni lunghi incrociati a
// graticcio), Fante, Cavallo e Re diversi per seme e un dorso per mazzo.
// Disegnati da zero per questa app: nessun ricalco di edizioni esistenti.
//
// Prestazioni: ogni carta è un <symbol> scritto una volta sola in un unico
// SVG nascosto nella pagina (ensureItalianDeck, al primo uso del mazzo);
// PlayingCard la richiama con <use>. I semi delle carte numerali sono a loro
// volta <g> condivisi. Riquadro di ogni carta: 90x130.

const NS = 'http://www.w3.org/2000/svg';
const SPRITE_ID = 'vm-italian-cards-sprite';
const PREFIX = { napoletane: 'nap', piacentine: 'pia', siciliane: 'sic' };

export const italianCardId = (deck, card) => `vmit-${PREFIX[deck] ?? 'nap'}-${card}`;
export const italianBackId = (deck) => `vmit-${PREFIX[deck] ?? 'nap'}-back`;

// Rettangolo visibile della carta (le siciliane sono più raccolte dentro lo
// stesso riquadro 90x130): serve anche a PlayingCard per gli indici.
export const ITALIAN_CARD_BOX = {
  napoletane: { x: 1.5, y: 1.5, w: 87, h: 127 },
  piacentine: { x: 1.5, y: 1.5, w: 87, h: 127 },
  siciliane: { x: 6, y: 7, w: 78, h: 116 },
};

const n = (v) => Math.round(v * 100) / 100;

// --- Stili dei mazzi --------------------------------------------------------

const STYLES = {
  napoletane: {
    ink: '#3b2615',
    lw: 1.1,
    paper: '#fbf2df',
    edge: '#cdb68c',
    red: '#c3382a',
    yellow: '#f0b52e',
    azure: '#4a8fca',
    green: '#3e8a45',
    dark: '#2a2630',
    skin: '#f3cfa6',
    hair: '#5b3a1d',
    white: '#fffaf0',
    pip: 1,
    // Costumi per seme: principale, secondario, gambe.
    costume: {
      D: ['red', 'yellow', 'azure'],
      C: ['azure', 'red', 'yellow'],
      S: ['green', 'yellow', 'red'],
      B: ['yellow', 'green', 'red'],
    },
    horse: { D: '#f4ead6', C: '#9a5a2e', S: '#3a3236', B: '#c9b49a' },
    beard: { D: '#6b4320', C: '#9c9c9c', S: '#2c2420', B: '#b4532a' },
  },
  piacentine: {
    ink: '#262636',
    lw: 0.65,
    paper: '#fdfbf6',
    edge: '#c9c4b8',
    red: '#b5312c',
    yellow: '#e0b23e',
    azure: '#33689f',
    green: '#3a7a52',
    dark: '#23232e',
    skin: '#f4d6b8',
    hair: '#4a3324',
    white: '#ffffff',
    pip: 0.92,
    costume: {
      D: ['azure', 'yellow', 'red'],
      C: ['red', 'green', 'azure'],
      S: ['yellow', 'azure', 'green'],
      B: ['green', 'red', 'yellow'],
    },
    horse: { D: '#e9e3d6', C: '#7c4a2a', S: '#2d2b33', B: '#a98d6c' },
    beard: { D: '#5a3b22', C: '#a8a8a8', S: '#22202a', B: '#9c4a26' },
  },
  siciliane: {
    ink: '#2b1830',
    lw: 0.85,
    paper: '#fff7e6',
    edge: '#e0b98a',
    red: '#e2264b',
    yellow: '#ffc21a',
    azure: '#1c8fe2',
    green: '#20a34b',
    magenta: '#c42e8f',
    orange: '#ff7a1a',
    dark: '#2b2033',
    skin: '#f6cfa4',
    hair: '#3e2414',
    white: '#ffffff',
    pip: 0.82,
    costume: {
      D: ['magenta', 'yellow', 'azure'],
      C: ['orange', 'azure', 'green'],
      S: ['azure', 'magenta', 'yellow'],
      B: ['green', 'orange', 'red'],
    },
    horse: { D: '#fbf1e0', C: '#b0602a', S: '#3b2f40', B: '#e0c08a' },
    beard: { D: '#4a2a14', C: '#b0b0b0', S: '#1e1820', B: '#c4502a' },
  },
};

const stroke = (st, k = 1) => `stroke="${st.ink}" stroke-width="${n(st.lw * k)}" stroke-linejoin="round"`;

// --- Semi -------------------------------------------------------------------

function coin(st, deck) {
  const ring = deck === 'piacentine' ? st.green : deck === 'siciliane' ? st.magenta : st.red;
  let center;
  if (deck === 'piacentine') {
    const rays = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return `M${n(Math.cos(a) * 1.2)},${n(Math.sin(a) * 1.2)}L${n(Math.cos(a) * 3.6)},${n(Math.sin(a) * 3.6)}`;
    }).join('');
    center = `<path d="${rays}" stroke="${st.ink}" stroke-width="0.5"/><circle r="1.1" fill="${st.red}"/>`;
  } else if (deck === 'siciliane') {
    const dots = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return `<circle cx="${n(Math.cos(a) * 5.4)}" cy="${n(Math.sin(a) * 5.4)}" r="0.75" fill="${st.white}"/>`;
    }).join('');
    center = `${dots}<circle r="2.2" fill="${st.azure}" ${stroke(st, 0.6)}/>`;
  } else {
    center = `<path d="M0,-3.4L1,0L0,3.4L-1,0ZM-3.4,0L0,1L3.4,0L0,-1Z" fill="${st.green}"/>`;
  }
  return (
    `<circle r="9" fill="${st.yellow}" ${stroke(st)}/>` +
    `<circle r="6.6" fill="${ring}" ${stroke(st, 0.6)}/>` +
    `<circle r="4.3" fill="${st.yellow}" ${stroke(st, 0.6)}/>` +
    center
  );
}

function cup(st, deck) {
  const band = deck === 'siciliane' ? st.magenta : st.red;
  const body = deck === 'piacentine' ? st.yellow : st.yellow;
  return (
    `<path d="M-6,10.5Q0,6.5 6,10.5Z" fill="${band}" ${stroke(st)}/>` +
    `<rect x="-1.4" y="2.4" width="2.8" height="5" fill="${body}" ${stroke(st, 0.8)}/>` +
    `<ellipse cy="5.2" rx="2.7" ry="1.3" fill="${band}" ${stroke(st, 0.7)}/>` +
    `<path d="M-8,-8C-8,-1 -4,2.2 0,2.6C4,2.2 8,-1 8,-8Z" fill="${body}" ${stroke(st)}/>` +
    `<path d="M-6.8,-4.2C-3,-2.4 3,-2.4 6.8,-4.2" fill="none" stroke="${band}" stroke-width="1.7"/>` +
    `<rect x="-8.8" y="-10" width="17.6" height="2.4" rx="1" fill="${band}" ${stroke(st, 0.8)}/>` +
    (deck === 'siciliane' ? `<circle cy="-1.2" r="1" fill="${st.azure}"/>` : '')
  );
}

// Spada dritta verticale, punta in alto, lunga len (centrata in 0,0).
function sword(st, deck, len = 26) {
  const h = len / 2;
  const guard = deck === 'siciliane' ? st.magenta : st.yellow;
  const grip = deck === 'piacentine' ? st.green : st.red;
  return (
    `<path d="M0,${n(-h)}L1.8,${n(-h + 4)}L1.8,${n(h - 8)}L-1.8,${n(h - 8)}L-1.8,${n(-h + 4)}Z" fill="${st.azure}" ${stroke(st)}/>` +
    `<path d="M0,${n(-h + 5)}V${n(h - 9)}" stroke="${st.white}" stroke-width="0.6" opacity="0.8"/>` +
    `<rect x="-6.2" y="${n(h - 8.2)}" width="12.4" height="2.4" rx="1.2" fill="${guard}" ${stroke(st, 0.8)}/>` +
    `<rect x="-1.25" y="${n(h - 5.8)}" width="2.5" height="3.8" fill="${grip}" ${stroke(st, 0.7)}/>` +
    `<circle cy="${n(h - 1.2)}" r="1.9" fill="${guard}" ${stroke(st, 0.7)}/>`
  );
}

// Bastone nodoso verticale, più grosso in alto, lungo len.
function club(st, deck, len = 26) {
  const h = len / 2;
  const wood = deck === 'piacentine' ? '#5f8f3c' : deck === 'siciliane' ? st.green : '#4f8f3a';
  const knot = deck === 'siciliane' ? '#13702f' : '#2f5f22';
  const band = deck === 'siciliane' ? st.orange : st.red;
  const width = (t) => 1.7 + 2.1 * (1 - t); // t: 0 in alto, 1 in basso
  const knots = [0.22, 0.42, 0.62, 0.8]
    .map((t, i) => {
      const y = -h + t * len;
      const side = i % 2 ? 1 : -1;
      return `<ellipse cx="${n(side * (width(t) + 0.5))}" cy="${n(y)}" rx="1.5" ry="1.05" fill="${knot}" ${stroke(st, 0.5)}/>`;
    })
    .join('');
  return (
    `<path d="M-1.7,${n(h)}L-3.8,${n(-h + 3)}Q0,${n(-h - 1.6)} 3.8,${n(-h + 3)}L1.7,${n(h)}Z" fill="${wood}" ${stroke(st)}/>` +
    knots +
    `<rect x="-2.3" y="${n(h - 6)}" width="4.6" height="1.7" fill="${band}" ${stroke(st, 0.5)}/>` +
    `<rect x="-2.1" y="${n(h - 3.2)}" width="4.2" height="1.4" fill="${st.yellow}" ${stroke(st, 0.5)}/>`
  );
}

const glyph = (st, deck, suit, len) =>
  suit === 'D' ? coin(st, deck) : suit === 'C' ? cup(st, deck) : suit === 'S' ? sword(st, deck, len) : club(st, deck, len);

const place = (x, y, s, inner, rot = 0) =>
  `<g transform="translate(${n(x)} ${n(y)})${rot ? ` rotate(${n(rot)})` : ''}${s !== 1 ? ` scale(${n(s)})` : ''}">${inner}</g>`;

// --- Disposizioni 1-7 ---------------------------------------------------------

// Denari e coppe: in file, come nei mazzi tradizionali (il 3 di denari in
// diagonale, il 3 di coppe a triangolo).
const ROWS = {
  2: [[45, 38], [45, 92]],
  3: [[29, 36], [45, 65], [61, 94]],
  4: [[28, 38], [62, 38], [28, 92], [62, 92]],
  5: [[28, 36], [62, 36], [45, 65], [28, 94], [62, 94]],
  6: [[28, 34], [62, 34], [28, 65], [62, 65], [28, 96], [62, 96]],
  7: [[27, 34], [63, 34], [45, 49], [27, 65], [63, 65], [27, 96], [63, 96]],
};
const CUP_3 = [[45, 38], [29, 90], [61, 90]];

// Spade e bastoni: lunghi e incrociati a graticcio, con quello dritto al
// centro nei valori dispari.
function lattice(v) {
  const pairs = Math.floor(v / 2);
  const spread = pairs === 1 ? [0] : pairs === 2 ? [-12, 12] : [-19, 0, 19];
  const angle = pairs === 1 ? 27 : pairs === 2 ? 19 : 13;
  const len = pairs === 1 ? 86 : pairs === 2 ? 84 : 80;
  const out = [];
  for (const dx of spread) {
    out.push({ x: 45 + dx, y: 65, rot: -angle, len });
    out.push({ x: 45 + dx, y: 65, rot: angle, len });
  }
  if (v % 2) out.push({ x: 45, y: 65, rot: 0, len: 92 });
  return out;
}

// --- Fondo carta ---------------------------------------------------------------

function paper(st, deck) {
  const b = ITALIAN_CARD_BOX[deck];
  let out = `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${deck === 'siciliane' ? 6 : 7}" fill="${st.paper}" stroke="${st.edge}" stroke-width="1"/>`;
  if (deck === 'piacentine') {
    out +=
      `<rect x="5.5" y="5.5" width="79" height="119" rx="4" fill="none" stroke="${st.ink}" stroke-width="0.6"/>` +
      `<rect x="7.2" y="7.2" width="75.6" height="115.6" rx="3" fill="none" stroke="${st.ink}" stroke-width="0.3" opacity="0.6"/>`;
  }
  return out;
}

// --- Teste e cappelli ----------------------------------------------------------

function crown(st, x, y, w, kind) {
  const half = w / 2;
  const jewel = kind === 'C' ? st.red : kind === 'S' ? st.azure : kind === 'B' ? st.green : st.red;
  const points = kind === 'C' ? 3 : kind === 'S' ? 7 : 5;
  let d = `M${n(x - half)},${n(y)}`;
  for (let i = 0; i <= points * 2; i++) {
    const px = x - half + (w * i) / (points * 2);
    const py = i % 2 === 0 ? y - (kind === 'S' ? 7 : 6) : y - 3;
    d += `L${n(px)},${n(py)}`;
  }
  d += `L${n(x + half)},${n(y)}Z`;
  const tips = Array.from({ length: points + 1 }, (_, i) => {
    const px = x - half + (w * i) / points;
    return `<circle cx="${n(px)}" cy="${n(y - (kind === 'S' ? 7.4 : 6.4))}" r="0.8" fill="${st.yellow}" ${stroke(st, 0.4)}/>`;
  }).join('');
  return (
    `<path d="${d}" fill="${st.yellow}" ${stroke(st, 0.8)}/>` +
    tips +
    `<rect x="${n(x - half)}" y="${n(y - 1.6)}" width="${n(w)}" height="2" fill="${st.yellow}" ${stroke(st, 0.6)}/>` +
    `<circle cx="${n(x)}" cy="${n(y - 0.6)}" r="0.9" fill="${jewel}"/>` +
    (kind === 'C'
      ? `<path d="M${n(x - half + 1)},${n(y - 5)}Q${n(x)},${n(y - 11)} ${n(x + half - 1)},${n(y - 5)}" fill="none" ${stroke(st, 0.7)}/><circle cx="${n(x)}" cy="${n(y - 8.6)}" r="1.1" fill="${st.yellow}" ${stroke(st, 0.4)}/>`
      : '')
  );
}

function hat(st, x, y, r, type, color, accent) {
  switch (type) {
    case 'brim': // cappello a tesa larga con piuma
      return (
        `<path d="M${n(x + r * 0.2)},${n(y - r * 1.05)}Q${n(x + r * 1.9)},${n(y - r * 2.3)} ${n(x + r * 2.2)},${n(y - r * 0.9)}" fill="none" stroke="${accent}" stroke-width="${n(r * 0.32)}" stroke-linecap="round"/>` +
        `<ellipse cx="${n(x)}" cy="${n(y - r * 0.72)}" rx="${n(r * 1.55)}" ry="${n(r * 0.32)}" fill="${color}" ${stroke(st, 0.8)}/>` +
        `<path d="M${n(x - r * 0.85)},${n(y - r * 0.8)}Q${n(x)},${n(y - r * 1.9)} ${n(x + r * 0.85)},${n(y - r * 0.8)}Z" fill="${color}" ${stroke(st, 0.8)}/>` +
        `<path d="M${n(x - r * 0.85)},${n(y - r * 0.92)}H${n(x + r * 0.85)}" stroke="${accent}" stroke-width="${n(r * 0.18)}"/>`
      );
    case 'beret': // berretto morbido inclinato
      return (
        `<ellipse cx="${n(x - r * 0.2)}" cy="${n(y - r * 0.85)}" rx="${n(r * 1.3)}" ry="${n(r * 0.55)}" transform="rotate(-12 ${n(x)} ${n(y)})" fill="${color}" ${stroke(st, 0.8)}/>` +
        `<circle cx="${n(x + r * 0.5)}" cy="${n(y - r * 1.25)}" r="${n(r * 0.22)}" fill="${accent}" ${stroke(st, 0.5)}/>`
      );
    case 'helmet': // elmo con pennacchio
      return (
        `<path d="M${n(x)},${n(y - r * 1.5)}Q${n(x - r * 1.6)},${n(y - r * 2.6)} ${n(x - r * 1.7)},${n(y - r * 1.2)}" fill="none" stroke="${accent}" stroke-width="${n(r * 0.42)}" stroke-linecap="round"/>` +
        `<path d="M${n(x - r * 1.02)},${n(y - r * 0.1)}Q${n(x - r * 1.05)},${n(y - r * 1.55)} ${n(x)},${n(y - r * 1.55)}Q${n(x + r * 1.05)},${n(y - r * 1.55)} ${n(x + r * 1.02)},${n(y - r * 0.1)}L${n(x + r * 0.75)},${n(y - r * 0.45)}H${n(x - r * 0.75)}Z" fill="${color}" ${stroke(st, 0.8)}/>` +
        `<path d="M${n(x)},${n(y - r * 1.55)}V${n(y - r * 0.45)}" stroke="${st.ink}" stroke-width="${n(st.lw * 0.6)}"/>`
      );
    case 'cap': // berretto a punta ricadente
      return (
        `<path d="M${n(x - r * 1.05)},${n(y - r * 0.45)}Q${n(x - r * 0.9)},${n(y - r * 1.7)} ${n(x + r * 0.3)},${n(y - r * 1.6)}Q${n(x + r * 1.6)},${n(y - r * 1.4)} ${n(x + r * 1.5)},${n(y - r * 0.4)}Q${n(x + r * 1.2)},${n(y - r * 0.9)} ${n(x + r * 0.95)},${n(y - r * 0.55)}Z" fill="${color}" ${stroke(st, 0.8)}/>` +
        `<rect x="${n(x - r * 1.08)}" y="${n(y - r * 0.68)}" width="${n(r * 2.1)}" height="${n(r * 0.32)}" rx="${n(r * 0.15)}" fill="${accent}" ${stroke(st, 0.5)}/>`
      );
    default:
      return '';
  }
}

function head(st, x, y, r, { hatType, hatColor, hatAccent, beard, crownKind, longHair }) {
  let out = '';
  if (longHair) {
    out += `<path d="M${n(x - r * 1.05)},${n(y + r * 0.9)}Q${n(x - r * 1.35)},${n(y - r * 0.9)} ${n(x)},${n(y - r * 1.05)}Q${n(x + r * 1.35)},${n(y - r * 0.9)} ${n(x + r * 1.05)},${n(y + r * 0.9)}Z" fill="${st.hair}" ${stroke(st, 0.6)}/>`;
  }
  out += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${st.skin}" ${stroke(st)}/>`;
  if (!longHair) {
    out += `<path d="M${n(x - r * 0.95)},${n(y - r * 0.15)}Q${n(x - r * 0.8)},${n(y - r * 1.05)} ${n(x)},${n(y - r * 1.02)}Q${n(x + r * 0.8)},${n(y - r * 1.05)} ${n(x + r * 0.95)},${n(y - r * 0.15)}Q${n(x)},${n(y - r * 0.6)} ${n(x - r * 0.95)},${n(y - r * 0.15)}Z" fill="${st.hair}"/>`;
  }
  if (beard) {
    out += `<path d="M${n(x - r * 0.85)},${n(y + r * 0.1)}Q${n(x - r * 0.8)},${n(y + r * 1.75)} ${n(x)},${n(y + r * 1.9)}Q${n(x + r * 0.8)},${n(y + r * 1.75)} ${n(x + r * 0.85)},${n(y + r * 0.1)}Q${n(x)},${n(y + r * 0.85)} ${n(x - r * 0.85)},${n(y + r * 0.1)}Z" fill="${beard}" ${stroke(st, 0.6)}/>`;
    out += `<path d="M${n(x - r * 0.4)},${n(y + r * 0.42)}Q${n(x)},${n(y + r * 0.25)} ${n(x + r * 0.4)},${n(y + r * 0.42)}" fill="none" stroke="${beard}" stroke-width="${n(r * 0.18)}" stroke-linecap="round"/>`;
  }
  out +=
    `<circle cx="${n(x - r * 0.34)}" cy="${n(y - r * 0.08)}" r="${n(r * 0.09)}" fill="${st.ink}"/>` +
    `<circle cx="${n(x + r * 0.34)}" cy="${n(y - r * 0.08)}" r="${n(r * 0.09)}" fill="${st.ink}"/>` +
    `<path d="M${n(x)},${n(y)}L${n(x + r * 0.1)},${n(y + r * 0.28)}" stroke="${st.ink}" stroke-width="${n(r * 0.06)}" stroke-linecap="round"/>`;
  if (!beard) {
    out += `<path d="M${n(x - r * 0.22)},${n(y + r * 0.5)}Q${n(x)},${n(y + r * 0.62)} ${n(x + r * 0.22)},${n(y + r * 0.5)}" fill="none" stroke="${st.red}" stroke-width="${n(r * 0.09)}" stroke-linecap="round"/>`;
  }
  if (crownKind) out += crown(st, x, y - r * 0.72, r * 1.9, crownKind);
  else if (hatType) out += hat(st, x, y, r, hatType, hatColor, hatAccent);
  return out;
}

// Oggetto del seme tenuto in mano, con la mano in (hx, hy).
function heldObject(st, deck, suit, hx, hy, s = 1) {
  if (suit === 'D') return place(hx + 1, hy - 8 * s, 0.72 * s, coin(st, deck));
  if (suit === 'C') return place(hx + 1, hy - 8 * s, 0.72 * s, cup(st, deck));
  if (suit === 'S') return place(hx, hy - 15 * s, s, sword(st, deck, 38));
  return place(hx + 6 * s, hy - 13 * s, s, club(st, deck, 32), 24);
}

// Motivo del vestito per seme (broccato, righe, scaglie, rombi).
function pattern(st, suit, x0, y0, x1, y1, color) {
  const out = [];
  for (let y = y0; y <= y1; y += 6) {
    for (let x = x0; x <= x1; x += 6) {
      if (suit === 'D') out.push(`<circle cx="${n(x)}" cy="${n(y)}" r="0.7" fill="${color}"/>`);
      else if (suit === 'S') out.push(`<path d="M${n(x - 1.6)},${n(y)}l1.6,1.6 1.6,-1.6" fill="none" stroke="${color}" stroke-width="0.6"/>`);
      else if (suit === 'B') out.push(`<path d="M${n(x)},${n(y - 1.4)}l1.2,1.4 -1.2,1.4 -1.2,-1.4Z" fill="${color}"/>`);
    }
    if (suit === 'C') out.push(`<path d="M${n(x0)},${n(y)}H${n(x1)}" stroke="${color}" stroke-width="0.6" opacity="0.9"/>`);
  }
  return out.join('');
}

// --- Figure intere (napoletane e siciliane) -------------------------------------

const FANTE_HAT = { D: 'brim', C: 'beret', S: 'helmet', B: 'cap' };
const RIDER_HAT = { D: 'beret', C: 'brim', S: 'helmet', B: 'cap' };

function colorsFor(st, suit) {
  const [main, accent, legs] = st.costume[suit].map((k) => st[k]);
  return { main, accent, legs };
}

function fullFante(st, deck, suit) {
  const { main, accent, legs } = colorsFor(st, suit);
  return (
    `<ellipse cx="45" cy="119" rx="17" ry="2.4" fill="#000" opacity="0.1"/>` +
    `<rect x="38" y="93" width="6" height="23" fill="${legs}" ${stroke(st)}/>` +
    `<rect x="46" y="93" width="6" height="23" fill="${legs}" ${stroke(st)}/>` +
    `<ellipse cx="40.5" cy="117" rx="4.6" ry="2" fill="${st.dark}"/>` +
    `<ellipse cx="49.5" cy="117" rx="4.6" ry="2" fill="${st.dark}"/>` +
    `<path d="M35,58Q29,70 31,83L35.5,83Q35,71 38.5,60Z" fill="${main}" ${stroke(st)}/>` +
    `<circle cx="33.3" cy="85" r="2.3" fill="${st.skin}" ${stroke(st, 0.7)}/>` +
    `<path d="M31,97L35,56Q45,51 55,56L59,97Q45,101 31,97Z" fill="${main}" ${stroke(st)}/>` +
    pattern(st, suit, 37, 63, 54, 92, accent) +
    `<path d="M31,97Q45,101 59,97" fill="none" stroke="${accent}" stroke-width="2.2"/>` +
    `<path d="M45,57V99" stroke="${accent}" stroke-width="1.6"/>` +
    `<rect x="33.6" y="74" width="22.8" height="3.2" fill="${accent}" ${stroke(st, 0.7)}/>` +
    `<rect x="43" y="49" width="4" height="7" fill="${st.skin}" ${stroke(st, 0.6)}/>` +
    `<path d="M38.5,55.5Q45,61 51.5,55.5Q45,53.5 38.5,55.5Z" fill="${accent}" ${stroke(st, 0.7)}/>` +
    `<path d="M54.5,58Q62,57 63.5,49L59.6,47.6Q58.6,53.5 52.5,57Z" fill="${main}" ${stroke(st)}/>` +
    heldObject(st, deck, suit, 61.8, 46.2) +
    `<circle cx="61.8" cy="46.2" r="2.3" fill="${st.skin}" ${stroke(st, 0.7)}/>` +
    head(st, 45, 42, 8.4, { hatType: FANTE_HAT[suit], hatColor: legs, hatAccent: accent, longHair: suit === 'C' })
  );
}

function fullCavallo(st, deck, suit) {
  const { main, accent, legs } = colorsFor(st, suit);
  const horse = st.horse[suit];
  const mane = suit === 'S' ? '#8a8a96' : st.hair;
  const leg = (x, y2 = 117) =>
    `<rect x="${x}" y="93" width="3.6" height="${y2 - 93}" fill="${horse}" ${stroke(st, 0.9)}/><rect x="${x - 0.3}" y="${y2 - 2}" width="4.2" height="2.6" fill="${st.dark}"/>`;
  return (
    `<ellipse cx="47" cy="119" rx="27" ry="2.4" fill="#000" opacity="0.1"/>` +
    `<path d="M71,84Q78,92 74,108" fill="none" stroke="${mane}" stroke-width="3.4" stroke-linecap="round"/>` +
    leg(57) +
    leg(64) +
    leg(36) +
    `<g transform="rotate(-38 31 95)">${leg(29, 113)}</g>` +
    `<ellipse cx="50" cy="88" rx="21.5" ry="11" fill="${horse}" ${stroke(st)}/>` +
    `<path d="M31,86C26,77 23,70 25,62L33.5,60C34.5,68 38,76 41,82Z" fill="${horse}" ${stroke(st)}/>` +
    `<path d="M25.5,62L15,70Q12,73.5 15.5,75.5L21.5,75L30,68.5Z" fill="${horse}" ${stroke(st)}/>` +
    `<path d="M28,61.5L29.5,55.5L32,61Z" fill="${horse}" ${stroke(st, 0.8)}/>` +
    `<circle cx="24.5" cy="65.5" r="0.9" fill="${st.ink}"/>` +
    `<path d="M33,60Q37,70 40.5,79" fill="none" stroke="${mane}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M36,78Q50,73 64,78L66,97Q50,102 34,97Z" fill="${main}" ${stroke(st)}/>` +
    pattern(st, suit, 40, 83, 62, 94, accent) +
    `<path d="M34,97Q50,102 66,97" fill="none" stroke="${accent}" stroke-width="2"/>` +
    `<path d="M20,72L41,71" stroke="${accent}" stroke-width="1"/>` +
    `<path d="M49,79L47.5,98L52,98L54,80Z" fill="${legs}" ${stroke(st)}/>` +
    `<ellipse cx="49" cy="99.2" rx="3.6" ry="1.8" fill="${st.dark}"/>` +
    `<path d="M43,80L45,60Q51,56 57,60L59,80Z" fill="${accent}" ${stroke(st)}/>` +
    `<rect x="43.4" y="69" width="15.2" height="2.6" fill="${main}" ${stroke(st, 0.6)}/>` +
    `<path d="M45.5,62Q40,66 41,71L44,71Q44,67 47.5,64Z" fill="${accent}" ${stroke(st, 0.8)}/>` +
    `<circle cx="41.6" cy="71.6" r="1.9" fill="${st.skin}" ${stroke(st, 0.6)}/>` +
    `<path d="M56.5,61Q63,59 63.6,52L60,51Q59.6,56 55,59Z" fill="${accent}" ${stroke(st)}/>` +
    heldObject(st, deck, suit, 62, 50, 0.9) +
    `<circle cx="62" cy="50" r="2.1" fill="${st.skin}" ${stroke(st, 0.6)}/>` +
    `<rect x="49" y="54" width="3.6" height="6" fill="${st.skin}" ${stroke(st, 0.5)}/>` +
    head(st, 51, 47.5, 7.2, { hatType: RIDER_HAT[suit], hatColor: main, hatAccent: legs })
  );
}

function fullRe(st, deck, suit) {
  const { main, accent, legs } = colorsFor(st, suit);
  const cape = legs;
  const ermine = Array.from({ length: 5 }, (_, i) => `<path d="M${37 + i * 4},57.5v1.6" stroke="${st.ink}" stroke-width="0.9"/>`).join('');
  return (
    `<ellipse cx="45" cy="119" rx="22" ry="2.4" fill="#000" opacity="0.1"/>` +
    `<path d="M33,57Q19,86 21,118L69,118Q71,86 57,57Z" fill="${cape}" ${stroke(st)}/>` +
    `<path d="M27,117.5L35,58Q45,52 55,58L63,117.5Z" fill="${main}" ${stroke(st)}/>` +
    pattern(st, suit, 33, 66, 57, 112, accent) +
    `<path d="M42,59L40,117.5H50L48,59Z" fill="${accent}" ${stroke(st, 0.8)}/>` +
    `<path d="M27,117.5H63" stroke="${st.white}" stroke-width="2.4"/>` +
    `<ellipse cx="40" cy="118.6" rx="3.4" ry="1.4" fill="${st.dark}"/>` +
    `<ellipse cx="50" cy="118.6" rx="3.4" ry="1.4" fill="${st.dark}"/>` +
    `<path d="M34,58.5Q45,67 56,58.5Q51,54.5 45,54.5Q39,54.5 34,58.5Z" fill="${st.white}" ${stroke(st, 0.8)}/>` +
    ermine +
    `<path d="M35.5,60Q29,72 33,82L37,81Q35,72 39,63Z" fill="${main}" ${stroke(st)}/>` +
    `<circle cx="35.2" cy="83" r="2.3" fill="${st.skin}" ${stroke(st, 0.7)}/>` +
    `<path d="M55,60Q63,62 64,55L60.5,53.5Q59.5,58 54,58Z" fill="${main}" ${stroke(st)}/>` +
    heldObject(st, deck, suit, 62.3, 52.5) +
    `<circle cx="62.3" cy="52.5" r="2.3" fill="${st.skin}" ${stroke(st, 0.7)}/>` +
    head(st, 45, 43, 8.4, { beard: st.beard[suit], crownKind: suit })
  );
}

// --- Figure a doppia testa (piacentine) -----------------------------------------
// Metà superiore disegnata fino alla linea di mezzo (y=65), poi capovolta.

function bustFante(st, deck, suit) {
  const { main, accent, legs } = colorsFor(st, suit);
  return (
    `<path d="M20,65L24,43Q45,34 66,43L70,65Z" fill="${main}" ${stroke(st)}/>` +
    pattern(st, suit, 30, 50, 60, 62, accent) +
    `<path d="M45,40V65" stroke="${accent}" stroke-width="1.4"/>` +
    `<path d="M37,39Q45,46 53,39Q45,36.5 37,39Z" fill="${accent}" ${stroke(st, 0.8)}/>` +
    `<rect x="43" y="32" width="4" height="7" fill="${st.skin}" ${stroke(st, 0.6)}/>` +
    `<path d="M24,46Q20,56 24,63L28,62Q26,55 29,48Z" fill="${main}" ${stroke(st)}/>` +
    `<path d="M64,45Q71,44 71,35L67,34Q66.5,40 61,42Z" fill="${main}" ${stroke(st)}/>` +
    heldObject(st, deck, suit, 69, 32.5, 0.8) +
    `<circle cx="69" cy="32.5" r="2.1" fill="${st.skin}" ${stroke(st, 0.6)}/>` +
    head(st, 45, 24, 8, { hatType: FANTE_HAT[suit], hatColor: legs, hatAccent: accent, longHair: suit === 'C' })
  );
}

function bustCavallo(st, deck, suit) {
  const { main, accent, legs } = colorsFor(st, suit);
  const horse = st.horse[suit];
  const mane = suit === 'S' ? '#8a8a96' : st.hair;
  return (
    `<path d="M19,65C18.5,53 20,42 23,32L33,30.5C32.5,42 34.5,54 38,65Z" fill="${horse}" ${stroke(st)}/>` +
    `<path d="M22,31L13,38Q10,42 13,44L19,44L28,37Z" fill="${horse}" ${stroke(st)}/>` +
    `<path d="M25,30.5L26.5,24.5L29,30Z" fill="${horse}" ${stroke(st, 0.8)}/>` +
    `<circle cx="21" cy="34.5" r="0.9" fill="${st.ink}"/>` +
    `<path d="M33,30Q35,48 40,64" fill="none" stroke="${mane}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M15,40L38,52" stroke="${accent}" stroke-width="0.9"/>` +
    `<path d="M36,65L39,45Q53,38 66,45L70,65Z" fill="${main}" ${stroke(st)}/>` +
    pattern(st, suit, 44, 52, 64, 62, accent) +
    `<path d="M47,42Q53,47 59,42Q53,40 47,42Z" fill="${accent}" ${stroke(st, 0.8)}/>` +
    `<rect x="51" y="35" width="3.6" height="7" fill="${st.skin}" ${stroke(st, 0.5)}/>` +
    `<path d="M41,49Q36,52 38,56L41,55.5Q41,53 44,51.5Z" fill="${main}" ${stroke(st, 0.8)}/>` +
    `<circle cx="38.6" cy="55.6" r="1.8" fill="${st.skin}" ${stroke(st, 0.5)}/>` +
    `<path d="M64,47Q71,45 71.5,37L68,36Q67.5,41 62,44Z" fill="${main}" ${stroke(st)}/>` +
    heldObject(st, deck, suit, 70, 35, 0.75) +
    `<circle cx="70" cy="35" r="1.9" fill="${st.skin}" ${stroke(st, 0.5)}/>` +
    head(st, 53, 27.5, 7, { hatType: RIDER_HAT[suit], hatColor: legs, hatAccent: accent })
  );
}

function bustRe(st, deck, suit) {
  const { main, accent, legs } = colorsFor(st, suit);
  const ermine = Array.from({ length: 6 }, (_, i) => `<path d="M${35 + i * 4},42v1.5" stroke="${st.ink}" stroke-width="0.8"/>`).join('');
  return (
    `<path d="M15,65L20,44Q45,33 70,44L75,65Z" fill="${legs}" ${stroke(st)}/>` +
    `<path d="M24,65L27,45Q45,37 63,45L66,65Z" fill="${main}" ${stroke(st)}/>` +
    pattern(st, suit, 31, 50, 60, 62, accent) +
    `<path d="M42,42L41,65H49L48,42Z" fill="${accent}" ${stroke(st, 0.7)}/>` +
    `<path d="M31,43.5Q45,51 59,43.5Q53,38.5 45,38.5Q37,38.5 31,43.5Z" fill="${st.white}" ${stroke(st, 0.7)}/>` +
    ermine +
    `<path d="M62,47Q70,46 70.5,37L67,36Q66.5,42 60.5,44.5Z" fill="${main}" ${stroke(st)}/>` +
    heldObject(st, deck, suit, 68.6, 34.5, 0.8) +
    `<circle cx="68.6" cy="34.5" r="2.1" fill="${st.skin}" ${stroke(st, 0.6)}/>` +
    head(st, 45, 25, 8, { beard: st.beard[suit], crownKind: suit })
  );
}

function doubleHeaded(st, inner) {
  return (
    `<g>${inner}</g><g transform="rotate(180 45 65)">${inner}</g>` +
    `<path d="M8,65H82" stroke="${st.ink}" stroke-width="0.6"/>` +
    `<path d="M45,62.6L47.4,65L45,67.4L42.6,65Z" fill="${st.yellow}" ${stroke(st, 0.5)}/>`
  );
}

// --- Assi -------------------------------------------------------------------------

function eagle(st, deck, crowned) {
  const body = st.dark;
  const feathers = (side) =>
    `<g transform="scale(${side} 1)">` +
    `<path d="M-4,-6C-14,-21 -28,-23 -35,-14L-31,-12L-34.5,-7L-29,-6L-32.5,-1L-26,-1L-28,4.5L-21,2C-14,2 -8,0 -4,2Z" fill="${body}" ${stroke(st, 0.8)}/>` +
    `<path d="M-10,-10L-27,-14M-11,-6L-28,-8M-11,-2L-25,-1" stroke="${deck === 'piacentine' ? st.yellow : st.red}" stroke-width="${deck === 'piacentine' ? 0.5 : 0.8}"/>` +
    `</g>`;
  return (
    feathers(-1) +
    feathers(1) +
    `<path d="M-6,13L-3,26L0,22L3,26L6,13Z" fill="${body}" ${stroke(st, 0.8)}/>` +
    `<path d="M-3,15L-4.5,19M3,15L4.5,19" stroke="${st.yellow}" stroke-width="1.1" stroke-linecap="round"/>` +
    `<ellipse cy="3" rx="7.2" ry="12.5" fill="${body}" ${stroke(st, 0.8)}/>` +
    `<circle cy="-12" r="5" fill="${body}" ${stroke(st, 0.8)}/>` +
    `<path d="M3.6,-13.4L8.6,-11.4L3.6,-9.8Z" fill="${st.yellow}" ${stroke(st, 0.5)}/>` +
    `<circle cx="1.8" cy="-13" r="0.9" fill="${st.yellow}"/>` +
    (crowned ? crown(st, 0, -16.2, 9.4, 'D') : '') +
    place(0, 4, 0.95, coin(st, deck))
  );
}

function ace(st, deck, suit) {
  if (suit === 'D') {
    if (deck === 'siciliane') {
      const rays = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        const a1 = a - 0.12;
        const a2 = a + 0.12;
        return `<path d="M${n(Math.cos(a1) * 17)},${n(Math.sin(a1) * 17)}L${n(Math.cos(a) * 27)},${n(Math.sin(a) * 27)}L${n(Math.cos(a2) * 17)},${n(Math.sin(a2) * 17)}Z" fill="${i % 2 ? st.orange : st.red}" ${stroke(st, 0.5)}/>`;
      }).join('');
      return place(45, 65, 1, rays + place(0, 0, 2, coin(st, deck)));
    }
    return place(45, 63, 1.1, eagle(st, deck, deck === 'piacentine'));
  }
  if (suit === 'C') {
    const deco =
      `<path d="M-14,-24Q0,-34 14,-24" fill="none" stroke="${st.red}" stroke-width="1.6"/>` +
      `<circle cy="-31" r="2.4" fill="${st.yellow}" ${stroke(st, 0.6)}/>`;
    return place(45, 70, 1, deco + place(0, 0, 2.5, cup(st, deck)));
  }
  if (suit === 'S') {
    const ribbon = `<path d="M-14,-6C-4,-14 4,2 14,-6C10,4 -2,-4 -12,6Z" fill="${deck === 'siciliane' ? st.magenta : st.red}" ${stroke(st, 0.6)}/>`;
    return place(45, 65, 1, place(0, 0, 1.25, sword(st, deck, 86)) + ribbon);
  }
  const leaves = [
    [-5, -40, -40],
    [5, -34, 40],
    [-5, -24, -35],
  ]
    .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="2.1" transform="rotate(${r} ${x} ${y})" fill="${st.green}" ${stroke(st, 0.6)}/>`)
    .join('');
  return place(45, 67, 1, place(0, 0, 1.35, club(st, deck, 76)) + leaves);
}

// --- Dorsi ------------------------------------------------------------------------

function back(deck) {
  const st = STYLES[deck];
  const b = ITALIAN_CARD_BOX[deck];
  const out = [];
  if (deck === 'napoletane') {
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="7" fill="#a8261d" stroke="#5c140f" stroke-width="1"/>`);
    out.push(`<rect x="7" y="7" width="76" height="116" rx="4" fill="none" stroke="${st.yellow}" stroke-width="1"/>`);
    for (let y = 13; y <= 117; y += 9) {
      for (let x = 13 + (((y - 13) / 9) % 2) * 4.5; x <= 78; x += 9) {
        out.push(`<path d="M${n(x)},${n(y - 2.6)}l2.6,2.6 -2.6,2.6 -2.6,-2.6Z" fill="${st.yellow}" opacity="0.55"/>`);
      }
    }
    out.push(`<ellipse cx="45" cy="65" rx="17" ry="23" fill="#f6e3b6" stroke="${st.yellow}" stroke-width="1.6"/>`);
    out.push(place(45, 65, 1.25, coin(st, deck)));
  } else if (deck === 'piacentine') {
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="7" fill="#f7f4ec" stroke="${st.edge}" stroke-width="1"/>`);
    out.push(`<rect x="6" y="6" width="78" height="118" rx="4" fill="#24548f"/>`);
    for (let y = 8; y < 122; y += 5) {
      for (let x = 8 + (Math.round((y - 8) / 5) % 2) * 5; x < 82; x += 10) {
        out.push(`<rect x="${n(x)}" y="${n(y)}" width="5" height="5" fill="#3a6fae"/>`);
      }
    }
    out.push(`<rect x="9" y="9" width="72" height="112" rx="3" fill="none" stroke="#ffffff" stroke-width="0.6"/>`);
    out.push(`<path d="M45,44L60,65L45,86L30,65Z" fill="#f7f4ec" stroke="${st.yellow}" stroke-width="1"/>`);
    out.push(crown(st, 45, 63, 12, 'D'));
    out.push(`<path d="M41,68L45,74L49,68" fill="none" stroke="${st.azure}" stroke-width="1.4"/>`);
  } else {
    out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="#13894a" stroke="#0b5a30" stroke-width="1"/>`);
    for (let y = 16; y <= 116; y += 12) {
      for (let x = 17; x <= 74; x += 12) {
        out.push(
          `<g transform="translate(${x} ${y})"><circle cy="-2.4" r="1.9" fill="${st.magenta}"/><circle cy="2.4" r="1.9" fill="${st.magenta}"/><circle cx="-2.4" r="1.9" fill="${st.yellow}"/><circle cx="2.4" r="1.9" fill="${st.yellow}"/><circle r="1.1" fill="#fff"/></g>`
        );
      }
    }
    out.push(`<rect x="9.5" y="10.5" width="71" height="109" rx="4" fill="none" stroke="${st.yellow}" stroke-width="1"/>`);
    out.push(`<circle cx="45" cy="65" r="14" fill="#fff7e6" stroke="${st.magenta}" stroke-width="1.6"/>`);
    out.push(place(45, 65, 1.05, cup(st, deck)));
  }
  return out.join('');
}

// --- Carte ------------------------------------------------------------------------

const SUITS = ['D', 'C', 'S', 'B'];

function face(deck, suit, value) {
  const st = STYLES[deck];
  const p = PREFIX[deck];
  let art;
  if (value === 1) art = ace(st, deck, suit);
  else if (value <= 7) {
    if (suit === 'S' || suit === 'B') {
      art = lattice(value)
        .map((l) => place(l.x, l.y, 1, glyph(st, deck, suit, l.len * (deck === 'siciliane' ? 0.9 : 1)), l.rot))
        .join('');
    } else {
      const pos = suit === 'C' && value === 3 ? CUP_3 : ROWS[value];
      art = pos.map(([x, y]) => `<use href="#vmit-${p}-g${suit}" transform="translate(${x} ${y}) scale(${st.pip})"/>`).join('');
    }
  } else if (deck === 'piacentine') {
    const bust = value === 8 ? bustFante : value === 9 ? bustCavallo : bustRe;
    art = doubleHeaded(st, bust(st, deck, suit));
  } else {
    const full = value === 8 ? fullFante : value === 9 ? fullCavallo : fullRe;
    art = full(st, deck, suit);
  }
  // Siciliane: tutto un po' più minuto, dentro la carta più raccolta.
  if (deck === 'siciliane') art = `<g transform="translate(45 65) scale(0.86) translate(-45 -65)">${art}</g>`;
  return `<symbol id="vmit-${p}-${suit}${value}" viewBox="0 0 90 130">${paper(st, deck)}${art}</symbol>`;
}

function buildDeck(deck) {
  const st = STYLES[deck];
  const p = PREFIX[deck];
  const glyphs = SUITS.map((s) => `<g id="vmit-${p}-g${s}">${glyph(st, deck, s, 26)}</g>`).join('');
  const faces = SUITS.flatMap((s) => Array.from({ length: 10 }, (_, i) => face(deck, s, i + 1))).join('');
  return `<defs>${glyphs}</defs>${faces}<symbol id="vmit-${p}-back" viewBox="0 0 90 130">${back(deck)}</symbol>`;
}

const injected = new Set();

// Scrive nella pagina i disegni di un mazzo, una volta sola.
export function ensureItalianDeck(deck) {
  if (injected.has(deck) || typeof document === 'undefined' || !STYLES[deck]) return;
  injected.add(deck);
  let host = document.getElementById(SPRITE_ID);
  if (!host) {
    host = document.createElementNS(NS, 'svg');
    host.setAttribute('id', SPRITE_ID);
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('focusable', 'false');
    // Non display:none: alcuni browser non disegnano i <use> che puntano lì.
    host.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
    document.body.appendChild(host);
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = `<svg xmlns="${NS}">${buildDeck(deck)}</svg>`;
  const parsed = tmp.firstChild;
  while (parsed.firstChild) host.appendChild(parsed.firstChild);
}
