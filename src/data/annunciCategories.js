import { ANNUNCI_CATEGORIES_META } from './annunciSchema';

// Categorie del mondo Annunci (arancione): stessa struttura di
// VETRINA_CATEGORIES/LAVORO_CATEGORIES (id/label/icon/anchor/aliases),
// stesso meccanismo di triangoli sul globo — con una sagoma dedicata per
// categoria invece del triangolo, vedi CATEGORY_SHAPE_BY_WORLD in
// WorldGlobe.jsx e buildCategoryFaceShape in categoryShell.js. Ogni
// categoria mostra dentro di sé le schede Vendita/Affitto (AnnunciColumn),
// non sono categorie separate. Anchor sull'oceano, verificati uno per uno
// contro land-110m.geojson.json, e sparpagliati su 7 bacini oceanici
// diversi (non solo per estetica: più le direzioni sono distanti, meno
// probabile che due categorie finiscano vicine sul guscio — margine reale
// in più, vedi marginRings in categoryShell.js).
export const ANNUNCI_CATEGORIES = [
  {
    id: 'auto',
    label: ANNUNCI_CATEGORIES_META.auto.label,
    icon: ANNUNCI_CATEGORIES_META.auto.icon,
    anchor: { lat: 20, lng: -150 }, // Pacifico settentrionale
    aliases: ['auto', 'automobile', 'macchina', 'macchine'],
    subfamilies: [],
  },
  {
    id: 'moto',
    label: ANNUNCI_CATEGORIES_META.moto.label,
    icon: ANNUNCI_CATEGORIES_META.moto.icon,
    anchor: { lat: -25, lng: -99 }, // Pacifico meridionale, al largo del Cile
    aliases: ['moto', 'motocicletta', 'motociclette', 'scooter'],
    subfamilies: [],
  },
  {
    id: 'biciclette',
    label: ANNUNCI_CATEGORIES_META.biciclette.label,
    icon: ANNUNCI_CATEGORIES_META.biciclette.icon,
    anchor: { lat: 20, lng: -47 }, // Atlantico equatoriale
    aliases: ['biciclette', 'bici', 'bicicletta', 'ebike'],
    subfamilies: [],
  },
  {
    id: 'barche',
    label: ANNUNCI_CATEGORIES_META.barche.label,
    icon: ANNUNCI_CATEGORIES_META.barche.icon,
    anchor: { lat: -25, lng: 4 }, // Atlantico meridionale
    aliases: ['barche', 'barca', 'gommone', 'yacht'],
    subfamilies: [],
  },
  {
    id: 'case',
    label: ANNUNCI_CATEGORIES_META.case.label,
    icon: ANNUNCI_CATEGORIES_META.case.icon,
    anchor: { lat: 10, lng: 70 }, // Mar Arabico
    aliases: ['case', 'casa', 'immobili', 'affitto', 'appartamento'],
    subfamilies: [],
  },
  {
    id: 'abbigliamento',
    label: ANNUNCI_CATEGORIES_META.abbigliamento.label,
    icon: ANNUNCI_CATEGORIES_META.abbigliamento.icon,
    anchor: { lat: -25, lng: 107 }, // Oceano Indiano orientale
    aliases: ['abbigliamento', 'accessori', 'vestiti', 'moda', 'scarpe', 'borse'],
    subfamilies: [],
  },
  {
    id: 'oggetti-vari',
    label: ANNUNCI_CATEGORIES_META['oggetti-vari'].label,
    icon: ANNUNCI_CATEGORIES_META['oggetti-vari'].icon,
    anchor: { lat: 20, lng: 159 }, // Pacifico occidentale
    aliases: ['oggetti vari', 'oggetti', 'varie', 'altro', 'elettronica', 'arredamento'],
    subfamilies: [],
  },
];

export function resolveCategoryQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    ANNUNCI_CATEGORIES.find((c) => c.label.toLowerCase() === q || c.aliases.some((a) => a.toLowerCase() === q)) ??
    ANNUNCI_CATEGORIES.find((c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))) ??
    null
  );
}
