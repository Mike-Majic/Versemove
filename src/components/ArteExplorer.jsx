import { useState } from 'react';
import CategoryColumn from './CategoryColumn';
import LibreriaColumn from './LibreriaColumn';
import FotografiaColumn from './FotografiaColumn';
import VideoColumn from './VideoColumn';
import MusicaColumn from './MusicaColumn';
import './shared/categoryExplorerShell.css';

// Guscio di navigazione categorie, generico per qualunque mondo che abbia un
// proprio set di categorie (categorySet = { categories, featured, results,
// resolveQuery }, vedi CATEGORY_WORLDS in App.jsx) — usato oggi da Arte &
// Musica e da Nerd, senza copie: la X, il campo di ricerca categoria e
// CategoryColumn sono sempre gli stessi, cambiano solo i dati.
export default function ArteExplorer({
  world,
  categorySet,
  activeCategory,
  onToggleCategory,
  onSearchCategory,
  initialSubfamily,
  locationFilters,
  user,
  onOpenAuth,
}) {
  const [categoryQuery, setCategoryQuery] = useState('');
  const [categoryQueryInvalid, setCategoryQueryInvalid] = useState(false);

  const category = categorySet.categories.find((c) => c.id === activeCategory) ?? null;

  const submitCategorySearch = (e) => {
    e.preventDefault();
    const found = categorySet.resolveQuery(categoryQuery);
    if (found) {
      setCategoryQueryInvalid(false);
      onSearchCategory(found);
      setCategoryQuery('');
    } else {
      setCategoryQueryInvalid(true);
    }
  };

  return (
    <div className="rb-arte-explorer" style={{ '--accent': world.color }}>
      {category && (
        <>
          <div className="rb-arte-top-controls">
            <button
              type="button"
              className="rb-arte-close-all-btn"
              onClick={() => onToggleCategory(null)}
              aria-label="Chiudi le colonne"
              title="Chiudi le colonne"
            >
              ✕
            </button>

            <form className="rb-arte-category-search" onSubmit={submitCategorySearch}>
              <input
                type="text"
                placeholder="Cerca una categoria (es. film)..."
                value={categoryQuery}
                onChange={(e) => {
                  setCategoryQuery(e.target.value);
                  setCategoryQueryInvalid(false);
                }}
                className={categoryQueryInvalid ? 'invalid' : ''}
              />
            </form>
          </div>

          {category.id === 'libreria' ? (
            <LibreriaColumn
              key={category.id}
              category={category}
              initialSubfamily={initialSubfamily}
              locationFilters={locationFilters}
              featured={categorySet.featured[category.id] ?? []}
              allResults={categorySet.results[category.id] ?? []}
            />
          ) : category.id === 'fotografia' ? (
            <FotografiaColumn key={category.id} user={user} onOpenAuth={onOpenAuth} />
          ) : category.id === 'video' ? (
            <VideoColumn key={category.id} user={user} onOpenAuth={onOpenAuth} />
          ) : category.id === 'musica' ? (
            <MusicaColumn key={category.id} category={category} user={user} onOpenAuth={onOpenAuth} />
          ) : (
            <CategoryColumn
              key={category.id}
              world={world.id}
              category={category}
              initialSubfamily={initialSubfamily}
              locationFilters={locationFilters}
              featured={categorySet.featured[category.id] ?? []}
              allResults={categorySet.results[category.id] ?? []}
              user={user}
              onOpenAuth={onOpenAuth}
            />
          )}
        </>
      )}
    </div>
  );
}
