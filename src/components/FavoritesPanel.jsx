import { useTranslation } from 'react-i18next';
import ModalOverlay from './ModalOverlay';
import Icon from './shared/Icon';
import { translateWorld } from '../i18n/worldLabels';
import { currentCategoryLabel, favoritesByWorld } from '../data/favoriteLabels';
import './FavoritesPanel.css';

// Categorie preferite (stellina nella barra in alto), raggruppate per
// mondo. Un clic porta a quel mondo e a quella categoria; la stellina
// accanto la toglie dai preferiti.
export default function FavoritesPanel({ favorites, user, onClose, onOpenCategory, onRemove }) {
  const { t } = useTranslation();
  const groups = favoritesByWorld(favorites, user);
  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-favorites-panel" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
        <h2>
          <Icon name="star" size={20} /> Preferiti
        </h2>
        {groups.length === 0 ? (
          <p className="rb-favorites-empty">Nessuna categoria preferita. Tocca la stellina di una categoria per salvarla qui.</p>
        ) : (
          groups.map(({ world, items }) => (
            <section key={world.id} className="rb-favorites-group" style={{ '--world': world.color }}>
              <h3>{translateWorld(t, world).label}</h3>
              <ul>
                {items.map((f) => {
                  const label = currentCategoryLabel(f);
                  return (
                    <li key={f.categoryId}>
                      <button type="button" className="rb-favorites-open" onClick={() => onOpenCategory(f)}>
                        <span className="rb-favorites-dot" aria-hidden="true" />
                        {label}
                      </button>
                      <button
                        type="button"
                        className="rb-favorites-star"
                        onClick={() => onRemove(f)}
                        aria-label={`Togli ${label} dai preferiti`}
                        title="Togli dai preferiti"
                      >
                        ★
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </ModalOverlay>
  );
}
