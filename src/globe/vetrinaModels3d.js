import * as THREE from 'three';
import { fitCategoryModel } from './categoryModels3d.js';
import { ANNUNCI_BUILDERS } from './annunciModels3d.js';

// Modelli 3D "cromo + contorno rosa #ec4899" delle 14 categorie del mondo
// Vetrina, al posto dei triangoli (vedi categoryShell.js, shapeType
// 'vetrina'). Misure e pezzi sono quelli del riferimento approvato (foto di
// anteprima), costruiti con il kit condiviso di valigetta e Annunci
// (categoryModels3d.js: env map unica, materiali, helper). Maglietta e auto
// sono gli stessi modelli del mondo Annunci. In Vetrina il kit ha luci e
// finestre #ffd6ea e accento rosa (stella della borsa, punta del rossetto).
//
// Ogni modello guarda verso +z; fitCategoryModel lo centra e lo porta a un
// ingombro di 2.7 x 2.1, conservando le inclinazioni del modello (portatile
// inclinato verso chi guarda, pallone, aereo, martello, buono).
// Una categoria senza modello qui resta sul triangolo visibile.

const HALF = Math.PI / 2;

// ---- NOVITÀ (borsa della spesa con stella) ----
function bag(k) {
  const { MAT, V, t, box, ext, poly, track } = k;
  const g = new THREE.Group();
  box(g, 1.55, 1.7, 0.62, MAT.body, V(0, 0.85, 0), { r: 0.06 });
  box(g, 1.57, 0.16, 0.64, MAT.shiny, V(0, 1.62, 0), { o: false, r: 0.03 });
  for (const z of [-0.2, 0.2]) {
    const curve = new THREE.CatmullRomCurve3([V(-0.42, 1.68, z), V(-0.36, 2.1, z), V(0, 2.3, z), V(0.36, 2.1, z), V(0.42, 1.68, z)]);
    g.add(new THREE.Mesh(track(new THREE.TubeGeometry(curve, 40, 0.045, 12)), MAT.dark));
    if (MAT.out) g.add(new THREE.Mesh(track(new THREE.TubeGeometry(curve, 40, 0.045 + t, 12)), MAT.out));
  }
  const star = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? 0.46 : 0.15;
    star.push([Math.cos(a) * r, Math.sin(a) * r + 0.78]);
  }
  ext(g, poly(star), 0.1, MAT.accent, { bevel: 0.03, o: false, z: 0.33 });
  return g;
}

// ---- ANIMALI (zampa su medaglia) ----
function paw(k) {
  const { MAT, V, cyl, ext } = k;
  const g = new THREE.Group();
  cyl(g, 1.3, 0.22, MAT.dark, V(0, 0, 0), { rot: [HALF, 0, 0] });
  const ell = (cx, cy, rx, ry, rot) => {
    const s = new THREE.Shape();
    s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, rot);
    return s;
  };
  const pads = [
    ell(0, -0.32, 0.56, 0.46, 0),
    ell(-0.72, 0.2, 0.2, 0.27, 0.45),
    ell(-0.27, 0.58, 0.22, 0.3, 0.12),
    ell(0.27, 0.58, 0.22, 0.3, -0.12),
    ell(0.72, 0.2, 0.2, 0.27, -0.45),
  ];
  pads.forEach((s) => ext(g, s, 0.3, MAT.body, { bevel: 0.1, o: false, z: 0.2 }));
  return g;
}

// ---- CASA & ARREDAMENTO (divano) ----
function sofa(k) {
  const { MAT, V, box, cyl } = k;
  const g = new THREE.Group();
  box(g, 2.2, 0.45, 0.95, MAT.body, V(0, 0.42, 0), { r: 0.1 });
  box(g, 2.2, 0.95, 0.3, MAT.body, V(0, 0.9, -0.36), { r: 0.12 });
  for (const x of [-1.12, 1.12]) box(g, 0.36, 0.8, 1.0, MAT.shiny, V(x, 0.58, 0), { r: 0.14 });
  for (const x of [-0.47, 0.47]) {
    box(g, 0.9, 0.2, 0.72, MAT.dark, V(x, 0.72, 0.1), { o: false, r: 0.08 });
    box(g, 0.86, 0.55, 0.16, MAT.dark, V(x, 1.06, -0.2), { o: false, r: 0.07, rot: [-0.18, 0, 0] });
  }
  for (const x of [-1.0, 1.0]) for (const z of [-0.35, 0.38]) cyl(g, 0.06, 0.22, MAT.dark, V(x, 0.1, z));
  return g;
}

// ---- CIBO & SUPERMERCATI (carrello) ----
function cart(k) {
  const { MAT, V, box, cyl, bar, ext, poly } = k;
  const g = new THREE.Group();
  ext(g, poly([[-0.78, 1.4], [0.98, 1.4], [0.72, 0.58], [-0.56, 0.58]]), 0.92, MAT.body, { bevel: 0.05 });
  for (const y of [0.82, 1.02, 1.22]) box(g, 1.75, 0.035, 0.95, MAT.dark, V(0.1, y, 0), { o: false, r: 0.01 });
  for (const x of [-0.35, 0.05, 0.45]) box(g, 0.035, 0.8, 0.95, MAT.dark, V(x, 1.0, 0), { o: false, r: 0.01 });
  for (const z of [-0.42, 0.42]) {
    bar(g, V(-0.78, 1.4, z), V(-1.2, 1.68, z), 0.045, MAT.shiny);
    bar(g, V(-0.56, 0.58, z), V(-0.5, 0.2, z), 0.045, MAT.shiny);
    bar(g, V(0.72, 0.58, z), V(0.74, 0.2, z), 0.045, MAT.shiny);
    bar(g, V(-0.62, 0.24, z), V(0.82, 0.24, z), 0.045, MAT.shiny);
    for (const x of [-0.5, 0.74]) cyl(g, 0.15, 0.1, MAT.rubber, V(x, 0.12, z), { rot: [HALF, 0, 0] });
  }
  bar(g, V(-1.2, 1.68, -0.5), V(-1.2, 1.68, 0.5), 0.06, MAT.dark);
  return g;
}

// ---- SCARPE (sneaker, senza loghi né strisce) ----
function sneaker(k) {
  const { MAT, V, box, bar, ext } = k;
  const g = new THREE.Group();
  const u = new THREE.Shape();
  u.moveTo(-1.22, 0.26);
  u.lineTo(-1.3, 1.22);
  u.quadraticCurveTo(-1.1, 1.36, -0.92, 1.2);
  u.quadraticCurveTo(-0.72, 1.02, -0.5, 1.2);
  u.quadraticCurveTo(-0.34, 1.34, -0.2, 1.2);
  u.quadraticCurveTo(0.35, 0.82, 0.88, 0.7);
  u.quadraticCurveTo(1.36, 0.62, 1.34, 0.26);
  u.closePath();
  ext(g, u, 0.8, MAT.body, { bevel: 0.08 });
  const so = new THREE.Shape();
  so.moveTo(-1.32, 0);
  so.lineTo(1.2, 0);
  so.quadraticCurveTo(1.46, 0.04, 1.42, 0.34);
  so.lineTo(-1.32, 0.34);
  so.closePath();
  ext(g, so, 0.92, MAT.dark, { bevel: 0.06 });
  box(g, 2.5, 0.07, 0.94, MAT.shiny, V(0.04, 0.36, 0), { o: false, r: 0.03 }); // bordo suola
  [[-0.12, 1.14], [0.1, 1.0], [0.32, 0.9], [0.54, 0.82]].forEach(([x, y]) =>
    bar(g, V(x, y + 0.03, -0.3), V(x, y + 0.03, 0.3), 0.045, MAT.dark, { o: false })
  ); // lacci
  const cap = new THREE.Shape();
  cap.moveTo(0.82, 0.3);
  cap.lineTo(0.82, 0.72);
  cap.quadraticCurveTo(1.36, 0.62, 1.34, 0.3);
  cap.closePath();
  ext(g, cap, 0.84, MAT.shiny, { bevel: 0.08, o: false }); // puntale
  box(g, 0.16, 0.4, 0.5, MAT.dark, V(-1.27, 1.05, 0), { o: false, r: 0.04 }); // linguetta tallone
  return g;
}

// ---- ELETTRONICA (portatile) ----
function laptop(k) {
  const { MAT, V, box } = k;
  const g = new THREE.Group();
  box(g, 2.3, 0.1, 1.5, MAT.body, V(0, 0.05, 0), { r: 0.04 });
  box(g, 1.9, 0.02, 0.72, MAT.dark, V(0, 0.105, -0.22), { o: false, r: 0.008 });
  box(g, 0.6, 0.02, 0.36, MAT.shiny, V(0, 0.105, 0.44), { o: false, r: 0.008 });
  const sg = new THREE.Group();
  box(sg, 2.3, 1.45, 0.08, MAT.body, V(0, 0.725, 0), { r: 0.035 });
  box(sg, 2.1, 1.25, 0.02, MAT.dark, V(0, 0.735, 0.04), { o: false, r: 0.008 });
  box(sg, 2.0, 1.15, 0.02, MAT.light, V(0, 0.735, 0.046), { o: false, r: 0.008 }); // schermo acceso
  sg.position.set(0, 0.08, -0.74);
  sg.rotation.x = -0.28;
  g.add(sg);
  // Inclinato verso chi guarda: tastiera e schermo sempre visibili, anche
  // quando la categoria sta in alto o in basso sul globo. Non raddrizzarlo:
  // dal basso si vedrebbe solo il fondo.
  g.rotation.x = 0.75;
  return g;
}

// ---- BELLEZZA & CURA PERSONA (rossetto con cappuccio) ----
function lipstick(k) {
  const { MAT, V, t, cyl, put, track } = k;
  const g = new THREE.Group();
  cyl(g, 0.32, 0.9, MAT.dark, V(0, 0.45, 0));
  cyl(g, 0.345, 0.12, MAT.shiny, V(0, 0.93, 0));
  cyl(g, 0.27, 0.55, MAT.body, V(0, 1.26, 0));
  // Punta tagliata in obliquo.
  const tip = (r, h, extra) => {
    const geo = new THREE.CylinderGeometry(r, r, h, 32);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i += 1) if (p.getY(i) > 0) p.setY(i, p.getY(i) + (p.getX(i) / r) * 0.2 + extra);
    geo.computeVertexNormals();
    return track(geo);
  };
  put(g, tip(0.2, 0.6, 0), MAT.accent, V(0, 1.82, 0), null, tip(0.2 + t, 0.6, t));
  cyl(g, 0.345, 0.98, MAT.dark, V(0.95, 0.49, 0)); // cappuccio
  cyl(g, 0.36, 0.1, MAT.shiny, V(0.95, 0.9, 0), { o: false });
  return g;
}

// ---- SPORT & OUTDOOR (pallone) ----
function ball(k) {
  const { MAT, V, sph, cached } = k;
  const g = new THREE.Group();
  sph(g, 1, MAT.body, V(0, 0, 0));
  const phi = (1 + Math.sqrt(5)) / 2;
  const dirs = [];
  for (const a of [-1, 1]) for (const b of [-phi, phi]) dirs.push(V(0, a, b), V(a, b, 0), V(b, 0, a));
  const cap = cached('vetrina:ball-cap', () => new THREE.SphereGeometry(1.012, 5, 4, 0, Math.PI * 2, 0, 0.36));
  dirs.forEach((d) => {
    const m = new THREE.Mesh(cap, MAT.dark);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    g.add(m);
  });
  g.rotation.set(0.5, 0.3, 0);
  return g;
}

// ---- BAMBINI & GIOCATTOLI (orsetto) ----
function teddy(k) {
  const { MAT, V, sph } = k;
  const g = new THREE.Group();
  sph(g, 0.62, MAT.body, V(0, 0.62, 0));
  sph(g, 0.5, MAT.body, V(0, 1.52, 0));
  for (const x of [-0.4, 0.4]) {
    sph(g, 0.2, MAT.body, V(x, 1.94, 0));
    sph(g, 0.1, MAT.dark, V(x, 1.94, 0.14), { o: false });
    sph(g, 0.24, MAT.body, V(x * 1.7, 0.95, 0.1));
    sph(g, 0.28, MAT.body, V(x * 1.05, 0.2, 0.3));
    sph(g, 0.13, MAT.dark, V(x * 1.05, 0.2, 0.5), { o: false });
    sph(g, 0.06, MAT.dark, V(x * 0.45, 1.64, 0.44), { o: false });
  }
  sph(g, 0.2, MAT.shiny, V(0, 1.42, 0.38), { o: false });
  sph(g, 0.07, MAT.dark, V(0, 1.48, 0.56), { o: false });
  sph(g, 0.4, MAT.shiny, V(0, 0.6, 0.3), { o: false });
  return g;
}

// ---- VIAGGI & VOLI (aereo, visto dall'alto) ----
function plane(k) {
  const { MAT, V, box, cyl, sph, ext, poly } = k;
  const g = new THREE.Group();
  cyl(g, 0.2, 2.0, MAT.body, V(0, 0, 0), { rot: [0, 0, HALF] });
  sph(g, 0.2, MAT.body, V(1.0, 0, 0));
  sph(g, 0.2, MAT.body, V(-1.0, 0, 0));
  for (const sy of [-1, 1]) {
    ext(g, poly([[0.3, sy * 0.12], [-0.15, sy * 0.12], [-0.8, sy * 1.4], [-0.5, sy * 1.4]]), 0.09, MAT.shiny, { bevel: 0.035 });
    ext(g, poly([[-0.74, sy * 0.1], [-0.98, sy * 0.1], [-1.22, sy * 0.58], [-1.06, sy * 0.58]]), 0.08, MAT.shiny, { bevel: 0.03 });
    cyl(g, 0.1, 0.36, MAT.dark, V(-0.05, sy * 0.6, 0.02), { rot: [0, 0, HALF] });
  }
  box(g, 0.4, 0.07, 0.5, MAT.dark, V(-0.98, 0, 0.3), { r: 0.03 });
  sph(g, 0.13, MAT.glass, V(0.88, 0, 0.13), { o: false });
  for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) sph(g, 0.045, MAT.glass, V(x, 0, 0.19), { o: false });
  g.rotation.z = 0.62;
  return g;
}

// ---- FAI DA TE & GIARDINO (martello) ----
function hammer(k) {
  const { MAT, V, box, cyl, bar, ext, poly } = k;
  const g = new THREE.Group();
  bar(g, V(0, 0.6, 0), V(0, 1.9, 0), 0.085, MAT.shiny);
  bar(g, V(0, 0, 0), V(0, 0.75, 0), 0.125, MAT.rubber);
  box(g, 1.0, 0.38, 0.38, MAT.body, V(0.08, 1.98, 0), { r: 0.06 });
  cyl(g, 0.22, 0.2, MAT.shiny, V(0.66, 1.98, 0), { rot: [0, 0, HALF] });
  ext(g, poly([[-0.4, 2.17], [-0.4, 1.79], [-0.95, 1.56], [-1.08, 1.7]]), 0.3, MAT.body, { bevel: 0.05 });
  g.rotation.z = -0.55;
  return g;
}

// ---- CODICI SCONTO (buono con %) ----
function coupon(k) {
  const { MAT, V, sph, torus, bar, ext } = k;
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-1.3, -0.72);
  s.lineTo(1.3, -0.72);
  s.lineTo(1.3, -0.2);
  s.absarc(1.3, 0, 0.2, -HALF, HALF, true);
  s.lineTo(1.3, 0.72);
  s.lineTo(-1.3, 0.72);
  s.lineTo(-1.3, 0.2);
  s.absarc(-1.3, 0, 0.2, HALF, -HALF, true);
  s.closePath();
  ext(g, s, 0.22, MAT.body, { bevel: 0.05 });
  torus(g, 0.17, 0.055, MAT.dark, V(-0.52, 0.28, 0.13), { o: false });
  torus(g, 0.17, 0.055, MAT.dark, V(0.02, -0.28, 0.13), { o: false });
  bar(g, V(-0.58, -0.44, 0.13), V(0.08, 0.44, 0.13), 0.055, MAT.dark, { o: false });
  for (let i = 0; i < 6; i += 1) sph(g, 0.045, MAT.dark, V(0.68, -0.5 + i * 0.2, 0.11), { o: false });
  g.rotation.z = 0.18;
  return g;
}

const VETRINA_BUILDERS = {
  novita: bag,
  'offerte-animali': paw,
  'offerte-casa-arredamento': sofa,
  'offerte-cibo-supermercati': cart,
  'offerte-abbigliamento': ANNUNCI_BUILDERS.abbigliamento,
  'offerte-scarpe': sneaker,
  'offerte-elettronica': laptop,
  'offerte-bellezza-cura-persona': lipstick,
  'offerte-sport-outdoor': ball,
  'offerte-bambini-giocattoli': teddy,
  'offerte-viaggi-voli': plane,
  'offerte-fai-da-te-giardino': hammer,
  'offerte-auto-moto': ANNUNCI_BUILDERS.auto,
  'offerte-codici-sconto': coupon,
};

export function createVetrinaModel(kit, categoryId) {
  const build = VETRINA_BUILDERS[categoryId];
  return build ? fitCategoryModel(kit, build) : null;
}
