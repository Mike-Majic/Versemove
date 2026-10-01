import { useEffect, useRef, useState } from 'react';
import { useBackLayer } from '../../../hooks/useBackLayer';
import { ITALIAN_DECKS, useItalianDeck, useItalianIndex } from './cardTheme';
import PlayingCard from './PlayingCard';
import './italianDeckPanel.css';

// 🎨 di Scopa e Trentuno, come quello del Burraco: mazzo regionale
// (anteprima con asso di denari e re di bastoni) e "Mostra i numeri". Solo
// per questo utente (localStorage, vedi cardTheme.js): cambiare mazzo
// ridisegna subito tutte le carte a schermo.
function Panel({ onClose }) {
  const ref = useRef(null);
  const [deck, setDeck] = useItalianDeck();
  const [showIndex, setShowIndex] = useItalianIndex();
  useBackLayer(true, onClose, 'modal:italian-deck');
  useEffect(() => {
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.rb-it-gear')) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="rb-it-pop" ref={ref} role="dialog" aria-label="Personalizza le carte">
      <h4>🎨 Personalizza</h4>
      <div className="rb-it-pop-sec">Mazzo</div>
      <div className="rb-it-opts">
        {ITALIAN_DECKS.map((d) => (
          <button key={d.id} type="button" className={`rb-it-opt ${d.id === deck ? 'on' : ''}`} onClick={() => setDeck(d.id)} aria-pressed={d.id === deck}>
            <span className="rb-it-mini" aria-hidden="true">
              <PlayingCard card="D1" size="sm" deck={d.id} showIndex={false} decorative />
              <PlayingCard card="B10" size="sm" deck={d.id} showIndex={false} decorative />
            </span>
            {d.label}
          </button>
        ))}
      </div>
      <label className="rb-it-switch">
        <input type="checkbox" checked={showIndex} onChange={(e) => setShowIndex(e.target.checked)} />
        <span className="rb-it-switch-track" aria-hidden="true" />
        <span>
          Mostra i numeri
          <small>Un piccolo indice nell'angolo: i mazzi regionali veri non ce l'hanno.</small>
        </span>
      </label>
      <p className="rb-it-pop-note">La scelta vale solo per te e resta salvata per le prossime partite.</p>
    </div>
  );
}

export default function ItalianDeckButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="rb-it-gear"
        onClick={() => setOpen((v) => !v)}
        title="Personalizza le carte"
        aria-label="Personalizza le carte"
        aria-expanded={open}
      >
        🎨
      </button>
      {open && <Panel onClose={() => setOpen(false)} />}
    </>
  );
}
