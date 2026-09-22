// Categorie del mondo Vetrina (rosa): "Novità" (ancora senza contenuto
// editoriale, CategoryColumn mostra da sé lo stato vuoto), "Cani" (mappa
// reale di luoghi pet-friendly + recensioni, componente dedicato
// DogWorldMap — vedi ArteExplorer.jsx, stesso meccanismo di musica/cinema)
// e le categorie "Offerte" (vedi VETRINA_OFFERTE_CATEGORY_IDS sotto,
// componente dedicato VetrinaOfferteColumn — stesso meccanismo). Stessa
// struttura di LAVORO_CATEGORIES/SOCIAL_CATEGORIES, stesso meccanismo di
// triangoli sul globo (vedi App.jsx, CATEGORY_WORLDS).
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
  {
    id: 'offerte-casa-arredamento',
    label: 'Casa & Arredamento',
    icon: '🏠',
    anchor: { lat: 15, lng: -155 }, // Pacifico centrale
    aliases: ['casa', 'arredamento', 'ikea', 'mondo convenienza', 'leroy merlin', 'maisons du monde'],
    subfamilies: [],
  },
  {
    id: 'offerte-cibo-supermercati',
    label: 'Cibo & Supermercati',
    icon: '🛒',
    anchor: { lat: -20, lng: -175 }, // Pacifico meridionale
    aliases: ['cibo', 'supermercati', 'volantini', 'esselunga', 'coop', 'conad', 'lidl', 'eurospin'],
    subfamilies: [],
  },
  {
    id: 'offerte-abbigliamento',
    label: 'Abbigliamento',
    icon: '👕',
    anchor: { lat: 35, lng: -35 }, // Atlantico settentrionale
    aliases: ['abbigliamento', 'vestiti', 'moda'],
    subfamilies: [],
  },
  {
    id: 'offerte-scarpe',
    label: 'Scarpe',
    icon: '👟',
    anchor: { lat: -40, lng: -30 }, // Atlantico meridionale
    aliases: ['scarpe', 'sneaker', 'calzature'],
    subfamilies: [],
  },
  {
    id: 'offerte-elettronica',
    label: 'Elettronica',
    icon: '💻',
    anchor: { lat: 5, lng: 65 }, // Oceano Indiano
    aliases: ['elettronica', 'informatica', 'smartphone', 'elettrodomestici'],
    subfamilies: [],
  },
  {
    id: 'offerte-bellezza-cura-persona',
    label: 'Bellezza & Cura persona',
    icon: '💄',
    anchor: { lat: -25, lng: 75 }, // Oceano Indiano meridionale
    aliases: ['bellezza', 'cura persona', 'cosmetici', 'profumeria'],
    subfamilies: [],
  },
  {
    id: 'offerte-sport-outdoor',
    label: 'Sport & Outdoor',
    icon: '⚽',
    anchor: { lat: 45, lng: -25 }, // Atlantico del nord
    aliases: ['sport', 'outdoor', 'decathlon'],
    subfamilies: [],
  },
  {
    id: 'offerte-bambini-giocattoli',
    label: 'Bambini & Giocattoli',
    icon: '🧸',
    anchor: { lat: 0, lng: -110 }, // Pacifico equatoriale
    aliases: ['bambini', 'giocattoli', 'giochi'],
    subfamilies: [],
  },
  {
    id: 'offerte-viaggi-voli',
    label: 'Viaggi & Voli',
    icon: '✈️',
    anchor: { lat: 25, lng: 165 }, // Pacifico occidentale
    aliases: ['viaggi', 'voli', 'hotel', 'vacanze'],
    subfamilies: [],
  },
  {
    id: 'offerte-fai-da-te-giardino',
    label: 'Fai da te & Giardino',
    icon: '🔨',
    anchor: { lat: -50, lng: -90 }, // Pacifico meridionale
    aliases: ['fai da te', 'giardino', 'bricolage'],
    subfamilies: [],
  },
  {
    id: 'offerte-auto-moto',
    label: 'Auto & Moto',
    icon: '🚗',
    anchor: { lat: 55, lng: -20 }, // Nord Atlantico
    aliases: ['auto', 'moto', 'veicoli'],
    subfamilies: [],
  },
  {
    id: 'offerte-codici-sconto',
    label: 'Codici sconto',
    icon: '🎟️',
    anchor: { lat: -60, lng: 140 }, // Oceano Meridionale
    aliases: ['codici sconto', 'coupon', 'sconti'],
    subfamilies: [],
  },
];

// Le 12 categorie "Offerte" condividono lo stesso componente
// (VetrinaOfferteColumn, parametrizzato dalla categoria) invece di averne
// uno a testa: aggiungere o rinominare un'offerta si fa da questa lista
// sola, senza toccare ArteExplorer.jsx (vedi il branch lì).
export const VETRINA_OFFERTE_CATEGORY_IDS = VETRINA_CATEGORIES.filter((c) => c.id.startsWith('offerte-')).map(
  (c) => c.id
);

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
