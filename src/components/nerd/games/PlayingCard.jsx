import { memo } from 'react';
import { cardSuit, cardValue, SUITS } from '../../../data/scopa';
import { useItalianDeck, useItalianIndex } from './cardTheme';
import { ITALIAN_CARD_BOX, ensureItalianDeck, italianBackId, italianCardId } from './italianDecks';
import './playingCard.css';

// Le 40 carte italiane (Denari/Coppe/Spade/Bastoni, 1-7 più Fante, Cavallo
// e Re per 8/9/10) nel mazzo regionale scelto dall'utente nel pannello 🎨
// (napoletane, piacentine o siciliane, vedi cardTheme.js): i disegni sono in
// italianDecks.js, scritti una volta sola nella pagina e richiamati qui con
// <use>, così anche un tavolo pieno resta leggero sul telefono. Un solo
// componente disegna sia il fronte sia il dorso (carta coperta). deck e
// showIndex servono alle anteprime del pannello; di norma vale la scelta
// salvata.

const FIGURE_LETTER = { 8: 'F', 9: 'C', 10: 'R' };
const FIGURE_NAME = { 8: 'Fante', 9: 'Cavallo', 10: 'Re' };
const WIDTH = { sm: 52, md: 68, lg: 92 };

// Indice nell'angolo ("Mostra i numeri"): i mazzi regionali veri non ce
// l'hanno, qui è acceso di partenza per la leggibilità.
function CornerIndex({ deck, text, color }) {
  const b = ITALIAN_CARD_BOX[deck];
  const x = b.x + 6.5;
  const y = b.y + 13;
  const t = (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize="12"
      fontWeight="800"
      fontFamily="inherit"
      fill={color}
      stroke="#fffaf0"
      strokeWidth="3"
      paintOrder="stroke"
    >
      {text}
    </text>
  );
  return (
    <g aria-hidden="true">
      {t}
      <g transform="rotate(180 45 65)">{t}</g>
    </g>
  );
}

function PlayingCardBase({ card, size = 'md', faceDown = false, selected = false, disabled = false, onClick, className = '', deck: deckProp, showIndex: showIndexProp, decorative = false }) {
  const [savedDeck] = useItalianDeck();
  const [savedIndex] = useItalianIndex();
  const deck = deckProp ?? savedDeck;
  const showIndex = showIndexProp ?? savedIndex;
  ensureItalianDeck(deck);

  const px = WIDTH[size] ?? WIDTH.md;
  const cls = ['rb-scopa-card', size, `deck-${deck}`, selected ? 'selected' : '', disabled ? 'disabled' : '', className].filter(Boolean).join(' ');

  if (faceDown || !card) {
    return (
      <div className={cls} style={{ width: px, aspectRatio: '90/130' }}>
        <svg viewBox="0 0 90 130" width="100%" height="100%" aria-hidden="true">
          <use href={`#${italianBackId(deck)}`} width="90" height="130" />
        </svg>
      </div>
    );
  }

  const suit = cardSuit(card);
  const value = cardValue(card);
  const meta = SUITS[suit];
  const figure = FIGURE_NAME[value];

  const label = figure ? `${meta.nome} ${figure}` : `${value} di ${meta.nome}`;
  const art = (
    <svg viewBox="0 0 90 130" width="100%" height="100%" aria-hidden="true">
      <use href={`#${italianCardId(deck, card)}`} width="90" height="130" />
      {showIndex && <CornerIndex deck={deck} text={FIGURE_LETTER[value] ?? value} color={meta.colore} />}
    </svg>
  );

  // decorative: solo immagine (dentro un altro pulsante, es. anteprime del
  // pannello 🎨 o la pila degli scarti), niente pulsante annidato.
  if (decorative) {
    return (
      <div className={`${cls} disabled`} style={{ width: px, aspectRatio: '90/130' }} role="img" aria-label={label}>
        {art}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      style={{ width: px, aspectRatio: '90/130' }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled && !onClick}
      aria-label={label}
    >
      {art}
    </button>
  );
}

// Memorizzata: a ogni aggiornamento del tavolo si ridisegnano solo le carte
// che cambiano davvero.
export const PlayingCard = memo(PlayingCardBase);

export default PlayingCard;
