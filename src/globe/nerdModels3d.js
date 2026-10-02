import * as THREE from 'three';
import { fitCategoryModel } from './categoryModels3d.js';

// Modelli 3D "cromo + contorno lime #d4f634" delle 9 categorie del mondo
// Nerd, sopra agli UFO piatti (che restano invisibili ma cliccabili, vedi
// categoryShell.js, shapeType 'ufo'). Misure e pezzi sono quelli del
// riferimento approvato (foto di anteprima), costruiti con il kit condiviso
// di valigetta, Annunci e Vetrina (categoryModels3d.js): env map unica,
// materiali, helper. In Nerd schermi accesi #eaffa0 e accento lime.
//
// Niente loghi, simboli o colori di marche reali sui modelli console:
// gamepad con quattro tasti tondi uguali (uno lime), joystick arcade con
// tasti tondi, portatile tutta cromo.
//
// Ogni modello guarda verso +z; fitCategoryModel lo centra e lo porta a un
// ingombro di 2.7 x 2.1, conservando le inclinazioni (joystick
// rotation.x = 0.65, dado ruotato per mostrare tre facce).
// Una categoria senza modello qui resta sull'UFO visibile.

const HALF = Math.PI / 2;

// Due archi simmetrici (onde del segnale del Live), col loro contorno.
function arcPair(k, g, R, r, mat, center, arc, side) {
  const { MAT, t, track } = k;
  const rotZ = side > 0 ? -arc / 2 : Math.PI - arc / 2;
  const m = new THREE.Mesh(track(new THREE.TorusGeometry(R, r, 12, 36, arc)), mat);
  m.position.copy(center);
  m.rotation.z = rotZ;
  g.add(m);
  if (MAT.out) {
    const o = new THREE.Mesh(track(new THREE.TorusGeometry(R, r + t, 12, 36, arc)), MAT.out);
    o.position.copy(center);
    o.rotation.z = rotZ;
    g.add(o);
  }
}

// ---- BACHECA (bacheca con foglietti) ----
function board(k) {
  const { MAT, V, box, sph } = k;
  const g = new THREE.Group();
  box(g, 2.5, 1.8, 0.14, MAT.body, V(0, 0, 0), { r: 0.06 });
  box(g, 2.2, 1.5, 0.05, MAT.dark, V(0, 0, 0.06), { o: false, r: 0.02 });
  const notes = [
    [-0.62, 0.28, 0.62, 0.72, 0.08, MAT.shiny],
    [0.32, 0.36, 0.78, 0.52, -0.06, MAT.body],
    [0.5, -0.36, 0.62, 0.46, 0.05, MAT.light],
    [-0.52, -0.42, 0.6, 0.36, -0.04, MAT.body],
  ];
  notes.forEach(([x, y, w, h, rz, mat]) => {
    box(g, w, h, 0.03, mat, V(x, y, 0.11), { o: false, r: 0.012, rot: [0, 0, rz] });
    for (let i = 0; i < 2; i += 1) box(g, w * 0.6, 0.035, 0.02, MAT.dark, V(x, y - 0.02 - i * 0.12, 0.13), { o: false, r: 0.008, rot: [0, 0, rz] });
    sph(g, 0.055, MAT.accent, V(x, y + h / 2 - 0.08, 0.15), { o: false }); // puntina
  });
  return g;
}

// ---- GIOCHI DA TAVOLO (dado con carta dietro) ----
function dice(k) {
  const { MAT, V, box, sph } = k;
  const g = new THREE.Group();
  const card = new THREE.Group();
  box(card, 0.95, 1.4, 0.05, MAT.shiny, V(0, 0, 0), { r: 0.02 });
  box(card, 0.34, 0.34, 0.03, MAT.accent, V(0, 0, 0.03), { o: false, r: 0.02, rot: [0, 0, Math.PI / 4] }); // seme
  card.position.set(-0.95, 0.3, -0.25);
  card.rotation.z = 0.32;
  g.add(card);
  const d = new THREE.Group();
  const S = 1.25;
  const h = S / 2;
  box(d, S, S, S, MAT.body, V(0, 0, 0), { r: 0.2 });
  const pip = (x, y, z) => sph(d, 0.115, MAT.dark, V(x, y, z), { o: false });
  const q = 0.32;
  [[0, 0], [-q, -q], [q, q], [-q, q], [q, -q]].forEach(([a, b]) => pip(a, b, h - 0.03)); // 5 davanti
  [[-q, -q], [0, 0], [q, q]].forEach(([a, b]) => pip(h - 0.03, a, b)); // 3 a destra
  sph(d, 0.16, MAT.accent, V(0, h - 0.05, 0), { o: false }); // 1 sopra
  // Ruotato per mostrare tre facce: non raddrizzarlo.
  d.rotation.set(0.5, -0.65, 0);
  d.position.set(0.35, -0.1, 0.2);
  g.add(d);
  return g;
}

// ---- GAMING PC (monitor acceso e case) ----
function pc(k) {
  const { MAT, V, box, cyl } = k;
  const g = new THREE.Group();
  box(g, 2.0, 1.2, 0.1, MAT.body, V(0, 1.2, 0), { r: 0.04 });
  box(g, 1.84, 1.04, 0.02, MAT.dark, V(0, 1.2, 0.05), { o: false, r: 0.01 });
  box(g, 1.74, 0.94, 0.02, MAT.light, V(0, 1.2, 0.058), { o: false, r: 0.01 }); // schermo acceso
  box(g, 0.18, 0.5, 0.1, MAT.shiny, V(0, 0.4, 0), { r: 0.03 });
  box(g, 0.95, 0.08, 0.5, MAT.shiny, V(0, 0.16, 0.05), { r: 0.03 });
  box(g, 0.62, 1.6, 0.95, MAT.body, V(1.5, 0.92, -0.1), { r: 0.05 });
  box(g, 0.5, 1.46, 0.03, MAT.dark, V(1.5, 0.92, 0.38), { o: false, r: 0.02 });
  box(g, 0.06, 1.2, 0.04, MAT.accent, V(1.36, 0.92, 0.39), { o: false, r: 0.02 }); // striscia del case
  for (const y of [1.3, 0.9, 0.5]) cyl(g, 0.12, 0.03, MAT.glass, V(1.55, y, 0.4), { rot: [HALF, 0, 0], o: false });
  return g;
}

// ---- GAMING PS (gamepad generico, senza simboli di marca) ----
function gamepad(k) {
  const { MAT, V, box, cyl, ext } = k;
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-1.0, 0.5);
  s.lineTo(1.0, 0.5);
  s.quadraticCurveTo(1.4, 0.5, 1.4, 0.1);
  s.lineTo(1.3, -0.75);
  s.quadraticCurveTo(1.24, -1.02, 0.98, -0.96);
  s.lineTo(0.58, -0.32);
  s.lineTo(-0.58, -0.32);
  s.lineTo(-0.98, -0.96);
  s.quadraticCurveTo(-1.24, -1.02, -1.3, -0.75);
  s.lineTo(-1.4, 0.1);
  s.quadraticCurveTo(-1.4, 0.5, -1.0, 0.5);
  ext(g, s, 0.52, MAT.body, { bevel: 0.16 });
  for (const x of [-0.42, 0.42]) {
    cyl(g, 0.21, 0.1, MAT.dark, V(x, -0.12, 0.28), { rot: [HALF, 0, 0], o: false });
    cyl(g, 0.15, 0.2, MAT.rubber, V(x, -0.12, 0.33), { rot: [HALF, 0, 0], o: false });
  }
  box(g, 0.44, 0.15, 0.1, MAT.dark, V(-0.9, 0.12, 0.27), { o: false, r: 0.03 });
  box(g, 0.15, 0.44, 0.1, MAT.dark, V(-0.9, 0.12, 0.27), { o: false, r: 0.03 });
  // Quattro tasti tondi uguali, uno lime: nessun simbolo.
  [[0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18]].forEach(([dx, dy], i) =>
    cyl(g, 0.085, 0.1, i === 0 ? MAT.accent : MAT.dark, V(0.9 + dx, 0.12 + dy, 0.27), { rot: [HALF, 0, 0], o: false })
  );
  for (const x of [-0.16, 0.16]) box(g, 0.16, 0.07, 0.06, MAT.dark, V(x, 0.26, 0.26), { o: false, r: 0.02 });
  return g;
}

// ---- GAMING XBOX (joystick arcade generico) ----
function arcade(k) {
  const { MAT, V, box, cyl, sph, bar } = k;
  const g = new THREE.Group();
  box(g, 2.1, 0.5, 1.35, MAT.body, V(0, 0.25, 0), { r: 0.1 });
  box(g, 1.9, 0.04, 1.15, MAT.dark, V(0, 0.51, 0), { o: false, r: 0.015 });
  cyl(g, 0.2, 0.08, MAT.shiny, V(-0.5, 0.55, 0), { o: false });
  bar(g, V(-0.5, 0.5, 0), V(-0.5, 1.3, 0), 0.06, MAT.shiny);
  sph(g, 0.27, MAT.accent, V(-0.5, 1.45, 0)); // pomello
  [[0.2, 0.25], [0.6, 0.12], [0.28, -0.22], [0.68, -0.34]].forEach(([x, z]) => cyl(g, 0.16, 0.12, MAT.dark, V(x, 0.57, z), { o: false }));
  // Inclinato verso chi guarda: non raddrizzarlo.
  g.rotation.x = 0.65;
  return g;
}

// ---- GAMING NINTENDO (console portatile generica, senza colori di marca) ----
function handheld(k) {
  const { MAT, V, box, cyl } = k;
  const g = new THREE.Group();
  box(g, 2.7, 1.2, 0.22, MAT.body, V(0, 0, 0), { r: 0.11 });
  box(g, 1.46, 0.9, 0.02, MAT.dark, V(0, 0, 0.11), { o: false, r: 0.02 });
  box(g, 1.36, 0.8, 0.02, MAT.light, V(0, 0, 0.118), { o: false, r: 0.015 }); // schermo acceso
  box(g, 0.36, 0.12, 0.08, MAT.dark, V(-1.02, 0.2, 0.12), { o: false, r: 0.03 });
  box(g, 0.12, 0.36, 0.08, MAT.dark, V(-1.02, 0.2, 0.12), { o: false, r: 0.03 });
  cyl(g, 0.13, 0.14, MAT.rubber, V(-1.02, -0.28, 0.14), { rot: [HALF, 0, 0], o: false });
  [[0.14, 0], [-0.14, 0], [0, 0.14], [0, -0.14]].forEach(([dx, dy]) =>
    cyl(g, 0.065, 0.08, MAT.dark, V(1.02 + dx, 0.2 + dy, 0.12), { rot: [HALF, 0, 0], o: false })
  );
  cyl(g, 0.13, 0.14, MAT.rubber, V(1.02, -0.28, 0.14), { rot: [HALF, 0, 0], o: false });
  return g;
}

// ---- COSPLAY (mascherina) ----
function mask(k) {
  const { MAT, V, ext, sph, bar } = k;
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-1.32, 0.15);
  s.quadraticCurveTo(-1.38, 0.66, -0.8, 0.58);
  s.quadraticCurveTo(-0.3, 0.5, 0, 0.3);
  s.quadraticCurveTo(0.3, 0.5, 0.8, 0.58);
  s.quadraticCurveTo(1.38, 0.66, 1.32, 0.15);
  s.quadraticCurveTo(1.2, -0.48, 0.55, -0.48);
  s.quadraticCurveTo(0.15, -0.42, 0, -0.1);
  s.quadraticCurveTo(-0.15, -0.42, -0.55, -0.48);
  s.quadraticCurveTo(-1.2, -0.48, -1.32, 0.15);
  for (const sx of [-1, 1]) {
    const hole = new THREE.Path();
    hole.absellipse(sx * 0.62, 0.08, 0.3, 0.16, 0, Math.PI * 2, true, sx * -0.18);
    s.holes.push(hole);
  }
  ext(g, s, 0.26, MAT.body, { bevel: 0.08 });
  sph(g, 0.08, MAT.accent, V(0, 0.33, 0.14), { o: false }); // gemma
  for (const sx of [-1, 1]) bar(g, V(sx * 1.3, 0.2, -0.05), V(sx * 1.75, 0.45, -0.3), 0.035, MAT.dark);
  return g;
}

// ---- STREAMING & CONTENT CREATOR (cinepresa) ----
function camera(k) {
  const { MAT, V, box, cyl, sph, ext, poly } = k;
  const g = new THREE.Group();
  box(g, 1.5, 1.0, 0.7, MAT.body, V(0, 0.6, 0), { r: 0.08 });
  cyl(g, 0.3, 0.5, MAT.dark, V(1.0, 0.6, 0), { rot: [0, 0, HALF] });
  cyl(g, 0.36, 0.12, MAT.shiny, V(1.3, 0.6, 0), { rot: [0, 0, HALF] });
  cyl(g, 0.27, 0.02, MAT.glass, V(1.365, 0.6, 0), { rot: [0, 0, HALF], o: false });
  for (const x of [-0.4, 0.42]) {
    cyl(g, 0.38, 0.3, MAT.dark, V(x, 1.42, 0), { rot: [HALF, 0, 0] });
    cyl(g, 0.13, 0.33, MAT.shiny, V(x, 1.42, 0), { rot: [HALF, 0, 0], o: false });
  }
  box(g, 0.3, 0.3, 0.3, MAT.dark, V(-0.88, 0.8, 0), { r: 0.05 });
  ext(g, poly([[-0.22, 0.38], [-0.22, 0.82], [0.2, 0.6]]), 0.06, MAT.accent, { bevel: 0.02, o: false, z: 0.37 }); // play
  sph(g, 0.07, MAT.red, V(0.52, 0.94, 0.36), { o: false });
  return g;
}

// ---- LIVE (pallino rosso con onde del segnale) ----
function live(k) {
  const { MAT, V, sph, bar, cyl } = k;
  const g = new THREE.Group();
  sph(g, 0.3, MAT.liveRed, V(0, 0, 0));
  for (const side of [-1, 1]) {
    arcPair(k, g, 0.66, 0.07, MAT.body, V(0, 0, 0), 1.7, side);
    arcPair(k, g, 1.08, 0.07, MAT.shiny, V(0, 0, 0), 1.7, side);
  }
  bar(g, V(0, -0.3, 0), V(0, -1.15, 0), 0.06, MAT.shiny);
  cyl(g, 0.45, 0.1, MAT.dark, V(0, -1.2, 0));
  return g;
}

const NERD_BUILDERS = {
  bacheca: board,
  'giochi-tavolo': dice,
  'gaming-pc': pc,
  'gaming-ps': gamepad,
  'gaming-xbox': arcade,
  'gaming-nintendo': handheld,
  cosplay: mask,
  streaming: camera,
  'nerd-live': live,
};

export function hasNerdModel(categoryId) {
  return Boolean(NERD_BUILDERS[categoryId]);
}

export function createNerdModel(kit, categoryId) {
  const build = NERD_BUILDERS[categoryId];
  return build ? fitCategoryModel(kit, build) : null;
}
