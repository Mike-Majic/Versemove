// Categorie del mondo Vetrina (rosa): "Novità" (ancora senza contenuto
// editoriale, CategoryColumn mostra da sé lo stato vuoto) e le categorie
// "Offerte" (vedi VETRINA_OFFERTE_CATEGORY_IDS sotto,
// componente dedicato VetrinaOfferteColumn — stesso meccanismo). Stessa
// struttura di LAVORO_CATEGORIES/SOCIAL_CATEGORIES, stesso meccanismo di
// triangoli sul globo (vedi App.jsx, CATEGORY_WORLDS).
//
// Anchor deliberatamente in mezzo all'oceano, stesso motivo delle altre
// categorie "globali": un triangolo grande e semi-trasparente su
// terraferma finirebbe sopra ai marker degli utenti di quella zona.
// Sparpagliati su tutti gli oceani (non solo Pacifico/Atlantico, dove
// erano ammassati — feedback utente "le vedo troppo appiccicate"),
// verificati uno per uno contro public/geo/land-110m.geojson.json (stesso
// controllo già fatto per l'anchor di Incontri) perché nessuno cada su
// terraferma. Poi ricalcolati tutti insieme (anche per Arte, Nerd, Annunci,
// FAQ e Bambini): ogni anchor è il centro di una faccia del guscio
// (icosaedro, dettaglio 1) con al massimo il 20% di terra, scelte per
// allontanarle il più possibile fra loro — in Vetrina la distanza minima fra
// due categorie è passata da 15° a 35°.
export const VETRINA_CATEGORIES = [
  {
    id: 'novita',
    label: 'Novità',
    icon: '🛍️',
    anchor: { lat: 0, lng: -159.1 }, // distribuzione uniforme sull'oceano
    aliases: ['novita', 'novità', 'vetrina', 'in mostra'],
    subfamilies: [],
  },
  {
    // La mappa dei luoghi pet-friendly (DogWorldMap) si è spostata nel
    // mondo Social come categoria "Animali": qui resta solo la versione
    // "negozio" (prodotti/sconti, stesso VetrinaOfferteColumn delle altre
    // offerte-*), stesso anchor già verificato in oceano.
    id: 'offerte-animali',
    label: 'Animali',
    icon: '🐕',
    anchor: { lat: -49.2, lng: 180 }, // distribuzione uniforme sull'oceano
    aliases: ['animali', 'cani', 'cane', 'pet', 'mangime', 'guinzagli', 'accessori animali'],
    subfamilies: [],
  },
  {
    id: 'offerte-casa-arredamento',
    label: 'Casa & Arredamento',
    icon: '🏠',
    anchor: { lat: 49.2, lng: 180 }, // distribuzione uniforme sull'oceano
    aliases: ['casa', 'arredamento', 'ikea', 'mondo convenienza', 'leroy merlin', 'maisons du monde'],
    subfamilies: [],
  },
  {
    id: 'offerte-cibo-supermercati',
    label: 'Cibo & Supermercati',
    icon: '🛒',
    anchor: { lat: -20.9, lng: -90 }, // distribuzione uniforme sull'oceano
    aliases: ['cibo', 'supermercati', 'volantini', 'esselunga', 'coop', 'conad', 'lidl', 'eurospin'],
    subfamilies: [],
  },
  {
    id: 'offerte-abbigliamento',
    label: 'Abbigliamento',
    icon: '👕',
    anchor: { lat: 16.6, lng: -127.3 }, // distribuzione uniforme sull'oceano
    aliases: ['abbigliamento', 'vestiti', 'moda'],
    subfamilies: [],
  },
  {
    id: 'offerte-scarpe',
    label: 'Scarpe',
    icon: '👟',
    anchor: { lat: -17.1, lng: -10.6 }, // distribuzione uniforme sull'oceano
    aliases: ['scarpe', 'sneaker', 'calzature'],
    subfamilies: [],
  },
  {
    id: 'offerte-elettronica',
    label: 'Elettronica',
    icon: '💻',
    anchor: { lat: 10.2, lng: 72.6 }, // distribuzione uniforme sull'oceano
    aliases: ['elettronica', 'informatica', 'smartphone', 'elettrodomestici'],
    subfamilies: [],
  },
  {
    id: 'offerte-bellezza-cura-persona',
    label: 'Bellezza & Cura persona',
    icon: '💄',
    anchor: { lat: -49.7, lng: 116.2 }, // distribuzione uniforme sull'oceano
    aliases: ['bellezza', 'cura persona', 'cosmetici', 'profumeria'],
    subfamilies: [],
  },
  {
    id: 'offerte-sport-outdoor',
    label: 'Sport & Outdoor',
    icon: '⚽',
    anchor: { lat: 35.5, lng: -20.5 }, // distribuzione uniforme sull'oceano
    aliases: ['sport', 'outdoor', 'decathlon'],
    subfamilies: [],
  },
  {
    id: 'offerte-bambini-giocattoli',
    label: 'Bambini & Giocattoli',
    icon: '🧸',
    anchor: { lat: -35.3, lng: -45 }, // distribuzione uniforme sull'oceano
    aliases: ['bambini', 'giocattoli', 'giochi'],
    subfamilies: [],
  },
  {
    id: 'offerte-viaggi-voli',
    label: 'Viaggi & Voli',
    icon: '✈️',
    anchor: { lat: 0, lng: 159.1 }, // distribuzione uniforme sull'oceano
    aliases: ['viaggi', 'voli', 'hotel', 'vacanze'],
    subfamilies: [],
  },
  {
    id: 'offerte-fai-da-te-giardino',
    label: 'Fai da te & Giardino',
    icon: '🔨',
    anchor: { lat: 16.6, lng: 127.3 }, // distribuzione uniforme sull'oceano
    aliases: ['fai da te', 'giardino', 'bricolage'],
    subfamilies: [],
  },
  {
    id: 'offerte-auto-moto',
    label: 'Auto & Moto',
    icon: '🚗',
    anchor: { lat: -49.7, lng: -116.2 }, // distribuzione uniforme sull'oceano
    aliases: ['auto', 'moto', 'veicoli'],
    subfamilies: [],
  },
  {
    id: 'offerte-codici-sconto',
    label: 'Codici sconto',
    icon: '🎟️',
    anchor: { lat: -35.3, lng: 45 }, // distribuzione uniforme sull'oceano
    aliases: ['codici sconto', 'coupon', 'sconti'],
    subfamilies: [],
  },
];

// Le 12 categorie "Offerte" condividono lo stesso componente
// (VetrinaOfferteColumn, parametrizzato dalla categoria) invece di averne
// uno a testa: aggiungere o rinominare un'offerta si fa da questa lista
// sola, senza toccare ArteExplorer.jsx (vedi il branch lì).
// Anche "Novità" usa la colonna delle offerte: mostra le ultime di tutte le
// categorie (vedi listDeals in data/vetrinaDeals.js).
export const VETRINA_OFFERTE_CATEGORY_IDS = VETRINA_CATEGORIES.filter((c) => c.id === 'novita' || c.id.startsWith('offerte-')).map(
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
