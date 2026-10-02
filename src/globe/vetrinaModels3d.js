import { fitCategoryModel } from './categoryModels3d.js';
import { ANNUNCI_BUILDERS } from './annunciModels3d.js';

// Modelli 3D "cromo + contorno rosa #ec4899" delle 14 categorie del mondo
// Vetrina, al posto dei triangoli (vedi categoryShell.js, shapeType
// 'vetrina'). Stesso kit condiviso di valigetta e Annunci
// (categoryModels3d.js): env map unica, materiali, helper. Maglietta e auto
// sono gli stessi modelli del mondo Annunci (già approvati).
//
// Una categoria senza modello qui resta sul triangolo visibile.
//
// DA COMPLETARE: gli altri 12 modelli (borsa con stella, zampa su medaglia,
// divano, carrello, sneaker, portatile, rossetto, pallone, orsetto, aereo,
// martello, buono "%") vanno portati dal file di riferimento approvato
// (categorie-modelli-3d-riferimento.js), con le sue misure.
const VETRINA_BUILDERS = {
  'offerte-abbigliamento': ANNUNCI_BUILDERS.abbigliamento,
  'offerte-auto-moto': ANNUNCI_BUILDERS.auto,
};

export function createVetrinaModel(kit, categoryId) {
  const build = VETRINA_BUILDERS[categoryId];
  return build ? fitCategoryModel(kit, build) : null;
}
