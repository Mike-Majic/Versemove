import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

// Icona "i" cerchiata: al click mostra/nasconde una vignetta col testo.
// Condivisa da ProfileSettingsPanel (dove serve anche onSeen, per non
// mostrare una conferma extra a chi ha già letto la regola) e da
// SettingsPanel (dove tutte le spiegazioni prima sempre visibili sono
// state spostate qui dentro, per occupare meno spazio in colonna).
//
// La vignetta si disegna in un portal su document.body con position: fixed,
// calcolata dall'icona: dentro un pannello che scorre (es. "Il mio profilo",
// overflow-y: auto) una vignetta assoluta veniva tagliata a destra e in
// basso e faceva comparire la barra orizzontale. Così resta sempre tutta
// dentro lo schermo: si sposta a sinistra se non ci sta, e si apre sopra
// l'icona se sotto manca spazio. Si chiude toccando fuori, scorrendo o
// ridimensionando la finestra.
const BUBBLE_MAX_W = 240;
const EDGE = 12;
const GAP = 6;

export default function InfoBadge({ text, onSeen }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { top, left, width }
  const wrapRef = useRef(null);
  const bubbleRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(BUBBLE_MAX_W, vw - EDGE * 2);
    const left = Math.min(Math.max(EDGE, rect.left), vw - width - EDGE);
    const height = bubbleRef.current?.offsetHeight ?? 0;
    const below = rect.bottom + GAP;
    const top = below + height > vh - EDGE && rect.top - GAP - height >= EDGE ? rect.top - GAP - height : below;
    setPos((p) => (p && p.top === top && p.left === left && p.width === width ? p : { top, left, width }));
  }, [open, pos]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target) || bubbleRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return (
    <span className="rb-info-badge-wrap" ref={wrapRef}>
      <button
        type="button"
        className="rb-info-badge"
        onClick={(e) => {
          // Può trovarsi dentro una <label> (i toggle) o affiancata a un
          // bottone che apre/chiude una fisarmonica: senza queste due
          // righe, il click aprirebbe la spiegazione MA farebbe scattare
          // anche l'altro controllo (stesso problema già risolto per il
          // link Termini dentro AuthModal).
          e.preventDefault();
          e.stopPropagation();
          setPos(null);
          setOpen((v) => !v);
          onSeen?.();
        }}
        aria-label={t('common.howItWorks')}
        aria-expanded={open}
      >
        i
      </button>
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            className="rb-info-bubble"
            role="tooltip"
            onClick={(e) => e.stopPropagation()}
            style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: 0, left: 0, visibility: 'hidden' }}
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}
