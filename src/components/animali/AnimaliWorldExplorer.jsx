import { useState } from 'react';
import { ANIMALI_CATEGORIES, resolveCategoryQuery } from '../../data/animaliCategories';
import DogWorldMap from '../dogworld/DogWorldMap';
import FavoriteStarButton from '../shared/FavoriteStarButton';
import '../shared/categoryExplorerShell.css';

// Guscio di navigazione del mondo Animali: stesso pattern di
// LavoroWorldExplorer/IncontriLiveExplorer (X + ricerca in alto, chiuso
// finché non si sceglie la categoria). Per ora solo "Cani" (mappa reale di
// luoghi pet-friendly + recensioni, DogWorldMap) — spostata qui dal mondo
// Vetrina, su richiesta esplicita di un mondo dedicato.
export default function AnimaliWorldExplorer({
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
  const category = ANIMALI_CATEGORIES.find((c) => c.id === activeCategory) ?? null;

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
                placeholder="Cerca (es. cani)..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setInvalid(false);
                }}
                className={invalid ? 'invalid' : ''}
              />
            </form>
          </div>

          <DogWorldMap user={user} onOpenAuth={onOpenAuth} />
        </>
      )}
    </div>
  );
}
