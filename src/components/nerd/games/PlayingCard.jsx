import { cardSuit, cardValue, SUITS } from '../../../data/scopa';
import './playingCard.css';

// Grafica vettoriale delle 40 carte italiane (Denari/Coppe/Spade/Bastoni,
// valori 1-10 con Fante/Cavallo/Re per 8/9/10): niente foto/asset esterni,
// solo forme SVG semplici e pulite, coerenti con lo stile piatto del resto
// dell'app (vedi shared/Icon.jsx). Un solo componente disegna sia il fronte
// (carta nota) sia il dorso (carta coperta, mano dell'avversario).

function Coin({ x, y, scale = 1, color }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle r="7.5" fill="none" stroke={color} strokeWidth="1.6" />
      <circle r="4" fill="none" stroke={color} strokeWidth="1" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <circle key={i} cx={Math.cos(a) * 5.7} cy={Math.sin(a) * 5.7} r="0.9" fill={color} />;
      })}
    </g>
  );
}

function Cup({ x, y, scale = 1, color }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color}>
      <path d="M -7 -9 Q -7 3 0 5 Q 7 3 7 -9 Z" />
      <rect x="-1.4" y="5" width="2.8" height="4" />
      <rect x="-5" y="9" width="10" height="2.2" rx="1" />
    </g>
  );
}

function Sword({ x, y, scale = 1, color }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color}>
      <polygon points="0,-13 2.4,-4 -2.4,-4" />
      <rect x="-1.4" y="-4" width="2.8" height="12" />
      <rect x="-6" y="-1.5" width="12" height="2" rx="1" />
      <circle cy="9.5" r="2" />
    </g>
  );
}

function Baton({ x, y, scale = 1, color }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} fill={color}>
      <rect x="-2" y="-11" width="4" height="22" rx="2" transform="rotate(28)" />
      <circle cx="-6" cy="-9.6" r="2.4" transform="rotate(28)" />
      <circle cx="6" cy="9.6" r="2.4" transform="rotate(28)" />
    </g>
  );
}

const SUIT_GLYPH = { D: Coin, C: Cup, S: Sword, B: Baton };

// Disposizione dei simboli per i valori numerici 1-7 (coordinate in una
// griglia -18..18 orizzontale, -30..30 verticale): non è la disposizione
// storica delle carte italiane vere, ma si legge bene a colpo d'occhio,
// che è quel che conta qui.
const PIP_LAYOUTS = {
  1: [[0, 0]],
  2: [[0, -20], [0, 20]],
  3: [[0, -22], [0, 0], [0, 22]],
  4: [[-13, -20], [13, -20], [-13, 20], [13, 20]],
  5: [[-13, -20], [13, -20], [0, 0], [-13, 20], [13, 20]],
  6: [[-13, -22], [13, -22], [-13, 0], [13, 0], [-13, 22], [13, 22]],
  7: [[-13, -22], [13, -22], [0, -10], [-13, 4], [13, 4], [-13, 24], [13, 24]],
};

const FIGURE_LETTER = { 8: 'F', 9: 'C', 10: 'R' };

export function PlayingCard({ card, size = 'md', faceDown = false, selected = false, disabled = false, onClick, className = '' }) {
  const px = size === 'lg' ? 92 : size === 'sm' ? 52 : 68;
  const cls = ['rb-scopa-card', size, selected ? 'selected' : '', disabled ? 'disabled' : '', className].filter(Boolean).join(' ');

  if (faceDown || !card) {
    return (
      <div className={cls} style={{ width: px, aspectRatio: '90/130' }}>
        <svg viewBox="0 0 90 130" width="100%" height="100%">
          <rect x="1" y="1" width="88" height="128" rx="8" fill="#101820" stroke="#3a4552" strokeWidth="1.5" />
          <rect x="8" y="8" width="74" height="114" rx="5" fill="none" stroke="#c8a06e" strokeWidth="1" opacity="0.5" />
          <g stroke="#c8a06e" strokeWidth="1" opacity="0.35">
            {Array.from({ length: 6 }).map((_, i) => (
              <line key={i} x1={10 + i * 14} y1="8" x2={10 + i * 14} y2="122" />
            ))}
          </g>
          <circle cx="45" cy="65" r="16" fill="none" stroke="#c8a06e" strokeWidth="1.4" opacity="0.7" />
          <text x="45" y="71" textAnchor="middle" fontSize="16" fill="#c8a06e" fontWeight="700" fontFamily="inherit">V</text>
        </svg>
      </div>
    );
  }

  const suit = cardSuit(card);
  const value = cardValue(card);
  const meta = SUITS[suit];
  const Glyph = SUIT_GLYPH[suit];
  const figureLetter = FIGURE_LETTER[value];

  return (
    <button
      type="button"
      className={cls}
      style={{ width: px, aspectRatio: '90/130' }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled && !onClick}
      aria-label={`${figureLetter ? meta.nome + ' ' + (value === 8 ? 'Fante' : value === 9 ? 'Cavallo' : 'Re') : value + ' di ' + meta.nome}`}
    >
      <svg viewBox="0 0 90 130" width="100%" height="100%">
        <rect x="1" y="1" width="88" height="128" rx="8" fill="#fbf6ec" stroke="#00000022" strokeWidth="1.2" />

        <g fontFamily="inherit" fontWeight="800" fill={meta.colore}>
          <text x="8" y="18" fontSize="14">{figureLetter ?? value}</text>
          <g transform="translate(8 22)"><Glyph x="0" y="4" scale={0.5} color={meta.colore} /></g>
          <g transform="rotate(180 45 65)">
            <text x="8" y="18" fontSize="14">{figureLetter ?? value}</text>
            <g transform="translate(8 22)"><Glyph x="0" y="4" scale={0.5} color={meta.colore} /></g>
          </g>
        </g>

        {figureLetter ? (
          <g>
            <circle cx="45" cy="60" r="22" fill={meta.colore} opacity="0.1" />
            <Glyph x={45} y={55} scale={1.7} color={meta.colore} />
            <text x="45" y="98" textAnchor="middle" fontSize="15" fontWeight="800" fill={meta.colore} fontFamily="inherit">
              {value === 8 ? 'FANTE' : value === 9 ? 'CAVALLO' : 'RE'}
            </text>
          </g>
        ) : (
          PIP_LAYOUTS[value].map(([dx, dy], i) => (
            <Glyph key={i} x={45 + dx} y={65 + dy} scale={1} color={meta.colore} />
          ))
        )}
      </svg>
    </button>
  );
}

export default PlayingCard;
