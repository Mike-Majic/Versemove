import { useEffect, useState } from 'react';
import { MINIGAMES, resolveCategoryQuery } from '../games/registry';
import MiniGameShell from './minigames/MiniGameShell';
import FavoriteStarButton from './shared/FavoriteStarButton';
import './shared/categoryExplorerShell.css';
import './BambiniGameExplorer.css';

// Guscio di navigazione per il mondo Bambini: stesso pattern di
// ArteExplorer (X + campo di ricerca in alto, chiuso finché nessun
// triangolo/pulsante è stato scelto), ma apre un minigioco (MiniGameShell)
// invece delle colonne di contenuti — i giochi non sono "categorie" da
// sfogliare, sono esperienze a sé. onGameOpenChange avvisa App.jsx quando un
// gioco è aperto/chiuso, per disattivare lo swipe/le frecce di cambio mondo
// mentre si gioca (alcuni giochi, es. Snake, usano le stesse frecce).
export default function BambiniGameExplorer({
  world,
  activeCategory,
  onToggleCategory,
  onSearchCategory,
  onGameOpenChange,
  user,
  onOpenAuth,
  favorites = [],
  onToggleFavorite,
}) {
  const [query, setQuery] = useState('');
  const [invalid, setInvalid] = useState(false);
  const game = MINIGAMES.find((g) => g.id === activeCategory) ?? null;

  useEffect(() => {
    onGameOpenChange?.(!!game);
  }, [game, onGameOpenChange]);

  useEffect(() => () => onGameOpenChange?.(false), [onGameOpenChange]);

  const submitSearch = (e) => {
    e.preventDefault();
    const found = resolveCategoryQuery(query);
    if (found) {
      setInvalid(false);
      onSearchCategory(found);
      setQuery('');
    } else {
      setInvalid(true);
    }
  };

  return (
    <div className="rb-arte-explorer rb-bambini-explorer" style={{ '--accent': world.color }}>
      {game && (
        <>
          <div className="rb-arte-top-controls">
            <div className="rb-arte-top-controls-row">
              <button
                type="button"
                className="rb-arte-close-all-btn rb-bambini-close-btn"
                onClick={() => onToggleCategory(null)}
                aria-label="Chiudi il gioco"
                title="Chiudi il gioco"
              >
                ✕
              </button>
              <FavoriteStarButton
                worldId={world.id}
                categoryId={game.id}
                categoryLabel={game.label}
                favorites={favorites}
                onToggle={onToggleFavorite}
                user={user}
                onOpenAuth={onOpenAuth}
              />
            </div>

            <form className="rb-arte-category-search" onSubmit={submitSearch}>
              <input
                type="text"
                placeholder="🔍 Cerca un gioco (es. snake)..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setInvalid(false);
                }}
                className={invalid ? 'invalid' : ''}
              />
            </form>
          </div>

          <div className="rb-bambini-game-panel">
            <MiniGameShell key={game.id} game={game} />
          </div>
        </>
      )}
    </div>
  );
}
