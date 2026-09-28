// Categorie del mondo Incontri (rosso): "Match" (stile Tinder) e
// "Videochiamata" (stanze video di gruppo, arrivate dal mondo Nerd) — le
// live sono state spostate nei mondi Social e Lavoro (vedi
// liveStreams.js), qui restano solo gli incontri. Stessa struttura di
// BAMBINI_CATEGORIES/ARTE_CATEGORIES, così funziona con lo stesso
// meccanismo di triangoli sul globo (vedi App.jsx, CATEGORY_WORLDS).
//
// L'anchor è deliberatamente in mezzo all'oceano (non su una città): il
// triangolo/sagoma di una categoria è grande e semi-trasparente, se
// ancorato su terraferma finisce sopra ai marker degli utenti di quella
// zona e li nasconde. Sull'acqua non c'è nessuno da coprire. Era nel
// Pacifico meridionale (lat -20, lng -140): acqua, ma sul lato opposto del
// globo rispetto all'inquadratura iniziale (lat 0, lng 0), quindi invisibile
// finché non si ruotava manualmente. Spostato nel Golfo di Aden — ancora
// oceano aperto (verificato contro gli stessi dati GeoJSON del globo, vedi
// landGeo.js), ma vicino all'inquadratura di apertura, così il cuore
// dell'unica categoria si vede fin da subito.
export const INCONTRI_CATEGORIES = [
  {
    id: 'match',
    label: 'Match',
    icon: '💘',
    anchor: { lat: 12, lng: 48 }, // Golfo di Aden
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
    anchor: { lat: -22, lng: 72 }, // Oceano Indiano
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
