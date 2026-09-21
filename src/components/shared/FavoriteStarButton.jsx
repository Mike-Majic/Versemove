// Stellina "categoria preferita" accanto alla X di ogni pannello categoria
// (mondo Arte & Musica, Nerd, Lavoro, Incontri, Social, Bambini — stesso
// guscio condiviso, vedi categoryExplorerShell.css). Segnare/togliere una
// categoria preferita la fa comparire/scomparire dalla lista nel profilo
// personale (vedi ProfileSettingsPanel).
export default function FavoriteStarButton({ worldId, categoryId, categoryLabel, favorites, onToggle, user, onOpenAuth }) {
  const isFavorite = favorites.some((f) => f.worldId === worldId && f.categoryId === categoryId);

  const handleClick = () => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    onToggle({ worldId, categoryId, categoryLabel }, isFavorite);
  };

  return (
    <button
      type="button"
      className={`rb-favorite-star-btn ${isFavorite ? 'active' : ''}`}
      onClick={handleClick}
      aria-label={isFavorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}
      title={isFavorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti'}
      aria-pressed={isFavorite}
    >
      {isFavorite ? '★' : '☆'}
    </button>
  );
}
