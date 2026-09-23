import { cardSuit, cardRankCode, isJoker, FRENCH_SUITS } from '../../../data/burraco';
import './playingCard.css';

// Grafica vettoriale del mazzo francese (Cuori/Quadri/Fiori/Picche, A-K,
// più il Jolly) per Burraco: stessa tecnica di PlayingCard.jsx (Scopa),
// solo semi/valori diversi — niente asset esterni, solo SVG.

function Heart({ x, y, scale = 1, color, flip = false }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}${flip ? ',-1' : ''})`} fill={color}>
      <path d="M 0,3.2 C -1,-1.6 -6.4,-1.6 -6.4,2.2 C -6.4,5.6 -2.4,7.6 0,11.6 C 2.4,7.6 6.4,5.6 6.4,2.2 C 6.4,-1.6 1,-1.6 0,3.2 Z" />
    </g>
  );
}

function Diamond({ x, y, scale = 1, color }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color}>
      <polygon points="0,-8 5.5,0 0,8 -5.5,0" />
    </g>
  );
}

function Club({ x, y, scale = 1, color }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color}>
      <circle cx="0" cy="-4" r="3.6" />
      <circle cx="-3.6" cy="2" r="3.6" />
      <circle cx="3.6" cy="2" r="3.6" />
      <polygon points="-1.6,3 1.6,3 3,10 -3,10" />
    </g>
  );
}

function Spade({ x, y, scale = 1, color }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color}>
      <path d="M 0,-9 C 6.4,-3.2 6.4,1.6 0,6 C -6.4,1.6 -6.4,-3.2 0,-9 Z" />
      <polygon points="-1.8,4 1.8,4 3,11 -3,11" />
    </g>
  );
}

const SUIT_GLYPH = { H: Heart, D: Diamond, C: Club, S: Spade };

const PIP_LAYOUTS = {
  A: [[0, 0]],
  2: [[0, -25], [0, 25]],
  3: [[0, -25], [0, 0], [0, 25]],
  4: [[-12, -22], [12, -22], [-12, 22], [12, 22]],
  5: [[-12, -22], [12, -22], [0, 0], [-12, 22], [12, 22]],
  6: [[-12, -24], [12, -24], [-12, 0], [12, 0], [-12, 24], [12, 24]],
  7: [[-12, -24], [12, -24], [0, -12], [-12, 0], [12, 0], [-12, 24], [12, 24]],
  8: [[-12, -24], [12, -24], [0, -12], [-12, 0], [12, 0], [0, 12], [-12, 24], [12, 24]],
  9: [[-12, -26], [12, -26], [-12, -9], [12, -9], [0, 0], [-12, 9], [12, 9], [-12, 26], [12, 26]],
  10: [[-12, -26], [12, -26], [0, -18], [-12, -9], [12, -9], [-12, 9], [12, 9], [0, 18], [-12, 26], [12, 26]],
};

const FIGURE_LETTER = { J: 'J', Q: 'Q', K: 'K' };

export function FrenchCard({ card, size = 'md', faceDown = false, selected = false, disabled = false, onClick, className = '' }) {
  const px = size === 'lg' ? 92 : size === 'sm' ? 52 : 68;
  const cls = ['rb-scopa-card', size, selected ? 'selected' : '', disabled ? 'disabled' : '', className].filter(Boolean).join(' ');

  if (faceDown || !card) {
    return (
      <div className={cls} style={{ width: px, aspectRatio: '90/130' }}>
        <svg viewBox="0 0 90 130" width="100%" height="100%">
          <rect x="1" y="1" width="88" height="128" rx="8" fill="#1a1030" stroke="#4a3a68" strokeWidth="1.5" />
          <rect x="8" y="8" width="74" height="114" rx="5" fill="none" stroke="#b98be0" strokeWidth="1" opacity="0.5" />
          <g stroke="#b98be0" strokeWidth="1" opacity="0.3">
            {Array.from({ length: 6 }).map((_, i) => (
              <line key={i} x1="8" y1={12 + i * 18} x2="82" y2={12 + i * 18} />
            ))}
          </g>
          <circle cx="45" cy="65" r="16" fill="none" stroke="#b98be0" strokeWidth="1.4" opacity="0.7" />
          <text x="45" y="71" textAnchor="middle" fontSize="16" fill="#b98be0" fontWeight="700" fontFamily="inherit">V</text>
        </svg>
      </div>
    );
  }

  if (isJoker(card)) {
    return (
      <button type="button" className={cls} style={{ width: px, aspectRatio: '90/130' }} onClick={disabled ? undefined : onClick} disabled={disabled && !onClick} aria-label="Jolly">
        <svg viewBox="0 0 90 130" width="100%" height="100%">
          <rect x="1" y="1" width="88" height="128" rx="8" fill="#fbf6ec" stroke="#00000022" strokeWidth="1.2" />
          <circle cx="45" cy="55" r="24" fill="#8b5cf6" opacity="0.15" />
          <Spade x={38} y={48} scale={1.1} color="#1a1a1a" />
          <Heart x={52} y={48} scale={1.1} color="#c62828" />
          <text x="45" y="95" textAnchor="middle" fontSize="13" fontWeight="800" fill="#8b5cf6" fontFamily="inherit">JOLLY</text>
        </svg>
      </button>
    );
  }

  const suit = cardSuit(card);
  const rank = cardRankCode(card);
  const meta = FRENCH_SUITS[suit];
  const Glyph = SUIT_GLYPH[suit];
  const figureLetter = FIGURE_LETTER[rank];

  return (
    <button
      type="button"
      className={cls}
      style={{ width: px, aspectRatio: '90/130' }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled && !onClick}
      aria-label={`${rank} di ${meta.nome}`}
    >
      <svg viewBox="0 0 90 130" width="100%" height="100%">
        <rect x="1" y="1" width="88" height="128" rx="8" fill="#fbf6ec" stroke="#00000022" strokeWidth="1.2" />

        <g fontFamily="inherit" fontWeight="800" fill={meta.colore}>
          <text x="8" y="18" fontSize="13">{figureLetter ?? rank}</text>
          <g transform="translate(8 22)"><Glyph x="0" y="4" scale={0.45} color={meta.colore} /></g>
          <g transform="rotate(180 45 65)">
            <text x="8" y="18" fontSize="13">{figureLetter ?? rank}</text>
            <g transform="translate(8 22)"><Glyph x="0" y="4" scale={0.45} color={meta.colore} /></g>
          </g>
        </g>

        {figureLetter ? (
          <g>
            <circle cx="45" cy="60" r="22" fill={meta.colore} opacity="0.1" />
            <Glyph x={45} y={55} scale={1.5} color={meta.colore} />
            <text x="45" y="98" textAnchor="middle" fontSize="15" fontWeight="800" fill={meta.colore} fontFamily="inherit">{figureLetter}</text>
          </g>
        ) : (
          PIP_LAYOUTS[rank]?.map(([dx, dy], i) => (
            <Glyph key={i} x={45 + dx} y={65 + dy} scale={0.85} color={meta.colore} />
          ))
        )}
      </svg>
    </button>
  );
}

export default FrenchCard;
