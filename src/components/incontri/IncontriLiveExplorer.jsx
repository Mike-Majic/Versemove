import { useState } from 'react';
import { INCONTRI_CATEGORIES, resolveCategoryQuery } from '../../data/incontriCategories';
import MatchColumn from './MatchColumn';
import FavoriteStarButton from '../shared/FavoriteStarButton';
import '../shared/categoryExplorerShell.css';

// Guscio di navigazione del mondo Incontri: stesso pattern di ArteExplorer
// (X + ricerca in alto, chiuso finché non si sceglie la categoria). Resta
// solo "Match" (stile Tinder): le dirette sono state spostate nei mondi
// Social e Lavoro.
export default function IncontriLiveExplorer({
  world,
  activeCategory,
  onToggleCategory,
  onSearchCategory,
  user,
  onOpenAuth,
  onOpenChat,
  initialMatchTab,
  onConsumeInitialMatchTab,
  favorites = [],
  onToggleFavorite,
  matchFilters,
}) {
  const [query, setQuery] = useState('');
  const [invalid, setInvalid] = useState(false);
  const category = INCONTRI_CATEGORIES.find((c) => c.id === activeCategory) ?? null;

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
                placeholder="Cerca (es. match)..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setInvalid(false);
                }}
                className={invalid ? 'invalid' : ''}
              />
            </form>
          </div>

          <MatchColumn
            user={user}
            onOpenAuth={onOpenAuth}
            onOpenChat={onOpenChat}
            initialTab={initialMatchTab}
            onConsumeInitialTab={onConsumeInitialMatchTab}
            matchFilters={matchFilters}
          />
        </>
      )}
    </div>
  );
}
