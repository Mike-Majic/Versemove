import * as THREE from 'three';
import { getDotTexture } from './dotTexture';
import { buildShellNodeGeometry } from './networkOverlay';
import { makeLabelSprite } from './categoryShell';
import { SATELLITE_SPIN_PERIOD_S, IDLE_SATELLITE_ORBIT_DEG_S } from '../fx/globeRotation';

const DEG2RAD = Math.PI / 180;

// Raggio (in unità di scena) del guscio a rete del globo grande — vedi
// networkOverlay.buildNetworkShell(radius=128) — usato qui solo per il
// test "il globo mi nasconde il satellite?" (occlusione), non per
// posizionare niente: i satelliti ora vivono in coordinate ASSOLUTE e
// FISSE (vedi SLOTS sotto), non più in proporzione a un raggio d'orbita.
const OCCLUSION_RADIUS = 128;

// Raggio intrinseco della geometria di un satellite (fisso, uguale per
// tutti: mai ricreata, vedi buildSatelliteGlobes). La dimensione APPARENTE
// varia invece per slot tramite una scala (vedi SLOTS.radius sotto e
// slotScale in setActiveWorld) — cambiare solo la scala, mai la geometria,
// evita di ricompilare gli shader ad ogni cambio di mondo (il costo vero
// del blocco durante il warp misurato in origine, vedi commento più giù).
const SATELLITE_RADIUS = 30;
const SATELLITE_DETAIL = 2;

// Sei posizioni FISSE in coordinate di scena (raggio del globo grande =
// 100), sparse nelle tre dimensioni attorno a lui — non su un'unica fascia
// frontale — per avere vera profondità/parallasse mentre la camera gira,
// invece di restare "attaccati" a lei. Coordinate scelte a mano guardando
// la scena (compresa una sesta, nello stesso stile, per il sesto mondo
// possibile — Vetrina — che le prime cinque non coprivano). `radius`
// (22-45) è il raggio APPARENTE voluto per quello slot: più vicino/grande
// per chi deve leggersi come "in primo piano", più piccolo per chi è
// dietro — la prospettiva fa il resto.
const SLOTS = [
  { pos: [320, 180, -260], radius: 26 }, // dietro-sopra a destra
  { pos: [-360, 40, 120], radius: 36 }, // sinistra, più vicino
  { pos: [-200, -230, -80], radius: 42 }, // sotto a sinistra, il più vicino
  { pos: [60, 260, -380], radius: 22 }, // dietro in alto, il più lontano
  { pos: [300, -170, 160], radius: 36 }, // destra in basso, davanti
  { pos: [-90, -300, 210], radius: 30 }, // sotto, davanti (sesto slot)
];

// Ampiezza (unità di scena) del galleggiamento sinusoidale verticale: fissa
// per tutti, non più proporzionale al raggio del satellite (era così
// quando i satelliti erano piccoli e vicini alla camera; ora sono grandi e
// lontani, un valore assoluto si legge meglio).
const BOB_AMPLITUDE = 8;

// Orbita propria lenta attorno all'asse verticale del globo (radianti al
// secondo), attiva solo quando il mouse è fuori dal canvas (vedi
// idleFactor in update() sotto, pilotato da WorldGlobe.jsx): un giro
// completo dura 360/IDLE_SATELLITE_ORBIT_DEG_S secondi. Il segno
// (orario/antiorario) resta casuale per satellite, solo per varietà — la
// MAGNITUDINE è fissa e uguale per tutti (prima era un valore casuale,
// 0.02-0.05 rad/s, ~1.1-2.9°/s). Nota sul "mai nascosto": la CAMERA non
// orbita più da sola attorno alla scena (lo faceva, ogni 40 secondi circa,
// prima che questo file venisse riscritto: disorientava, i satelliti
// sembravano sfrecciare sullo schermo) — resta solo questa deriva lenta,
// indipendente. Un primo tentativo di "inseguire" attivamente la camera
// (ruotare il satellite verso di lei quando usciva dai bordi) è stato
// scartato perché lo portava a passarle troppo vicino, esplodendo di
// dimensione in prospettiva (bug visto in uno screenshot di verifica).
// Resta solo la difesa sotto (MIN_CAMERA_DISTANCE + il margine dinamico
// sulla distanza vera della camera dal centro), che quel bug lo previene
// senza inseguire nessuno.
const ORBIT_SPEED_RAD_S = IDLE_SATELLITE_ORBIT_DEG_S * DEG2RAD;

// Distanza minima dalla camera: se l'orbita porta un satellite più vicino
// di così, viene respinto lungo la stessa direzione fino a questa
// distanza (la direzione — quindi "da che parte si vede" — resta la
// stessa, solo la prospettiva non lo fa più esplodere di dimensione). A
// questa distanza anche il satellite più grande (raggio 42, vedi SLOTS)
// ha una dimensione angolare paragonabile al globo grande, mai dominante.
// È solo un PAVIMENTO: la vera soglia usata in update() è sempre almeno
// questa, ma cresce con la distanza reale camera-centro (vedi
// SATELLITE_CAMERA_MARGIN) così un satellite non è MAI più vicino alla
// camera del globo centrale stesso, a qualunque livello di zoom.
const MIN_CAMERA_DISTANCE = 280;
// Quanto un satellite deve restare più lontano dalla camera rispetto al
// centro del globo (che è sempre nell'origine, quindi camPos.length() è
// esattamente "distanza globo centrale-camera").
const SATELLITE_CAMERA_MARGIN = 60;

// Distanza dalla camera oltre la quale un satellite comincia a sbiadire
// (profondità atmosferica, come una foschia leggera) e a cui arriva alla
// sua opacità minima.
const FOG_NEAR = 420;
const FOG_FAR = 950;
const FOG_MIN_OPACITY = 0.4;
// Quanto sbiadisce, IN PIÙ rispetto alla foschia sopra, un satellite che
// il globo sta bloccando alla vista in questo istante (mai a zero secco:
// la sua stessa orbita lenta lo scopre di nuovo prima o poi — un'opacità
// residua bassa invece di zero evita un pop-in/pop-out di scatto quando
// rientra in vista).
const OCCLUDED_OPACITY_FACTOR = 0.15;

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Il globo (sfera opaca + guscio a rete, raggio OCCLUSION_RADIUS) blocca
// la vista fra la camera e il satellite? Intersezione raggio/sfera
// standard, sfera centrata nell'origine (il centro del globo grande).
const _occDir = new THREE.Vector3();
function isOccludedByGlobe(pos, camera) {
  const camPos = camera.position;
  _occDir.copy(pos).sub(camPos);
  const distToSat = _occDir.length();
  _occDir.normalize();
  const b = camPos.dot(_occDir);
  const c = camPos.lengthSq() - OCCLUSION_RADIUS * OCCLUSION_RADIUS;
  const discriminant = b * b - c;
  if (discriminant <= 0) return false;
  const t1 = -b - Math.sqrt(discriminant);
  return t1 > 0 && t1 < distToSat;
}

// Inversa di un vettore posizione, in lat/lng invece che coordinate XYZ
// (stessa formula di vectorToPolar in categoryShell.js, coordinate
// three-globe). Serve al warp (Fase 2b, vedi WorldGlobe.jsx) per puntare
// la camera verso la DIREZIONE di un satellite con g.pointOfView({lat,
// lng, ...}) — l'unica API che react-globe.gl offre per orientare la
// camera, non un target XYZ diretto. Funziona qualunque sia la distanza
// reale del satellite: conta solo la sua direzione dall'origine.
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
// buildNetworkShell) colorato del mondo che rappresenta, con un nucleo
// pieno semi-trasparente sotto la rete (come il globo grande, che ha la
// Terra piena sotto il proprio guscio): senza un corpo pieno la sola rete
// si legge come uno scheletro spigoloso invece che come una sfera. Il nome
// del mondo resta sempre visibile sopra (stessa etichetta a pillola scura
// delle categorie sul globo grande — vedi categoryShell.js makeLabelSprite
// — ma senza il triangolo colorato dietro, qui non c'è una faccia da
// riempire).
function buildSatelliteMesh(world) {
  const group = new THREE.Group();

  const coreGeometry = new THREE.IcosahedronGeometry(SATELLITE_RADIUS, SATELLITE_DETAIL);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: world.color,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.userData.worldId = world.id;
  core.userData.isSatellite = true;
  group.add(core);

  // Come nel guscio del globo grande (vedi applyOverlayColor in
  // WorldGlobe.jsx): un mondo può avere un world.lineColor separato solo
  // per le linee, mentre nucleo e puntini restano su world.color.
  const netMaterial = new THREE.LineBasicMaterial({
    color: world.lineColor ?? world.color,
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

  const { sprite: label } = makeLabelSprite(world.label, SATELLITE_RADIUS * 1.1);
  label.position.set(0, SATELLITE_RADIUS * 1.6, 0);
  group.add(label);

  group.userData.worldId = world.id;
  group.userData.hitMesh = core;
  group.userData.opacityMeshes = [
    { mesh: core, baseOpacity: 0.3 },
    { mesh: net, baseOpacity: 0.85 },
    { mesh: nodes, baseOpacity: 1 },
    { mesh: label, baseOpacity: 1 },
  ];
  // Fase/velocità del galleggiamento: proprietà del SATELLITE (non dello
  // slot), così restano coerenti anche se lo stesso satellite cambia slot
  // da un warp all'altro. Il galleggiamento resta leggermente casuale per
  // varietà; la rotazione propria invece no (vedi SATELLITE_SPIN_PERIOD_S
  // in fx/globeRotation.js): stesso giro pulito per tutti, richiesto
  // esplicitamente dall'utente al posto del valore casuale di prima.
  group.userData.bobPhase = Math.random() * Math.PI * 2;
  group.userData.bobSpeed = ((2 * Math.PI) / 10) * (0.95 + Math.random() * 0.1);
  group.userData.spinSpeed = (2 * Math.PI) / SATELLITE_SPIN_PERIOD_S;
  // Impostati per davvero da setActiveWorld() quando il satellite diventa
  // visibile: finché createdAtMs resta -Infinity l'oggetto è comunque
  // invisibile (group.visible = false qui sotto), quindi non ha nessun
  // effetto grafico.
  group.userData.createdAtMs = -Infinity;
  group.userData.basePos = null;
  group.visible = false;

  return group;
}

// Costruisce UN SATELLITE PERSISTENTE PER OGNI MONDO (non solo quelli
// visibili adesso) e lo aggiunge DIRETTAMENTE alla scena del globo grande
// (g.scene() in WorldGlobe.jsx) — mai dentro un gruppo che ruota, mai un
// secondo <Globe>/renderer (su mobile non reggerebbe). A differenza della
// Fase 2a/2b, qui i satelliti si costruiscono UNA SOLA VOLTA IN ASSOLUTO
// (WorldGlobe.jsx la chiama da un effetto con deps [], mai più) e non
// vengono mai più ricreati: warp() si limita a chiamare setActiveWorld(),
// che mostra/nasconde e riposiziona gli stessi oggetti già pronti.
// Ricreare geometrie/materiali (quindi ricompilare gli shader) ad ogni
// warp era il vero costo del blocco misurato durante il volo.
export function buildSatelliteGlobes({ worlds }) {
  const group = new THREE.Group();
  group.name = 'rb-satellite-globes';

  const satellites = worlds.map((world) => {
    const mesh = buildSatelliteMesh(world);
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
  // SLOTS.length), assegnando ad ognuno uno slot FISSO in coordinate
  // assolute (vedi SLOTS) — la posizione vera e propria (slot + orbita
  // lenta + galleggiamento + eventuale correzione) si calcola poi ad ogni
  // fotogramma in update(). Non tocca mai geometrie/materiali: solo
  // visibilità e stato di posizionamento, più — se richiesto — un riavvio
  // dell'animazione di comparsa sui satelliti ora visibili.
  function setActiveWorld(activeWorldId, { animateSpawn = true } = {}) {
    const visibleWorlds = worlds.filter((w) => w.id !== activeWorldId).slice(0, SLOTS.length);
    const visibleIds = new Set(visibleWorlds.map((w) => w.id));
    const nowMs = performance.now();

    satellites.forEach((sat) => {
      sat.visible = visibleIds.has(sat.userData.worldId);
    });

    visibleWorlds.forEach((world, i) => {
      const sat = satellitesById.get(world.id);
      if (!sat) return;
      const slot = SLOTS[i];
      sat.userData.basePosRef = new THREE.Vector3(...slot.pos);
      sat.userData.slotScale = slot.radius / SATELLITE_RADIUS;
      // Riparte da angolo 0 (cioè esattamente la posizione dello slot,
      // quella scelta a mano) ad ogni cambio di mondo attivo: l'orbita
      // lenta e l'eventuale correzione (vedi update()) accumulano da lì.
      sat.userData.orbitAngle = 0;
      sat.userData.baseOrbitSpeed = ORBIT_SPEED_RAD_S * (Math.random() < 0.5 ? -1 : 1);
      if (animateSpawn) sat.userData.createdAtMs = nowMs;
    });
  }

  // Galleggiamento (sempre attivo) + rotazione propria e orbita lenta
  // attorno al globo (entrambe SOLO quando il mouse è fuori dal canvas,
  // scalate da idleFactor 0..1 — 0 = camera/mouse dentro, ferme; 1 = mouse
  // fuori, velocità piena — pilotato da WorldGlobe.jsx in sincrono con la
  // stessa rampa morbida del globo centrale), più le due animazioni
  // temporanee (materializzazione e crescita durante il warp) sopra.
  // "Riduci animazioni" (reduceMotion): niente rotazioni proprio, resta
  // solo il galleggiamento. Una sola difesa attiva per fotogramma: se
  // l'orbita porterebbe il satellite più vicino della soglia (sempre
  // almeno MIN_CAMERA_DISTANCE, ma cresce con la distanza vera camera-
  // centro così non è mai più vicino della camera al globo centrale
  // stesso), lo si respinge (stessa direzione, solo distanza minima
  // garantita) — evita che l'oggetto esploda di dimensione in prospettiva
  // senza mai bloccare o deviare l'orbita stessa. elapsedSec/deltaSec
  // vengono da WorldGlobe.jsx, agganciati allo stesso giro di rendering
  // del globo grande (si fermano quando lui si ferma per risparmiare CPU).
  const _toCam = new THREE.Vector3();
  function update(elapsedSec, deltaSec, camera, idleFactor = 0, reduceMotion = false) {
    const nowMs = performance.now();
    const camPos = camera.position;
    const minAllowedDist = Math.max(MIN_CAMERA_DISTANCE, camPos.length() + SATELLITE_CAMERA_MARGIN);

    for (const sat of satellites) {
      if (!sat.visible) continue;
      const ud = sat.userData;
      if (!ud.basePosRef) continue;

      if (!reduceMotion) ud.orbitAngle += ud.baseOrbitSpeed * deltaSec * idleFactor;
      const basePos = ud.basePosRef.clone().applyAxisAngle(Y_AXIS, ud.orbitAngle);
      basePos.y += Math.sin(elapsedSec * ud.bobSpeed + ud.bobPhase) * BOB_AMPLITUDE;

      _toCam.copy(basePos).sub(camPos);
      const distToCam = _toCam.length();
      if (distToCam < minAllowedDist) {
        _toCam.setLength(minAllowedDist);
        basePos.copy(camPos).add(_toCam);
      }

      ud.basePos = basePos;
      sat.position.copy(basePos);
      if (!reduceMotion) sat.rotation.y += ud.spinSpeed * deltaSec;

      let depthFactor = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(camPos.distanceTo(basePos), FOG_NEAR, FOG_FAR, 1, FOG_MIN_OPACITY),
        FOG_MIN_OPACITY,
        1
      );
      if (isOccludedByGlobe(basePos, camera)) depthFactor *= OCCLUDED_OPACITY_FACTOR;

      const spawnAge = nowMs - ud.createdAtMs;
      const spawnT = spawnAge >= SPAWN_MS ? 1 : easeOutCubic(Math.max(0, spawnAge) / SPAWN_MS);

      let warpScale = 1;
      if (ud.worldId === warpState.targetWorldId && warpState.startMs !== null) {
        const wt = Math.min(1, (nowMs - warpState.startMs) / warpState.durationMs);
        warpScale = 1 + (WARP_GROW_SCALE - 1) * easeOutCubic(wt);
      }

      sat.scale.setScalar(ud.slotScale * spawnT * warpScale);
      ud.opacityMeshes.forEach(({ mesh, baseOpacity }) => {
        mesh.material.opacity = baseOpacity * spawnT * depthFactor;
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

  return {
    group,
    satellites,
    setActiveWorld,
    update,
    getHitMeshes,
    setWarpTarget,
    getWorldLatLng,
    dispose,
  };
}
