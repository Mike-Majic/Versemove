import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// Valigetta 3D delle categorie del mondo Lavoro (versione "A2": cromo con
// contorno nero), al posto della sagoma piatta 'briefcase' (vedi
// categoryShell.js, stesso schema delle lettere gotiche del mondo Social).
//
// Unità locali: corpo largo 2.5, alto 1.6, profondo 0.62, centrato
// nell'origine; il fronte guarda +z. categoryShell.js la scala alla
// larghezza della sagoma piatta e la mette su un pivot orientato come lei.
//
// Ferma: si muove solo insieme al globo. L'unica animazione (leggero
// ingrandimento su hover/categoria attiva) la fa categoryShell.js sul pivot.
//
// Geometrie, materiali e env map sono condivisi da tutte le valigette del
// guscio (createBriefcaseResources, uno per guscio) e si liberano tutti
// insieme con resources.dispose().

const BODY_W = 2.5;
const BODY_H = 1.6;
const BODY_D = 0.62;
// Contorno nero "inverted hull": copia ingrandita di 0.06 per lato, solo le
// facce interne (BackSide), così si vede come un bordo dietro alla forma.
const OUTLINE = 0.06;
const OUTLINE_COLOR = '#08090c';
const CHROME_COLOR = '#e9ecf4';
const DARK_COLOR = '#1a1b21';
const ENV_INTENSITY = 1.25;
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

// Una sola env map (PMREM + RoomEnvironment) assegnata SOLO ai materiali
// della valigetta: nella scena non c'è un'environment e con metalness 1 il
// cromo verrebbe nero. Mai scene.environment: cambierebbe le lettere
// gotiche M e V del mondo Social (approvate).
export function createBriefcaseResources(renderer) {
  let envMap = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envMap = pmrem.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
    pmrem.dispose();
  }

  const curve = new THREE.CatmullRomCurve3(
    HANDLE_POINTS.map(([x, y]) => new THREE.Vector3(x, y, 0)),
    false,
    'catmullrom',
    0.25
  );

  const geometries = {
    body: new RoundedBoxGeometry(BODY_W, BODY_H, BODY_D, 8, 0.16),
    slot: new THREE.BoxGeometry(2.512, 0.04, 0.632),
    handle: new THREE.TubeGeometry(curve, 48, 0.075, 12, false),
    handleOutline: new THREE.TubeGeometry(curve, 48, 0.075 + OUTLINE, 12, false),
    mount: new THREE.CylinderGeometry(0.12, 0.13, 0.07, 20),
    mountOutline: new THREE.CylinderGeometry(0.12 + OUTLINE, 0.13 + OUTLINE, 0.07 + OUTLINE * 2, 20),
    clasp: new RoundedBoxGeometry(0.3, 0.26, 0.09, 4, 0.04),
    plate: new RoundedBoxGeometry(0.42, 0.16, 0.05, 4, 0.03),
    corner: new THREE.SphereGeometry(0.137, 16, 12),
    cornerOutline: new THREE.SphereGeometry(0.137 + OUTLINE, 16, 12),
  };

  const standard = (color, roughness) =>
    new THREE.MeshStandardMaterial({ color, metalness: 1, roughness, envMap, envMapIntensity: ENV_INTENSITY });
  const materials = {
    chrome: standard(CHROME_COLOR, 0.2),
    chromeFine: standard(CHROME_COLOR, 0.12),
    dark: standard(DARK_COLOR, 0.25),
    slot: new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR }),
    outline: new THREE.MeshBasicMaterial({ color: OUTLINE_COLOR, side: THREE.BackSide }),
  };

  return {
    geometries,
    materials,
    dispose() {
      Object.values(geometries).forEach((g) => g.dispose());
      Object.values(materials).forEach((m) => m.dispose());
      envMap?.dispose();
    },
  };
}

// Una valigetta. Restituisce il gruppo (da mettere su un pivot), i mesh da
// rendere cliccabili e le mezze misure in unità locali (per sollevarla dal
// guscio e mettere l'etichetta sotto).
export function createBriefcase3D(resources, { renderOrder = 0 } = {}) {
  const { geometries: g, materials: m } = resources;
  const group = new THREE.Group();
  const model = new THREE.Group();
  model.position.y = MODEL_Y_OFFSET;
  group.add(model);
  const meshes = [];

  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.renderOrder = renderOrder;
    model.add(mesh);
    meshes.push(mesh);
    return mesh;
  };

  // Corpo e contorno (scala non uniforme: +0.06 per lato su ogni asse).
  add(g.body, m.chrome);
  add(g.body, m.outline).scale.set(
    (BODY_W + OUTLINE * 2) / BODY_W,
    (BODY_H + OUTLINE * 2) / BODY_H,
    (BODY_D + OUTLINE * 2) / BODY_D
  );
  // Fessura del coperchio.
  add(g.slot, m.slot, 0, 0.3, 0);

  // Maniglia e attacchi.
  add(g.handle, m.chromeFine);
  add(g.handleOutline, m.outline);
  for (const x of [-0.5, 0.5]) {
    add(g.mount, m.chromeFine, x, 0.82, 0);
    add(g.mountOutline, m.outline, x, 0.82, 0);
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
        add(g.corner, m.chromeFine, sx * cx, sy * cy, sz * cz);
        add(g.cornerOutline, m.outline, sx * cx, sy * cy, sz * cz);
      }
    }
  }

  return {
    group,
    meshes,
    halfWidth: BODY_W / 2,
    // Mezza altezza del riquadro intero (maniglia compresa), già centrato.
    halfHeight: (1.2 + 0.075 + BODY_H / 2) / 2,
    halfDepth: BODY_D / 2,
    // Quota del fronte (chiusure comprese) rispetto al centro.
    frontZ: 0.33 + 0.045,
    // Larghezza del corpo: categoryShell.js la porta a quella della sagoma piatta.
    width: BODY_W,
  };
}
