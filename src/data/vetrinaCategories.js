// Categorie del mondo Vetrina (rosa): "Novità" (ancora senza contenuto
// editoriale, CategoryColumn mostra da sé lo stato vuoto) e "Cani" (mappa
// reale di luoghi pet-friendly + recensioni, componente dedicato
// DogWorldMap — vedi ArteExplorer.jsx, stesso meccanismo di musica/cinema).
// Stessa struttura di LAVORO_CATEGORIES/SOCIAL_CATEGORIES, stesso
// meccanismo di triangoli sul globo (vedi App.jsx, CATEGORY_WORLDS).
//
// Anchor deliberatamente in mezzo all'oceano, stesso motivo delle altre
// categorie "globali": un triangolo grande e semi-trasparente su
// terraferma finirebbe sopra ai marker degli utenti di quella zona.
export const VETRINA_CATEGORIES = [
  {
    id: 'novita',
    label: 'Novità',
    icon: '🛍️',
    anchor: { lat: 20, lng: -150 }, // Pacifico settentrionale
    aliases: ['novita', 'novità', 'vetrina', 'in mostra'],
    subfamilies: [],
  },
  {
    id: 'cani',
    label: 'Cani',
    icon: '🐕',
    anchor: { lat: -35, lng: -15 }, // Atlantico meridionale
    aliases: ['cani', 'cane', 'dog', 'dogs', 'pet friendly', 'aree cani'],
    subfamilies: [],
  },
];

export function resolveCategoryQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    VETRINA_CATEGORIES.find(
      (c) => c.label.toLowerCase() === q || c.aliases.some((a) => a.toLowerCase() === q)
    ) ??
    VETRINA_CATEGORIES.find(
      (c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))
    ) ??
    null
  );
}
