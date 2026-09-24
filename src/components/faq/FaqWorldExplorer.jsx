import { useMemo, useState } from 'react';
import { getFaqCategories, resolveCategoryQuery } from '../../data/faqCategories';
import { isStaff } from '../../data/roles';
import ModRoomColumn from './ModRoomColumn';
import SegnalazioniColumn from './SegnalazioniColumn';
import SuggerimentiColumn from './SuggerimentiColumn';
import InformazioniColumn from './InformazioniColumn';
import FavoriteStarButton from '../shared/FavoriteStarButton';
import '../shared/categoryExplorerShell.css';
import './faq.css';

// Guscio di navigazione del mondo FAQ: stesso pattern di IncontriLiveExplorer/
// LavoroWorldExplorer (X + ricerca in alto, chiuso finché non si sceglie la
// categoria). Le categorie visibili dipendono dal ruolo (getFaqCategories):
// la Stanza MOD non esiste proprio per chi non è owner/moderatore, né sul
// globo né qui né nella ricerca.
export default function FaqWorldExplorer({
  world,
  activeCategory,
  onToggleCategory,
  onSearchCategory,
  user,
  onOpenAuth,
  favorites = [],
  onToggleFavorite,
  isClosing = false,
}) {
  const [query, setQuery] = useState('');
  const [invalid, setInvalid] = useState(false);
  const staff = isStaff(user?.ruolo);
  const categories = useMemo(() => getFaqCategories(staff), [staff]);
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
    // La Stanza MOD ha l'accento rosso (come la sua nuvola sul globo), le
    // altre categorie il grigio-argento del mondo FAQ.
    <div className="rb-arte-explorer" style={{ '--accent': category?.id === 'mod-room' ? '#ff3b3b' : world.color }}>
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

            {/* Sopra la Stanza MOD (pannello unico a tutto schermo) la
                ricerca delle categorie coprirebbe la sua testata. */}
            {category.id !== 'mod-room' && (
            <form className="rb-arte-category-search" onSubmit={submitSearch}>
              <input
                type="text"
                placeholder="Cerca (es. suggerimenti)..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setInvalid(false);
                }}
                className={invalid ? 'invalid' : ''}
              />
            </form>
            )}
          </div>

          {/* Ogni categoria usa lo stesso layout a due pannelli degli altri
              mondi (TwoColumnSwitcher: pannello scuro con bordo del colore
              del mondo, apertura olografica, chiusura in particelle) —
              prima i contenuti erano disegnati "nudi" sopra al globo. */}
          {category.id === 'mod-room' && staff && <ModRoomColumn user={user} onOpenCategory={onToggleCategory} />}
          {category.id === 'segnalazioni' && (
            <SegnalazioniColumn user={user} onOpenAuth={onOpenAuth} closing={isClosing} />
          )}
          {category.id === 'suggerimenti' && (
            <SuggerimentiColumn user={user} onOpenAuth={onOpenAuth} staff={staff} closing={isClosing} />
          )}
          {category.id === 'informazioni' && (
            <InformazioniColumn staff={staff} closing={isClosing} onOpenCategory={onToggleCategory} />
          )}
        </>
      )}
    </div>
  );
}
