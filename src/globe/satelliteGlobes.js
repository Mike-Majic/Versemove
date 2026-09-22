import * as THREE from 'three';
import GeoJsonGeometry from 'three-geojson-geometry';
import { getDotTexture } from './dotTexture';
import { buildShellNodeGeometry } from './networkOverlay';
import { makeLabelSprite } from './categoryShell';
import { SATELLITE_SPIN_PERIOD_S, IDLE_SATELLITE_ORBIT_DEG_S } from '../fx/globeRotation';

const DEG2RAD = Math.PI / 180;

// Raggio intrinseco della geometria di un satellite (fisso, uguale per
// tutti: mai ricreata, vedi buildSatelliteGlobes). La dimensione APPARENTE
// varia invece per slot tramite una scala (vedi SLOTS.radius sotto e
// slotScale in setActiveWorld) — cambiare solo la scala, mai la geometria,
// evita di ricompilare gli shader ad ogni cambio di mondo (il costo vero
// del blocco durante il warp misurato in origine, vedi commento più giù).
const SATELLITE_RADIUS = 30;
const SATELLITE_DETAIL = 2;

// Contorni reali dei continenti sulla sfera di un satellite (stessa idea del
// globo grande, vedi WorldGlobe.jsx polygonsData/landGeo.js, ma lì è
// react-globe.gl a disegnarli con la sua proiezione interna: un satellite è
// una Mesh THREE "nuda", quindi qui servono direttamente — three-geojson-
// geometry (già una dipendenza transitiva di three-globe, ora dichiarata
// anche qui) genera una BufferGeometry a segmenti pronti per THREE.LineSegments
// da un oggetto GeoJSON, proiettati sulla sfera di un raggio dato. Un filo
// appena più largo del raggio del satellite (vedi CONTINENT_RADIUS_SCALE
// sotto) evita z-fighting con la rete/nucleo che stanno esattamente a
// SATELLITE_RADIUS. Risoluzione in gradi: più bassa = curve più fedeli ma
// più vertici — 6° basta per la scala a cui si vedono i satelliti.
const CONTINENT_RADIUS_SCALE = 1.015;
const CONTINENT_RESOLUTION_DEG = 6;

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

const Y_AXIS = new THREE.Vector3(0, 1, 0);

// L'occlusione fra satellite e globo grande NON è più simulata a mano (un
// test raggio/sfera JS che abbassava l'opacità quando "calcolava" un
// satellite coperto): sul canale trasparente l'ordine di disegno, non la
// vera profondità, decide chi si vede sopra chi, e quel calcolo lato JS
// poteva far scomparire un satellite anche quando era davanti, non dietro
// (bug segnalato dal vivo). Ora l'occlusione è quella vera della GPU
// (depth test), gratuita e sempre corretta: basta che il CORPO di ogni
// satellite sia opaco (depthWrite/depthTest attivi, vedi coreMaterial più
// sotto) esattamente come il globo grande (vedi globeMaterial in
// WorldGlobe.jsx, già opaco) — un satellite davanti copre il globo, uno
// dietro viene coperto, senza calcoli manuali.

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
// buildNetworkShell) con un nucleo OPACO sotto la rete — non più
// semi-trasparente: un corpo che non scrive/legge davvero la profondità non
// può occludere né essere occluso correttamente dal globo grande (era il
// bug: "davanti" al globo il satellite si vedeva mimetizzato/trasparente
// invece che pieno). Stesso schema del globo grande (vedi globeMaterial in
// WorldGlobe.jsx): base scura e opaca (world.globeColor) che fa da vero
// corpo 3D, colore del mondo affidato solo alla rete/ai nodi sopra, che
// restano decorazioni trasparenti. Il nome del mondo resta sempre visibile
// sopra (stessa etichetta a pillola scura delle categorie sul globo grande
// — vedi categoryShell.js makeLabelSprite — ma senza il triangolo colorato
// dietro, qui non c'è una faccia da riempire).
function buildSatelliteMesh(world) {
  const group = new THREE.Group();

  const coreGeometry = new THREE.IcosahedronGeometry(SATELLITE_RADIUS, SATELLITE_DETAIL);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: world.globeColor ?? '#050508',
    transparent: false,
    depthWrite: true,
    depthTest: true,
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.userData.worldId = world.id;
  core.userData.isSatellite = true;
  group.add(core);

  // Come nel guscio del globo grande (vedi applyOverlayColor in
  // WorldGlobe.jsx): un mondo può avere un world.lineColor separato solo
  // per le linee, mentre i puntini restano su world.color. Decorazioni
  // trasparenti sopra al nucleo opaco: renderOrder più alto del reticolo
  // del globo grande (che resta a 0, il default) così, nei rari casi in cui
  // due elementi trasparenti sono quasi alla stessa profondità, quelli del
  // satellite non vengono "velati" dal reticolo del globo grande.
  const netMaterial = new THREE.LineBasicMaterial({
    color: world.lineColor ?? world.color,
    transparent: true,
    opacity: 0.85,
  });
  const net = new THREE.LineSegments(new THREE.EdgesGeometry(coreGeometry), netMaterial);
  net.renderOrder = 2;
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
  nodes.renderOrder = 2;
  group.add(nodes);

  const { sprite: label } = makeLabelSprite(world.label, SATELLITE_RADIUS * 1.1);
  label.position.set(0, SATELLITE_RADIUS * 1.6, 0);
  group.add(label);

  // Guscio per i contorni reali dei continenti (vedi setContinentMap più
  // sotto): vuoto e invisibile finché il GeoJSON non è arrivato — lo stesso
  // dato, già caricato una volta per il globo grande (loadLandGeo() lo
  // mette in cache), viene riusato qui senza una seconda richiesta di rete.
  const continentGroup = new THREE.Group();
  continentGroup.visible = false;
  group.add(continentGroup);

  group.userData.worldId = world.id;
  group.userData.hitMesh = core;
  group.userData.continentGroup = continentGroup;
  // Il nucleo NON è più in questa lista: è opaco, la sua opacity è sempre
  // 1 e non deve mai sfumare (né per foschia né per occlusione, richiesta
  // esplicita — "davanti l'opacità resta 1"). Sfumano solo le decorazioni
  // trasparenti sopra di lui.
  group.userData.opacityMeshes = [
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

  // Sceglie bianco o quasi-nero per i contorni dei continenti in base alla
  // luminanza del colore del mondo (stessa idea di un "testo leggibile su
  // qualunque sfondo"): sul globo grande i continenti si distinguono dal
  // reticolo perché hanno anche un riempimento tenue oltre al contorno
  // (polygonCapColor); qui, senza riempimento, usare lo stesso colore della
  // rete (world.atmosphereColor, il tentativo iniziale) li mimetizzava
  // completamente — invisibili a colpo d'occhio anche se tecnicamente
  // disegnati. Un mondo chiaro (es. Lavoro, quasi bianco) prende contorni
  // scuri; uno scuro o saturo prende contorni bianchi.
  const _luminanceColor = new THREE.Color();
  function pickContrastColor(hex) {
    _luminanceColor.set(hex);
    const luminance = 0.2126 * _luminanceColor.r + 0.7152 * _luminanceColor.g + 0.0722 * _luminanceColor.b;
    return luminance > 0.6 ? '#0a0a12' : '#ffffff';
  }

  // Disegna sulla sfera di OGNI satellite il vero contorno dei continenti
  // (stessi dati GeoJSON del globo grande, vedi WorldGlobe.jsx/landGeo.js),
  // niente categorie né altro sopra: solo il disegno del mondo, richiesta
  // esplicita. Chiamata una sola volta, quando il GeoJSON è pronto (può
  // arrivare dopo che i satelliti sono già visibili — build asincrona,
  // vedi WorldGlobe.jsx). La geometria è identica per tutti (stesso pianeta),
  // quindi si costruisce UNA VOLTA SOLA per feature e si condivide tra i sei
  // satelliti: solo il colore (vedi pickContrastColor sopra) resta per-satellite.
  let continentGeometries = null;
  function setContinentMap(features) {
    if (continentGeometries || !features?.length) return;
    continentGeometries = features.map(
      (feature) => new GeoJsonGeometry(feature.geometry, SATELLITE_RADIUS * CONTINENT_RADIUS_SCALE, CONTINENT_RESOLUTION_DEG)
    );

    satellites.forEach((sat) => {
      const world = worlds.find((w) => w.id === sat.userData.worldId);
      const color = pickContrastColor(world?.color ?? '#888888');
      const continentGroup = sat.userData.continentGroup;

      continentGeometries.forEach((geometry) => {
        const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
        const lines = new THREE.LineSegments(geometry, material);
        lines.renderOrder = 2;
        continentGroup.add(lines);
        sat.userData.opacityMeshes.push({ mesh: lines, baseOpacity: 0.85 });
      });

      continentGroup.visible = true;
    });
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

      // Foschia leggera solo per le decorazioni trasparenti (mai per il
      // nucleo, opaco e sempre a piena opacità — vedi sopra): puramente in
      // funzione della distanza dalla camera, non più anche
      // dell'occlusione dietro al globo, che ora è quella vera della GPU.
      const depthFactor = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(camPos.distanceTo(basePos), FOG_NEAR, FOG_FAR, 1, FOG_MIN_OPACITY),
        FOG_MIN_OPACITY,
        1
      );

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
    setContinentMap,
    dispose,
  };
}
