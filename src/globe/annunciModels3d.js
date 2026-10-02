import * as THREE from 'three';
import { fitCategoryModel } from './categoryModels3d.js';

// Modelli 3D "cromo + contorno arancione" delle sette categorie del mondo
// Annunci, al posto delle sagome piatte (vedi categoryShell.js). Misure e
// pezzi sono quelli del riferimento approvato (foto di anteprima), costruiti
// con il kit condiviso dei modelli 3D (categoryModels3d.js: env map unica,
// materiali, helper), lo stesso della valigetta del mondo Lavoro.
//
// Ogni modello guarda verso +z (lato visibile). Unità locali, poi fit() lo
// centra e lo porta a un ingombro standard di 2.7 x 2.1; categoryShell.js lo
// scala alla larghezza della sagoma piatta della categoria.

const HALF = Math.PI / 2;

// ---- AUTO ----
function car(k) {
  const { MAT, V, ext, box, cyl } = k;
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-1.42, 0.32);
  s.lineTo(-1.42, 0.62);
  s.quadraticCurveTo(-1.42, 0.8, -1.25, 0.82);
  s.lineTo(-0.98, 0.86);
  s.quadraticCurveTo(-0.72, 1.32, -0.35, 1.32);
  s.lineTo(0.22, 1.32);
  s.quadraticCurveTo(0.5, 1.32, 0.84, 0.88);
  s.lineTo(1.28, 0.78);
  s.quadraticCurveTo(1.44, 0.74, 1.44, 0.56);
  s.lineTo(1.44, 0.32);
  s.closePath();
  ext(g, s, 1.05, MAT.body, { bevel: 0.07 });
  const w = new THREE.Shape();
  w.moveTo(-0.8, 0.9);
  w.quadraticCurveTo(-0.6, 1.22, -0.36, 1.23);
  w.lineTo(0.2, 1.23);
  w.quadraticCurveTo(0.42, 1.22, 0.7, 0.9);
  w.closePath();
  ext(g, w, 1.09, MAT.glass, { bevel: 0.01, o: false });
  box(g, 0.08, 0.36, 1.11, MAT.body, V(-0.06, 1.06, 0), { o: false, r: 0.02 });
  for (const x of [-0.86, 0.88]) {
    for (const z of [-0.47, 0.47]) {
      cyl(g, 0.33, 0.24, MAT.rubber, V(x, 0.33, z), { rot: [HALF, 0, 0] });
      cyl(g, 0.19, 0.27, MAT.shiny, V(x, 0.33, z), { rot: [HALF, 0, 0], o: false });
    }
  }
  for (const z of [-0.33, 0.33]) {
    box(g, 0.06, 0.13, 0.24, MAT.light, V(1.43, 0.62, z), { o: false, r: 0.02 });
    box(g, 0.06, 0.1, 0.24, MAT.red, V(-1.41, 0.66, z), { o: false, r: 0.02 });
  }
  box(g, 0.1, 0.06, 0.3, MAT.dark, V(0.4, 0.74, 0.5), { o: false, r: 0.02 }); // maniglia
  return g;
}

// ---- MOTO ----
function moto(k) {
  const { MAT, V, ext, box, cyl, sph, torus, bar } = k;
  const g = new THREE.Group();
  for (const x of [-0.95, 0.95]) {
    torus(g, 0.4, 0.11, MAT.rubber, V(x, 0.51, 0));
    cyl(g, 0.3, 0.06, MAT.shiny, V(x, 0.51, 0), { rot: [HALF, 0, 0], o: false });
    cyl(g, 0.09, 0.2, MAT.dark, V(x, 0.51, 0), { rot: [HALF, 0, 0], o: false });
  }
  const s = new THREE.Shape();
  s.moveTo(-1.15, 1.08);
  s.lineTo(-0.35, 0.98);
  s.quadraticCurveTo(-0.15, 1.3, 0.2, 1.32);
  s.quadraticCurveTo(0.6, 1.3, 0.62, 1.02);
  s.lineTo(0.42, 0.62);
  s.lineTo(-0.3, 0.62);
  s.lineTo(-0.55, 0.86);
  s.lineTo(-1.1, 0.94);
  s.closePath();
  ext(g, s, 0.36, MAT.body, { bevel: 0.07 });
  box(g, 0.62, 0.42, 0.44, MAT.dark, V(0.05, 0.52, 0), { r: 0.08 }); // motore
  box(g, 0.78, 0.11, 0.3, MAT.dark, V(-0.68, 1.1, 0), { r: 0.05, o: false, rot: [0, 0, 0.12] }); // sella
  for (const z of [-0.15, 0.15]) bar(g, V(0.95, 0.51, z), V(0.58, 1.4, z), 0.045, MAT.shiny); // forcella
  bar(g, V(0.56, 1.44, -0.42), V(0.56, 1.44, 0.42), 0.04, MAT.dark); // manubrio
  sph(g, 0.14, MAT.shiny, V(0.78, 1.18, 0)); // faro
  cyl(g, 0.08, 0.03, MAT.light, V(0.91, 1.18, 0), { rot: [0, 0, HALF], o: false });
  bar(g, V(-0.95, 0.51, 0.16), V(-0.2, 0.62, 0.16), 0.045, MAT.shiny); // forcellone
  bar(g, V(-1.12, 0.66, 0.24), V(-0.05, 0.4, 0.24), 0.075, MAT.shiny); // scarico
  return g;
}

// ---- BICICLETTA ----
function bike(k) {
  const { MAT, V, box, cyl, torus, bar, barsMerged } = k;
  const g = new THREE.Group();
  const A = V(-0.88, 0.62);
  const B = V(-0.14, 0.6);
  const S = V(-0.3, 1.28);
  const H = V(0.5, 1.3);
  const H2 = V(0.56, 1.08);
  const F = V(0.88, 0.62);
  // I 20 raggi (10 per ruota) uniti in una sola geometria.
  const spokes = [];
  for (const c of [A, F]) {
    torus(g, 0.56, 0.05, MAT.rubber, c);
    torus(g, 0.5, 0.022, MAT.shiny, c, { o: false });
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      spokes.push([c, c.clone().add(V(Math.cos(a) * 0.5, Math.sin(a) * 0.5))]);
    }
    cyl(g, 0.05, 0.12, MAT.dark, c, { rot: [HALF, 0, 0], o: false });
  }
  barsMerged(g, spokes, 0.008, MAT.shiny);
  const r = 0.045;
  bar(g, A, B, r, MAT.body);
  bar(g, B, S, r, MAT.body);
  bar(g, S, H, r, MAT.body);
  bar(g, B, H2, r, MAT.body);
  bar(g, A, S, r * 0.8, MAT.body);
  bar(g, H, H2, r, MAT.body);
  bar(g, H2, F, r, MAT.shiny);
  bar(g, S, V(-0.33, 1.46), r * 0.8, MAT.shiny);
  box(g, 0.38, 0.07, 0.16, MAT.dark, V(-0.37, 1.5, 0), { r: 0.03 });
  bar(g, H, V(0.46, 1.52), r * 0.8, MAT.shiny);
  bar(g, V(0.46, 1.52, -0.3), V(0.46, 1.52, 0.3), 0.035, MAT.dark);
  cyl(g, 0.12, 0.05, MAT.shiny, V(B.x, B.y, 0.07), { rot: [HALF, 0, 0], o: false });
  bar(g, V(B.x, B.y, 0.1), V(B.x + 0.14, B.y - 0.2, 0.1), 0.02, MAT.dark, { o: false });
  box(g, 0.14, 0.03, 0.1, MAT.dark, V(B.x + 0.14, B.y - 0.21, 0.16), { o: false, r: 0.01 });
  return g;
}

// ---- BARCA (a vela) ----
function boat(k) {
  const { MAT, V, ext, box, bar, poly } = k;
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-1.2, 0.56);
  s.lineTo(1.38, 0.6);
  s.quadraticCurveTo(1.05, 0.08, 0.6, 0.08);
  s.lineTo(-0.85, 0.08);
  s.quadraticCurveTo(-1.15, 0.1, -1.2, 0.56);
  s.closePath();
  ext(g, s, 0.62, MAT.body, { bevel: 0.12 });
  box(g, 2.2, 0.05, 0.5, MAT.dark, V(0, 0.585, 0), { o: false, r: 0.02 }); // ponte
  bar(g, V(0.05, 0.56), V(0.05, 2.15), 0.04, MAT.shiny); // albero
  ext(g, poly([[-0.03, 0.78], [-0.03, 2.08], [-1.08, 0.78]]), 0.07, MAT.shiny, { bevel: 0.025 });
  ext(g, poly([[0.14, 0.74], [0.14, 1.92], [1.18, 0.74]]), 0.07, MAT.body, { bevel: 0.025 });
  box(g, 0.5, 0.2, 0.3, MAT.shiny, V(-0.45, 0.7, 0), { r: 0.06 }); // cabina
  return g;
}

// ---- CASA ----
function house(k) {
  const { MAT, V, ext, box, sph, poly } = k;
  const g = new THREE.Group();
  box(g, 1.9, 1.15, 1.3, MAT.body, V(0, 0.575, 0), { r: 0.04 });
  ext(g, poly([[-1.18, 1.08], [0, 1.95], [1.18, 1.08]]), 1.5, MAT.dark, { bevel: 0.05 });
  box(g, 0.24, 0.55, 0.24, MAT.body, V(0.62, 1.62, -0.2), { r: 0.03 }); // camino
  box(g, 0.4, 0.66, 0.06, MAT.dark, V(0, 0.34, 0.65), { o: false, r: 0.03 }); // porta
  sph(g, 0.035, MAT.shiny, V(0.12, 0.34, 0.69), { o: false });
  for (const x of [-0.6, 0.6]) {
    box(g, 0.42, 0.42, 0.05, MAT.dark, V(x, 0.66, 0.65), { o: false, r: 0.03 });
    box(g, 0.34, 0.34, 0.07, MAT.light, V(x, 0.66, 0.65), { o: false, r: 0.02 });
    box(g, 0.34, 0.03, 0.09, MAT.dark, V(x, 0.66, 0.65), { o: false, r: 0.01 });
    box(g, 0.03, 0.34, 0.09, MAT.dark, V(x, 0.66, 0.65), { o: false, r: 0.01 });
  }
  return g;
}

// ---- MAGLIETTA ----
function shirt(k) {
  const { MAT, V, ext, bar, track } = k;
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-0.32, 1.55);
  s.lineTo(-0.72, 1.48);
  s.lineTo(-1.38, 1.1);
  s.lineTo(-1.1, 0.7);
  s.lineTo(-0.72, 0.92);
  s.lineTo(-0.72, -0.1);
  s.lineTo(0.72, -0.1);
  s.lineTo(0.72, 0.92);
  s.lineTo(1.1, 0.7);
  s.lineTo(1.38, 1.1);
  s.lineTo(0.72, 1.48);
  s.lineTo(0.32, 1.55);
  s.quadraticCurveTo(0, 1.18, -0.32, 1.55);
  ext(g, s, 0.34, MAT.body, { bevel: 0.12 });
  const curve = new THREE.QuadraticBezierCurve3(V(-0.33, 1.55, 0.13), V(0, 1.16, 0.13), V(0.33, 1.55, 0.13));
  g.add(new THREE.Mesh(track(new THREE.TubeGeometry(curve, 24, 0.055, 12)), MAT.dark)); // colletto
  for (const sx of [-1, 1]) bar(g, V(sx * 1.36, 1.07, 0.13), V(sx * 1.09, 0.69, 0.13), 0.04, MAT.dark, { o: false }); // orlo maniche
  bar(g, V(-0.7, -0.06, 0.14), V(0.7, -0.06, 0.14), 0.035, MAT.dark, { o: false }); // orlo
  return g;
}

// ---- OGGETTI VARI (pacco con fiocco) ----
function parcel(k) {
  const { MAT, V, box, sph, torus } = k;
  const g = new THREE.Group();
  box(g, 1.6, 1.05, 1.2, MAT.body, V(0, 0.525, 0), { r: 0.05 });
  box(g, 1.74, 0.3, 1.34, MAT.shiny, V(0, 1.12, 0), { r: 0.05 });
  box(g, 0.26, 1.3, 1.36, MAT.dark, V(0, 0.63, 0), { o: false, r: 0.02 });
  box(g, 1.76, 1.3, 0.26, MAT.dark, V(0, 0.63, 0), { o: false, r: 0.02 });
  for (const sx of [-1, 1]) torus(g, 0.2, 0.065, MAT.dark, V(sx * 0.24, 1.44, 0), { rot: [0, 0, sx * 0.5] });
  sph(g, 0.11, MAT.dark, V(0, 1.32, 0));
  return g;
}

// Costruttori per categoria (usati anche dal mondo Vetrina per maglietta e
// auto, vedi vetrinaModels3d.js).
export const ANNUNCI_BUILDERS = {
  auto: car,
  moto,
  biciclette: bike,
  barche: boat,
  case: house,
  abbigliamento: shirt,
  'oggetti-vari': parcel,
};

export function createAnnunciModel(kit, categoryId) {
  const build = ANNUNCI_BUILDERS[categoryId];
  return build ? fitCategoryModel(kit, build) : null;
}
