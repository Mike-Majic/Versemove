import * as THREE from 'three';
import GeoJsonGeometry from 'three-geojson-geometry';
import { getDotTexture } from './dotTexture';
import { buildShellNodeGeometry } from './networkOverlay';
import { makeLabelSprite } from './categoryShell';
import { SATELLITE_SPIN_PERIOD_S } from '../fx/globeRotation';

const DEG2RAD = Math.PI / 180;

// Raggio intrinseco della geometria di un satellite (fisso, uguale per
// tutti: mai ricreata, vedi buildSatelliteGlobes). La dimensione APPARENTE
// varia invece per slot tramite una scala (vedi wavePoint sotto e
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

// ANELLO attorno al globo: i satelliti stanno su un cerchio orizzontale che
// gira attorno al globo grande, alternando uno più in alto e uno più in basso
// — è la "saetta" a triangolo chiusa ad anello. Di fronte si legge come la
// fila a zigzag del disegno; ruotando la camera si vede che è un anello vero.
//
// Nota: la metà "dietro" passa dietro al globo, quindi il satellite al posto 6
// non si vede (è per questo che lì ci va il mondo Work in progress).
const RING_RADIUS_WIDE = 330; // raggio dell'anello in unità di scena
const RING_SWING_WIDE = 105; // quanto sale e scende il zigzag
const RING_RADIUS_TALL = 250; // telefono
const RING_SWING_TALL = 95;
// Il posto 1 sta davanti al centro (il più grande, in primo piano) e i numeri
// crescono verso destra. Il giro va all'indietro (segno meno in wavePoint),
// così il posto 6 finisce esattamente dietro al globo.
const RING_START_DEG = 90;

// Servono solo per dare a ogni sfera il raggio giusto: le posizioni hanno
// profondità molto diverse, quindi il raggio in scena si calcola sulla
// distanza dalla camera, altrimenti quelle davanti sembrano palloni e quelle
// dietro puntini.
const CAMERA_DISTANCE_GUESS = 700;
const PROJECTION_PX = 957;
const BEAD_PX_WIDE = 46; // taglia apparente voluta, in pixel
const BEAD_PX_TALL = 36;

function isNarrow() {
  return typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
}

function wavePoint(index, total) {
  const narrow = isNarrow();
  const R = narrow ? RING_RADIUS_TALL : RING_RADIUS_WIDE;
  const swing = narrow ? RING_SWING_TALL : RING_SWING_WIDE;
  const beadPx = narrow ? BEAD_PX_TALL : BEAD_PX_WIDE;
  const a = (RING_START_DEG - (index * 360) / Math.max(total, 1)) * DEG2RAD;
  // Cerchio orizzontale attorno al globo (piano XZ) + zigzag su e giù.
  const pos = new THREE.Vector3(
    Math.cos(a) * R,
    index % 2 === 0 ? swing : -swing,
    Math.sin(a) * R
  );
  const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y + (CAMERA_DISTANCE_GUESS - pos.z) ** 2);
  const proximity = 0.7 + 0.3 * Math.max(0, Math.min(1, (dist - 220) / 220));
  const radius = Math.round((beadPx * dist) / (PROJECTION_PX * proximity));
  return { pos, radius };
}

// Distanza minima ASSOLUTA dalla camera: se un satellite risultasse più
// vicino di così, viene respinto lungo la stessa direzione fino a questa
// distanza (la direzione — quindi "da che parte si vede" — resta la
// stessa, solo la prospettiva non lo fa più esplodere di dimensione).
// Nessun legame con la distanza camera-globo centrale: un satellite PUÒ
// stare più vicino alla camera del globo stesso e passargli davanti,
// occludendolo — comportamento realistico richiesto esplicitamente (prima
// un margine dinamico lo respingeva sempre dietro anche quando sarebbe
// dovuto passare davanti, bug segnalato dal vivo). Resta solo un
// pavimento fisso per non avere un satellite gigante in faccia in
// prospettiva a distanza quasi zero.
const MIN_CAMERA_DISTANCE = 220;

// Zona di rimpicciolimento morbido quando un satellite è molto vicino
// alla camera: la scala scende con continuità (mai a scatti) man mano che
// la distanza NATURALE (prima dell'eventuale respinta sopra) scende da
// PROXIMITY_SCALE_FAR_DISTANCE fino al pavimento MIN_CAMERA_DISTANCE, fino
// a un massimo di PROXIMITY_SCALE_MIN (-30%). Puramente estetico — non
// c'entra con l'occlusione, che resta solo del depth buffer (vedi sotto).
const PROXIMITY_SCALE_FAR_DISTANCE = MIN_CAMERA_DISTANCE * 2;
const PROXIMITY_SCALE_MIN = 0.7;

// Distanza dalla camera oltre la quale un satellite comincia a sbiadire
// (profondità atmosferica, come una foschia leggera) e a cui arriva alla
// sua opacità minima. Si applica SOLO ai satelliti più lontani dalla
// camera del globo centrale stesso (cioè dietro di lui): un satellite che
// sta passando DAVANTI al globo resta sempre a piena opacità, mai in
// dissolvenza (richiesta esplicita) — l'occlusione vera e propria la
// decide comunque solo il depth buffer, questa è solo una foschia in più
// sui satelliti lontani.
const FOG_NEAR = 420;
const FOG_FAR = 950;
const FOG_MIN_OPACITY = 0.4;

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
  // Velocità di rotazione propria: stesso giro pulito per tutti, richiesto
  // esplicitamente dall'utente al posto del valore casuale di prima (vedi
  // SATELLITE_SPIN_PERIOD_S in fx/globeRotation.js).
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

  // Ordine dei posti nell'anello, numerato come nel disegno di Mike:
  // 1 Intrattenimento, 2 Bambini, 3 Nerd, 4 Animali, 5 Incontri,
  // 6 Work in progress (finisce dietro al globo), 7 Annunci, 8 Vetrina,
  // 9 Lavoro, 10 FAQ. I dispari stanno in alto, i pari in basso.
  const RING_ORDER = [
    'arte',
    'bambini',
    'nerd',
    'animali',
    'incontri',
    'wip',
    'annunci',
    'vetrina',
    'lavoro',
    'faq',
  ];

  // Posto di ogni mondo nell'anello (worldId -> indice), deciso una volta sola.
  let slotOf = null;
  let previousActiveId = null;

  function setWarpTarget(worldId, durationMs = 0) {
    warpState.targetWorldId = worldId;
    warpState.startMs = worldId ? performance.now() : null;
    warpState.durationMs = durationMs;
  }

  function getWorldLatLng(worldId) {
    const sat = satellitesById.get(worldId);
    // Solo satelliti davvero visibili: una posizione rimasta da un giro
    // precedente farebbe volare la camera verso un punto vuoto.
    if (!sat?.visible || !sat.userData.basePos) return null;
    return vectorToLatLng(sat.userData.basePos);
  }

  // Disegna sulla sfera di OGNI satellite il vero contorno dei continenti
  // (stessi dati GeoJSON del globo grande, vedi WorldGlobe.jsx/landGeo.js),
  // niente categorie né altro sopra: solo il disegno del mondo, richiesta
  // esplicita. Chiamata una sola volta, quando il GeoJSON è pronto (può
  // arrivare dopo che i satelliti sono già visibili — build asincrona,
  // vedi WorldGlobe.jsx). La geometria è identica per tutti (stesso pianeta),
  // quindi si costruisce UNA VOLTA SOLA per feature e si condivide tra i sei
  // satelliti.
  //
  // Colore SEMPRE bianco (richiesta esplicita di Mike): un tentativo
  // precedente sceglieva il colore per contrasto rispetto a world.color (il
  // colore della rete/dei puntini), ma il contorno si disegna sopra al
  // NUCLEO del satellite, che è sempre scuro/nero per ogni mondo (vedi
  // world.globeColor in worlds.js) — su un mondo chiaro come Lavoro quel
  // calcolo sbagliava riferimento e sceglieva contorni scuri, invisibili sul
  // nucleo nero sotto. Resta comunque possibile forzare un altro colore per
  // un singolo mondo con world.satelliteContinentColor, se mai servisse.
  let continentGeometries = null;
  function setContinentMap(features) {
    if (continentGeometries || !features?.length) return;
    continentGeometries = features.map(
      (feature) => new GeoJsonGeometry(feature.geometry, SATELLITE_RADIUS * CONTINENT_RADIUS_SCALE, CONTINENT_RESOLUTION_DEG)
    );

    satellites.forEach((sat) => {
      const world = worlds.find((w) => w.id === sat.userData.worldId);
      const color = world?.satelliteContinentColor ?? '#ffffff';
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

  // Mostra come satelliti tutti i mondi tranne quello attivo, ognuno sul
  // SUO posto fisso nell'anello (vedi RING_ORDER/wavePoint sopra). Quando
  // entri in un mondo il suo satellite sparisce (diventa il globo centrale)
  // e il mondo da cui vieni prende il suo posto: i due si SCAMBIANO, tutti
  // gli altri restano fermi — non un semplice ricalcolo "primi N mondi
  // rimasti" come nel vecchio sistema a slot, altrimenti ogni cambio di
  // mondo avrebbe rimescolato tutti i satelliti.
  function setActiveWorld(activeWorldId, { animateSpawn = true } = {}) {
    const nowMs = performance.now();

    if (!slotOf) {
      slotOf = new Map();
      RING_ORDER.forEach((id, i) => slotOf.set(id, i));
      // Mondi non elencati (aggiunti in futuro): in coda, sui posti liberi.
      let next = RING_ORDER.length;
      worlds.forEach((w) => {
        if (!slotOf.has(w.id)) slotOf.set(w.id, next++);
      });
    } else if (previousActiveId && previousActiveId !== activeWorldId) {
      const freed = slotOf.get(activeWorldId);
      if (freed !== undefined) slotOf.set(previousActiveId, freed);
    }
    previousActiveId = activeWorldId;

    const totalSlots = worlds.length - 1; // tutti i mondi tranne quello attivo

    satellites.forEach((sat) => {
      const id = sat.userData.worldId;
      sat.visible = id !== activeWorldId;
      if (!sat.visible) return;
      const slotIndex = slotOf.get(id);
      if (slotIndex === undefined) return;
      const slot = wavePoint(slotIndex, totalSlots);
      sat.userData.basePosRef = slot.pos;
      sat.userData.slotScale = slot.radius / SATELLITE_RADIUS;
      if (animateSpawn) sat.userData.createdAtMs = nowMs;
    });
  }

  // Rotazione propria (sempre attiva, tranne con "Riduci animazioni") più
  // le due animazioni temporanee (materializzazione e crescita durante il
  // warp). Niente più galleggiamento né orbita: la posizione è FISSA
  // (vedi basePosRef, impostato da setActiveWorld sopra). Una sola difesa
  // resta attiva per fotogramma: se un satellite risultasse più vicino
  // della soglia ASSOLUTA MIN_CAMERA_DISTANCE, lo si respinge (stessa
  // direzione, solo distanza minima garantita) — evita solo che l'oggetto
  // esploda di dimensione in prospettiva a distanza quasi zero. In più la
  // scala scende con continuità (mai a scatti, fino a -30%) quando un
  // satellite è vicino alla camera, solo per non farlo sembrare
  // sproporzionato — l'occlusione vera resta sempre quella del depth
  // buffer (vedi sopra), non dipende da questo. elapsedSec/deltaSec
  // vengono da WorldGlobe.jsx, agganciati allo stesso giro di rendering
  // del globo grande (si fermano quando lui si ferma per risparmiare CPU).
  const _toCam = new THREE.Vector3();
  function update(elapsedSec, deltaSec, camera, idleFactor = 0, reduceMotion = false) {
    const nowMs = performance.now();
    const camPos = camera.position;
    const globeDistToCam = camPos.length();

    for (const sat of satellites) {
      if (!sat.visible) continue;
      const ud = sat.userData;
      if (!ud.basePosRef) continue;

      // Posizione FISSA. Il clone serve solo perché il pavimento
      // MIN_CAMERA_DISTANCE può spostare la copia quando è la CAMERA ad
      // avvicinarsi.
      const basePos = ud.basePosRef.clone();

      _toCam.copy(basePos).sub(camPos);
      const naturalDistToCam = _toCam.length();
      if (naturalDistToCam < MIN_CAMERA_DISTANCE) {
        _toCam.setLength(MIN_CAMERA_DISTANCE);
        basePos.copy(camPos).add(_toCam);
      }

      ud.basePos = basePos;
      sat.position.copy(basePos);
      if (!reduceMotion) sat.rotation.y += ud.spinSpeed * deltaSec;

      // Foschia leggera solo per le decorazioni trasparenti (mai per il
      // nucleo, opaco e sempre a piena opacità — vedi sopra), e solo se il
      // satellite è più lontano dalla camera del globo centrale stesso
      // (quindi dietro di lui): davanti resta sempre piena opacità, senza
      // nessuna dissolvenza, a prescindere dalla distanza.
      const satDistToCam = camPos.distanceTo(basePos);
      const depthFactor =
        satDistToCam > globeDistToCam
          ? THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(satDistToCam, FOG_NEAR, FOG_FAR, 1, FOG_MIN_OPACITY), FOG_MIN_OPACITY, 1)
          : 1;

      const spawnAge = nowMs - ud.createdAtMs;
      const spawnT = spawnAge >= SPAWN_MS ? 1 : easeOutCubic(Math.max(0, spawnAge) / SPAWN_MS);

      let warpScale = 1;
      if (ud.worldId === warpState.targetWorldId && warpState.startMs !== null) {
        const wt = Math.min(1, (nowMs - warpState.startMs) / warpState.durationMs);
        warpScale = 1 + (WARP_GROW_SCALE - 1) * easeOutCubic(wt);
      }

      // Rimpicciolimento morbido in prossimità della camera, sulla
      // distanza NATURALE (prima dell'eventuale respinta sopra) così resta
      // continuo anche quando il satellite è già al pavimento.
      const proximityT = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(naturalDistToCam, MIN_CAMERA_DISTANCE, PROXIMITY_SCALE_FAR_DISTANCE, 0, 1),
        0,
        1
      );
      const proximityScale = PROXIMITY_SCALE_MIN + (1 - PROXIMITY_SCALE_MIN) * proximityT;

      sat.scale.setScalar(ud.slotScale * spawnT * warpScale * proximityScale);
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
