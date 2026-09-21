import * as THREE from 'three';
import { makeLabelSprite } from './categoryShell';

// Stesso raggio del globo grande (vedi networkOverlay.js): i satelliti si
// posizionano in proporzione a questo, non a un valore a sé.
const GLOBE_RADIUS = 100;

// Distanza dal centro a cui fluttuano i satelliti. Il campo visivo della
// camera di three-render-objects è una PerspectiveCamera "di serie" (fov 50,
// vedi node_modules/three-render-objects): a distanza di partenza (altitudine
// 2.4 => camera a GLOBE_RADIUS*3.4 dal centro, vedi three-globe/polar2Cartesian)
// resta poco più di metà del raggio del globo prima di uscire dall'inquadratura
// in verticale — per questo l'orbita e gli angoli sotto sono volutamente
// stretti, misurati con uno screenshot reale (non solo calcolati a tavolino).
const ORBIT_RADIUS = GLOBE_RADIUS * 1.55;
const SATELLITE_RADIUS = GLOBE_RADIUS * 0.09;

// Disposizione fissa attorno al globo grande, pensata sullo schizzo
// dell'utente: due in alto (sinistra/destra), due in basso, uno di lato —
// tutti ben dentro il campo visivo della camera di partenza, mai a ridosso
// del bordo dove verrebbero tagliati. az/el in gradi (azimut rispetto al
// "davanti" della camera, elevazione sopra/sotto l'equatore).
const LAYOUT = [
  { az: -24, el: 15 },
  { az: 24, el: 14 },
  { az: -26, el: -16 },
  { az: 25, el: -15 },
  { az: 1, el: 23 },
];

function sphereFromAzEl(az, el, radius) {
  const azRad = THREE.MathUtils.degToRad(az);
  const elRad = THREE.MathUtils.degToRad(el);
  return new THREE.Vector3(
    radius * Math.cos(elRad) * Math.sin(azRad),
    radius * Math.sin(elRad),
    radius * Math.cos(elRad) * Math.cos(azRad)
  );
}

// Inversa di sphereFromAzEl, in lat/lng invece che az/el: stessa formula di
// vectorToPolar in categoryShell.js (coordinate three-globe). Serve al warp
// (Fase 2b, vedi WorldGlobe.jsx) per puntare la camera verso la direzione di
// un satellite con g.pointOfView({lat, lng, ...}) — l'unica API che
// react-globe.gl offre per orientare la camera, non un target XYZ diretto.
function vectorToLatLng(v) {
  const n = v.clone().normalize();
  const phi = Math.acos(Math.max(-1, Math.min(1, n.y)));
  const theta = Math.atan2(n.z, n.x);
  return { lat: 90 - (phi * 180) / Math.PI, lng: 90 - (theta * 180) / Math.PI };
}

// Quanto dura la "materializzazione" di un satellite appena apparso (il
// mondo appena lasciato dopo un warp, vedi Fase 2b): scala e opacità
// crescono da 0 invece di comparire di scatto, così sembra "arrivato lì"
// invece di teletrasportato in un frame.
const SPAWN_MS = 420;
// Quanto cresce il satellite verso cui si sta facendo il warp mentre la
// camera gli vola incontro: >1 dà la sensazione di avvicinamento anche se
// la sua posizione in scena resta ferma (muovere la camera con precisione
// verso un punto qualunque richiederebbe un target XYZ che react-globe.gl
// non espone, solo lat/lng — vedi vectorToLatLng sopra).
const WARP_GROW_SCALE = 2.4;

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Un satellite = una sfera piena semi-trasparente colorata del mondo, più un
// wireframe leggermente più grande sopra (solo su qualità medium/high, vedi
// fx/quality.js) per leggerla subito come "un piccolo globo" e non una
// pallina piatta. L'etichetta col nome resta nascosta finché non ci si passa
// sopra (vedi setHoveredWorldId più sotto) — mai un'etichetta fissa che
// affollerebbe la scena con 5 mondi intorno a quello attivo.
function buildSatelliteMesh(world, quality, animateSpawn) {
  const group = new THREE.Group();

  const geometry = new THREE.IcosahedronGeometry(SATELLITE_RADIUS, quality.detail);
  const material = new THREE.MeshPhongMaterial({
    color: world.color,
    transparent: true,
    opacity: 0.42,
    shininess: 12,
  });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.userData.worldId = world.id;
  sphere.userData.isSatellite = true;
  group.add(sphere);

  const opacityMeshes = [{ mesh: sphere, baseOpacity: 0.42 }];

  if (quality.showWireframe) {
    const wireGeometry = new THREE.IcosahedronGeometry(SATELLITE_RADIUS * 1.015, quality.detail);
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: world.color,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    const wireMesh = new THREE.Mesh(wireGeometry, wireMaterial);
    group.add(wireMesh);
    opacityMeshes.push({ mesh: wireMesh, baseOpacity: 0.5 });
  }

  const { sprite } = makeLabelSprite(world.label, SATELLITE_RADIUS * 1.05);
  sprite.position.set(0, SATELLITE_RADIUS * 1.75, 0);
  sprite.visible = false;
  group.add(sprite);

  group.userData.worldId = world.id;
  group.userData.hitMesh = sphere;
  group.userData.label = sprite;
  group.userData.opacityMeshes = opacityMeshes;
  group.userData.bobPhase = Math.random() * Math.PI * 2;
  group.userData.bobSpeed = 0.35 + Math.random() * 0.15;
  group.userData.spinSpeed = 0.06 + Math.random() * 0.05;
  // Se non deve materializzarsi (primo montaggio, vedi buildSatelliteGlobes),
  // nasce già "vecchio" (createdAtMs molto nel passato): update() lo trova
  // già a scala/opacità piene dal primissimo frame.
  group.userData.createdAtMs = animateSpawn ? performance.now() : -Infinity;

  return group;
}

// Costruisce il gruppo dei globi satellite (tutti i mondi tranne quello
// attivo, al massimo LAYOUT.length) e lo aggiunge come oggetto in PIU' nella
// stessa scena/renderer del globo grande — mai un secondo <Globe>/renderer,
// che su mobile non reggerebbe (vedi il commento di chi ha chiesto questa
// fase). Il chiamante (WorldGlobe.jsx) decide quando costruirlo/distruggerlo
// e quando chiamare update() ad ogni frame.
export function buildSatelliteGlobes({ worlds, activeWorldId, quality, animateSpawn = true }) {
  const group = new THREE.Group();
  group.name = 'rb-satellite-globes';

  const satellites = worlds
    .filter((w) => w.id !== activeWorldId)
    .slice(0, LAYOUT.length)
    .map((world, i) => {
      const mesh = buildSatelliteMesh(world, quality, animateSpawn);
      const basePos = sphereFromAzEl(LAYOUT[i].az, LAYOUT[i].el, ORBIT_RADIUS);
      mesh.position.copy(basePos);
      mesh.userData.basePos = basePos;
      group.add(mesh);
      return mesh;
    });

  // Stato del warp in corso (Fase 2b, vedi WorldGlobe.jsx): quale satellite
  // sta "crescendo" verso la camera e da quando. Un solo warp alla volta —
  // WorldGlobe.jsx si assicura di non farne partire un altro finché questo
  // non è arrivato.
  const warpState = { targetWorldId: null, startMs: null, durationMs: 0 };

  function setWarpTarget(worldId, durationMs = 0) {
    warpState.targetWorldId = worldId;
    warpState.startMs = worldId ? performance.now() : null;
    warpState.durationMs = durationMs;
  }

  function getWorldLatLng(worldId) {
    const sat = satellites.find((s) => s.userData.worldId === worldId);
    if (!sat) return null;
    return vectorToLatLng(sat.userData.basePos);
  }

  // Galleggiamento verticale (oscillazione sin, ampiezza minima) + rotazione
  // propria lenta, più le due animazioni temporanee (materializzazione e
  // crescita durante il warp) sopra. elapsedSec/deltaSec vengono da
  // WorldGlobe.jsx, agganciati allo stesso giro di rendering del globo
  // grande (si fermano quando lui si ferma per risparmiare CPU).
  function update(elapsedSec, deltaSec) {
    const nowMs = performance.now();
    for (const sat of satellites) {
      const { basePos, bobPhase, bobSpeed, spinSpeed, createdAtMs, worldId, opacityMeshes } = sat.userData;

      const spawnAge = nowMs - createdAtMs;
      const spawnT = spawnAge >= SPAWN_MS ? 1 : easeOutCubic(Math.max(0, spawnAge) / SPAWN_MS);

      const bob = Math.sin(elapsedSec * bobSpeed + bobPhase) * (SATELLITE_RADIUS * 0.3);
      sat.position.set(basePos.x, basePos.y + bob, basePos.z);
      sat.rotation.y += spinSpeed * deltaSec;

      let warpScale = 1;
      if (worldId === warpState.targetWorldId && warpState.startMs !== null) {
        const wt = Math.min(1, (nowMs - warpState.startMs) / warpState.durationMs);
        warpScale = 1 + (WARP_GROW_SCALE - 1) * easeOutCubic(wt);
      }

      sat.scale.setScalar(spawnT * warpScale);
      opacityMeshes.forEach(({ mesh, baseOpacity }) => {
        mesh.material.opacity = baseOpacity * spawnT;
      });
    }
  }

  function getHitMeshes() {
    return satellites.map((s) => s.userData.hitMesh);
  }

  function setHoveredWorldId(worldId) {
    for (const sat of satellites) {
      sat.userData.label.visible = sat.userData.worldId === worldId;
    }
  }

  function dispose() {
    satellites.forEach((sat) => {
      sat.traverse((obj) => {
        obj.geometry?.dispose();
        if (obj.material) {
          obj.material.map?.dispose();
          obj.material.dispose();
        }
      });
    });
  }

  return { group, satellites, update, getHitMeshes, setHoveredWorldId, setWarpTarget, getWorldLatLng, dispose };
}
