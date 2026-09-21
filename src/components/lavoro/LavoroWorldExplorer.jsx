import { useState } from 'react';
import { LAVORO_CATEGORIES, resolveCategoryQuery } from '../../data/lavoroCategories';
import LiveWorldPanel from '../live/LiveWorldPanel';
import FavoriteStarButton from '../shared/FavoriteStarButton';
import '../shared/categoryExplorerShell.css';

// Guscio di navigazione del mondo Lavoro: stesso pattern di ArteExplorer/
// IncontriLiveExplorer (X + ricerca in alto, chiuso finché non si sceglie
// la categoria). Per ora solo "Live".
export default function LavoroWorldExplorer({
  world,
  activeCategory,
  onToggleCategory,
  onSearchCategory,
  user,
  onOpenAuth,
  favorites = [],
  onToggleFavorite,
}) {
  const [query, setQuery] = useState('');
  const [invalid, setInvalid] = useState(false);
  const category = LAVORO_CATEGORIES.find((c) => c.id === activeCategory) ?? null;

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
    <div className="rb-arte-explorer" style={{ '--accent': world.color }}>
      {category && (
        <>
          <div className="rb-arte-top-controls">
            <div className="rb-arte-top-controls-row">
              <button
                type="button"
                className="rb-arte-close-all-btn"
                onClick={() => onToggleCategory(null)}
                aria-label="Chiudi le colonne"
                title="Chiudi le colonne"
              >
                ✕
              </button>
              <FavoriteStarButton
                worldId={world.id}
                categoryId={category.id}
                categoryLabel={category.label}
                favorites={favorites}
                onToggle={onToggleFavorite}
                user={user}
                onOpenAuth={onOpenAuth}
              />
            </div>

            <form className="rb-arte-category-search" onSubmit={submitSearch}>
              <input
                type="text"
                placeholder="Cerca (es. live)..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setInvalid(false);
                }}
                className={invalid ? 'invalid' : ''}
              />
            </form>
          </div>

          <LiveWorldPanel mondo="lavoro" user={user} onOpenAuth={onOpenAuth} />
        </>
      )}
    </div>
  );
}
