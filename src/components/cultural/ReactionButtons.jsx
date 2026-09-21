// Le due reazioni condivise da Cinema/Teatro/Arte/Live: "Lo voglio vedere"
// (organizzarsi per andarci insieme) e "Mi è piaciuto" (dopo averlo visto).
// Il numero è cliccabile e apre la lista di chi ha reagito (ReactorsModal).
export default function ReactionButtons({ summary, onToggle, onShowReactors }) {
  const vuole = summary?.vuole ?? [];
  const piaciuto = summary?.piaciuto ?? [];
  const myReactions = summary?.myReactions ?? new Set();

  return (
    <div className="rb-cultural-reactions">
      <button
        type="button"
        className={`rb-cultural-reaction-btn ${myReactions.has('vuole') ? 'active' : ''}`}
        onClick={() => onToggle('vuole')}
      >
        🎟️ Lo voglio vedere
      </button>
      {vuole.length > 0 && (
        <button type="button" className="rb-cultural-reaction-count" onClick={() => onShowReactors('vuole', vuole)}>
          {vuole.length}
        </button>
      )}
      <button
        type="button"
        className={`rb-cultural-reaction-btn ${myReactions.has('piaciuto') ? 'active' : ''}`}
        onClick={() => onToggle('piaciuto')}
      >
        ❤️ Mi è piaciuto
      </button>
      {piaciuto.length > 0 && (
        <button type="button" className="rb-cultural-reaction-count" onClick={() => onShowReactors('piaciuto', piaciuto)}>
          {piaciuto.length}
        </button>
      )}
    </div>
  );
}
