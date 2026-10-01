import { useMemo, useState } from 'react';
import { getLavoroCategories, canSearchCandidates, resolveCategoryQuery } from '../../data/lavoroCategories';
import VideoRoomsColumn from '../nerd/VideoRoomsColumn';
import CandidatiSearchColumn from './CandidatiSearchColumn';
import FavoriteStarButton from '../shared/FavoriteStarButton';
import SponsorCard from '../ads/SponsorCard';
import '../shared/categoryExplorerShell.css';

// Guscio di navigazione del mondo Lavoro: stesso pattern di ArteExplorer/
// IncontriLiveExplorer (X + ricerca in alto, chiuso finché non si sceglie
// la categoria). "Stanza conferenze" per tutti, "Cerca candidati" solo
// per le aziende verificate e l'owner (getLavoroCategories).
export default function LavoroWorldExplorer({
  world,
  activeCategory,
  onToggleCategory,
  onSearchCategory,
  user,
  onOpenAuth,
  favorites = [],
  onToggleFavorite,
  onNoAccess,
}) {
  const [query, setQuery] = useState('');
  const [invalid, setInvalid] = useState(false);
  const canRecruit = canSearchCandidates(user);
  const categories = useMemo(() => getLavoroCategories(canRecruit), [canRecruit]);
  const category = categories.find((c) => c.id === activeCategory) ?? null;

  const submitSearch = (e) => {
    e.preventDefault();
    const found = resolveCategoryQuery(query, categories);
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
                placeholder="Cerca (es. conferenze)..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setInvalid(false);
                }}
                className={invalid ? 'invalid' : ''}
              />
            </form>
          </div>

          {/* Stanze video del Nerd con i testi e i nomi del Lavoro (nome e
              cognome); "Non hai accesso a questo mondo" -> consenso Lavoro. */}
          {category.id === 'candidati' ? (
            <CandidatiSearchColumn key={category.id} />
          ) : (
            <VideoRoomsColumn key={category.id} preset="conferenze" user={user} onOpenAuth={onOpenAuth} onNoAccess={onNoAccess} />
          )}
          {/* In fondo alla colonna, non sopra ai contenuti: richiesta esplicita. */}
          <SponsorCard mondo="lavoro" categoria={category.id} formato="banner_pannello" />
        </>
      )}
    </div>
  );
}
