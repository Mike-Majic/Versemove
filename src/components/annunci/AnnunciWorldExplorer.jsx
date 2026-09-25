import { useState } from 'react';
import { ANNUNCI_CATEGORIES, resolveCategoryQuery } from '../../data/annunciCategories';
import AnnunciColumn from './AnnunciColumn';
import FavoriteStarButton from '../shared/FavoriteStarButton';
import '../shared/categoryExplorerShell.css';
import './annunci.css';

// Guscio di navigazione del mondo Annunci: stesso pattern di
// LavoroWorldExplorer/FaqWorldExplorer (X + ricerca in alto, chiuso finché
// non si sceglie la categoria). Vendita/Affitto sono schede DENTRO
// AnnunciColumn, non categorie separate sul globo.
export default function AnnunciWorldExplorer({
  world,
  activeCategory,
  onToggleCategory,
  onSearchCategory,
  user,
  onOpenAuth,
  onOpenChat,
  favorites = [],
  onToggleFavorite,
  isClosing = false,
}) {
  const [query, setQuery] = useState('');
  const [invalid, setInvalid] = useState(false);
  const category = ANNUNCI_CATEGORIES.find((c) => c.id === activeCategory) ?? null;

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
                placeholder="Cerca (es. case)..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setInvalid(false);
                }}
                className={invalid ? 'invalid' : ''}
              />
            </form>
          </div>

          <AnnunciColumn
            category={category}
            user={user}
            onOpenAuth={onOpenAuth}
            onOpenChat={onOpenChat}
            onGoToCategory={(id) => {
              const target = ANNUNCI_CATEGORIES.find((c) => c.id === id);
              if (target) onSearchCategory(target);
            }}
            closing={isClosing}
          />
        </>
      )}
    </div>
  );
}
