import './EmptyState.css';

// Segnaposto per "qui non c'è ancora niente", condiviso da feed/colonne di
// ogni mondo invece di un semplice <p> grigio (Fase 1 "effetto wow"): usa
// --accent del contenitore che lo ospita (già impostato da ogni
// panel/explorer, vedi shared.css) così il cerchio prende da solo il colore
// del mondo corrente, senza bisogno di passarlo come prop.
export default function EmptyState({ icon = '✨', title, subtitle, actions = [], children }) {
  return (
    <div className="rb-empty-state">
      <span className="rb-empty-state-icon" aria-hidden="true">{icon}</span>
      {title && <p className="rb-empty-state-title">{title}</p>}
      {subtitle && <p className="rb-empty-state-subtitle">{subtitle}</p>}
      {actions.length > 0 && (
        <div className="rb-empty-state-actions">
          {actions.map((a) => (
            <button key={a.label} type="button" className={a.primary ? 'rb-apply-filters-btn' : 'rb-reset-filters-btn'} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
