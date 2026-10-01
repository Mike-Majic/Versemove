import { ANIMALI_CATEGORIES } from './animaliCategories';
import { ARTE_CATEGORIES } from './arteCategories';
import { NERD_CATEGORIES } from './nerdCategories';
import { LAVORO_CATEGORIES, canSearchCandidates } from './lavoroCategories';
import { WORLDS } from './worlds';

// Categorie preferite (stellina, vedi FavoriteStarButton): nome da
// mostrare e quali nascondere, usati dal pannello della stellina nella
// barra in alto (FavoritesPanel).

// Etichetta salvata col preferito, ma se la categoria è stata rinominata
// (es. Animali: "Cani" -> "Amici a 4 zampe", Intrattenimento: "Cinema" ->
// "Sala cinema") vince il nome attuale.
const RENAMED_CATEGORY_LABELS = new Map([
  ...ANIMALI_CATEGORIES.map((c) => [`animali:${c.id}`, c.label]),
  ...ARTE_CATEGORIES.map((c) => [`arte:${c.id}`, c.label]),
  ...NERD_CATEGORIES.map((c) => [`nerd:${c.id}`, c.label]),
  ...LAVORO_CATEGORIES.map((c) => [`lavoro:${c.id}`, c.label]),
]);
// Categorie tolte (Lavoro "Live", sostituita da "Stanza conferenze"): un
// vecchio preferito non si mostra più.
const REMOVED_CATEGORIES = new Set(['lavoro:live']);
// Categorie riservate (Lavoro "Cerca candidati"): un preferito rimasto da
// quando l'azienda era verificata non si mostra a chi non può più aprirla.
const RECRUITER_CATEGORIES = new Set(LAVORO_CATEGORIES.filter((c) => c.recruiterOnly).map((c) => `lavoro:${c.id}`));

export function currentCategoryLabel(f) {
  return RENAMED_CATEGORY_LABELS.get(`${f.worldId}:${f.categoryId}`) ?? f.categoryLabel;
}

// Preferiti raggruppati nell'ordine dei mondi (data/worlds.js), senza
// quelli tolti o non più apribili da questo utente.
export function favoritesByWorld(favorites, user) {
  const canRecruit = canSearchCandidates(user);
  const hidden = (f) => {
    const key = `${f.worldId}:${f.categoryId}`;
    return REMOVED_CATEGORIES.has(key) || (!canRecruit && RECRUITER_CATEGORIES.has(key));
  };
  return WORLDS.map((w) => ({ world: w, items: favorites.filter((f) => f.worldId === w.id && !hidden(f)) })).filter((g) => g.items.length > 0);
}
