import { useId } from 'react';
import { cardSuit, cardRankCode, isJoker, FRENCH_SUITS } from '../../../data/burraco';
import { CARD_WIDTHS, useCardDeck } from './cardTheme';
import './frenchCard.css';

// Carte francesi in SVG (niente immagini esterne), disegno originale sullo
// schema di docs/mockup/mockup_tavolo_burraco.html: angoli con valore e
// seme in alto a sinistra e capovolti in basso a destra, semi nelle
// posizioni classiche, figure con cornice, corona e lettera grande, jolly
// con stella. Tre mazzi (prop deck, altrimenti la scelta dell'utente dal
// pannello 🎨, vedi cardTheme.js):
// - classico: carta avorio, semi rossi/neri, dorso viola a rombi con "V" dorata;
// - moderno: carta bianca, numero grande al centro, un colore per seme;
// - neon: carta scura con bordo e semi luminosi, dorso viola-blu a righe.

const SYMBOL = { H: '♥', D: '♦', C: '♣', S: '♠' };
const FIGURE_NAME = { J: 'FANTE', Q: 'DONNA', K: 'RE' };

// Posizioni dei semi su una carta 100x140.
const PIPS = {
  1: [[50, 70]],
  2: [[50, 30], [50, 110]],
  3: [[50, 30], [50, 70], [50, 110]],
  4: [[32, 32], [68, 32], [32, 108], [68, 108]],
  5: [[32, 32], [68, 32], [50, 70], [32, 108], [68, 108]],
  6: [[32, 32], [68, 32], [32, 70], [68, 70], [32, 108], [68, 108]],
  7: [[32, 32], [68, 32], [50, 51], [32, 70], [68, 70], [32, 108], [68, 108]],
  8: [[32, 32], [68, 32], [50, 51], [32, 70], [68, 70], [50, 89], [32, 108], [68, 108]],
  9: [[32, 30], [68, 30], [32, 57], [68, 57], [50, 70], [32, 83], [68, 83], [32, 110], [68, 110]],
  10: [[32, 30], [68, 30], [50, 44], [32, 57], [68, 57], [32, 83], [68, 83], [50, 96], [32, 110], [68, 110]],
};

// Contrasto alto: nero #111 e rosso #c8102e pieni sul fondo chiaro.
function suitColor(suit, deck) {
  if (deck === 'moderno') return { H: '#c8102e', D: '#1f5fcf', C: '#137a3f', S: '#111111' }[suit];
  if (deck === 'neon') return { H: '#ff4f8b', D: '#ffb03b', C: '#38e0a0', S: '#7fb2ff' }[suit];
  return suit === 'H' || suit === 'D' ? '#c8102e' : '#111111';
}

// Angoli grandi (valore 24 e seme 19 su una carta 100x140, +60% rispetto a
// prima) in grassetto pieno, seme subito sotto il valore: nelle colonne sul
// tavolo si vede solo l'angolo e deve bastare da solo. Occupano la fascia
// alta fino a y≈48 (vedi CORNER_H): il disegno centrale si stringe (BODY)
// per non finirci sotto.
export const CORNER_H = 48 / 140;
const BODY = { scale: 0.72, cx: 50, cy: 72 };

const paper = (deck) => (deck === 'neon' ? '#12121c' : deck === 'moderno' ? '#ffffff' : '#fbf7ee');

function Face({ card, deck, glowId }) {
  const suit = cardSuit(card);
  const rank = cardRankCode(card);
  const col = suitColor(suit, deck);
  const sym = SYMBOL[suit];
  const neon = deck === 'neon';
  const border = neon ? col : deck === 'moderno' ? '#e3e3ea' : '#d8cfb8';
  const glow = neon ? `url(#${glowId})` : undefined;

  let body;
  if (deck === 'moderno') {
    body = (
      <>
        <text x="50" y="84" fontSize={rank === '10' ? 44 : 52} fontWeight="800" textAnchor="middle" fill={col} fontFamily="system-ui, sans-serif">{rank}</text>
        <text x="50" y="118" fontSize="24" textAnchor="middle" fill={col}>{sym}</text>
      </>
    );
  } else if (FIGURE_NAME[rank]) {
    const inner = neon ? 'none' : suit === 'H' || suit === 'D' ? '#fde6e2' : '#e6e8f2';
    body = (
      <>
        <rect x="20" y="22" width="60" height="96" rx="6" fill={inner} stroke={col} strokeWidth={neon ? 1.6 : 1.2} filter={glow} />
        <path d="M32 44 L40 34 L50 44 L60 34 L68 44 L66 52 L34 52 Z" fill={neon ? 'none' : '#e2b33c'} stroke={neon ? col : '#9b7419'} strokeWidth="1" />
        <text x="50" y="92" fontSize="38" fontWeight="900" textAnchor="middle" fill={col} fontFamily="Georgia, serif">{rank}</text>
        <text x="50" y="110" fontSize="9" fontWeight="700" textAnchor="middle" fill={col} letterSpacing="1">{FIGURE_NAME[rank]}</text>
      </>
    );
  } else {
    const n = rank === 'A' ? 1 : parseInt(rank, 10);
    const size = n === 1 ? 46 : n > 8 ? 17 : 19;
    body = PIPS[n].map(([x, y], i) => (
      <text
        key={i}
        x={x}
        y={y + size * 0.36}
        fontSize={size}
        textAnchor="middle"
        fill={col}
        transform={y > 70 && n > 1 ? `rotate(180 ${x} ${y})` : undefined}
        filter={glow}
      >
        {sym}
      </text>
    ));
  }

  const corner = (
    <>
      <text
        x={rank === '10' ? 4 : 7}
        y="25"
        fontSize="24"
        fontWeight="900"
        fill={col}
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        letterSpacing={rank === '10' ? -1.5 : 0}
      >
        {rank}
      </text>
      <text x="6" y="45" fontSize="19" fill={col} fontFamily="'Segoe UI Symbol', 'DejaVu Sans', sans-serif">{sym}</text>
    </>
  );

  return (
    <>
      <rect x="1" y="1" width="98" height="138" rx="9" fill={paper(deck)} stroke={border} strokeWidth="2" />
      {corner}
      <g transform="rotate(180 50 70)">{corner}</g>
      <g transform={`translate(${BODY.cx} ${BODY.cy}) scale(${BODY.scale}) translate(${-BODY.cx} ${-BODY.cy})`}>{body}</g>
    </>
  );
}

function Joker({ deck }) {
  const neon = deck === 'neon';
  const c1 = neon ? '#d6e84a' : '#7b3fe4';
  const c2 = neon ? '#ff4f8b' : '#e0344b';
  return (
    <>
      <rect x="1" y="1" width="98" height="138" rx="9" fill={paper(deck)} stroke={neon ? c1 : '#d8cfb8'} strokeWidth="2" />
      <text x="9" y="22" fontSize="11" fontWeight="900" fill={c2} writingMode="tb">JOLLY</text>
      <polygon points="50,34 58,58 83,58 63,73 71,97 50,82 29,97 37,73 17,58 42,58" fill={c1} opacity="0.9" />
      <circle cx="50" cy="66" r="9" fill={c2} />
      <text x="50" y="120" fontSize="12" fontWeight="900" textAnchor="middle" fill={c1} letterSpacing="2">JOLLY</text>
    </>
  );
}

function Back({ deck, gradId }) {
  if (deck === 'moderno') {
    return (
      <>
        <rect x="1" y="1" width="98" height="138" rx="9" fill="#f4f4f8" stroke="#dcdce6" strokeWidth="2" />
        <rect x="9" y="9" width="82" height="122" rx="6" fill="#2f7de1" />
        {Array.from({ length: 6 }, (_, i) => (
          <circle key={i} cx="50" cy="70" r={8 + i * 8} fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="3" />
        ))}
        <text x="50" y="76" fontSize="18" fontWeight="900" textAnchor="middle" fill="#fff">V</text>
      </>
    );
  }
  if (deck === 'neon') {
    return (
      <>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2a0f3f" />
            <stop offset="1" stopColor="#0b1a33" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="98" height="138" rx="9" fill={`url(#${gradId})`} stroke="#d6e84a" strokeWidth="2" />
        {Array.from({ length: 7 }, (_, i) => (
          <line key={i} x1={-20 + i * 22} y1="140" x2={40 + i * 22} y2="0" stroke="rgba(214,232,74,.18)" strokeWidth="2" />
        ))}
        <circle cx="50" cy="70" r="16" fill="none" stroke="#d6e84a" strokeWidth="2" />
        <text x="50" y="76" fontSize="16" fontWeight="900" textAnchor="middle" fill="#d6e84a">V</text>
      </>
    );
  }
  return (
    <>
      <rect x="1" y="1" width="98" height="138" rx="9" fill="#2a1a4a" stroke="#fbf7ee" strokeWidth="3" />
      <rect x="8" y="8" width="84" height="124" rx="6" fill="none" stroke="#8b6fd6" strokeWidth="1.5" />
      {Array.from({ length: 9 }, (_, r) =>
        Array.from({ length: 6 }, (_, c) => (
          <path key={`${r}-${c}`} d={`M${16 + c * 14} ${18 + r * 13} l4 -5 l4 5 l-4 5z`} fill="rgba(139,111,214,.35)" />
        ))
      )}
      <circle cx="50" cy="70" r="15" fill="#2a1a4a" stroke="#d9c98f" strokeWidth="2" />
      <text x="50" y="76" fontSize="16" fontWeight="900" textAnchor="middle" fill="#d9c98f" fontFamily="Georgia, serif">V</text>
    </>
  );
}

// size: xs | sm | md | lg (larghezza fissa, vedi CARD_WIDTHS), oppure width
// in px per chi calcola la grandezza da solo (la mano del Burraco).
// Con onClick diventa un <button>, altrimenti un semplice <div>.
export function FrenchCard({ card, size = 'md', width, deck: deckProp, faceDown = false, selected = false, disabled = false, onClick, className = '', style }) {
  const [userDeck] = useCardDeck();
  const deck = deckProp ?? userDeck;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const w = width ?? CARD_WIDTHS[size] ?? CARD_WIDTHS.md;
  const hidden = faceDown || !card;
  const cls = ['rb-fcard', `rb-fcard--${deck}`, selected ? 'selected' : '', disabled ? 'disabled' : '', onClick ? 'clickable' : '', className]
    .filter(Boolean)
    .join(' ');
  const label = hidden ? 'Carta coperta' : isJoker(card) ? 'Jolly' : `${cardRankCode(card)} di ${FRENCH_SUITS[cardSuit(card)].nome}`;

  const svg = (
    <svg viewBox="0 0 100 140" width="100%" height="100%" aria-hidden="true">
      {deck === 'neon' && !hidden && (
        <defs>
          <filter id={`g${uid}`}>
            <feGaussianBlur stdDeviation="1.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      )}
      {hidden ? <Back deck={deck} gradId={`nb${uid}`} /> : isJoker(card) ? <Joker deck={deck} /> : <Face card={card} deck={deck} glowId={`g${uid}`} />}
    </svg>
  );

  const boxStyle = { width: w, height: Math.round((w * 140) / 100), ...style };
  if (onClick) {
    return (
      <button type="button" className={cls} style={boxStyle} onClick={disabled ? undefined : onClick} disabled={disabled} aria-label={label} aria-pressed={selected}>
        {svg}
      </button>
    );
  }
  return (
    <div className={cls} style={boxStyle} role="img" aria-label={label}>
      {svg}
    </div>
  );
}

export default FrenchCard;
