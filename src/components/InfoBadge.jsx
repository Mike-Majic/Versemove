import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Icona "i" cerchiata: al click mostra/nasconde una vignetta col testo.
// Condivisa da ProfileSettingsPanel (dove serve anche onSeen, per non
// mostrare una conferma extra a chi ha già letto la regola) e da
// SettingsPanel (dove tutte le spiegazioni prima sempre visibili sono
// state spostate qui dentro, per occupare meno spazio in colonna).
export default function InfoBadge({ text, onSeen }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState('left');
  const wrapRef = useRef(null);

  // La (i) può finire vicino al bordo destro (es. accanto alla freccetta
  // di una fisarmonica dentro il pannello Impostazioni, agganciato al
  // bordo destro dello schermo): con la vignetta sempre ancorata a
  // sinistra dell'icona, in quel caso usciva dal pannello e restava
  // tagliata. Qui si misura lo spazio vero disponibile e si apre dal lato
  // che ci sta, o centrata se non ci sta comunque (schermi stretti).
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const bubbleWidth = Math.min(220, window.innerWidth - 32);
    const margin = 16;
    if (rect.left + bubbleWidth + margin <= window.innerWidth) {
      setAlign('left');
    } else if (rect.right - bubbleWidth - margin >= 0) {
      setAlign('right');
    } else {
      setAlign('center');
    }
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
          setOpen((v) => !v);
          onSeen?.();
        }}
        aria-label={t('common.howItWorks')}
      >
        i
      </button>
      {open && <div className={`rb-info-bubble rb-info-bubble-${align}`}>{text}</div>}
    </span>
  );
}
