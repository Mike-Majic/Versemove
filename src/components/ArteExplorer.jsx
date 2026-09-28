import CategoryColumn from './CategoryColumn';
import LibreriaColumn from './LibreriaColumn';
import FotografiaColumn from './FotografiaColumn';
import VideoColumn from './VideoColumn';
import MusicaApp from './musica/MusicaApp';
import PodcastColumn from './PodcastColumn';
import CinemaColumn from './cultural/CinemaColumn';
import CommunityEventsColumn from './cultural/CommunityEventsColumn';
import TeatroColumn from './arte/TeatroColumn';
import TattooColumn from './tattoo/TattooColumn';
import GiochiTavoloColumn from './nerd/games/GiochiTavoloColumn';
import TwitchColumn from './nerd/twitch/TwitchColumn';
import LiveWorldPanel from './live/LiveWorldPanel';
import GamingColumn from './nerd/gaming/GamingColumn';
import NerdBachecaColumn from './nerd/NerdBachecaColumn';
import CosplayColumn from './nerd/cosplay/CosplayColumn';
import VetrinaOfferteColumn from './vetrina/VetrinaOfferteColumn';
import FavoriteStarButton from './shared/FavoriteStarButton';
import { VETRINA_OFFERTE_CATEGORY_IDS } from '../data/vetrinaCategories';
import { GAMING_CATEGORY_IDS } from '../data/gaming';
import './shared/categoryExplorerShell.css';

const COMMUNITY_EVENT_CATEGORIES = new Set(['teatro', 'arti-visive', 'live']);
const NERD_LIVE_CATEGORY = 'nerd-live';

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
  cosplayFocus = null,
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
          ) : world.id === 'nerd' && category.id === 'cosplay' ? (
            // Cosplay: schede Eventi · Cerco gruppo · Galleria · WIP ·
            // Community (vedi nerd/cosplay/CosplayColumn.jsx).
            <CosplayColumn key={category.id} category={category} user={user} onOpenAuth={onOpenAuth} locationFilters={locationFilters} focus={cosplayFocus} />
          ) : world.id === 'nerd' && category.id === 'bacheca' ? (
            <NerdBachecaColumn key={category.id} user={user} onOpenAuth={onOpenAuth} />
          ) : world.id === 'nerd' && GAMING_CATEGORY_IDS.includes(category.id) ? (
            // Gaming PC / PS / Xbox: una sola colonna, la piattaforma della
            // categoria fa da contesto (vedi nerd/gaming/GamingColumn.jsx).
            <GamingColumn key={category.id} category={category} user={user} onOpenAuth={onOpenAuth} focus={gamingFocus} locationFilters={locationFilters} />
          ) : VETRINA_OFFERTE_CATEGORY_IDS.includes(category.id) ? (
            <VetrinaOfferteColumn key={category.id} category={category} user={user} onOpenAuth={onOpenAuth} locationFilters={locationFilters} closing={isClosing} />
          ) : world.id === 'nerd' && category.id === 'streaming' ? (
            // Streaming & Content Creator: Twitch dentro Versemove (dirette,
            // ricerca, player e chat incorporati).
            <TwitchColumn key={category.id} user={user} onOpenAuth={onOpenAuth} />
          ) : world.id === 'nerd' && category.id === NERD_LIVE_CATEGORY ? (
            // Live del mondo Nerd: dirette Twitch/YouTube/Kick come nel Social
            // (le stanze video sono passate al mondo Incontri).
            <LiveWorldPanel key={category.id} mondo="nerd" standalone title="Live" user={user} onOpenAuth={onOpenAuth} />
          ) : world.id === 'arte' && category.id === 'dirette' ? (
            // In diretta (Intrattenimento): link di dirette YouTube e TikTok.
            <LiveWorldPanel key={category.id} mondo="arte" standalone title="In diretta" user={user} onOpenAuth={onOpenAuth} />
          ) : world.id === 'arte' && ['teatro', 'arti-visive', 'live'].includes(category.id) ? (
            // Teatro: eventi come in Cosplay (lista/mappa, città + km,
            // periodo, tipo) più la scheda Community di prima.
            <TeatroColumn key={category.id} category={category} user={user} onOpenAuth={onOpenAuth} onShowReactors={onShowReactors} locationFilters={locationFilters} />
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
