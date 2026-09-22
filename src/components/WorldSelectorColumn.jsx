import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateWorld } from '../i18n/worldLabels';
import './WorldSelectorColumn.css';

const ITEM_HEIGHT = 42; // deve combaciare con --rb-world-item-height nel CSS

function MiniGlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </svg>
  );
}

// Selettore mondi a scorrimento: se ne vedono al massimo 4 alla volta (il
// contenitore è alto esattamente 4 * ITEM_HEIGHT, con overflow-y:auto e
// scroll-snap-type sugli item — questo copre già touch e rotella del mouse,
// li scrolla e li aggancia il browser da solo). Il click-e-trascina col
// mouse invece NON esiste di default su un overflow (il tasto sinistro
// serve alla selezione testo), quindi è l'unica parte gestita a mano qui
// sotto, solo per pointerType 'mouse'.
export default function WorldSelectorColumn({ worlds, activeWorldId, onSelectWorld }) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const dragRef = useRef(null); // { startY, startScrollTop, moved }
  const suppressClickRef = useRef(false);
  const snapTimerRef = useRef(null);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);

  const updateEdges = () => {
    const el = containerRef.current;
    if (!el) return;
    setAtTop(el.scrollTop <= 1);
    setAtBottom(el.scrollTop >= el.scrollHeight - el.clientHeight - 1);
  };

  const snapToNearest = () => {
    const el = containerRef.current;
    if (!el) return;
    const target = Math.round(el.scrollTop / ITEM_HEIGHT) * ITEM_HEIGHT;
    el.scrollTo({ top: target, behavior: 'smooth' });
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    updateEdges();

    const onScroll = () => {
      updateEdges();
      // Rotella/touch: la snap CSS aggancia già da sola, ma non tutti i
      // browser la applicano allo stesso modo ad ogni sorgente di scroll —
      // questo è solo una rete di sicurezza che riallinea una volta che lo
      // scroll si ferma (nessun evento "scrollend" nel giro dei browser
      // meno recenti, quindi si usa un debounce sul normale evento scroll).
      clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(snapToNearest, 120);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      clearTimeout(snapTimerRef.current);
    };
  }, []);

  // Se il mondo attivo (cambiato da altrove: satellite cliccato, swipe a
  // due dita, tasti freccia) non è tra i 4 visibili, lo si porta in vista.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = worlds.findIndex((w) => w.id === activeWorldId);
    if (idx < 0) return;
    const itemTop = idx * ITEM_HEIGHT;
    const itemBottom = itemTop + ITEM_HEIGHT;
    if (itemTop < el.scrollTop || itemBottom > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: itemTop, behavior: 'smooth' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorldId]);

  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse') return; // touch/pen: scroll nativo, niente da gestire qui
    const el = containerRef.current;
    if (!el) return;
    dragRef.current = { startY: e.clientY, startScrollTop: el.scrollTop, moved: false };
    el.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    const el = containerRef.current;
    if (!drag || !el) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) > 6) drag.moved = true;
    el.scrollTop = drag.startScrollTop - dy;
  };

  const endDrag = (e) => {
    const drag = dragRef.current;
    const el = containerRef.current;
    if (!drag || !el) return;
    dragRef.current = null;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // già rilasciato, o mai catturato (pointercancel): nessun problema.
    }
    if (drag.moved) suppressClickRef.current = true;
    snapToNearest();
  };

  const handleWorldClick = (worldId) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (worldId !== activeWorldId) onSelectWorld(worldId);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      containerRef.current?.scrollBy({ top: ITEM_HEIGHT, behavior: 'smooth' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      containerRef.current?.scrollBy({ top: -ITEM_HEIGHT, behavior: 'smooth' });
    }
  };

  return (
    <div className="rb-world-selector">
      {!atTop && (
        <button
          type="button"
          className="rb-world-selector-arrow up"
          aria-label={t('common.scrollWorldsUp')}
          onClick={() => containerRef.current?.scrollBy({ top: -ITEM_HEIGHT, behavior: 'smooth' })}
        >
          ▲
        </button>
      )}
      {!atTop && <div className="rb-world-selector-fade top" aria-hidden="true" />}

      <div
        className="rb-world-selector-list"
        ref={containerRef}
        tabIndex={0}
        role="listbox"
        aria-label={t('common.changeWorld')}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {worlds.map((w) => (
          <div key={w.id} className="rb-world-selector-item">
            <button
              type="button"
              className={`rb-world-dot ${w.id === activeWorldId ? 'active' : ''}`}
              style={{ '--dot-color': w.color }}
              onClick={() => handleWorldClick(w.id)}
              role="option"
              aria-selected={w.id === activeWorldId}
              aria-label={t('common.goToWorld', { world: translateWorld(t, w).label })}
              title={translateWorld(t, w).label}
            >
              <MiniGlobeIcon />
            </button>
          </div>
        ))}
      </div>

      {!atBottom && <div className="rb-world-selector-fade bottom" aria-hidden="true" />}
      {!atBottom && (
        <button
          type="button"
          className="rb-world-selector-arrow down"
          aria-label={t('common.scrollWorldsDown')}
          onClick={() => containerRef.current?.scrollBy({ top: ITEM_HEIGHT, behavior: 'smooth' })}
        >
          ▼
        </button>
      )}
    </div>
  );
}
