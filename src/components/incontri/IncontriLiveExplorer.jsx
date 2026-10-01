import { useState } from 'react';
import { INCONTRI_CATEGORIES, resolveCategoryQuery } from '../../data/incontriCategories';
import MatchColumn from './MatchColumn';
import VideoRoomsColumn from '../nerd/VideoRoomsColumn';
import FavoriteStarButton from '../shared/FavoriteStarButton';
import SponsorCard from '../ads/SponsorCard';
import '../shared/categoryExplorerShell.css';

// Guscio di navigazione del mondo Incontri: stesso pattern di ArteExplorer
// (X + ricerca in alto, chiuso finché non si sceglie la categoria):
// "Match" (stile Tinder) e "Videochiamata" (stanze video di gruppo, le
// stesse del mondo Nerd, preset 'incontri'). Le dirette sono nei mondi
// Social, Lavoro, Nerd e Intrattenimento.
export default function IncontriLiveExplorer({
  world,
  activeCategory,
  onToggleCategory,
  onSearchCategory,
  user,
  onOpenAuth,
  onOpenChat,
  onOpenProfile,
  onOpenMyDatingProfile,
  myDatingProfileVersion,
  initialMatchTab,
  onConsumeInitialMatchTab,
  favorites = [],
  onToggleFavorite,
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
                placeholder="Cerca (es. match, videochiamata)..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setInvalid(false);
                }}
                className={invalid ? 'invalid' : ''}
              />
            </form>
          </div>

          {category.id === 'videochiamata' ? (
            <VideoRoomsColumn key={category.id} preset="incontri" user={user} onOpenAuth={onOpenAuth} />
          ) : (
            <MatchColumn
              user={user}
              onOpenAuth={onOpenAuth}
              onOpenChat={onOpenChat}
              onOpenProfile={onOpenProfile}
              onOpenMyDatingProfile={onOpenMyDatingProfile}
              myDatingProfileVersion={myDatingProfileVersion}
              initialTab={initialMatchTab}
              onConsumeInitialTab={onConsumeInitialMatchTab}
            />
          )}
          {/* In fondo alla colonna, non sopra ai contenuti: richiesta esplicita. */}
          <SponsorCard mondo="incontri" categoria={category.id} formato="banner_pannello" />
        </>
      )}
    </div>
  );
}
