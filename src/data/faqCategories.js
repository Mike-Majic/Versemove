// Categorie del mondo FAQ (nero): Stanza MOD (solo staff, filtrata via
// getFaqCategories — mai nell'array passato a chi non è owner/moderatore),
// Segnalazioni, Suggerimenti, Informazioni. Stessa struttura delle altre
// liste categoria (LAVORO_CATEGORIES ecc.), stesso meccanismo di forme sul
// globo (nuvole, vedi App.jsx CATEGORY_SHAPE_BY_WORLD e globe/categoryShell.js).
//
// Anchor sparsi sull'oceano, come le altre categorie "globali" — un
// riquadro semi-trasparente grande su terraferma finirebbe sopra ai marker
// degli utenti di quella zona.
export const FAQ_CATEGORIES = [
  {
    id: 'mod-room',
    label: 'Stanza MOD',
    icon: '🛡️',
    anchor: { lat: 40, lng: -140 }, // Pacifico nord-orientale
    aliases: ['stanza mod', 'mod room', 'staff'],
    subfamilies: [],
    staffOnly: true,
  },
  {
    id: 'segnalazioni',
    label: 'Segnalazioni',
    icon: '🚩',
    anchor: { lat: -30, lng: 60 }, // Oceano Indiano meridionale
    aliases: ['segnalazioni', 'segnala', 'problema', 'bug'],
    subfamilies: [],
  },
  {
    id: 'suggerimenti',
    label: 'Suggerimenti',
    icon: '💡',
    anchor: { lat: 10, lng: -35 }, // Atlantico equatoriale
    aliases: ['suggerimenti', 'idee', 'proposte'],
    subfamilies: [],
  },
  {
    id: 'informazioni',
    label: 'Informazioni',
    icon: 'ℹ️',
    anchor: { lat: -55, lng: -60 }, // Passaggio di Drake
    aliases: ['informazioni', 'guida', 'aiuto', 'come funziona'],
    subfamilies: [],
  },
];

// Solo le categorie visibili per QUESTO utente (Stanza MOD esclusa per chi
// non è owner/moderatore) — usato ovunque al posto dell'array completo,
// così una categoria nascosta non compare né sul globo né nella lista né
// nella ricerca testuale.
export function getFaqCategories(isStaffUser) {
  return isStaffUser ? FAQ_CATEGORIES : FAQ_CATEGORIES.filter((c) => !c.staffOnly);
}

export function resolveCategoryQuery(query, categories = FAQ_CATEGORIES) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    categories.find((c) => c.label.toLowerCase() === q || c.aliases.some((a) => a.toLowerCase() === q)) ??
    categories.find((c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))) ??
    null
  );
}
