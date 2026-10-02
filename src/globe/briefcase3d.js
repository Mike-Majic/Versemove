import * as THREE from 'three';

// Valigetta 3D delle categorie del mondo Lavoro (versione "A2": cromo con
// contorno nero), al posto della sagoma piatta 'briefcase' (vedi
// categoryShell.js, stesso schema delle lettere gotiche del mondo Social).
// Materiali, env map e geometrie vengono dal kit condiviso dei modelli 3D
// (categoryModels3d.js, createModelKit con contorno nero), lo stesso dei
// modelli del mondo Annunci.
//
// Unità locali: corpo largo 2.5, alto 1.6, profondo 0.62, centrato
// nell'origine; il fronte guarda +z. categoryShell.js la scala alla
// larghezza della sagoma piatta e la mette su un pivot orientato come lei.
//
// Ferma: si muove solo insieme al globo. L'unica animazione (leggero
// ingrandimento su hover/categoria attiva) la fa categoryShell.js sul pivot.

const BODY_W = 2.5;
const BODY_H = 1.6;
const BODY_D = 0.62;
// Contorno nero: copia ingrandita di 0.06 per lato (kit.t).
const OUTLINE = 0.06;
// Il riquadro va da y = -0.8 (fondo) a y = 1.275 (cima della maniglia):
// il modello scende di metà della differenza, così il centro visivo cade sul
// centro della categoria (dove vola la camera), come la sagoma piatta.
const MODEL_Y_OFFSET = -(1.2 + 0.075 - BODY_H / 2) / 2;

const HANDLE_POINTS = [
  [-0.5, 0.78],
  [-0.5, 1.06],
  [-0.36, 1.2],
  [0.36, 1.2],
  [0.5, 1.06],
  [0.5, 0.78],
];

// Geometrie della valigetta, create una volta per kit (condivise da tutte
// le valigette del guscio, liberate con kit.dispose()).
function briefcaseGeometries(kit) {
  return kit.cached('briefcase:geometries', () => {
    const curve = new THREE.CatmullRomCurve3(
      HANDLE_POINTS.map(([x, y]) => new THREE.Vector3(x, y, 0)),
      false,
      'catmullrom',
      0.25
    );
    const g = {
      body: kit.roundedBox(BODY_W, BODY_H, BODY_D, 0.16, 8),
      slot: kit.track(new THREE.BoxGeometry(2.512, 0.04, 0.632)),
      handle: kit.track(new THREE.TubeGeometry(curve, 48, 0.075, 12, false)),
      handleOutline: kit.track(new THREE.TubeGeometry(curve, 48, 0.075 + OUTLINE, 12, false)),
      mount: kit.cylinder(0.12, 0.13, 0.07, 20),
      mountOutline: kit.cylinder(0.12 + OUTLINE, 0.13 + OUTLINE, 0.07 + OUTLINE * 2, 20),
      clasp: kit.roundedBox(0.3, 0.26, 0.09, 0.04, 4),
      plate: kit.roundedBox(0.42, 0.16, 0.05, 0.03, 4),
      corner: kit.sphere(0.137, 16, 12),
      cornerOutline: kit.sphere(0.137 + OUTLINE, 16, 12),
    };
    // Segnaposto per la cache del kit: il contenitore non ha nulla da liberare.
    return { ...g, dispose() {} };
  });
}

// Una valigetta. Restituisce il gruppo (da mettere su un pivot), i mesh da
// rendere cliccabili e le misure in unità locali (per scalarla, sollevarla
// dal guscio e mettere l'etichetta sotto).
export function createBriefcase3D(kit) {
  const g = briefcaseGeometries(kit);
  const m = kit.MAT;
  const group = new THREE.Group();
  const model = new THREE.Group();
  model.position.y = MODEL_Y_OFFSET;
  group.add(model);
  const meshes = [];

  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    model.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  // Corpo e contorno (scala non uniforme: +0.06 per lato su ogni asse).
  add(g.body, m.body);
  add(g.body, m.out).scale.set(
    (BODY_W + OUTLINE * 2) / BODY_W,
    (BODY_H + OUTLINE * 2) / BODY_H,
    (BODY_D + OUTLINE * 2) / BODY_D
  );
  // Fessura del coperchio.
  add(g.slot, m.slot, 0, 0.3, 0);

  // Maniglia e attacchi.
  add(g.handle, m.bodyFine);
  add(g.handleOutline, m.out);
  for (const x of [-0.5, 0.5]) {
    add(g.mount, m.bodyFine, x, 0.82, 0);
    add(g.mountOutline, m.out, x, 0.82, 0);
  }

  // Chiusure e targhetta sul fronte.
  add(g.clasp, m.dark, -0.72, 0.3, 0.33);
  add(g.clasp, m.dark, 0.72, 0.3, 0.33);
  add(g.plate, m.dark, 0, 0.3, 0.33);

  // Paraspigoli agli 8 angoli, rientrati di 0.13.
  const cx = BODY_W / 2 - 0.13;
  const cy = BODY_H / 2 - 0.13;
  const cz = BODY_D / 2 - 0.13;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(g.corner, m.bodyFine, sx * cx, sy * cy, sz * cz);
        add(g.cornerOutline, m.out, sx * cx, sy * cy, sz * cz);
      }
    }
  }

  return {
    group,
    meshes,
    // Mezza altezza del riquadro intero (maniglia compresa), già centrato.
    halfHeight: (1.2 + 0.075 + BODY_H / 2) / 2,
    halfDepth: BODY_D / 2,
    // Quota del fronte (chiusure comprese) rispetto al centro.
    frontZ: 0.33 + 0.045,
    // Larghezza del corpo: categoryShell.js la porta a quella della sagoma piatta.
    width: BODY_W,
  };
}
