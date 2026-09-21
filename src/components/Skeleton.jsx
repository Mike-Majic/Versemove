import './Skeleton.css';

// Placeholder "a scheletro" con effetto shimmer, per il tempo tra l'apertura
// di un pannello e l'arrivo dei primi dati reali (Fase 1 "effetto wow"): al
// posto del testo "Caricamento..." isolato. `lines` disegna N barre di testo
// di larghezza decrescente (come una didascalia), `height`/`width` per un
// blocco singolo (es. una card).
export default function Skeleton({ lines, height, width, className = '' }) {
  if (lines) {
    return (
      <div className={`rb-skeleton-block ${className}`} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <span key={i} className="rb-skeleton-line" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
        ))}
      </div>
    );
  }
  return <span className={`rb-skeleton-line ${className}`} style={{ height, width }} aria-hidden="true" />;
}
