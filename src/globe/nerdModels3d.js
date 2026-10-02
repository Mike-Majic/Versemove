import { fitCategoryModel } from './categoryModels3d.js';

// Modelli 3D "cromo + contorno lime #d4f634" delle 9 categorie del mondo
// Nerd, sopra agli UFO piatti (che restano invisibili ma cliccabili, vedi
// categoryShell.js, shapeType 'ufo'). Stesso kit condiviso di valigetta,
// Annunci e Vetrina (categoryModels3d.js): env map unica, materiali, helper;
// in Nerd luci/schermi #eaffa0 e accento lime. Niente loghi, simboli o
// colori di marche reali sui modelli console.
//
// Una categoria senza modello qui resta sull'UFO visibile.
//
// DA COMPLETARE: i 9 modelli (bacheca con foglietti, dado con carta,
// monitor con case, gamepad generico, joystick arcade inclinato, console
// portatile generica, mascherina, cinepresa, pallino Live con onde) vanno
// portati dal file di riferimento approvato, con le sue misure.
const NERD_BUILDERS = {};

export function hasNerdModel(categoryId) {
  return Boolean(NERD_BUILDERS[categoryId]);
}

export function createNerdModel(kit, categoryId) {
  const build = NERD_BUILDERS[categoryId];
  return build ? fitCategoryModel(kit, build) : null;
}
