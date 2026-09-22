// Categoria del mondo Social (Blu): una sola, "World", che apre il feed
// esistente (colonne, composer, eventi...) — stesso meccanismo a triangoli
// sul globo degli altri mondi, invece del feed sempre aperto di prima.
// Anchor in mezzo all'oceano (non su una città), stesso motivo delle
// categorie di Incontri: un triangolo grande e semi-trasparente su
// terraferma finirebbe sopra ai marker degli utenti di quella zona. Messo
// vicino al centro della vista di default del globo (lat 0, lng 0), così
// entrando nel mondo Social è il primo triangolo visibile, in mezzo allo
// schermo, prima che la rotazione automatica lo porti altrove.
export const SOCIAL_CATEGORIES = [
  {
    id: 'world',
    label: 'World',
    icon: '🌐',
    anchor: { lat: 2, lng: -8 }, // Oceano Atlantico, al largo dell'Africa occidentale
    aliases: ['world', 'mondo', 'feed', 'bacheca', 'social'],
    subfamilies: [],
  },
];

export function resolveCategoryQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    SOCIAL_CATEGORIES.find(
      (c) => c.label.toLowerCase() === q || c.aliases.some((a) => a.toLowerCase() === q)
    ) ??
    SOCIAL_CATEGORIES.find(
      (c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))
    ) ??
    null
  );
}
