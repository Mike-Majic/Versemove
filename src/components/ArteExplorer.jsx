import CategoryColumn from './CategoryColumn';
import LibreriaColumn from './LibreriaColumn';
import FotografiaColumn from './FotografiaColumn';
import VideoColumn from './VideoColumn';
import MusicaApp from './musica/MusicaApp';
import PodcastColumn from './PodcastColumn';
import CinemaColumn from './cultural/CinemaColumn';
import CommunityEventsColumn from './cultural/CommunityEventsColumn';
import EventiColumn from './cultural/EventiColumn';
import EventiTabsColumn from './cultural/EventiTabsColumn';
import TattooColumn from './tattoo/TattooColumn';
import GiochiTavoloColumn from './nerd/games/GiochiTavoloColumn';
import VideoRoomsColumn from './nerd/VideoRoomsColumn';
import GamingColumn from './nerd/gaming/GamingColumn';
import NerdBachecaColumn from './nerd/NerdBachecaColumn';
import VetrinaOfferteColumn from './vetrina/VetrinaOfferteColumn';
import FavoriteStarButton from './shared/FavoriteStarButton';
import { VETRINA_OFFERTE_CATEGORY_IDS } from '../data/vetrinaCategories';
import { GAMING_CATEGORY_IDS } from '../data/gaming';
import './shared/categoryExplorerShell.css';

const COMMUNITY_EVENT_CATEGORIES = new Set(['teatro', 'arti-visive', 'live']);
const NERD_LIVE_CATEGORY = 'nerd-live';
const COSPLAY_CATEGORY = 'cosplay';

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
  gamingFocus = null,
}) {
  const category = categorySet.categories.find((c) => c.id === activeCategory) ?? null;
  const genericColumn = category && (
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
  );

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
          ) : world.id === 'nerd' && category.id === 'bacheca' ? (
            <NerdBachecaColumn key={category.id} user={user} onOpenAuth={onOpenAuth} />
          ) : world.id === 'nerd' && GAMING_CATEGORY_IDS.includes(category.id) ? (
            // Gaming PC / PS / Xbox: una sola colonna, la piattaforma della
            // categoria fa da contesto (vedi nerd/gaming/GamingColumn.jsx).
            <GamingColumn key={category.id} category={category} user={user} onOpenAuth={onOpenAuth} focus={gamingFocus} />
          ) : VETRINA_OFFERTE_CATEGORY_IDS.includes(category.id) ? (
            <VetrinaOfferteColumn key={category.id} category={category} user={user} onOpenAuth={onOpenAuth} locationFilters={locationFilters} closing={isClosing} />
          ) : world.id === 'nerd' && category.id === NERD_LIVE_CATEGORY ? (
            // Live del mondo Nerd: stanze video di gruppo, più la scheda
            // "Eventi" (fiere del videogioco, tornei: li aggiorna il bot).
            <VideoRoomsColumn
              key={category.id}
              user={user}
              onOpenAuth={onOpenAuth}
              events={
                <div className="rb-eventi-tabs-panel">
                  <EventiColumn mondo="nerd" categoria={NERD_LIVE_CATEGORY} label="Eventi" user={user} onOpenAuth={onOpenAuth} />
                </div>
              }
            />
          ) : world.id === 'nerd' && category.id === COSPLAY_CATEGORY ? (
            // Cosplay: scheda "Eventi" (fiere, raduni e gare, aggiornati dal
            // bot) + scheda "Community" con la colonna generica di prima.
            <EventiTabsColumn key={category.id} community={genericColumn}>
              <EventiColumn mondo="nerd" categoria={COSPLAY_CATEGORY} label="Eventi cosplay" user={user} onOpenAuth={onOpenAuth} />
            </EventiTabsColumn>
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
            genericColumn
          )}
        </>
      )}
    </div>
  );
}
