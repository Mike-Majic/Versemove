// Categorie del mondo Lavoro (bianco): "Stanza conferenze" e "Cerca
// candidati" (solo aziende verificate, vedi getLavoroCategories). Stanza conferenze
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
  {
    id: 'candidati',
    label: 'Cerca candidati',
    icon: '🔎',
    anchor: { lat: -25, lng: 80 }, // Oceano Indiano
    aliases: ['cerca candidati', 'candidati', 'candidato', 'cerca personale', 'personale', 'curriculum', 'cv', 'recruiting', 'selezione'],
    subfamilies: [],
    // Solo aziende verificate e owner: filtrata via getLavoroCategories,
    // stesso meccanismo di staffOnly nel mondo FAQ.
    recruiterOnly: true,
  },
];

// Può cercare candidati: azienda verificata oppure owner. Il server
// (is_lavoro_recruiter) controlla comunque a ogni chiamata.
export function canSearchCandidates(user) {
  return Boolean(user && ((user.tipoAccount === 'azienda' && user.verificato) || user.ruolo === 'owner'));
}

// Solo le categorie visibili per QUESTO utente ("Cerca candidati" esclusa
// per chi non può cercare) — usato ovunque al posto dell'array completo,
// così la categoria nascosta non compare né sul globo né nella lista né
// nella ricerca testuale né nei preferiti.
export function getLavoroCategories(canRecruit) {
  return canRecruit ? LAVORO_CATEGORIES : LAVORO_CATEGORIES.filter((c) => !c.recruiterOnly);
}

export function resolveCategoryQuery(query, categories = getLavoroCategories(false)) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    categories.find(
      (c) => c.label.toLowerCase() === q || c.aliases.some((a) => a.toLowerCase() === q)
    ) ??
    categories.find(
      (c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))
    ) ??
    null
  );
}
