import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dayKey, dayLabel } from './chatMedia';

// Lista dei messaggi (Stanza MOD e chat dirette): separatori di giorno
// ("Oggi", "Ieri", data), scorrimento automatico in fondo all'arrivo di un
// messaggio se si è già in fondo (o se è mio), altrimenti la pillola
// "↓ Nuovi messaggi"; salendo in cima si caricano i più vecchi
// (onLoadOlder -> Promise<boolean ancoraAltri>) tenendo ferma la vista.
// items: [{ id, data, mine }], in ordine dal più vecchio.
const NEAR_BOTTOM_PX = 90;
const NEAR_TOP_PX = 60;

export default function MessageList({ items, renderItem, onLoadOlder, hasMore = false, empty = null, className = '' }) {
  const ref = useRef(null);
  const [showNew, setShowNew] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const lastIdRef = useRef(null);
  const firstIdRef = useRef(null);
  const anchorRef = useRef(null); // { height, top } prima di caricare i vecchi
  const atBottomRef = useRef(true);

  const scrollToBottom = (smooth = false) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setShowNew(false);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const first = items[0]?.id ?? null;
    const last = items[items.length - 1] ?? null;
    // Vecchi aggiunti in cima: si recupera la posizione di prima.
    if (anchorRef.current && first !== firstIdRef.current) {
      el.scrollTop = el.scrollHeight - anchorRef.current.height + anchorRef.current.top;
      anchorRef.current = null;
    } else if (last && last.id !== lastIdRef.current) {
      if (lastIdRef.current === null || atBottomRef.current || last.mine) scrollToBottom(lastIdRef.current !== null);
      else setShowNew(true);
    }
    firstIdRef.current = first;
    lastIdRef.current = last?.id ?? null;
  }, [items]);

  const onScroll = async () => {
    const el = ref.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (atBottomRef.current) setShowNew(false);
    if (el.scrollTop < NEAR_TOP_PX && hasMore && onLoadOlder && !loadingOlder) {
      setLoadingOlder(true);
      anchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
      try {
        await onLoadOlder();
      } finally {
        setLoadingOlder(false);
      }
    }
  };

  // Allegati che finiscono di caricare (foto) allungano la lista: se si era
  // in fondo si resta in fondo.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const inner = el.firstElementChild;
    if (!inner) return undefined;
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`rb-chat-list-wrap ${className}`}>
      <div className="rb-chat-list" ref={ref} onScroll={onScroll}>
        <ol className="rb-chat-list-inner">
          {loadingOlder && <li className="rb-chat-older">Carico i messaggi precedenti…</li>}
          {!hasMore && items.length > 0 && onLoadOlder && <li className="rb-chat-older">Inizio della conversazione</li>}
          {items.length === 0 && empty}
          {items.map((item, i) => {
            const prev = items[i - 1];
            const newDay = !prev || dayKey(prev.data) !== dayKey(item.data);
            return (
              <Fragment key={item.id}>
                {newDay && (
                  <li className="rb-chat-day">
                    <span>{dayLabel(item.data)}</span>
                  </li>
                )}
                {renderItem(item, i)}
              </Fragment>
            );
          })}
        </ol>
      </div>
      {showNew && (
        <button type="button" className="rb-chat-new-pill" onClick={() => scrollToBottom(true)}>
          ↓ Nuovi messaggi
        </button>
      )}
    </div>
  );
}
