// Categorie del mondo Animali (marrone/verde): per ora solo "Amici a 4
// zampe" (id interno 'cani', tabelle dog_* invariate) (mappa
// reale di luoghi pet-friendly + recensioni, componente dedicato
// DogWorldMap — vedi AnimaliWorldExplorer.jsx), spostata qui dal mondo
// Vetrina — stessa struttura di LAVORO_CATEGORIES/SOCIAL_CATEGORIES, stesso
// meccanismo di triangoli sul globo (vedi App.jsx, CATEGORY_WORLDS).
//
// Anchor deliberatamente in mezzo all'oceano (stesso motivo delle altre
// categorie "globali": un triangolo grande e semi-trasparente su
// terraferma finirebbe sopra ai marker degli utenti di quella zona),
// riuso lo stesso punto già verificato contro land-110m.geojson.json.
export const ANIMALI_CATEGORIES = [
  {
    id: 'cani',
    label: 'Amici a 4 zampe',
    icon: '🐕',
    // Vicino al centro della vista d'arrivo (la camera entra nel mondo
    // puntata su lat 0 / lng 0, vedi WorldGlobe.jsx): la sagoma si aggancia
    // al triangolo più vicino del guscio, e quello più centrale in mare è
    // sull'equatore a ~21° O (Atlantico, al largo del Golfo di Guinea).
    // Prima era nel Pacifico a est della Nuova Zelanda, dietro al globo.
    anchor: { lat: 0, lng: -18 },
    aliases: ['amici a 4 zampe', '4 zampe', 'quattro zampe', 'cani', 'cane', 'dog', 'dogs', 'animali', 'pet', 'pet friendly', 'aree cani'],
    subfamilies: [],
  },
];

export function resolveCategoryQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    ANIMALI_CATEGORIES.find(
      (c) => c.label.toLowerCase() === q || c.aliases.some((a) => a.toLowerCase() === q)
    ) ??
    ANIMALI_CATEGORIES.find(
      (c) => c.label.toLowerCase().includes(q) || c.aliases.some((a) => a.toLowerCase().includes(q))
    ) ??
    null
  );
}
