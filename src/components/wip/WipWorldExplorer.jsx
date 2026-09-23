import './wipWorldExplorer.css';

// Mondo "Work in progress": nessuna categoria, nessun dato, nessuna
// chiamata al database — solo un pannello statico che spiega che il mondo
// è in costruzione. A differenza degli altri XxxWorldExplorer non serve
// aspettare il click su una categoria (qui non ce ne sono): il pannello è
// sempre visibile appena si entra nel mondo.
export default function WipWorldExplorer({ world }) {
  return (
    <div className="rb-wip-panel" style={{ '--accent': world.color }}>
      <span className="rb-wip-icon">🚧</span>
      <h2>Work in progress</h2>
      <p>Questo mondo è in costruzione: torna a trovarci presto.</p>
    </div>
  );
}
