// Categorie del mondo Lavoro (bianco): per ora solo "Stanza conferenze"
// (videoconferenze fino a 8 persone con condivisione schermo, stesse stanze
// video del mondo Nerd — vedi nerd/VideoRoomsColumn.jsx, preset
// 'conferenze'). Ha preso il posto di "Live" (dirette incorporate), che
// era vuota. Stessa struttura di INCONTRI_CATEGORIES/SOCIAL_CATEGORIES,
// stesso meccanismo di triangoli sul globo (vedi App.jsx, CATEGORY_WORLDS).
//
// Anchor deliberatamente in mezzo all'oceano, stesso motivo delle altre
// categorie "globali": un triangolo grande e semi-trasparente su
// terraferma finirebbe sopra ai marker degli utenti di quella zona.
export const LAVORO_CATEGORIES = [
  {
    id: 'conferenze',
    label: 'Stanza conferenze',
    icon: '💼',
    anchor: { lat: -10, lng: -25 }, // Atlantico meridionale
    aliases: ['stanza conferenze', 'conferenze', 'conferenza', 'riunione', 'riunioni', 'meeting', 'videoconferenza', 'call'],
    subfamilies: [],
  },
];

export function resolveCategoryQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    LAVORO_CATEGORIES.find(
      (c) => c.label.toLowerCase() === q || c.aliases.some((a) => a.toLowerCase() === q)
    ) ??
    LAVORO_CATEGORIES.find(
      (c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))
    ) ??
    null
  );
}
