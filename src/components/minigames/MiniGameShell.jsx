import { Suspense, useState } from 'react';
import ShareSheet from '../shared/ShareSheet';
import './MiniGameShell.css';

const DIFFICULTIES = [
  { id: 'facile', label: '🟢 Facile' },
  { id: 'medio', label: '🟡 Medio' },
  { id: 'difficile', label: '🔴 Difficile' },
];

// Fase A — wrapper comune a tutti i minigiochi: schermata iniziale (con
// scelta del livello: facile/medio/difficile, passato al gioco come prop
// "difficulty" — ogni gioco decide da solo cosa cambiare, qui c'è solo la
// selezione), schermata di fine partita con "gioca ancora" e "condividi
// risultato" (vedi shared/ShareSheet.jsx: prima la propria bacheca, poi i
// social). Ogni gioco riceve solo onFinish (score, extra?) e difficulty,
// non deve preoccuparsi d'altro.
export default function MiniGameShell({ game, user, onOpenAuth }) {
  const [phase, setPhase] = useState('intro'); // 'intro' | 'playing' | 'ended'
  const [difficulty, setDifficulty] = useState('medio');
  const [result, setResult] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);

  const start = () => {
    setResult(null);
    setShareOpen(false);
    setPhase('playing');
  };

  const finish = (score, extra = {}) => {
    setResult({ score, ...extra });
    setPhase('ended');
  };

  const shareText = `Ho fatto ${result?.score ?? 0} punti a "${game.nome}" su Versemove!`;

  const Component = game.Component;

  return (
    <div className="rb-minigame-shell">
      <div className="rb-minigame-title">{game.icon} {game.nome}</div>

      {phase === 'intro' && (
        <div className="rb-minigame-panel rb-minigame-intro">
          <p className="rb-minigame-mechanic">{game.meccanica}</p>
          <p className="rb-minigame-age">✨ Consigliato da {game.fasciaEtaMinima}+ anni</p>
          <div className="rb-minigame-difficulty">
            <p className="rb-minigame-difficulty-label">Scegli il livello:</p>
            <div className="rb-minigame-difficulty-row">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`rb-minigame-difficulty-btn ${difficulty === d.id ? 'active' : ''}`}
                  onClick={() => setDifficulty(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="rb-minigame-btn-primary" onClick={start}>
            🚀 Inizia!
          </button>
        </div>
      )}

      {phase === 'playing' && (
        <div className="rb-minigame-panel rb-minigame-play">
          <Suspense fallback={<p className="rb-minigame-loading">Caricamento…</p>}>
            <Component onFinish={finish} difficulty={difficulty} />
          </Suspense>
        </div>
      )}

      {phase === 'ended' && (
        <div className="rb-minigame-panel rb-minigame-end">
          <p className="rb-minigame-score">🏆 Punteggio: {result?.score}</p>
          {result?.detail && <p className="rb-minigame-detail">{result.detail}</p>}
          <p className="rb-minigame-difficulty-played">Livello: {DIFFICULTIES.find((d) => d.id === difficulty)?.label}</p>
          <div className="rb-minigame-end-actions">
            <button type="button" className="rb-minigame-btn-primary" onClick={start}>
              🔁 Gioca ancora
            </button>
            <button type="button" className="rb-minigame-btn-secondary" onClick={() => setShareOpen(true)}>
              📤 Condividi risultato
            </button>
          </div>
          {shareOpen && (
            <ShareSheet
              title="Condividi risultato"
              text={shareText}
              user={user}
              onOpenAuth={onOpenAuth}
              onClose={() => setShareOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
