import CategoryColumn from './CategoryColumn';
import LibreriaColumn from './LibreriaColumn';
import FotografiaColumn from './FotografiaColumn';
import VideoColumn from './VideoColumn';
import MusicaApp from './musica/MusicaApp';
import PodcastColumn from './PodcastColumn';
import CinemaColumn from './cultural/CinemaColumn';
import CommunityEventsColumn from './cultural/CommunityEventsColumn';
import TattooColumn from './tattoo/TattooColumn';
import GiochiTavoloColumn from './nerd/games/GiochiTavoloColumn';
import VetrinaOfferteColumn from './vetrina/VetrinaOfferteColumn';
import FavoriteStarButton from './shared/FavoriteStarButton';
import { VETRINA_OFFERTE_CATEGORY_IDS } from '../data/vetrinaCategories';
import './shared/categoryExplorerShell.css';

const COMMUNITY_EVENT_CATEGORIES = new Set(['teatro', 'arti-visive', 'live']);

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
  onShowReactors,
  morphTitleFromCenter = false,
  isClosing = false,
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
          ) : category.id === 'podcast' ? (
            <PodcastColumn key={category.id} category={category} user={user} onOpenAuth={onOpenAuth} />
          ) : category.id === 'cinema' ? (
            <CinemaColumn key={category.id} user={user} onOpenAuth={onOpenAuth} onShowReactors={onShowReactors} />
          ) : category.id === 'tattoo' ? (
            <TattooColumn key={category.id} user={user} onOpenAuth={onOpenAuth} />
          ) : category.id === 'giochi-tavolo' ? (
            <GiochiTavoloColumn key={category.id} user={user} onOpenAuth={onOpenAuth} />
          ) : VETRINA_OFFERTE_CATEGORY_IDS.includes(category.id) ? (
            <VetrinaOfferteColumn key={category.id} category={category} user={user} onOpenAuth={onOpenAuth} locationFilters={locationFilters} closing={isClosing} />
          ) : COMMUNITY_EVENT_CATEGORIES.has(category.id) ? (
            <CommunityEventsColumn
              key={category.id}
              categoryId={category.id}
              label={category.label}
              user={user}
              onOpenAuth={onOpenAuth}
              onShowReactors={onShowReactors}
            />
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
              morphTitleFromCenter={morphTitleFromCenter}
              isClosing={isClosing}
            />
          )}
        </>
      )}
    </div>
  );
}
