import CategoryColumn from './CategoryColumn';
import LibreriaColumn from './LibreriaColumn';
import FotografiaColumn from './FotografiaColumn';
import VideoColumn from './VideoColumn';
import MusicaApp from './musica/MusicaApp';
import FavoriteStarButton from './shared/FavoriteStarButton';
import './shared/categoryExplorerShell.css';

// Guscio di navigazione categorie, generico per qualunque mondo che abbia un
// proprio set di categorie (categorySet = { categories, featured, results,
// resolveQuery }, vedi CATEGORY_WORLDS in App.jsx) — usato oggi da Arte &
// Musica e da Nerd, senza copie: la X e CategoryColumn sono sempre gli
// stessi, cambiano solo i dati.
// (campo di ricerca categoria rimosso per ora, vedi onSearchCategory rimasto
// nelle props per quando tornerà)
export default function ArteExplorer({
  world,
  categorySet,
  activeCategory,
  onToggleCategory,
  initialSubfamily,
  locationFilters,
  user,
  onOpenAuth,
  favorites = [],
  onToggleFavorite,
}) {
  const category = categorySet.categories.find((c) => c.id === activeCategory) ?? null;

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
            <MusicaApp key={category.id} user={user} onOpenAuth={onOpenAuth} />
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
