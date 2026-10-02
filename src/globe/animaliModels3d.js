import * as THREE from 'three';
import { fitCategoryModel } from './categoryModels3d.js';

// Categorie 3D del mondo Animali (sagoma piatta 'dog', vedi categoryShell.js):
// per ora solo 'cani' ("Amici a 4 zampe"). Stesso kit condiviso degli altri
// mondi (categoryModels3d.js), contorno sabbia del mondo.

// Cane in piedi di profilo, muso a destra. Cromo con orecchie, naso e
// occhi scuri; collare e medaglietta del colore del mondo (accent).
function dog(k) {
  const { MAT, V, sph, bar, track } = k;
  const g = new THREE.Group();
  // capsula: asta con una sfera a ogni estremità
  const cap = (a, b, r, mat) => {
    bar(g, a, b, r, mat);
    sph(g, r, mat, a);
    sph(g, r, mat, b);
  };
  cap(V(-0.62, 0.95, 0), V(0.5, 1.0, 0), 0.4, MAT.body); // corpo
  cap(V(0.55, 1.1, 0), V(0.92, 1.58, 0), 0.26, MAT.body); // collo
  sph(g, 0.38, MAT.body, V(1.02, 1.74, 0)); // testa
  cap(V(1.12, 1.66, 0), V(1.5, 1.58, 0), 0.19, MAT.shiny); // muso
  sph(g, 0.085, MAT.dark, V(1.68, 1.62, 0), { o: false }); // naso
  for (const z of [-0.3, 0.3]) {
    cap(V(0.9, 1.98, z), V(0.74, 1.5, z * 1.15), 0.13, MAT.dark); // orecchie
    sph(g, 0.055, MAT.dark, V(1.22, 1.86, z * 0.72), { o: false }); // occhi
    cap(V(0.42, 0.85, z * 0.8), V(0.48, 0.16, z * 0.8), 0.13, MAT.body); // zampe davanti
    cap(V(-0.6, 0.85, z * 0.8), V(-0.68, 0.16, z * 0.8), 0.13, MAT.body); // zampe dietro
    sph(g, 0.16, MAT.shiny, V(0.56, 0.13, z * 0.8)); // piedi
    sph(g, 0.16, MAT.shiny, V(-0.6, 0.13, z * 0.8));
  }
  cap(V(-0.98, 1.1, 0), V(-1.32, 1.62, 0), 0.085, MAT.body); // coda
  const collar = new THREE.Mesh(track(new THREE.TorusGeometry(0.3, 0.075, 12, 32)), MAT.accent);
  collar.position.set(0.72, 1.32, 0);
  collar.quaternion.setFromUnitVectors(V(0, 0, 1), V(0.37, 0.48, 0).normalize());
  g.add(collar);
  sph(g, 0.09, MAT.accent, V(0.86, 1.1, 0.24), { o: false }); // medaglietta
  return g;
}

export function createAnimaliModel(kit, categoryId) {
  return categoryId === 'cani' ? fitCategoryModel(kit, dog) : null;
}
