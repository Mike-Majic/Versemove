import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Modelli 3D "cromo + contorno" delle categorie (valigetta del mondo Lavoro,
// vedi briefcase3d.js; i sette modelli del mondo Annunci, vedi
// annunciModels3d.js). Un solo sistema: qui l'unica environment map, i
// materiali e gli helper per costruire i pezzi, usati da entrambi.
//
// Convenzioni: unità locali, il lato visibile guarda +z. Il contorno è un
// "inverted hull": copia del pezzo ingrandita di `t` per lato, solo facce
// interne (BackSide), che si vede come un bordo dietro alla forma.

// --- Environment map condivisa -------------------------------------------
// Nella scena non c'è un'environment e con metalness 1 il cromo verrebbe
// nero. Una sola env map (PMREM + RoomEnvironment) per renderer, contata
// per chi la usa, assegnata SOLO a material.envMap dei modelli: mai
// scene.environment, cambierebbe le lettere gotiche M e V (approvate).
let sharedEnv = null; // { renderer, texture, users }

function acquireEnvMap(renderer) {
  if (!renderer) return null;
  if (sharedEnv && sharedEnv.renderer === renderer) {
    sharedEnv.users += 1;
    return sharedEnv.texture;
  }
  if (sharedEnv) {
    sharedEnv.texture.dispose();
    sharedEnv = null;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const texture = pmrem.fromScene(room, 0.04).texture;
  room.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  pmrem.dispose();
  sharedEnv = { renderer, texture, users: 1 };
  return texture;
}

function releaseEnvMap(texture) {
  if (!texture || !sharedEnv || sharedEnv.texture !== texture) return;
  sharedEnv.users -= 1;
  if (sharedEnv.users <= 0) {
    sharedEnv.texture.dispose();
    sharedEnv = null;
  }
}

const ENV_INTENSITY = 1.25;

// --- Kit -------------------------------------------------------------------
// Un kit per guscio: materiali e geometrie creati una volta, condivisi fra
// i modelli dello stesso guscio, liberati tutti insieme con kit.dispose().
// outline: colore del contorno (null = nessun contorno); t: spessore.
export function createModelKit(renderer, { outline = '#08090c', t = 0.06 } = {}) {
  const envMap = acquireEnvMap(renderer);
  const chrome = (color, roughness, env = ENV_INTENSITY) =>
    new THREE.MeshStandardMaterial({ color, metalness: 1, roughness, envMap, envMapIntensity: env });
  const MAT = {
    body: chrome('#e9ecf4', 0.2),
    // Valigetta: maniglia, attacchi e paraspigoli (stesso cromo, più lucido).
    bodyFine: chrome('#e9ecf4', 0.12),
    shiny: chrome('#f2f4fa', 0.1),
    dark: chrome('#1a1b21', 0.25),
    rubber: new THREE.MeshStandardMaterial({ color: '#121317', metalness: 0.2, roughness: 0.65, envMap, envMapIntensity: ENV_INTENSITY }),
    glass: chrome('#0c1220', 0.05, 1.6),
    light: new THREE.MeshBasicMaterial({ color: '#ffe2b0' }),
    red: new THREE.MeshBasicMaterial({ color: '#ff3b30' }),
    slot: new THREE.MeshBasicMaterial({ color: '#08090c' }),
    // Vetrina: accento rosa (stella della borsa, punta del rossetto) e
    // schermo acceso del portatile.
    accent: new THREE.MeshStandardMaterial({ color: '#ec4899', metalness: 0.35, roughness: 0.3, envMap, envMapIntensity: ENV_INTENSITY }),
    screen: new THREE.MeshBasicMaterial({ color: '#ffd6ea' }),
    out: outline === null ? null : new THREE.MeshBasicMaterial({ color: outline, side: THREE.BackSide }),
  };

  // Geometrie: le primitive uguali (stesse misure) si creano una volta sola.
  const geometries = [];
  const cache = new Map();
  const track = (geo) => {
    geometries.push(geo);
    return geo;
  };
  const cached = (key, make) => {
    let geo = cache.get(key);
    if (!geo) {
      geo = track(make());
      cache.set(key, geo);
    }
    return geo;
  };
  const r4 = (n) => Math.round(n * 1e4) / 1e4;
  const roundedBox = (w, h, d, r, segments = 4) =>
    cached(`rb:${r4(w)}:${r4(h)}:${r4(d)}:${r4(r)}:${segments}`, () => new RoundedBoxGeometry(w, h, d, segments, r));
  const cylinder = (rTop, rBottom, h, radial = 32) =>
    cached(`cy:${r4(rTop)}:${r4(rBottom)}:${r4(h)}:${radial}`, () => new THREE.CylinderGeometry(rTop, rBottom, h, radial));
  const sphere = (r, w = 24, hs = 18) => cached(`sp:${r4(r)}:${w}:${hs}`, () => new THREE.SphereGeometry(r, w, hs));
  const torusGeo = (R, r) => cached(`to:${r4(R)}:${r4(r)}`, () => new THREE.TorusGeometry(R, r, 16, 56));

  const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

  function put(g, geo, mat, pos, rot, outGeo, outScale) {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.copy(pos);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    g.add(m);
    if (MAT.out && (outGeo || outScale)) {
      const o = new THREE.Mesh(outGeo ?? geo, MAT.out);
      o.position.copy(m.position);
      o.rotation.copy(m.rotation);
      if (outScale) o.scale.copy(outScale);
      g.add(o);
    }
    return m;
  }

  const box = (g, w, h, d, mat, pos, { rot, r = 0.05, o = true, segments = 4 } = {}) =>
    put(
      g,
      roundedBox(w, h, d, Math.min(r, Math.min(w, h, d) / 2 - 0.001), segments),
      mat,
      pos,
      rot,
      null,
      o ? V((w + 2 * t) / w, (h + 2 * t) / h, (d + 2 * t) / d) : null
    );
  const cyl = (g, r, h, mat, pos, { rot, o = true } = {}) =>
    put(g, cylinder(r, r, h), mat, pos, rot, o ? cylinder(r + t, r + t, h + 2 * t) : null);
  const sph = (g, r, mat, pos, { o = true } = {}) => put(g, sphere(r), mat, pos, null, o ? sphere(r + t) : null);
  const torus = (g, R, r, mat, pos, { rot, o = true } = {}) =>
    put(g, torusGeo(R, r), mat, pos, rot, o ? torusGeo(R, r + t) : null);

  // Asta (cilindro) da a a b.
  const barTransform = (a, b) => ({
    len: a.distanceTo(b),
    mid: a.clone().add(b).multiplyScalar(0.5),
    q: new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()),
  });
  function bar(g, a, b, r, mat, { o = true } = {}) {
    const { len, mid, q } = barTransform(a, b);
    const m = new THREE.Mesh(cylinder(r, r, len, 16), mat);
    m.position.copy(mid);
    m.quaternion.copy(q);
    g.add(m);
    if (MAT.out && o) {
      const oo = new THREE.Mesh(cylinder(r + t, r + t, len + 2 * t, 16), MAT.out);
      oo.position.copy(mid);
      oo.quaternion.copy(q);
      g.add(oo);
    }
    return m;
  }
  // Tante aste sottili uguali (es. i 20 raggi delle ruote della bici) unite
  // in una sola geometria: un solo mesh invece di venti.
  function barsMerged(g, segments, r, mat) {
    const parts = segments.map(([a, b]) => {
      const { len, mid, q } = barTransform(a, b);
      const geo = new THREE.CylinderGeometry(r, r, len, 8);
      geo.applyMatrix4(new THREE.Matrix4().compose(mid, q, V(1, 1, 1)));
      return geo;
    });
    const merged = track(mergeGeometries(parts));
    parts.forEach((p) => p.dispose());
    const m = new THREE.Mesh(merged, mat);
    g.add(m);
    return m;
  }

  // Sagoma estrusa di spessore totale D (centrata su z), con smusso. Il
  // contorno è la stessa estrusione allargata di t solo in X/Y e 0.012 più
  // sottile in profondità: altrimenti sulle facce davanti e dietro
  // spunterebbero righe del colore del contorno.
  function ext(g, shape, D, mat, { bevel = 0.05, o = true, z = 0 } = {}) {
    const mk = (extra) => {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: D - 2 * bevel,
        bevelEnabled: true,
        bevelThickness: extra > 0 ? bevel - 0.012 : bevel,
        bevelSize: bevel + extra,
        bevelOffset: -bevel,
        bevelSegments: 4,
        curveSegments: 24,
      });
      geo.translate(0, 0, -(D - 2 * bevel) / 2);
      return track(geo);
    };
    return put(g, mk(0), mat, V(0, 0, z), null, o ? mk(t) : null);
  }

  // Un modello fermo, fatto di tanti pezzi: i pezzi con lo stesso materiale
  // si uniscono in una sola geometria (trasformazioni già applicate). Stessa
  // forma, molte meno chiamate di disegno (da ~20 a ~6 per modello), e
  // meno mesh da controllare al click/hover.
  function mergeByMaterial(root) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const byMaterial = new Map();
    root.traverse((o) => {
      if (!o.isMesh) return;
      const geo = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
      geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      // Solo gli attributi comuni a tutte le primitive.
      for (const name of Object.keys(geo.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
      }
      geo.clearGroups();
      if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
      byMaterial.get(o.material).push(geo);
    });
    const merged = new THREE.Group();
    byMaterial.forEach((geos, material) => {
      const geo = track(mergeGeometries(geos));
      geos.forEach((g) => g.dispose());
      merged.add(new THREE.Mesh(geo, material));
    });
    return merged;
  }

  const poly = (pts) => {
    const s = new THREE.Shape();
    pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
    s.closePath();
    return s;
  };

  return {
    MAT,
    t,
    V,
    put,
    box,
    cyl,
    sph,
    torus,
    bar,
    barsMerged,
    mergeByMaterial,
    ext,
    poly,
    track,
    cached,
    roundedBox,
    cylinder,
    sphere,
    dispose() {
      geometries.forEach((geo) => geo.dispose());
      geometries.length = 0;
      cache.clear();
      Object.values(MAT).forEach((m) => m && m.dispose());
      releaseEnvMap(envMap);
    },
  };
}

// Un modello di categoria pronto per il guscio: costruito col kit, pezzi
// uniti per materiale (poche chiamate di disegno), centrato e portato a un
// ingombro standard di 2.7 x 2.1 (fit del riferimento). Restituisce il
// gruppo, i mesh (da rendere cliccabili) e le misure finali in unità locali.
const FIT_W = 2.7;
const FIT_H = 2.1;
export function fitCategoryModel(kit, build) {
  const model = kit.mergeByMaterial(build(kit));
  const b = new THREE.Box3().setFromObject(model);
  const c = b.getCenter(new THREE.Vector3());
  const size = b.getSize(new THREE.Vector3());
  model.position.sub(c);
  const s = 1 / Math.max(size.x / FIT_W, size.y / FIT_H);
  const group = new THREE.Group();
  const wrap = new THREE.Group();
  wrap.scale.setScalar(s);
  wrap.add(model);
  group.add(wrap);
  return {
    group,
    meshes: collectMeshes(group),
    width: size.x * s,
    halfHeight: (size.y * s) / 2,
    halfDepth: (size.z * s) / 2,
    frontZ: (size.z * s) / 2,
  };
}

// Tutti i mesh di un modello (contorni compresi): li rende cliccabili il guscio.
export function collectMeshes(root) {
  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  return meshes;
}
