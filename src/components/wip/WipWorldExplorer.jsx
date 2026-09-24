import './wipWorldExplorer.css';

// Mondo "Work in progress": nessuna categoria, nessun dato, nessuna
// chiamata al database — solo un pannello statico che spiega che il mondo
// è in costruzione. A differenza degli altri XxxWorldExplorer non serve
// aspettare il click su una categoria (qui non ce ne sono): il pannello è
// sempre visibile appena si entra nel mondo. Copre quasi tutto lo schermo
// (su telefono anche i satelliti), quindi serve la ✕ rossa per uscire:
// onClose riporta al mondo da cui si era arrivati (vedi App.jsx).
export default function WipWorldExplorer({ world, onClose }) {
  return (
    <div className="rb-wip-panel" style={{ '--accent': world.color }}>
      <button type="button" className="rb-close-btn rb-wip-close" onClick={onClose} aria-label="Esci dal mondo" title="Esci dal mondo">
        ✕
      </button>
      <span className="rb-wip-icon">🚧</span>
      <h2>Work in progress</h2>
      <p>Questo mondo è in costruzione: torna a trovarci presto.</p>
    </div>
  );
}
