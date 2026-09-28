import './GameScoreCard.css';

// Post "risultato di un gioco" nel feed: al posto della riga di testo
// piatta, una card con icona del gioco, punteggio grande e livello.
// punteggio: { gioco, icona, punti, livello, dettaglio } (vedi
// posts.js, media kind 'punteggio', e MiniGameShell).

export default function GameScoreCard({ punteggio }) {
  const { gioco, icona, punti, livello, dettaglio } = punteggio;
  return (
    <div className="rb-score-card" role="group" aria-label={`Risultato a ${gioco}: ${punti} punti`}>
      <div className="rb-score-card-glow" aria-hidden="true" />
      <div className="rb-score-card-icon" aria-hidden="true">{icona || '🎮'}</div>
      <div className="rb-score-card-body">
        <span className="rb-score-card-game">{gioco}</span>
        <span className="rb-score-card-points">
          {Number(punti).toLocaleString('it-IT')}
          <small>punti</small>
        </span>
        {(livello || dettaglio) && (
          <span className="rb-score-card-meta">
            {livello && <span className="rb-score-card-level">Livello {livello}</span>}
            {dettaglio && <span>{dettaglio}</span>}
          </span>
        )}
      </div>
      <span className="rb-score-card-trophy" aria-hidden="true">🏆</span>
    </div>
  );
}
