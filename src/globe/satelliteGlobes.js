import * as THREE from 'three';
import GeoJsonGeometry from 'three-geojson-geometry';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getDotTexture } from './dotTexture';
import { buildShellNodeGeometry } from './networkOverlay';
import { makeLabelSprite } from './categoryShell';
import { SATELLITE_SPIN_PERIOD_S } from '../fx/globeRotation';
import { PX, COLLAPSE_S, REVIVE_S, addSuckWarp, buildBlackHole, collapsePhase, makeDisabledTagSprite, revivePhase } from './blackHole';

const DEG2RAD = Math.PI / 180;

// Raggio intrinseco della geometria di un satellite (fisso, uguale per
// tutti: mai ricreata, vedi buildSatelliteGlobes). La dimensione APPARENTE
// varia invece per satellite tramite una scala ricalcolata ad ogni
// fotogramma in update() — cambiare solo la scala, mai la geometria, evita
// di ricompilare gli shader ad ogni cambio di mondo (il costo vero del
// blocco durante il warp misurato in origine, vedi commento più giù).
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

// Taglia apparente voluta di OGNI satellite, in pixel, ALL'ALTITUDINE DI
// DEFAULT — stessa per tutti (richiesta esplicita: tutti come "Vetrina",
// nessuno più grande/piccolo degli altri). Il raggio 3D vero che la
// produce si ricava dalla distanza REALE dalla camera, ricalcolata ad ogni
// fotogramma in update() (non più una volta sola qui, su una distanza
// camera solo indovinata): altrimenti, appena l'utente ruota la vista,
// ogni satellite si sbilancia in modo diverso dagli altri in base alla sua
// profondità nell'anello (bug segnalato dal vivo — "Incontri" enorme e
// "Vetrina" minuscola nello stesso schermo). Zoomando avanti/indietro
// invece l'intero anello scala insieme al globo, prospettiva normale (vedi
// referenceCamDist in update()) — beadPx NON è quindi una taglia fissa in
// pixel a qualunque zoom, solo il punto di calibrazione alla distanza di
// default. Il testo dell'etichetta scala insieme alla sfera (stesso
// gruppo, stessa scala), quindi si sistema da sé.
const PROJECTION_PX = 957;
const BEAD_PX_WIDE = 46;
const BEAD_PX_TALL = 36;

function isNarrow() {
  return typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
}

function targetBeadPx() {
  return isNarrow() ? BEAD_PX_TALL : BEAD_PX_WIDE;
}

function wavePoint(index, total) {
  const narrow = isNarrow();
  const R = narrow ? RING_RADIUS_TALL : RING_RADIUS_WIDE;
  const swing = narrow ? RING_SWING_TALL : RING_SWING_WIDE;
  const a = (RING_START_DEG - (index * 360) / Math.max(total, 1)) * DEG2RAD;
  // Cerchio orizzontale attorno al globo (piano XZ) + zigzag su e giù.
  const pos = new THREE.Vector3(
    Math.cos(a) * R,
    index % 2 === 0 ? swing : -swing,
    Math.sin(a) * R
  );
  return { pos };
}

// Distanza minima dalla camera: un satellite più vicino di così si
// dissolve (vedi COVER_FADE_S). Prima veniva respinto lungo la stessa
// direzione fino a questa distanza, ma così restava incollato davanti
// all'obiettivo e seguiva la camera, col nucleo scuro e opaco che copriva
// gran parte della vista (il mappamondo "diventava nero"). Un satellite
// PUÒ comunque passare davanti al globo e coprirne un pezzo: sparisce solo
// se sta proprio sulla linea camera → centro del globo (vedi
// COVER_SEGMENT_RADIUS_MUL) o troppo vicino.
const MIN_CAMERA_DISTANCE = 220;
// Un satellite il cui centro dista dal segmento camera → centro del globo
// meno del suo raggio per questo fattore sta "fra la camera e il globo":
// si dissolve anche se è lontano dalla camera.
const COVER_SEGMENT_RADIUS_MUL = 1.5;
// Durata della dissolvenza in uscita e in entrata (secondi).
const COVER_FADE_S = 0.3;

// Zona di rimpicciolimento morbido quando un satellite è molto vicino
// alla camera: la scala scende con continuità (mai a scatti) man mano che
// la distanza dalla camera scende da PROXIMITY_SCALE_FAR_DISTANCE fino a
// MIN_CAMERA_DISTANCE (dove ormai è sparito in dissolvenza), fino
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
// Nodi "a luce laterale" (world.nodeShading === 'luce-laterale'): stesso
// PointsMaterial di sempre (dimensione, attenuazione, texture tonda come
// alfa, opacity pilotata da update() come per gli altri) ma col colore
// calcolato per punto da una luce fissa in spazio vista — in alto a
// sinistra verso chi guarda — così il lato illuminato resta lo stesso
// mentre il satellite ruota e orbita. Fusione normale e non additiva: con
// l'additiva i puntini in ombra sparirebbero invece di diventare scuri.
// Estremi definiti in sRGB: il renderer converte l'uscita, quindi a
// schermo restano i valori scelti (quasi nero -> quasi bianco).
const SIDE_LIT_DARK = new THREE.Color().setRGB(0.1, 0.1, 0.12, THREE.SRGBColorSpace);
const SIDE_LIT_LIGHT = new THREE.Color().setRGB(0.93, 0.93, 0.96, THREE.SRGBColorSpace);

function buildSideLitNodeMaterial() {
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: SATELLITE_RADIUS * 0.22,
    map: getDotTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    sizeAttenuation: true,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uColorDark = { value: SIDE_LIT_DARK };
    shader.uniforms.uColorLight = { value: SIDE_LIT_LIGHT };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLuce;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vec3 nodeNormal = normalize( normalMatrix * normalize( position ) );
  vLuce = smoothstep( -0.15, 0.85, dot( nodeNormal, normalize( vec3( -0.6, 0.6, 0.8 ) ) ) );`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLuce;\nuniform vec3 uColorDark;\nuniform vec3 uColorLight;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( mix( uColorDark, uColorLight, vLuce ), opacity );');
  };
  return material;
}

function buildSatelliteMesh(world) {
  const group = new THREE.Group();
  // Il "corpo" (nucleo, rete, nodi, continenti) sta in un sottogruppo: è lui
  // a ruotare su se stesso, non l'intero satellite, così l'etichetta e il
  // buco nero di un mondo disattivato (vedi blackHole.js) restano fermi.
  const body = new THREE.Group();
  group.add(body);
  // Risucchio a spirale del corpo quando il mondo viene disattivato (0 =
  // fermo, 1 = inghiottito): un solo uniform condiviso da tutti i suoi
  // materiali, vedi addSuckWarp.
  const suck = { value: 0 };

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
  body.add(core);

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
  body.add(net);

  const nodeMaterial =
    world.nodeShading === 'luce-laterale'
      ? buildSideLitNodeMaterial()
      : new THREE.PointsMaterial({
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
  body.add(nodes);
  [coreMaterial, netMaterial, nodeMaterial].forEach((m) => addSuckWarp(m, suck));

  const { sprite: label } = makeLabelSprite(world.label, SATELLITE_RADIUS * 1.1);
  label.position.set(0, SATELLITE_RADIUS * 1.6, 0);
  label.renderOrder = 10;
  group.add(label);

  // Guscio per i contorni reali dei continenti (vedi setContinentMap più
  // sotto): vuoto e invisibile finché il GeoJSON non è arrivato — lo stesso
  // dato, già caricato una volta per il globo grande (loadLandGeo() lo
  // mette in cache), viene riusato qui senza una seconda richiesta di rete.
  const continentGroup = new THREE.Group();
  continentGroup.visible = false;
  body.add(continentGroup);

  group.userData.worldId = world.id;
  group.userData.world = world;
  group.userData.body = body;
  group.userData.suck = suck;
  group.userData.label = label;
  group.userData.labelBase = { y: label.position.y, sx: label.scale.x, sy: label.scale.y };
  // Buco nero (vedi setDisabledWorlds): costruito solo al primo bisogno.
  group.userData.hole = null;
  group.userData.holeState = 'none'; // none | collapsing | hole | reviving
  group.userData.holeStartMs = 0;
  group.userData.holeT = 0;
  group.userData.hitMesh = core;
  group.userData.coreMaterial = core.material;
  // 1 = visibile, 0 = dissolto perché copriva la vista (vedi update).
  group.userData.coverFade = 1;
  group.userData.continentGroup = continentGroup;
  // Il nucleo NON è più in questa lista: è opaco, la sua opacity è sempre
  // 1 e non deve mai sfumare (né per foschia né per occlusione, richiesta
  // esplicita — "davanti l'opacità resta 1"). Sfumano solo le decorazioni
  // trasparenti sopra di lui.
  // part: a quale moltiplicatore risponde durante disattivazione e
  // riattivazione (corpo che sparisce nel buco, etichetta che ci cade dentro).
  group.userData.opacityMeshes = [
    { mesh: net, baseOpacity: 0.85, part: 'body' },
    { mesh: nodes, baseOpacity: 1, part: 'body' },
    { mesh: label, baseOpacity: 1, part: 'label' },
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

  // Distanza camera-globo catturata al primo fotogramma utile: la scala dei
  // satelliti (vedi update() più sotto) la usa come riferimento "punto zero"
  // — qualunque sia la distanza di default reale (dipende dall'altitudine
  // iniziale e dalla formula interna di react-globe.gl, che non si vuole
  // indovinare qui), la calibrazione visiva già scelta con beadPx resta
  // quella, e lo zoom dell'utente scala naturalmente sopra/sotto da lì.
  let referenceCamDist = null;

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
  // Tutte le feature in UNA geometria (mergeGeometries): una sola
  // LineSegments, cioè una draw call, per satellite, qualunque sia il numero
  // di feature del GeoJSON.
  let continentGeometry = null;
  function setContinentMap(features) {
    if (continentGeometry || !features?.length) return;
    const parts = features.map(
      (feature) => new GeoJsonGeometry(feature.geometry, SATELLITE_RADIUS * CONTINENT_RADIUS_SCALE, CONTINENT_RESOLUTION_DEG)
    );
    continentGeometry = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    if (parts.length > 1) parts.forEach((part) => part.dispose());

    satellites.forEach((sat) => {
      const world = worlds.find((w) => w.id === sat.userData.worldId);
      const color = world?.satelliteContinentColor ?? '#ffffff';
      const continentGroup = sat.userData.continentGroup;

      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
      addSuckWarp(material, sat.userData.suck);
      const lines = new THREE.LineSegments(continentGeometry, material);
      lines.renderOrder = 2;
      continentGroup.add(lines);
      sat.userData.opacityMeshes.push({ mesh: lines, baseOpacity: 0.85, part: 'body' });

      continentGroup.visible = true;
    });
  }

  // Mostra come satelliti tutti i mondi tranne quello attivo. Ogni mondo
  // dell'anello (RING_ORDER) sta SEMPRE sul suo stesso posto fisso, in
  // qualunque momento — non si sposta mai. Il mondo Social (l'unico escluso
  // da RING_ORDER, non ha un posto fisso tutto suo, essendo il mondo di
  // casa dell'app) prende invece il posto lasciato libero dal mondo attivo
  // in quel momento — l'unico posto del ring sempre vuoto, visto che il
  // mondo attivo non è mai un satellite. Così solo Social "si sposta"
  // seguendo il mondo attivo, tutti gli altri restano fissi.
  //
  // Calcolo puro (nessuno stato salvato tra una chiamata e l'altra, solo
  // RING_ORDER.indexOf): la versione precedente teneva uno storico di
  // "scambi" (chi ha preso il posto di chi) che poteva disallinearsi dopo
  // molte chiamate, con due satelliti diversi che finivano sullo stesso
  // punto (bug segnalato dal vivo con screenshot, dopo diversi cambi
  // mondo). Un calcolo che riparte sempre da zero da un dato fisso non può
  // desincronizzarsi, qualunque sequenza di cambi mondo preceda la chiamata.
  function setActiveWorld(activeWorldId, { animateSpawn = true } = {}) {
    const nowMs = performance.now();
    const totalSlots = worlds.length - 1; // tutti i mondi tranne quello attivo
    const activeRingIndex = RING_ORDER.indexOf(activeWorldId);

    satellites.forEach((sat) => {
      const id = sat.userData.worldId;
      sat.visible = id !== activeWorldId;
      if (!sat.visible) return;

      const slotIndex = id === 'social' ? (activeRingIndex !== -1 ? activeRingIndex : 0) : RING_ORDER.indexOf(id);
      if (slotIndex === -1) return;

      sat.userData.basePosRef = wavePoint(slotIndex, totalSlots).pos;
      if (animateSpawn) sat.userData.createdAtMs = nowMs;
    });
  }

  // Mondi disattivati dall'utente (Impostazioni -> Mondi): al posto del
  // satellite resta un buco nero che continua a risucchiare (vedi
  // blackHole.js). animate: true quando la disattivazione avviene adesso
  // (risucchio del globo in ~7 s, poi buco nero stabile) o quando un mondo
  // viene riattivato (il globo si srotola fuori in ~1,6 s); false per lo
  // stato già salvato all'apertura dell'app, che compare direttamente.
  function ensureHole(sat, index) {
    const ud = sat.userData;
    if (ud.hole) return ud.hole;
    const hole = buildBlackHole(ud.world, 7 + index * 131);
    const billboard = new THREE.Group();
    billboard.add(hole.group);
    sat.add(billboard);
    const { sprite: dimLabel } = makeLabelSprite(ud.world.label, SATELLITE_RADIUS * 1.1, '#8d8d9a');
    // Sopra l'arco di luce del buco (a ~1,46 volte il suo raggio, grande
    // quanto il satellite): etichetta spenta e scritta "DISATTIVATO".
    dimLabel.position.set(0, SATELLITE_RADIUS * 2.1, 0);
    dimLabel.renderOrder = 10;
    const tag = makeDisabledTagSprite(SATELLITE_RADIUS * 0.34);
    tag.position.set(0, SATELLITE_RADIUS * 1.5, 0);
    sat.add(dimLabel, tag);
    ud.hole = { ...hole, billboard, dimLabel, tag };
    return ud.hole;
  }

  function setDisabledWorlds(worldIds, { animate = false } = {}) {
    const disabled = new Set(worldIds);
    const nowMs = performance.now();
    satellites.forEach((sat, index) => {
      const ud = sat.userData;
      const off = disabled.has(ud.worldId);
      if (off && (ud.holeState === 'none' || ud.holeState === 'reviving')) {
        ensureHole(sat, index);
        ud.holeState = animate ? 'collapsing' : 'hole';
        ud.holeStartMs = nowMs;
      } else if (!off && (ud.holeState === 'hole' || ud.holeState === 'collapsing')) {
        ud.holeState = animate ? 'reviving' : 'none';
        ud.holeStartMs = nowMs;
      }
    });
  }

  function isDisabled(worldId) {
    const state = satellitesById.get(worldId)?.userData.holeState;
    return state === 'hole' || state === 'collapsing';
  }

  // Fase del buco nero per questo fotogramma (null = satellite normale).
  function holePhase(ud, nowMs, reduceMotion) {
    const t = (nowMs - ud.holeStartMs) / 1000;
    if (ud.holeState === 'collapsing') {
      if (reduceMotion || t >= COLLAPSE_S) ud.holeState = 'hole';
      return collapsePhase(ud.holeState === 'hole' ? Infinity : t);
    }
    if (ud.holeState === 'hole') return collapsePhase(Infinity);
    if (ud.holeState === 'reviving') {
      if (reduceMotion || t >= REVIVE_S) {
        ud.holeState = 'none';
        return null;
      }
      return revivePhase(t);
    }
    return null;
  }

  // Rotazione propria (sempre attiva, tranne con "Riduci animazioni") più
  // le due animazioni temporanee (materializzazione e crescita durante il
  // warp). Niente più galleggiamento né orbita: la posizione è FISSA
  // (vedi basePosRef, impostato da setActiveWorld sopra), anche quando la
  // camera si avvicina. Un satellite troppo vicino alla camera
  // (MIN_CAMERA_DISTANCE) o fra la camera e il globo centrale
  // (COVER_SEGMENT_RADIUS_MUL) si dissolve in COVER_FADE_S e torna in
  // dissolvenza quando la vista si libera. In più la
  // scala scende con continuità (mai a scatti, fino a -30%) quando un
  // satellite è vicino alla camera, solo per non farlo sembrare
  // sproporzionato — l'occlusione vera resta sempre quella del depth
  // buffer (vedi sopra), non dipende da questo. elapsedSec/deltaSec
  // vengono da WorldGlobe.jsx, agganciati allo stesso giro di rendering
  // del globo grande (si fermano quando lui si ferma per risparmiare CPU).
  const _toCam = new THREE.Vector3();
  const _camToCenter = new THREE.Vector3();
  const _closest = new THREE.Vector3();

  // Distanza del punto p dal segmento camera → centro del globo (origine),
  // oppure Infinity se p non sta "fra" i due (proiezione fuori dal segmento).
  function distFromViewSegment(p, camPos) {
    _camToCenter.copy(camPos).negate();
    const lenSq = _camToCenter.lengthSq();
    if (lenSq === 0) return Infinity;
    const t = _toCam.copy(p).sub(camPos).dot(_camToCenter) / lenSq;
    if (t <= 0 || t >= 1) return Infinity;
    _closest.copy(camPos).addScaledVector(_camToCenter, t);
    return _closest.distanceTo(p);
  }

  function update(elapsedSec, deltaSec, camera, idleFactor = 0, reduceMotion = false) {
    const nowMs = performance.now();
    const camPos = camera.position;
    const globeDistToCam = camPos.length();
    const beadPx = targetBeadPx();
    if (referenceCamDist === null) referenceCamDist = globeDistToCam;

    for (const sat of satellites) {
      if (!sat.visible) continue;
      const ud = sat.userData;
      if (!ud.basePosRef) continue;

      // Posizione FISSA, sempre: non segue più la camera.
      const basePos = ud.basePosRef;
      const naturalDistToCam = camPos.distanceTo(basePos);

      ud.basePos = basePos;
      sat.position.copy(basePos);
      if (!reduceMotion) ud.body.rotation.y += ud.spinSpeed * deltaSec;

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

      // Rimpicciolimento morbido in prossimità della camera.
      const proximityT = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(naturalDistToCam, MIN_CAMERA_DISTANCE, PROXIMITY_SCALE_FAR_DISTANCE, 0, 1),
        0,
        1
      );
      const proximityScale = PROXIMITY_SCALE_MIN + (1 - PROXIMITY_SCALE_MIN) * proximityT;

      // Raggio 3D vero calcolato sulla distanza REALE dalla camera in
      // questo fotogramma (mai una distanza indovinata una tantum): il
      // fattore (naturalDistToCam / globeDistToCam) annulla SOLO la
      // variazione dovuta alla profondità del satellite nell'anello (dà a
      // tutti i satelliti la stessa taglia apparente TRA LORO, qualunque
      // sia il loro posto/profondità o quanto l'utente abbia ruotato la
      // vista), mentre (referenceCamDist / globeDistToCam) lascia intatta
      // la prospettiva normale sullo ZOOM generale: allontanandosi tutto
      // l'anello rimpicciolisce insieme al globo invece di restare fissato
      // a una taglia in pixel costante (bug segnalato dal vivo — l'anello
      // sembrava "fondersi" zoomando indietro).
      const slotScale =
        (beadPx * referenceCamDist * naturalDistToCam) / (globeDistToCam * PROJECTION_PX * SATELLITE_RADIUS);

      sat.scale.setScalar(slotScale * spawnT * warpScale * proximityScale);

      // Dissolvenza quando copre la vista (troppo vicino alla camera o sulla
      // linea camera → globo). Mai per il satellite verso cui si sta
      // facendo il warp: la camera ci vola incontro apposta.
      const isWarpTarget = ud.worldId === warpState.targetWorldId && warpState.startMs !== null;
      const satRadius = SATELLITE_RADIUS * slotScale * warpScale * proximityScale;
      const blocksView =
        !isWarpTarget &&
        (naturalDistToCam < MIN_CAMERA_DISTANCE || distFromViewSegment(basePos, camPos) < satRadius * COVER_SEGMENT_RADIUS_MUL);
      const fadeStep = Math.min(1, Math.max(0, deltaSec) / COVER_FADE_S);
      ud.coverFade = blocksView ? Math.max(0, ud.coverFade - fadeStep) : Math.min(1, ud.coverFade + fadeStep);
      const coverFade = ud.coverFade;
      // Il nucleo è opaco (occlude davvero, vedi sopra): durante la
      // dissolvenza diventa trasparente, altrimenti resterebbe una macchia
      // nera piena fino all'ultimo. OPAQUE è un define dello shader, quindi
      // il cambio di transparent vuole needsUpdate (solo al passaggio).
      const coreMaterial = ud.coreMaterial;
      const coreTransparent = coverFade < 1;
      if (coreMaterial.transparent !== coreTransparent) {
        coreMaterial.transparent = coreTransparent;
        coreMaterial.depthWrite = !coreTransparent;
        coreMaterial.needsUpdate = true;
      }
      coreMaterial.opacity = coverFade;

      // Buco nero di un mondo disattivato (vedi setDisabledWorlds).
      const phase = ud.holeState === 'none' ? null : holePhase(ud, nowMs, reduceMotion);
      let bodyMul = 1;
      let labelMul = 1;
      const label = ud.label;
      const base = ud.labelBase;
      ud.suck.value = phase ? phase.suck : 0;
      ud.body.visible = !phase || phase.suck < 1;
      if (phase) {
        bodyMul = 1 - THREE.MathUtils.clamp((phase.suck - 0.75) / 0.25, 0, 1);
        labelMul = phase.oldLabel;
      }
      if (phase && ud.holeState === 'collapsing') {
        // L'etichetta trema, gira e cade nel buco insieme al mondo.
        const e = phase.suck * phase.suck * phase.suck;
        const jitter = phase.born > 0 && phase.suck < 1 ? Math.sin(elapsedSec * 40) * 2 * PX : 0;
        label.position.set(jitter, base.y * (1 - e), 0);
        label.material.rotation = e * 2.4;
        label.scale.set(base.sx * (1 - 0.8 * phase.suck), base.sy * (1 - 0.8 * phase.suck), 1);
      } else if (label.material.rotation !== 0 || label.position.y !== base.y) {
        label.position.set(0, base.y, 0);
        label.material.rotation = 0;
        label.scale.set(base.sx, base.sy, 1);
      }
      label.visible = labelMul > 0.001;

      const hole = ud.hole;
      if (hole) {
        hole.billboard.visible = Boolean(phase);
        hole.dimLabel.visible = Boolean(phase) && phase.newLabel > 0.001;
        hole.tag.visible = hole.dimLabel.visible;
        if (phase) {
          if (!reduceMotion) ud.holeT += deltaSec;
          // Cartellone rivolto alla camera e spostato verso di lei di un
          // raggio: il nucleo opaco del satellite non copre il buco mentre
          // il mondo ci cade dentro.
          hole.billboard.quaternion.copy(camera.quaternion);
          _toCam.copy(camPos).sub(sat.position).normalize().multiplyScalar(SATELLITE_RADIUS * 1.05);
          hole.billboard.position.copy(_toCam);
          const fade = spawnT * depthFactor * coverFade;
          hole.update(ud.holeT, phase, fade, sat.scale.x);
          hole.dimLabel.material.opacity = phase.newLabel * 0.9 * fade;
          hole.tag.material.opacity = phase.newLabel * fade;
        }
      }

      ud.opacityMeshes.forEach(({ mesh, baseOpacity, part }) => {
        const mul = part === 'body' ? bodyMul : part === 'label' ? labelMul : 1;
        mesh.material.opacity = baseOpacity * spawnT * depthFactor * mul * coverFade;
      });

      // Del tutto dissolto: non si disegna proprio (niente draw call).
      // sat.visible resta di setActiveWorld (quali mondi sono satelliti),
      // qui si spengono solo i figli.
      if (coverFade <= 0) {
        ud.body.visible = false;
        label.visible = false;
        if (hole) {
          hole.billboard.visible = false;
          hole.dimLabel.visible = false;
          hole.tag.visible = false;
        }
      }
    }
  }

  // Un satellite dissolto (vedi coverFade in update) non si può cliccare.
  function getHitMeshes() {
    return satellites.filter((s) => s.visible && s.userData.coverFade > 0).map((s) => s.userData.hitMesh);
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
    setDisabledWorlds,
    isDisabled,
    dispose,
  };
}
