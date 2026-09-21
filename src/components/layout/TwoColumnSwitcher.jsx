import { useState } from 'react';
import { useIsDesktopLayout } from '../../hooks/useIsDesktopLayout';
import './TwoColumnSwitcher.css';

function SwitchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 7l-4 5 4 5" />
      <path d="M16 7l4 5-4 5" />
    </svg>
  );
}

// Layout a due colonne condiviso da qualunque mondo/pannello ne abbia
// bisogno (categorie di Arte & Musica/Nerd/Bambini, feed del mondo Social...):
// desktop (orizzontale + almeno 700px) le mostra affiancate, mobile una
// colonna alla volta con una maniglia fissa sul bordo per scorrere all'altra.
// Nessuna copia del meccanismo per ogni mondo — solo i contenuti cambiano.
//
// mobileView/onMobileViewChange sono opzionali: se non passati, lo stato
// della vista mobile resta interno (utile quando nessun altro elemento del
// pannello deve leggerlo o cambiarlo); passarli permette invece a un
// pulsante dentro "secondary" di tornare a "primary" (es. "← Torna a...").
export default function TwoColumnSwitcher({
  primary,
  secondary,
  primaryLabel = '',
  secondaryLabel = '',
  mobileView: controlledView,
  onMobileViewChange,
  closing = false,
}) {
  const isDesktop = useIsDesktopLayout();
  const [internalView, setInternalView] = useState('primary');
  const view = controlledView ?? internalView;
  const setView = onMobileViewChange ?? setInternalView;

  if (isDesktop) {
    return (
      <>
        <aside className={`rb-2col-panel rb-2col-left ${closing ? 'closing' : ''}`}>{primary}</aside>
        <aside className={`rb-2col-panel rb-2col-right ${closing ? 'closing' : ''}`}>{secondary}</aside>
      </>
    );
  }

  return (
    <div className={`rb-2col-mobile-stage ${closing ? 'closing' : ''}`}>
      <div className={`rb-2col-mobile-track ${view === 'secondary' ? 'show-secondary' : ''}`}>
        <div className="rb-2col-mobile-slide">{primary}</div>
        <div className="rb-2col-mobile-slide">{secondary}</div>
      </div>
      <button
        type="button"
        className="rb-2col-edge-handle"
        onClick={() => setView(view === 'primary' ? 'secondary' : 'primary')}
        aria-label={view === 'primary' ? `Mostra ${secondaryLabel}` : `Torna a ${primaryLabel}`}
        title={view === 'primary' ? secondaryLabel : primaryLabel}
      >
        <SwitchIcon />
      </button>
    </div>
  );
}
