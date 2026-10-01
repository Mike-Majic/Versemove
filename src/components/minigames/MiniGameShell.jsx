import { Suspense, useState } from 'react';
import ShareSheet from '../shared/ShareSheet';
import GameAdBreak from '../ads/GameAdBreak';
import { adBreakAfterGame } from '../ads/gameAds';
import { MINIGAMES } from '../../games/registry';
import './MiniGameShell.css';

const DIFFICULTIES = [
  { id: 'facile', label: '🟢 Facile' },
  { id: 'medio', label: '🟡 Medio' },
  { id: 'difficile', label: '🔴 Difficile' },
];

const BRAGS = [
  (p, g, l) => `🔥 ${p} punti a ${g}${l ? ` (livello ${l})` : ''}! Chi riesce a battermi?`,
  (p, g) => `🏆 Nuovo punteggio: ${p} a ${g}. Vi sfido a fare di meglio! 💪`,
  (p, g, l) => `🚀 Ho appena chiuso ${g} con ${p} punti${l ? ` a livello ${l}` : ''}. Tocca a voi!`,
  (p, g) => `⚡ ${p} punti a ${g}! Qualcuno accetta la sfida? 🎮`,
];

function scoreBrag(punti, gioco, livello, seed) {
  return BRAGS[seed % BRAGS.length](punti, gioco, livello);
}

// Fase A — wrapper comune a tutti i minigiochi: schermata iniziale (con
// scelta del livello: facile/medio/difficile, passato al gioco come prop
// "difficulty" — ogni gioco decide da solo cosa cambiare, qui c'è solo la
// selezione), schermata di fine partita con "gioca ancora" e "condividi
// risultato" (vedi shared/ShareSheet.jsx: prima la propria bacheca, poi i
// social). Ogni gioco riceve solo onFinish (score, extra?) e difficulty,
// non deve preoccuparsi d'altro.
export default function MiniGameShell({ game, user, onOpenAuth, mondo = 'bambini' }) {
  const [phase, setPhase] = useState('intro'); // 'intro' | 'playing' | 'ended' | 'ad'
  const [difficulty, setDifficulty] = useState('medio');
  const [result, setResult] = useState(null);
  const [shareOpen, setShareOpen] = useState(false);
  // Secondi dopo cui si può saltare la pubblicità che parte con "Gioca
  // ancora" (0 = nessuna pausa), vedi ads/gameAds.js.
  const [pendingAd, setPendingAd] = useState(0);

  const start = () => {
    setResult(null);
    setShareOpen(false);
    if (pendingAd) {
      setPhase('ad');
      return;
    }
    setPhase('playing');
  };

  const endAd = () => {
    setPendingAd(0);
    setPhase('playing');
  };

  const finish = (score, extra = {}) => {
    setResult({ score, seed: Math.floor(Math.random() * 1000), ...extra });
    setPendingAd(adBreakAfterGame());
    setPhase('ended');
  };

  // Nel mondo Bambini, se non c'è una campagna adatta ai bambini, la pausa
  // consiglia un altro gioco (niente di commerciale).
  const other = MINIGAMES.filter((g) => g.id !== game.id)[(result?.seed ?? 0) % Math.max(1, MINIGAMES.length - 1)];
  const kidsPromo = other
    ? { id: `promo-${other.id}`, promo: true, icona: other.icon, titolo: `Hai provato ${other.nome}?`, testo: other.meccanica }
    : null;

  // Testo del risultato: una frase diversa ogni volta, con un po' di
  // sfida per chi legge (niente "su Versemove": il link c'è già). Nel feed
  // il post diventa una card punteggio (vedi social/GameScoreCard.jsx).
  const score = result?.score ?? 0;
  const livello = DIFFICULTIES.find((d) => d.id === difficulty)?.label.replace(/^\S+\s/, '') ?? '';
  const shareText = scoreBrag(score, game.nome, livello, result?.seed ?? 0);
  const punteggio = { gioco: game.nome, icona: game.icon, punti: score, livello, dettaglio: result?.detail ?? null };

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

      {phase === 'ad' && (
        <GameAdBreak mondo={mondo} skipAfter={pendingAd} onDone={endAd} kidsFallback={kidsPromo} />
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
              feedText={shareText}
              punteggio={punteggio}
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
