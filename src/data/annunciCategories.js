import { ANNUNCI_CATEGORIES_META } from './annunciSchema';

// Categorie del mondo Annunci (arancione): stessa struttura di
// VETRINA_CATEGORIES/LAVORO_CATEGORIES (id/label/icon/anchor/aliases),
// stesso meccanismo di triangoli sul globo. Ogni categoria mostra dentro
// di sé le schede Vendita/Affitto (AnnunciColumn), non sono categorie
// separate. Anchor sull'oceano, verificati uno per uno contro
// land-110m.geojson.json.
export const ANNUNCI_CATEGORIES = [
  {
    id: 'auto',
    label: ANNUNCI_CATEGORIES_META.auto.label,
    icon: ANNUNCI_CATEGORIES_META.auto.icon,
    anchor: { lat: 20, lng: -40 }, // Atlantico centrale
    aliases: ['auto', 'automobile', 'macchina', 'macchine'],
    subfamilies: [],
  },
  {
    id: 'moto',
    label: ANNUNCI_CATEGORIES_META.moto.label,
    icon: ANNUNCI_CATEGORIES_META.moto.icon,
    anchor: { lat: -25, lng: -140 }, // Pacifico meridionale
    aliases: ['moto', 'motocicletta', 'motociclette', 'scooter'],
    subfamilies: [],
  },
  {
    id: 'biciclette',
    label: ANNUNCI_CATEGORIES_META.biciclette.label,
    icon: ANNUNCI_CATEGORIES_META.biciclette.icon,
    anchor: { lat: 35, lng: 150 }, // Pacifico occidentale
    aliases: ['biciclette', 'bici', 'bicicletta', 'ebike'],
    subfamilies: [],
  },
  {
    id: 'barche',
    label: ANNUNCI_CATEGORIES_META.barche.label,
    icon: ANNUNCI_CATEGORIES_META.barche.icon,
    anchor: { lat: -45, lng: 20 }, // Oceano Indiano meridionale
    aliases: ['barche', 'barca', 'gommone', 'yacht'],
    subfamilies: [],
  },
  {
    id: 'case',
    label: ANNUNCI_CATEGORIES_META.case.label,
    icon: ANNUNCI_CATEGORIES_META.case.icon,
    anchor: { lat: 5, lng: -25 }, // Atlantico equatoriale
    aliases: ['case', 'casa', 'immobili', 'affitto', 'appartamento'],
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
