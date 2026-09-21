import * as THREE from 'three';
import { getDotTexture } from './dotTexture';
import { buildShellNodeGeometry } from './networkOverlay';

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
// Tenuti volutamente oltre il raggio del guscio a rete del globo grande (128,
// vedi networkOverlay.buildNetworkShell) così i satelliti fluttuano chiaramente
// fuori da quel guscio, non appoggiati sopra.
const ORBIT_RADIUS = GLOBE_RADIUS * 1.85;
const SATELLITE_RADIUS = GLOBE_RADIUS * 0.085;

// Disposizione fissa attorno al globo grande, pensata sullo schizzo
// dell'utente: due in alto (sinistra/destra), due in basso, uno di lato —
// tutti ben dentro il campo visivo della camera di partenza, mai a ridosso
// del bordo dove verrebbero tagliati. az/el in gradi (azimut rispetto al
// "davanti" della camera, elevazione sopra/sotto l'equatore).
const LAYOUT = [
  { az: -22, el: 13 },
  { az: 22, el: 12 },
  { az: -24, el: -14 },
  { az: 23, el: -13 },
  { az: 1, el: 20 },
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

// Un satellite = un piccolo globo "a rete" (bordi + nodi luminosi, stesso
// linguaggio visivo del guscio del globo grande — vedi networkOverlay.js
// buildNetworkShell) colorato del mondo che rappresenta, più un nucleo quasi
// invisibile solo per il click/hover (una LineSegments da sola non è comoda
// da raycastare con precisione). Niente facce piene, niente etichette: lo
// schizzo dell'utente li vuole solo come piccoli globi a rete che fluttuano,
// non come poligoni colorati pieni.
function buildSatelliteMesh(world, quality) {
  const group = new THREE.Group();

  const coreGeometry = new THREE.IcosahedronGeometry(SATELLITE_RADIUS, quality.detail);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: world.color,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.userData.worldId = world.id;
  core.userData.isSatellite = true;
  group.add(core);

  const netMaterial = new THREE.LineBasicMaterial({
    color: world.color,
    transparent: true,
    opacity: 0.85,
  });
  const net = new THREE.LineSegments(new THREE.EdgesGeometry(coreGeometry), netMaterial);
  group.add(net);

  const nodeMaterial = new THREE.PointsMaterial({
    color: world.color,
    size: SATELLITE_RADIUS * 0.22,
    map: getDotTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const nodes = new THREE.Points(buildShellNodeGeometry(coreGeometry), nodeMaterial);
  group.add(nodes);

  group.userData.worldId = world.id;
  group.userData.hitMesh = core;
  group.userData.opacityMeshes = [
    { mesh: core, baseOpacity: 0.07 },
    { mesh: net, baseOpacity: 0.85 },
    { mesh: nodes, baseOpacity: 1 },
  ];
  group.userData.bobPhase = Math.random() * Math.PI * 2;
  group.userData.bobSpeed = 0.35 + Math.random() * 0.15;
  group.userData.spinSpeed = 0.06 + Math.random() * 0.05;
  // Impostato per davvero da setActiveWorld() quando il satellite diventa
  // visibile: finché resta -Infinity l'oggetto è comunque invisibile
  // (group.visible = false qui sotto), quindi non ha nessun effetto grafico.
  group.userData.createdAtMs = -Infinity;
  group.userData.basePos = null;
  group.visible = false;

  return group;
}

// Costruisce UN SATELLITE PERSISTENTE PER OGNI MONDO (non solo quelli
// visibili adesso) e lo aggiunge come oggetto in più nella STESSA
// scena/renderer del globo grande — mai un secondo <Globe>/renderer, che su
// mobile non reggerebbe. A differenza della Fase 2a/2b, qui i satelliti si
// costruiscono UNA SOLA VOLTA (a questa chiamata) e non vengono più
// ricreati ad ogni cambio di mondo: warp() si limita a chiamare
// setActiveWorld(), che mostra/nasconde e riposiziona gli stessi oggetti già
// pronti. Ricreare geometrie/materiali (quindi ricompilare gli shader) ad
// ogni warp era il vero costo del blocco misurato durante il volo — qui non
// succede più durante l'uso normale, solo quando cambia davvero la qualità
// grafica (vedi WorldGlobe.jsx, che richiama questa funzione da zero solo in
// quel caso, mai per un semplice cambio di mondo).
export function buildSatelliteGlobes({ worlds, quality }) {
  const group = new THREE.Group();
  group.name = 'rb-satellite-globes';

  const satellites = worlds.map((world) => {
    const mesh = buildSatelliteMesh(world, quality);
    group.add(mesh);
    return mesh;
  });
  const satellitesById = new Map(satellites.map((s) => [s.userData.worldId, s]));

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
    const sat = satellitesById.get(worldId);
    if (!sat?.userData.basePos) return null;
    return vectorToLatLng(sat.userData.basePos);
  }

  // Mostra come satelliti tutti i mondi tranne quello attivo (al massimo
  // LAYOUT.length), nella disposizione fissa di sempre. Non tocca mai
  // geometrie/materiali: solo visibilità, posizione e — se richiesto — un
  // riavvio dell'animazione di comparsa sui satelliti ora visibili.
  function setActiveWorld(activeWorldId, { animateSpawn = true } = {}) {
    const visibleWorlds = worlds.filter((w) => w.id !== activeWorldId).slice(0, LAYOUT.length);
    const visibleIds = new Set(visibleWorlds.map((w) => w.id));
    const nowMs = performance.now();

    satellites.forEach((sat) => {
      sat.visible = visibleIds.has(sat.userData.worldId);
    });

    visibleWorlds.forEach((world, i) => {
      const sat = satellitesById.get(world.id);
      if (!sat) return;
      const basePos = sphereFromAzEl(LAYOUT[i].az, LAYOUT[i].el, ORBIT_RADIUS);
      sat.userData.basePos = basePos;
      sat.position.copy(basePos);
      if (animateSpawn) sat.userData.createdAtMs = nowMs;
    });
  }

  // Galleggiamento verticale (oscillazione sin, ampiezza minima) + rotazione
  // propria lenta, più le due animazioni temporanee (materializzazione e
  // crescita durante il warp) sopra. elapsedSec/deltaSec vengono da
  // WorldGlobe.jsx, agganciati allo stesso giro di rendering del globo
  // grande (si fermano quando lui si ferma per risparmiare CPU).
  function update(elapsedSec, deltaSec) {
    const nowMs = performance.now();
    for (const sat of satellites) {
      if (!sat.visible) continue;
      const { basePos, bobPhase, bobSpeed, spinSpeed, createdAtMs, worldId, opacityMeshes } = sat.userData;
      if (!basePos) continue;

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
    return satellites.filter((s) => s.visible).map((s) => s.userData.hitMesh);
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

  return { group, satellites, setActiveWorld, update, getHitMeshes, setWarpTarget, getWorldLatLng, dispose };
}
