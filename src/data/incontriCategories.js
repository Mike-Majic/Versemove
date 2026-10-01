// Categorie del mondo Incontri (rosso): "Match" (stile Tinder) e
// "Videochiamata" (stanze video di gruppo, arrivate dal mondo Nerd) — le
// live sono state spostate nei mondi Social e Lavoro (vedi
// liveStreams.js), qui restano solo gli incontri. Stessa struttura di
// BAMBINI_CATEGORIES/ARTE_CATEGORIES, così funziona con lo stesso
// meccanismo di sagome sul globo (vedi App.jsx, CATEGORY_WORLDS).
//
// Posizioni: Match sull'equatore a lng 0, cioè al centro del globo nella
// vista iniziale; Videochiamata alla stessa altezza ma esattamente alle sue
// spalle (lng 180), quindi all'avvio non si vede e compare ruotando il
// globo di mezzo giro. Entrambi i punti sono oceano aperto (Golfo di
// Guinea e Pacifico centrale), quindi non coprono marker di utenti.
// exactAnchor: la sagoma sta esattamente sull'anchor e non al centro del
// triangolo più vicino (vedi buildCategoryShell in globe/categoryShell.js),
// altrimenti il cuore risulterebbe spostato di qualche grado.
export const INCONTRI_CATEGORIES = [
  {
    id: 'match',
    label: 'Match',
    icon: '💘',
    anchor: { lat: 0, lng: 0 }, // centro della vista iniziale
    exactAnchor: true,
    aliases: ['match', 'tinder', 'mi piace', 'incontri rapidi', 'swipe'],
    subfamilies: [],
  },
  {
    // Stanze video di gruppo (fino a 8 persone), spostate qui dal mondo
    // Nerd: stesso componente (nerd/VideoRoomsColumn.jsx, preset
    // 'incontri'), categoria 'videochiamata' lato server.
    id: 'videochiamata',
    label: 'Videochiamata',
    icon: '🎥',
    anchor: { lat: 0, lng: 180 }, // alle spalle di Match
    exactAnchor: true,
    aliases: ['videochiamata', 'videochiamate', 'stanze video', 'video chat', 'chiamata di gruppo'],
    subfamilies: [],
  },
];

export function resolveCategoryQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    INCONTRI_CATEGORIES.find(
      (c) => c.label.toLowerCase() === q || c.aliases.some((a) => a.toLowerCase() === q)
    ) ??
    INCONTRI_CATEGORIES.find(
      (c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))
    ) ??
    null
  );
}
