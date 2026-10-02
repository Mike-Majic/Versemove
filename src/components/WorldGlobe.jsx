import { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { WORLDS } from '../data/worlds';
import { loadLandDots } from '../globe/landDots';
import { loadLandGeo } from '../globe/landGeo';
import { createLandLod } from '../globe/landLod';
import { createPlaceLabels } from '../globe/placeLabels';
import { buildLandDots, buildNetworkShell, buildShellNodeGeometry } from '../globe/networkOverlay';
import { buildCategoryShell } from '../globe/categoryShell';
import { makeEventMarkerEl, applyEventZoom, eventZoomFor } from '../globe/eventMarkers';
import { buildSatelliteGlobes } from '../globe/satelliteGlobes';
import { CATEGORY_FLY_MS } from '../fx/timing';
import { IDLE_GLOBE_SPIN_DEG_S, IDLE_EASE_IN_S, IDLE_EASE_OUT_S } from '../fx/globeRotation';
import { getGlobeQuality, subscribeQualityMode, startAutoQualityMonitor, createAdaptiveFrameCap } from '../fx/quality';
import { getGlobeCover, subscribeGlobeCover } from '../fx/globeCover';
import './WorldGlobe.css';

const DEG2RAD = Math.PI / 180;
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

// Trova l'oggetto Three.js che react-globe.gl aggiunge alla scena per il
// globo vero e proprio (superficie + continenti + marker HTML + atmosfera,
// tutti nidificati dentro): quello, e SOLO quello, va ruotato per far
// girare "il globo su se stesso" restando fermi con la camera — ruotare i
// singoli layer sarebbe sbagliato (alcuni, come i nostri overlay
// custom sotto, non sono nidificati lì dentro). three-globe marca il
// layer della superficie con __globeObjType='globe' da qualche parte
// dentro l'albero: risalendo i parent da lì si arriva all'oggetto
// aggiunto direttamente alla scena (vedi globe.gl: .objects([globe])).
function findGlobeRootObject(scene) {
  let tagged = null;
  scene.traverse((obj) => {
    if (!tagged && obj.__globeObjType === 'globe') tagged = obj;
  });
  if (!tagged) return null;
  let node = tagged;
  while (node.parent && node.parent !== scene) node = node.parent;
  return node.parent === scene ? node : null;
}

// Esperimento: continenti con contorni reali (GeoJSON) al posto dei puntini.
// Per tornare al vecchio sistema basta rimettere questa a false, il codice
// dei puntini (src/globe/landDots.js, buildLandDots) è ancora tutto qui,
// intatto, sotto l'else.
const USE_REALISTIC_CONTINENTS = true;

// Sagoma delle categorie per mondo (vedi categoryShell.js buildCategoryShell
// shapeType): un mondo non elencato qui resta sul triangolo di sempre.
// Vetrina tiene il triangolo (invisibile e cliccabile) con sopra un modello
// 3D per categoria.
const CATEGORY_SHAPE_BY_WORLD = {
  nerd: 'ufo',
  incontri: 'heart',
  lavoro: 'briefcase',
  social: 'letterM',
  arte: 'star',
  bambini: 'kids',
  faq: 'cloud',
  annunci: 'annunci',
  animali: 'dog',
  vetrina: 'vetrina',
};

// Aspetto delle sagome per mondo, oltre alla forma (vedi categoryShell.js):
// Bambini più piccole e distanziate; FAQ e Animali bianche e più piene,
// perché col colore del mondo a trasparenza 0.2 si vedevano appena.
const CATEGORY_LOOK_BY_WORLD = {
  bambini: { sizeFactor: 0.72 },
  // Mondo Rosa: 14 triangoli, erano ammassati.
  vetrina: { sizeFactor: 0.7 },
  // Intrattenimento: stelle più luminose (col viola del mondo al 20% si
  // vedevano poco dalla panoramica). Solo il riempimento.
  arte: { fillColor: '#a78bfa', fillOpacity: 0.42, activeOpacity: 0.7 },
  // Mondo Rosso: i cuori erano enormi e quasi attaccati. Più pieni e
  // luminosi, sempre nel rosso puro del mondo (niente fillColor).
  incontri: { sizeFactor: 0.62, fillOpacity: 0.5, activeOpacity: 0.8 },
  // FAQ: nuvole bianche quasi piene con bordo arcobaleno fermo (la Stanza
  // MOD resta rossa, vedi buildCategoryFaceShape 'cloud').
  faq: { fillColor: '#ffffff', fillOpacity: 0.9, activeOpacity: 1, rainbowEdge: true },
  animali: { fillColor: '#ffffff', fillOpacity: 0.7, activeOpacity: 0.9 },
};

// Solo Annunci ha bisogno di più margine fra le categorie (poche categorie
// su un guscio con parecchie facce libere, vedi marginRings in
// categoryShell.js): gli altri mondi restano sul margine storico.
const CATEGORY_MARGIN_RINGS_BY_WORLD = { annunci: 2, incontri: 2 };

// Latitudine massima del volo verso una categoria (vedi l'effect di flyTo).
const POLE_FLY_MAX_LAT = 88;

// Il pallino nell'angolo della foto è verde e "vivo" solo per il proprio
// marker quando si condivide la posizione in tempo reale (vedi App.jsx,
// ownPosition/shareLiveLocation): altrimenti resta il colore standard del
// mondo, come sempre.
const LIVE_LOCATION_COLOR = '#22c55e';

// Marker costruiti con le API del DOM, mai con innerHTML: nickname, città,
// avatar e foto degli eventi sono dati degli utenti (niente HTML iniettato).
// Gli url passano solo se http(s) o relativi.
function safeUrl(url) {
  const s = String(url ?? '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || s.startsWith('/') || s.startsWith('./') || s.startsWith('data:image/')) return s;
  return '';
}

// Puntino della vista panoramica (fascia far) per avatar e grumi, come
// .rb-ev-dot degli eventi ma del colore del mondo. Il click risale
// all'elemento esterno (stesso gestore dell'avatar o del grumo).
function makeFarDot(world) {
  const dot = document.createElement('div');
  dot.className = 'rb-marker-far-dot';
  dot.style.setProperty('--far-dot-color', world.color);
  return dot;
}

function makeMarkerEl(user, world, onOpen) {
  const el = document.createElement('div');
  el.className = 'rb-marker';
  const dotColor = user.isLive ? LIVE_LOCATION_COLOR : world.color;
  const photo = document.createElement('div');
  photo.className = 'rb-marker-photo';
  photo.style.borderColor = world.color;
  const img = document.createElement('img');
  const src = safeUrl(user.avatar);
  if (src) img.src = src;
  img.alt = String(user.name ?? '');
  img.loading = 'lazy';
  // Foto mancante o che non si carica: al suo posto l'iniziale del nome.
  const showInitial = () => {
    img.remove();
    const initial = document.createElement('span');
    initial.className = 'rb-marker-initial';
    initial.textContent = String(user.name ?? '?').trim().charAt(0).toUpperCase() || '?';
    photo.style.background = world.color;
    photo.prepend(initial);
  };
  img.addEventListener('error', showInitial, { once: true });
  const dot = document.createElement('span');
  dot.className = `rb-marker-dot ${user.isLive ? 'rb-marker-dot-live' : ''}`;
  dot.style.background = dotColor;
  photo.append(img, dot);
  if (!src) showInitial();
  // Stesse fasce di zoom degli esagoni evento (data-ev-zoom / --ev-scale su
  // .rb-globe-shell, vedi globe/eventMarkers.js): l'esterno è solo l'ancora
  // sulla coordinata (il suo transform lo riscrive la libreria), scala il
  // figlio; da lontano (fascia far) resta un puntino del colore del mondo.
  const scaleWrap = document.createElement('div');
  scaleWrap.className = 'rb-marker-scale';
  scaleWrap.append(photo);
  el.append(scaleWrap, makeFarDot(world));
  el.title = `${user.name} · ${user.city}`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onOpen(user);
  });
  return el;
}

// Mondi in cui gli utenti sono solo pallini, a qualsiasi zoom: niente
// avatar né grumi col numero (marker HTML), ma un solo oggetto Points
// dentro la scena 3D, sulla superficie del globo. Così le categorie, che
// stanno sul guscio esterno, restano davanti e cliccabili (i marker HTML
// stanno sopra al canvas e coprivano nuvolette ed etichette). Non sono
// cliccabili. Gli altri mondi restano sui marker di sempre.
const USER_DOT_WORLDS = new Set(['faq']);
// Mondi in cui gli utenti diventano gli stessi pallini solo da lontano
// (fascia 'far' di eventZoomFor, la soglia a cui avatar e grumi
// spariscono): al posto del puntino HTML dei marker. Avvicinandosi i
// pallini si spengono e tornano avatar e grumi.
const FAR_USER_DOT_WORLDS = new Set(['lavoro']);
// Mondi senza i nodi luminosi della rete esterna (shell.nodes): nel Lavoro
// erano bianchi come i pallini degli utenti e si confondevano. Le linee
// della rete restano.
const HIDE_SHELL_NODES_WORLDS = new Set(['lavoro']);
// Raggio 100 come la sfera, più un filo (quota 0.003 = raggio 100,3):
// esattamente a 100 i pallini vicino al bordo del globo sfarfallerebbero
// con la superficie (stessa profondità).
const USER_DOT_ALTITUDE = 0.003;
// Dimensione in pixel sullo schermo (uguale da lontano e da vicino).
const USER_DOT_SIZE_PX = 11;

// Texture del pallino: centro pieno e alone morbido intorno; il colore lo
// dà il colore del vertice (quello del mondo, verde per la posizione dal
// vivo). Una sola, condivisa.
let userDotTexture = null;
function getUserDotTexture() {
  if (userDotTexture) return userDotTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,1)');
  g.addColorStop(0.32, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  userDotTexture = new THREE.CanvasTexture(canvas);
  userDotTexture.colorSpace = THREE.SRGBColorSpace;
  return userDotTexture;
}

// Soglie di zoom (unità di pointOfView: più alta = più lontano) usate dalle
// pillole delle città (globe/placeLabels.js, onZoomTo). I marker degli
// utenti si raggruppano invece per distanza sullo schermo (clusterUsers).
const ZOOM_TIER_COUNTRY = 1.4;
const ZOOM_TIER_CITY = 0.55;

function makeClusterEl(cluster, world, onExpand) {
  const el = document.createElement('div');
  el.className = 'rb-marker-cluster';
  // Cerchio, bordo e sfondo su un figlio che scala con lo zoom (come gli
  // avatar, vedi makeMarkerEl); l'esterno resta l'ancora sulla coordinata.
  const body = document.createElement('div');
  body.className = 'rb-marker-cluster-body';
  body.style.borderColor = world.color;
  body.style.background = `color-mix(in srgb, ${world.color} 28%, rgba(0,0,0,0.55))`;
  const count = document.createElement('span');
  count.textContent = String(cluster.count);
  body.append(count);
  el.append(body, makeFarDot(world));
  el.title = `${cluster.label} · ${cluster.count} persone`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onExpand(cluster);
  });
  return el;
}

// Mondi con i nomi di città, regioni, stati e mari (globe/placeLabels.js).
const PLACE_LABEL_WORLDS = new Set(['lavoro']);

// Un solo percorso per web e telefono: stessa scena (posizioni, taglie,
// regole) e stessa camera (posizione, distanza, direzione). Sugli schermi
// più stretti della composizione cambia solo il campo visivo VERTICALE
// della camera (vedi startupFov): quanto basta perché tutta la composizione
// entri nella larghezza. È la stessa immagine del web, rimpicciolita fino
// alla larghezza dello schermo e centrata in verticale. (Allontanare la
// camera invece cambiava la prospettiva: i satelliti davanti, tarati per
// essere visti da WEB_STARTUP_DIST, diventavano minuscoli sopra al globo.)
const WEB_STARTUP_DIST = 615;
const WEB_FOV_DEG = 50;
const GLOBE_RADIUS = 100;
// Tangente della metà del campo visivo verticale attuale (usata per
// convertire pixel in gradi, vedi clusterCellDegrees).
let halfFovTan = Math.tan((WEB_FOV_DEG * Math.PI) / 360);

// I punti (PointsMaterial con sizeAttenuation: nodi dei satelliti e della
// rete, puntini dei continenti, particelle) three.js li dimensiona
// sull'altezza del canvas, non sul campo visivo: con un campo visivo più
// ampio (schermi stretti) resterebbero grossi rispetto a sfere e linee,
// che invece si rimpiccioliscono. Fattore di correzione: 1 sul web.
// Velocità di rotazione col dito/mouse: globe.gl a ogni 'change' dei
// controlli mette rotateSpeed = altitudine * 0.3, tarato per il campo visivo
// del web (50°). OrbitControls ruota in proporzione ai pixel trascinati
// sull'altezza del canvas, quindi con un campo visivo più ampio (schermi
// stretti, vedi startupFov) la superficie scorreva sotto il dito molto più
// lenta del dito stesso (~0.6 px per px in verticale sul telefono, ~2 sul
// web). Fattore di correzione: 1 sul web, stessa formula ovunque.
function rotateSpeedFactor() {
  return halfFovTan / Math.tan((WEB_FOV_DEG * Math.PI) / 360);
}

function pointSizeFactor() {
  return Math.tan((WEB_FOV_DEG * Math.PI) / 360) / halfFovTan;
}
// Applicato prima di ogni disegno, solo se il fattore non è 1 (sul web non
// fa nulla). La taglia "di base" è l'ultima scritta da chi possiede il
// materiale (i satelliti la riscrivono a ogni fotogramma): se è cambiata
// dall'ultima correzione si riparte da quella.
function compensatePointSizes(scene) {
  const k = pointSizeFactor();
  if (Math.abs(k - 1) < 1e-3 && !compensatePointSizes.active) return;
  compensatePointSizes.active = Math.abs(k - 1) >= 1e-3;
  scene.traverse((obj) => {
    const m = obj.isPoints ? obj.material : null;
    if (!m || !m.isPointsMaterial || !m.sizeAttenuation) return;
    const ud = m.userData;
    if (ud.rbScaledSize === undefined || m.size !== ud.rbScaledSize) ud.rbBaseSize = m.size;
    m.size = ud.rbBaseSize * k;
    ud.rbScaledSize = m.size;
  });
}

// Altitudine di ritorno dopo il cambio mondo (warp): 6 sul web.
const DEFAULT_ALTITUDE_WIDE = 6;
function defaultAltitude() {
  return DEFAULT_ALTITUDE_WIDE;
}
// Vista iniziale (a ogni avvio, mai salvata): panoramica con il mondo
// attivo al centro e tutti gli altri intorno. Camera dal lato +Z (dove
// sta il satellite al posto 1, Intrattenimento), azimut 0, 4° sopra il
// piano orizzontale, rivolta all'origine; il globo parte con rotazione 0
// (Golfo di Guinea verso la camera). Elevazione e distanza del web
// ricavate dalla schermata di riferimento (desktop 1908×898).
const STARTUP_ELEVATION_DEG = 4;

// Stessi valori di globe/satelliteGlobes.js (SATELLITE_RADIUS,
// PROJECTION_PX, BEAD_PX_WIDE, reference = WEB_STARTUP_DIST): la taglia vera
// di un satellite nella scena, per calcolare la distanza iniziale.
const SAT_RADIUS = 30;
const SAT_PROJECTION_PX = 957;
const SAT_BEAD_PX = 46;
const SATELLITE_VISUAL_RADIUS = 1.5; // sfera + rete/nodi attorno, in raggi
// Posizione nell'anello e larghezza dell'etichetta (in raggi del satellite)
// dei satelliti visibili, letti dal pool già costruito.
function satelliteLayout(sats) {
  return (sats?.satellites ?? [])
    .filter((sat) => sat.visible && sat.userData.basePosRef)
    .map((sat) => {
      const base = sat.userData.labelBase;
      return { pos: sat.userData.basePosRef, labelW: base ? base.sx / SAT_RADIUS : 4 };
    });
}

// Campo visivo verticale (gradi) per uno schermo width×height: 50° come
// sul web, più ampio solo se con 50° la composizione (dal mondo più a
// sinistra al più a destra, etichette comprese, vista dalla camera della
// vista iniziale) non entra nella larghezza, senza margini in più. Sugli
// schermi larghi resta esattamente 50°.
// Taglia dei satelliti come in satelliteGlobes update: raggio nella scena
// = beadPx · (distanza dalla camera di riferimento) / PROJECTION_PX.
function startupFov(width, height, layout) {
  if (!width || !height || !layout?.length) return WEB_FOV_DEG;
  const e = (STARTUP_ELEVATION_DEG * Math.PI) / 180;
  const cy = WEB_STARTUP_DIST * Math.sin(e);
  const cz = WEB_STARTUP_DIST * Math.cos(e);
  // Tangente orizzontale che serve per far entrare ogni satellite.
  let needTanH = 0;
  for (const { pos, labelW } of layout) {
    if (Math.abs(pos.x) < 1 && pos.z < 0) continue; // dietro al globo
    const dy = pos.y - cy;
    const dz = pos.z - cz;
    const depth = -(dy * Math.sin(e) + dz * Math.cos(e));
    if (depth <= 0) continue;
    const worldR = (SAT_BEAD_PX * Math.hypot(pos.x, dy, dz)) / SAT_PROJECTION_PX;
    const halfW = Math.max(SATELLITE_VISUAL_RADIUS, labelW / 2) * worldR;
    needTanH = Math.max(needTanH, (Math.abs(pos.x) + halfW) / depth);
  }
  const webTan = Math.tan((WEB_FOV_DEG * Math.PI) / 360);
  const tanV = Math.max(webTan, needTanH / (width / height));
  return (2 * Math.atan(tanV) * 180) / Math.PI;
}

// Raggio della superficie del globo (sfera e continenti), dove stanno i
// marker HTML (htmlAltitude 0).
const MARKER_SURFACE_RADIUS = 100;

// Piano di clipping lontano della camera: di serie (vedi
// three-render-objects) è troppo vicino per le posizioni assolute dei
// satelliti (fino a ~450-500 unità dal centro, più l'orbita lenta), che
// altrimenti verrebbero tagliati via invece di sbiadire in lontananza.
const CAMERA_FAR = 5000;

// Dopo quanto tempo senza interazioni il disegno passa da pieno regime a
// ~30 fps (serve anche a far finire a pieno regime le transizioni/inerzie
// della camera). Non si ferma mai: vedi globeActivity.
const IDLE_MS = 3000;
// Senza interazioni da IDLE_MS: un fotogramma ogni ~33 ms (~30 fps).
const FRAME_MS_IDLE = 33;
// Con una colonna/categoria o un ModalOverlay aperti sopra (vedi
// fx/globeCover.js): ~10 fps. 6 giri del rAF da 16,7 ms = 100 ms; la soglia
// resta un po' sotto per non saltarne uno in più per le piccole oscillazioni.
const FRAME_MS_COVERED = 95;

// Durate del warp fra mondi (Fase 2b, vedi runWarp più sotto): volo della
// camera + crescita del satellite, poi il flash che copre lo scambio.
// Insieme restano sotto il tetto di 900ms per transizione del prompt
// "effetto wow" originale.
const WARP_DIVE_MS = 550;
const WARP_FLASH_MS = 150;

// Raggruppamento per DISTANZA SULLO SCHERMO, uguale in tutto il mondo (non
// più per nome di nazione/città: città vicine con pochi utenti ciascuna
// restavano "aperte" e i marker finivano uno sopra l'altro). Due marker più
// vicini di CLUSTER_PX pixel finiscono nello stesso grumo col numero;
// avvicinandosi (zoom o click sul grumo) il grumo si divide finché ogni
// persona torna col suo avatar.
//
// Pixel → gradi: la camera sta a raggio*(1+altitude) dal centro, quindi a
// raggio*altitude dalla superficie sotto di lei; con il campo visivo
// verticale di ~50° (tan 25° ≈ 0.466) lo schermo alto H px copre
// 0.93*raggio*altitude unità, e 1° sulla superficie vale raggio*π/180.
// Il raggio si semplifica: gradi per pixel = 0.93*altitude*180/(π*H).
const CLUSTER_PX = 46;
// Sotto questa altitudine la camera non si avvicina più (limite dei
// controlli): chi è ancora raggruppato (stessa città, coordinate quasi
// uguali) si apre a ventaglio attorno al centro del grumo.
const CLUSTER_MIN_ALTITUDE = 0.03;

function clusterCellDegrees(altitude, viewportHeight) {
  const h = Math.max(200, viewportHeight || 800);
  // 0.93 ≈ 2·tan(25°) con il campo visivo del web; sugli schermi stretti
  // (campo visivo più ampio, vedi startupFov) in proporzione.
  const fovFactor = 0.93 * (halfFovTan / Math.tan((WEB_FOV_DEG * Math.PI) / 360));
  return (CLUSTER_PX * fovFactor * altitude * 180) / (Math.PI * h);
}

function degDistance(aLat, aLng, bLat, bLng) {
  const dLng = (((bLng - aLng + 540) % 360) - 180) * Math.cos(((aLat + bLat) / 2) * (Math.PI / 180));
  return Math.hypot(bLat - aLat, dLng);
}

function clusterUsers(users, view, viewportHeight) {
  const altitude = Math.max(view.altitude, 0.001);
  const cell = clusterCellDegrees(altitude, viewportHeight);
  const degPerAltitude = cell / altitude;
  // Ordine fisso (non quello di arrivo): stessi grumi a ogni ricalcolo.
  const sorted = [...users].sort((a, b) => a.lat - b.lat || a.lng - b.lng || String(a.id).localeCompare(String(b.id)));

  // Griglia su lat e lng "schiacciata" dal coseno: si cercano grumi solo
  // nelle 9 celle vicine, non fra tutti (migliaia di utenti restano veloci).
  const grid = new Map();
  const clusters = [];
  const cellKey = (cy, cx) => `${cy}:${cx}`;
  for (const u of sorted) {
    const cy = Math.floor(u.lat / cell);
    const cx = Math.floor((u.lng * Math.cos((u.lat * Math.PI) / 180)) / cell);
    let target = null;
    for (let dy = -1; dy <= 1 && !target; dy++) {
      for (let dx = -1; dx <= 1 && !target; dx++) {
        const list = grid.get(cellKey(cy + dy, cx + dx));
        if (!list) continue;
        target = list.find((c) => degDistance(c.seedLat, c.seedLng, u.lat, u.lng) < cell) ?? null;
      }
    }
    if (target) {
      target.members.push(u);
    } else {
      const c = { seedLat: u.lat, seedLng: u.lng, members: [u] };
      clusters.push(c);
      const key = cellKey(cy, cx);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(c);
    }
  }

  const items = [];
  for (const c of clusters) {
    const { members } = c;
    if (members.length === 1) {
      items.push({ kind: 'user', ...members[0] });
      continue;
    }
    // Il grumo sta sul membro più vicino alla media, non sulla media: la
    // media di utenti su due coste può cadere in mare, un membro vero no.
    const meanLat = members.reduce((sum, u) => sum + u.lat, 0) / members.length;
    const meanLng = members.reduce((sum, u) => sum + u.lng, 0) / members.length;
    let anchor = members[0];
    let anchorDist = Infinity;
    for (const u of members) {
      const d = degDistance(meanLat, meanLng, u.lat, u.lng);
      if (d < anchorDist) {
        anchorDist = d;
        anchor = u;
      }
    }
    const { lat, lng } = anchor;
    if (altitude <= CLUSTER_MIN_ALTITUDE * 1.2) {
      // Più vicino di così non si va: ventaglio attorno al centro.
      const radius = cell * (0.7 + members.length * 0.08);
      members.forEach((u, i) => {
        const angle = (i / members.length) * Math.PI * 2;
        items.push({
          kind: 'user',
          ...u,
          lat: lat + radius * Math.sin(angle),
          lng: lng + (radius * Math.cos(angle)) / Math.max(0.2, Math.cos((lat * Math.PI) / 180)),
        });
      });
      continue;
    }
    // Quanto avvicinarsi al click: abbastanza perché il membro più lontano
    // dal centro si stacchi, mai meno del limite dei controlli.
    const spread = Math.max(...members.map((u) => degDistance(lat, lng, u.lat, u.lng)));
    const targetAltitude = Math.min(altitude * 0.55, Math.max(CLUSTER_MIN_ALTITUDE, (spread / degPerAltitude) * 0.9));
    const cities = [...new Set(members.map((u) => u.city).filter(Boolean))];
    const label = cities.length === 1 ? cities[0] : cities.slice(0, 2).join(', ') + (cities.length > 2 ? '…' : '');
    items.push({ kind: 'cluster', label, lat, lng, count: members.length, targetAltitude });
  }
  return items;
}

export default function WorldGlobe({
  world,
  users,
  onSelectUser,
  containerRef,
  flyTo,
  categories,
  activeCategory,
  onCategorySelect,
  onCategoryPositionsReady,
  events = [],
  onSelectEvent,
  onWarpArrived,
  disabledWorlds,
  onDisabledWorldClick,
  warpRequest,
}) {
  const globeRef = useRef();
  const overlayRef = useRef(null);
  // Pallini degli utenti nella scena: { points, farOnly } (vedi l'effetto
  // dei pallini più giù e syncEventZoom).
  const userDotsRef = useRef(null);
  const categoryShellRef = useRef(null);
  const landPointsRef = useRef(null);
  const satellitesRef = useRef(null);
  const warpFlashRef = useRef(null);
  const warpingRef = useRef(false);
  const hasPositionedSatellitesRef = useRef(false);
  // Stato del movimento "salvaschermo" (vedi globeActivity più sotto):
  // globeRootRef è l'oggetto trovato da findGlobeRootObject (cache, la
  // ricerca si fa una sola volta); globeSpinAngleRef l'angolo accumulato
  // (radianti) applicato ogni fotogramma a lui + overlayRef.current.group +
  // categoryShellRef.current.group, sempre in sincrono, così non si
  // "staccano" mai visivamente l'uno dall'altro. idleTargetRef/
  // idleRampFromRef/idleRampStartRef/idleRampDurationMsRef sono la rampa
  // (0..1) che porta il movimento da fermo a velocità piena in
  // IDLE_EASE_IN_S secondi quando il mouse esce, e viceversa in
  // IDLE_EASE_OUT_S quando rientra — calcolata "al volo" ad ogni
  // fotogramma (vedi computeIdleFactor), mai con un rAF a parte.
  const globeRootRef = useRef(null);
  // Continenti a più livelli di dettaglio (globe/landLod.js), vedi più giù.
  const landLodRef = useRef(null);
  // Nomi di città/regioni/stati/mari (globe/placeLabels.js).
  const placeLabelsRef = useRef(null);
  const globeSpinAngleRef = useRef(0);
  // true finché la camera è ancora nella vista iniziale (nessun
  // trascinamento/zoom/volo): solo allora il resize la ricalcola.
  const startupViewActiveRef = useRef(true);
  // Rotazione ferma durante il volo verso una categoria e finché la
  // categoria resta aperta: la sua stella deve restare al centro.
  const spinFrozenRef = useRef(false);
  // Ogni volo della camera verso un punto del globo passa da qui: lat/lng
  // sono coordinate LOCALI dell'oggetto che contiene il punto, e il punto
  // d'arrivo si ricava dalla rotazione reale di quell'oggetto in questo
  // momento (matrixWorld), non da un contatore a parte. Di default è
  // l'oggetto radice di react-globe.gl (marker HTML, continenti, pillole
  // delle città); per le stelle delle categorie si passa il loro gruppo.
  // Bug di prima: si aggiungeva sempre globeSpinAngleRef, ma l'oggetto dei
  // marker non ruota (globeRootRef resta null, vedi l'effetto dei
  // continenti più giù): dopo 40 s di rotazione il clic su un grumo in
  // Italia portava la camera oltre 100° più a est.
  const globeObjectRef = useRef(null);
  const getGlobeObject = () => {
    const g = globeRef.current;
    if (!g) return null;
    if (!globeObjectRef.current?.parent) globeObjectRef.current = findGlobeRootObject(g.scene());
    return globeObjectRef.current;
  };
  const toWorldLatLng = (lat, lng, container = getGlobeObject()) => {
    const g = globeRef.current;
    if (!g || !container) return { lat, lng };
    container.updateWorldMatrix(true, false);
    const p = new THREE.Vector3().copy(g.getCoords(lat, lng, 0)).applyMatrix4(container.matrixWorld);
    const geo = g.toGeoCoords(p);
    return { lat: geo.lat, lng: geo.lng };
  };
  const categoryPositionsRef = useRef({});
  const idleTargetRef = useRef(0);
  const idleRampFromRef = useRef(0);
  const idleRampStartRef = useRef(0);
  const idleRampDurationMsRef = useRef(0);
  const reduceMotionActiveRef = useRef(false);

  const computeIdleFactor = (now) => {
    const dur = idleRampDurationMsRef.current;
    if (dur <= 0) return idleTargetRef.current;
    const t = Math.min(1, (now - idleRampStartRef.current) / dur);
    return idleRampFromRef.current + (idleTargetRef.current - idleRampFromRef.current) * easeInOutCubic(t);
  };

  // Letto dal polling a 250ms sotto (interval con deps [], serve un ref e
  // non solo la prop per restare aggiornato senza far ripartire l'intervallo).
  const activeCategoryRef = useRef(activeCategory);
  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);
  const [size, setSize] = useState({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  });
  const [landPolygons, setLandPolygons] = useState([]);
  // Qualità grafica (Impostazioni -> Effetti, o "Auto" con downgrade da FPS
  // reali, vedi fx/quality.js): pixelRatio e atmosfera restano reattivi a
  // caldo qui sotto; l'antialias del renderer invece si decide una sola
  // volta alla creazione (rendererConfig più giù, useMemo su mount) perché
  // WebGLRenderer non permette di cambiarlo senza ricrearlo da zero.
  const [quality, setQuality] = useState(() => getGlobeQuality());
  const initialAntialias = useMemo(() => getGlobeQuality().antialias, []);
  // Vista attuale della camera (altitudine + centro): guida il livello di
  // raggruppamento dei marker (vedi clusterUsers). Non basta ascoltare
  // l'evento "change" dei controlli: i voli programmati (pointOfView su
  // categoria/città/grumo) non passano da li', quindi si controlla con un
  // piccolo polling, abbastanza leggero da non pesare (legge tre numeri
  // ogni 250ms).
  const [view, setView] = useState({ altitude: defaultAltitude(), lat: 0, lng: 0 });

  // Grandezza dei marker evento legata allo zoom (globe/eventMarkers.js):
  // una variabile CSS e un attributo sul contenitore del globo, mai i
  // marker uno per uno. Chiamata dal polling qui sotto (copre anche i voli
  // programmati) e dall'evento "change" dei controlli (zoom a mano, subito).
  const syncEventZoom = (altitude) => {
    const g = globeRef.current;
    const canvas = g?.renderer?.().domElement;
    const shell = canvas?.closest('.rb-globe-shell');
    if (!shell) return;
    const alt = altitude ?? g.pointOfView().altitude;
    applyEventZoom(shell, alt);
    // Pallini degli utenti "solo da lontano" (FAR_USER_DOT_WORLDS): accesi
    // e spenti qui, nello stesso momento in cui data-ev-zoom fa sparire o
    // tornare avatar e grumi.
    const dots = userDotsRef.current;
    if (dots?.farOnly) {
      const visible = eventZoomFor(alt).band === 'far';
      if (dots.points.visible !== visible) {
        dots.points.visible = visible;
        globeActivity.wake();
      }
    }
  };
  // Trascinamento che parte da un marker HTML (avatar, grumo, esagono
  // evento): i marker stanno sopra il canvas con pointer-events: auto, quindi
  // OrbitControls non riceveva nulla e il globo non girava. Finché il dito
  // (o il mouse) resta entro MARKER_DRAG_PX il gesto resta del marker: un
  // tocco secco lo apre come sempre, col click nativo. Appena si muove oltre,
  // si passa a OrbitControls un pointerdown sul canvas nel punto di partenza:
  // lui cattura il puntatore sul canvas e segue i movimenti successivi
  // (ascolta pointermove/pointerup sul documento), pizzico compreso. Il
  // pointerdown non si inoltra subito perché il click sul globo di
  // three-render-objects scatterebbe anche per un semplice tocco. Dopo un
  // trascinamento il click sul marker viene scartato.
  useEffect(() => {
    const g = globeRef.current;
    const canvas = g?.renderer?.().domElement;
    if (!canvas) return undefined;
    const MARKER_DRAG_PX = 8;
    const MARKER_SELECTOR = '.rb-marker, .rb-marker-cluster, .rb-event-marker';
    const pending = new Map(); // pointerId -> { init, x, y }
    const forwarded = new Set();
    const active = new Set();
    let suppressClickUntil = 0;
    const markerOf = (target) => {
      const el = target?.closest?.(MARKER_SELECTOR);
      return el && canvas.closest('.rb-globe-shell')?.contains(el) ? el : null;
    };
    const forward = (pointerId) => {
      const p = pending.get(pointerId);
      if (!p) return;
      pending.delete(pointerId);
      forwarded.add(pointerId);
      canvas.dispatchEvent(new PointerEvent('pointerdown', p.init));
    };
    const forwardAll = () => Array.from(pending.keys()).forEach(forward);
    const onDown = (e) => {
      const othersDown = active.size > 0;
      active.add(e.pointerId);
      if (!markerOf(e.target)) {
        // Secondo dito sul canvas mentre il primo è su un marker: il primo
        // passa al globo prima (questo ascoltatore precede OrbitControls),
        // così il pizzico parte con entrambi.
        if (pending.size && e.target === canvas) forwardAll();
        return;
      }
      pending.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        init: {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          isPrimary: e.isPrimary,
          clientX: e.clientX,
          clientY: e.clientY,
          screenX: e.screenX,
          screenY: e.screenY,
          button: e.button,
          buttons: e.buttons,
          pressure: e.pressure,
          width: e.width,
          height: e.height,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        },
      });
      // Pizzico con un dito già sul globo o su un altro marker: niente
      // attesa, il gesto è comunque del globo.
      if (othersDown) forwardAll();
    };
    const onMove = (e) => {
      const p = pending.get(e.pointerId);
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MARKER_DRAG_PX) forward(e.pointerId);
    };
    const onUp = (e) => {
      active.delete(e.pointerId);
      pending.delete(e.pointerId);
      if (forwarded.delete(e.pointerId)) suppressClickUntil = performance.now() + 400;
    };
    const onClick = (e) => {
      if ((forwarded.size > 0 || performance.now() < suppressClickUntil) && markerOf(e.target)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const opts = { capture: true };
    window.addEventListener('pointerdown', onDown, opts);
    window.addEventListener('pointermove', onMove, opts);
    window.addEventListener('pointerup', onUp, opts);
    window.addEventListener('pointercancel', onUp, opts);
    window.addEventListener('click', onClick, opts);
    return () => {
      window.removeEventListener('pointerdown', onDown, opts);
      window.removeEventListener('pointermove', onMove, opts);
      window.removeEventListener('pointerup', onUp, opts);
      window.removeEventListener('pointercancel', onUp, opts);
      window.removeEventListener('click', onClick, opts);
    };
  }, []);

  // Riapplicata dopo globe.gl (questo ascoltatore di 'change' è registrato
  // dopo il suo, quindi vince) e quando cambia il campo visivo
  // (measureStartup). Vedi rotateSpeedFactor.
  const applyRotateSpeed = () => {
    const g = globeRef.current;
    const controls = g?.controls?.();
    if (!controls) return;
    controls.rotateSpeed = g.pointOfView().altitude * 0.3 * rotateSpeedFactor();
  };
  useEffect(() => {
    const g = globeRef.current;
    const controls = g?.controls?.();
    if (!controls) return undefined;
    const onChange = () => {
      applyRotateSpeed();
      syncEventZoom();
    };
    controls.addEventListener('change', onChange);
    syncEventZoom();
    return () => controls.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const g = globeRef.current;
      if (!g) return;
      const pov = g.pointOfView();
      syncEventZoom(pov.altitude);
      // Il globo gira da solo senza che la camera si muova: la libreria
      // ricontrolla il retro solo quando cambia la camera, qui anche così.
      markerElsRef.current.forEach((el) => setMarkerVisibility(el));
      // Livello di dettaglio dei continenti (110m / 50m / riquadri 10m).
      landLodRef.current?.update(pov, g.camera());
      setView((prev) => {
        // Variazione relativa: a zoom ravvicinato (altitudine 0.03-0.5) una
        // soglia fissa non scatterebbe mai e i grumi non si dividerebbero.
        const altChanged = Math.abs(prev.altitude - pov.altitude) > Math.max(0.004, prev.altitude * 0.06);
        // La posizione non conta più (i grumi dipendono solo dalla distanza
        // sullo schermo, cioè dall'altitudine): ruotare il globo non
        // ricalcola/rimonta i marker.
        return altChanged ? { altitude: pov.altitude, lat: pov.lat, lng: pov.lng } : prev;
      });
      // Etichette delle categorie: nascoste (non tolte, solo sprite.visible)
      // quando sono sul retro del globo, troppo vicine al bordo dello
      // schermo o sopra al menu testuale delle categorie in basso a
      // sinistra (.rb-world-tagline-list) — mai tagliate a metà, mai
      // sovrapposte a un altro controllo cliccabile. Stesso giro di
      // polling della vista qui sopra, nessun ciclo nuovo da pagare.
      if (categoryShellRef.current) {
        updateCategoryLabelVisibility(g, categoryShellRef.current, activeCategoryRef.current);
      }
    }, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nei mondi a pallini (USER_DOT_WORLDS) gli utenti non diventano marker
  // HTML: li disegna l'oggetto Points più giù.
  const userDotsWorld = USER_DOT_WORLDS.has(world.id);
  const farUserDotsWorld = FAR_USER_DOT_WORLDS.has(world.id);
  const displayItems = useMemo(() => {
    const eventItems = events.map((e) => ({ kind: 'event', ...e }));
    if (userDotsWorld) return eventItems;
    return [...clusterUsers(users, view, typeof window !== 'undefined' ? window.innerHeight : 800), ...eventItems];
  }, [users, view, events, userDotsWorld]);

  const expandCluster = (cluster) => {
    startupViewActiveRef.current = false;
    const g = globeRef.current;
    if (g) g.pointOfView({ ...toWorldLatLng(cluster.lat, cluster.lng), altitude: cluster.targetAltitude }, 1200);
  };

  // Elementi HTML dei marker (creati da htmlElement più giù), per chi deve
  // spostarli fuori dalle scritte o raccoglierli in una pillola (vedi
  // globe/placeLabels.js). Solo quelli dei displayItems attuali.
  const markerElsRef = useRef(new Map());
  const displayItemsRef = useRef(displayItems);
  useEffect(() => {
    displayItemsRef.current = displayItems;
    const current = new Set(displayItems);
    for (const item of markerElsRef.current.keys()) {
      if (!current.has(item)) markerElsRef.current.delete(item);
    }
    placeLabelsRef.current?.invalidate();
  }, [displayItems]);
  const registerMarkerEl = (item, el) => {
    markerElsRef.current.set(item, el);
    el.__rbMarkerItem = item;
    placeLabelsRef.current?.invalidate();
    return el;
  };
  // Marker nascosti quando stanno sul retro del globo. Il controllo della
  // libreria (three-globe isBehindGlobe) con i marker a quota 0 sbaglia
  // proprio sul punto opposto alla camera: un arcocoseno riceve un valore
  // appena sopra 1 per arrotondamento, dà NaN e il marker resta visibile
  // attraverso il globo. Qui un test geometrico semplice: un punto della
  // superficie p (raggio R, centro nell'origine) è rivolto verso la camera
  // c se p·c > R². La rotazione del globo (globeRootRef) è inclusa.
  const markerFacingVec = useMemo(() => new THREE.Vector3(), []);
  const markerFacesCamera = (item) => {
    const g = globeRef.current;
    const root = globeRootRef.current;
    if (!g || !item || !Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return true;
    const phi = ((90 - item.lat) * Math.PI) / 180;
    const theta = ((90 - item.lng) * Math.PI) / 180;
    const v = markerFacingVec.set(
      MARKER_SURFACE_RADIUS * Math.sin(phi) * Math.cos(theta),
      MARKER_SURFACE_RADIUS * Math.cos(phi),
      MARKER_SURFACE_RADIUS * Math.sin(phi) * Math.sin(theta)
    );
    if (root) v.applyMatrix4(root.matrixWorld);
    return v.dot(g.camera().position) > MARKER_SURFACE_RADIUS * MARKER_SURFACE_RADIUS;
  };
  // Con htmlElementVisibilityModifier la libreria lascia l'oggetto visibile
  // e passa a noi l'elemento: si nasconde con visibility (display lo
  // riscrive il renderer HTML a ogni fotogramma).
  const setMarkerVisibility = (el) => {
    const visible = markerFacesCamera(el.__rbMarkerItem);
    const next = visible ? '' : 'hidden';
    if (el.style.visibility !== next) el.style.visibility = next;
  };

  // Puntatore "grezzo" (touch) = dispositivo mobile: li' il globo deve stare
  // fermo di default e muoversi solo con le dita (trascinamento/pizzico),
  // mai da solo. Su desktop invece ruota da solo finche' il mouse non ci
  // passa sopra.
  const isTouchDevice = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const isHoveringRef = useRef(false);

  // Regola del ciclo di disegno: MAI fermo mentre è visibile, 30 fps quando
  // nessuno interagisce, 10 fps con un pannello sopra, pausa solo a scheda
  // nascosta o con una partita in corso a un tavolo (fx/globeCover.js).
  //
  // Prima il disegno si metteva in pausa (pauseAnimation) dopo pochi
  // secondi senza eventi del mouse: col mouse fermo sopra il mappamondo
  // (1,4 s dopo l'ingresso, la rampa di IDLE_EASE_OUT_S) si bloccava tutto,
  // compresa la rotazione dei satelliti su se stessi, che gira solo quando
  // la scena viene ridisegnata. Ora:
  // - il ciclo di react-globe.gl gira sempre; il risparmio sta nel wrapper
  //   di renderer.render più giù, che dopo IDLE_MS senza interazioni salta
  //   un fotogramma ogni volta che dall'ultimo disegno sono passati meno di
  //   FRAME_MS_IDLE (~30 fps invece di 60). wake() riporta subito al pieno
  //   (movimento, clic, rotellina, tocco, voli della camera, dati nuovi);
  // - pauseAnimation solo con la scheda nascosta (visibilitychange) o con
  //   una partita in corso (copertura 'paused'), e resumeAnimation appena
  //   nessuna delle due vale più.
  //
  // I nomi startAutoRotate/stopAutoRotate sono rimasti (li chiamano molti
  // punti sotto: mount, hover, warp, fly-to) ma NON toccano più
  // OrbitControls.autoRotate — la CAMERA non orbita più da sola, punto
  // (richiesta esplicita, il vecchio comportamento disorientava). "Start"
  // vuol dire "il mouse è fuori, fai partire la rotazione del globo
  // centrale", "stop" il contrario (mouse sopra: il globo rallenta fino a
  // fermarsi per poter mirare con calma, i satelliti invece continuano a
  // girare): la rampa (idleTargetRef 0..1, calcolata al volo da
  // computeIdleFactor) porta la velocità da 0 a piena in IDLE_EASE_IN_S
  // secondi, e viceversa in IDLE_EASE_OUT_S. Su telefono il globo centrale
  // non gira mai da solo, ma i satelliti sì, con la stessa regola dei 30 fps.
  const fullFpsUntilRef = useRef(0);
  const globeCoverRef = useRef(getGlobeCover());
  const globeActivity = useMemo(() => {
    let hidden = false;
    let coverPaused = false;
    let paused = false;

    // Pieno regime di fotogrammi per almeno `ms` da adesso.
    const wake = (ms = IDLE_MS) => {
      fullFpsUntilRef.current = Math.max(fullFpsUntilRef.current, performance.now() + ms);
    };

    const syncPause = () => {
      const g = globeRef.current;
      if (!g) return;
      const shouldPause = hidden || coverPaused;
      if (shouldPause === paused) return;
      paused = shouldPause;
      if (paused) {
        g.pauseAnimation();
      } else {
        wake();
        g.resumeAnimation();
      }
    };

    const onVisibilityChange = () => {
      hidden = document.visibilityState === 'hidden';
      syncPause();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const setCoverPaused = (value) => {
      coverPaused = value;
      syncPause();
    };

    const setIdleTarget = (target, durationMs) => {
      const now = performance.now();
      idleRampFromRef.current = computeIdleFactor(now);
      idleTargetRef.current = target;
      idleRampStartRef.current = now;
      idleRampDurationMsRef.current = durationMs;
    };

    const stopAutoRotate = () => {
      setIdleTarget(0, IDLE_EASE_OUT_S * 1000);
      // La decelerazione si vede meglio a pieno regime.
      wake(IDLE_EASE_OUT_S * 1000 + 400);
    };

    const startAutoRotate = () => {
      const g = globeRef.current;
      if (!g || isTouchDevice) return;
      // "Riduci animazioni" del sistema: niente rotazioni, solo il
      // galleggiamento dei satelliti (già indipendente da questo stato).
      reduceMotionActiveRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setIdleTarget(1, IDLE_EASE_IN_S * 1000);
      wake(IDLE_EASE_IN_S * 1000 + 400);
    };

    const dispose = () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };

    return { wake, startAutoRotate, stopAutoRotate, setCoverPaused, dispose };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => globeActivity.dispose, [globeActivity]);

  // Pannelli sopra al globo: 'covered' abbassa il tetto (letto dal wrapper
  // di renderer.render tramite globeCoverRef), 'paused' ferma tutto.
  useEffect(() => {
    const apply = (level) => {
      globeCoverRef.current = level;
      globeActivity.setCoverPaused(level === 'paused');
    };
    apply(getGlobeCover());
    return subscribeGlobeCover(apply);
  }, [globeActivity]);

  // Qualsiasi interazione dentro al globo (anche sui marker HTML, che stanno
  // sopra al canvas) riporta il disegno a pieno regime per IDLE_MS.
  useEffect(() => {
    const g = globeRef.current;
    const target = containerRef?.current ?? g?.renderer().domElement;
    if (!target) return undefined;
    const onActivity = () => globeActivity.wake();
    const opts = { passive: true };
    target.addEventListener('pointermove', onActivity, opts);
    target.addEventListener('pointerdown', onActivity, opts);
    target.addEventListener('wheel', onActivity, opts);
    target.addEventListener('touchstart', onActivity, opts);
    return () => {
      target.removeEventListener('pointermove', onActivity, opts);
      target.removeEventListener('pointerdown', onActivity, opts);
      target.removeEventListener('wheel', onActivity, opts);
      target.removeEventListener('touchstart', onActivity, opts);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globeActivity]);

  // Su iOS (Safari e Chrome, entrambi su WebKit) l'evento "resize" della
  // finestra non scatta in modo affidabile quando la barra degli indirizzi
  // si espande/collassa a scorrimento: il canvas restava quindi bloccato
  // sulla dimensione iniziale (più bassa) mentre lo spazio visibile reale
  // cresceva, lasciando il globo/anello compresso in alto con spazio nero
  // sotto — bug segnalato dal vivo. window.visualViewport riflette invece
  // sempre l'area visibile reale ed emette i suoi eventi propri.
  useEffect(() => {
    const onResize = () => setSize({
      width: window.visualViewport?.width ?? window.innerWidth,
      height: window.visualViewport?.height ?? window.innerHeight,
    });
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
  }, []);

  // Segue i cambi di qualità (scelta esplicita in Impostazioni, o downgrade
  // automatico da FPS bassi in modalità "Auto") e li applica al renderer già
  // creato: pixelRatio a caldo, atmosfera tramite la prop dichiarativa più
  // giù (vedi <Globe showAtmosphere>).
  useEffect(() => {
    const unsubscribe = subscribeQualityMode(() => setQuality(getGlobeQuality()));
    const stopMonitor = startAutoQualityMonitor();
    return () => {
      unsubscribe();
      stopMonitor();
    };
  }, []);

  // Pixel ratio = quello reale dello schermo, col tetto del livello di
  // qualità; riapplicato anche al resize e quando cambia il
  // devicePixelRatio (zoom del browser, finestra spostata su un altro
  // monitor), che il resize da solo non sempre segnala.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return undefined;
    let dprQuery = null;
    const apply = () => {
      const renderer = g.renderer();
      const next = Math.min(window.devicePixelRatio || 1, quality.pixelRatioCap);
      // setPixelRatio ridimensiona già il buffer del canvas.
      if (renderer.getPixelRatio() !== next) renderer.setPixelRatio(next);
      dprQuery?.removeEventListener('change', apply);
      dprQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`) ?? null;
      dprQuery?.addEventListener('change', apply);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      dprQuery?.removeEventListener('change', apply);
    };
  }, [quality.pixelRatioCap]);

  // Materiale opaco (non trasparente): evitiamo che il globo finisca nel canale di
  // rendering "trasparente" insieme ai puntini, che causava sfarfallio/z-fighting
  // durante la rotazione o lo zoom.
  const globeMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: '#050508',
        shininess: 6,
      }),
    []
  );

  // Guscio "a rete" (wireframe + nodi luminosi), come nelle immagini di riferimento.
  // Non dipende da nessuna immagine: appare subito, a prescindere dai puntini dei continenti.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return undefined;

    const scene = g.scene();
    const shell = buildNetworkShell();
    const group = new THREE.Group();
    group.add(shell.lines, shell.nodes);
    scene.add(group);
    overlayRef.current = { group, shell, landDots: null };
    applyOverlayColor(overlayRef.current, world.atmosphereColor, world.lineColor);
    // Cache dell'oggetto "globo vero e proprio" di react-globe.gl (vedi
    // findGlobeRootObject sopra): serve al giro di rendering più giù per
    // farlo ruotare in sincrono con questo stesso overlay.
    globeRootRef.current = findGlobeRootObject(scene);

    return () => {
      scene.remove(group);
      shell.icoGeometry.dispose();
      shell.edgesGeometry.dispose();
      shell.nodes.geometry.dispose();
      shell.lineMaterial.dispose();
      shell.nodeMaterial.dispose();
      overlayRef.current = null;
      globeRootRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Utenti come pallini nella scena (mondi di USER_DOT_WORLDS sempre, di
  // FAR_USER_DOT_WORLDS solo da lontano, vedi syncEventZoom): un solo
  // THREE.Points dentro l'oggetto del globo (findGlobeRootObject), lo
  // stesso dei continenti (createLandLod), così ogni pallino resta sul suo
  // punto del continente col globo fermo, in rotazione e trascinato. Non
  // nel gruppo dell'overlay: quello riceve la rotazione delle categorie
  // (globeSpinAngleRef) e i pallini si staccavano dai continenti. Le
  // coordinate vengono da getCoords del globo, locali a quell'oggetto, la
  // stessa funzione che posiziona i marker HTML. La sfera opaca nasconde da
  // sola i pallini sul retro; renderOrder -1 li disegna prima delle
  // nuvolette trasparenti, che restano davanti.
  useEffect(() => {
    const g = globeRef.current;
    if ((!userDotsWorld && !farUserDotsWorld) || !g || !users?.length) return undefined;
    const positions = new Float32Array(users.length * 3);
    const colors = new Float32Array(users.length * 3);
    const base = new THREE.Color(world.color);
    const live = new THREE.Color(LIVE_LOCATION_COLOR);
    let n = 0;
    for (const u of users) {
      if (!Number.isFinite(u?.lat) || !Number.isFinite(u?.lng)) continue;
      const p = g.getCoords(u.lat, u.lng, USER_DOT_ALTITUDE);
      positions.set([p.x, p.y, p.z], n * 3);
      const c = u.isLive ? live : base;
      colors.set([c.r, c.g, c.b], n * 3);
      n++;
    }
    if (n === 0) return undefined;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions.subarray(0, n * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors.subarray(0, n * 3), 3));
    const material = new THREE.PointsMaterial({
      size: USER_DOT_SIZE_PX,
      sizeAttenuation: false,
      map: getUserDotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    points.renderOrder = -1;
    points.raycast = () => {}; // mai cliccabili
    const farOnly = !userDotsWorld;
    if (farOnly) points.visible = eventZoomFor(g.pointOfView().altitude).band === 'far';
    userDotsRef.current = { points, farOnly };
    // L'oggetto del globo si cerca qui, come per i continenti; se
    // react-globe.gl non l'ha ancora messo nella scena si riprova al
    // fotogramma dopo.
    let raf = 0;
    const attach = () => {
      const root = findGlobeRootObject(g.scene());
      if (!root) {
        raf = requestAnimationFrame(attach);
        return;
      }
      root.add(points);
      globeActivity.wake();
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      points.parent?.remove(points);
      if (userDotsRef.current?.points === points) userDotsRef.current = null;
      geometry.dispose();
      material.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userDotsWorld, farUserDotsWorld, users, world.color]);

  // Continenti: due sistemi alternativi, scelti da USE_REALISTIC_CONTINENTS.
  // Puntini (vecchio): caricati dall'immagine terra/acqua, se falliscono il
  // resto della scena resta comunque visibile.
  useEffect(() => {
    if (USE_REALISTIC_CONTINENTS) return undefined;
    let cancelled = false;

    loadLandDots()
      .then((landPoints) => {
        if (cancelled || !overlayRef.current) return;
        landPointsRef.current = landPoints;
        rebuildLandDots(overlayRef.current, landPoints, categoryShellRef.current?.triangles ?? [], world.atmosphereColor);
      })
      .catch((err) => {
        console.error('Impossibile caricare la mappa dei continenti', err);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contorni reali (nuovo): GeoJSON precalcolato (vedi scripts/build-land-geojson.mjs),
  // nessuna richiesta di rete oltre al file statico.
  useEffect(() => {
    if (!USE_REALISTIC_CONTINENTS) return undefined;
    let cancelled = false;

    loadLandGeo()
      .then((features) => {
        if (cancelled) return;
        setLandPolygons(features);
        // Stessi dati, riusati anche sui satelliti (mondi esterni): "solo il
        // disegno del mondo", niente categorie né altro sopra — vedi
        // satelliteGlobes.js setContinentMap. Il ref è già pronto: l'effetto
        // che costruisce i satelliti gira al mount, questa richiesta di rete
        // arriva sempre dopo.
        satellitesRef.current?.setContinentMap(features);
      })
      .catch((err) => {
        console.error('Impossibile caricare i contorni dei continenti', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // I contorni appena arrivati diventano pochi oggetti (calotte unite,
  // coste unite, confini di stato uniti, a più livelli di dettaglio secondo
  // lo zoom: vedi globe/landLod.js) dentro l'oggetto del globo, dove
  // stava il layer polygonsData di react-globe.gl. L'oggetto si cerca qui,
  // non da globeRootRef: quello viene cercato al mount, quando react-globe.gl
  // non l'ha ancora messo nella scena, e resta null.
  useEffect(() => {
    const g = globeRef.current;
    const root = g && findGlobeRootObject(g.scene());
    if (!USE_REALISTIC_CONTINENTS || !root || landPolygons.length === 0) return undefined;
    const land = createLandLod({ parent: root, features110: landPolygons });
    landLodRef.current = land;
    return () => {
      land.dispose();
      landLodRef.current = null;
    };
  }, [landPolygons]);

  // Riempimento: di default stesso colore del mondo ma molto trasparente
  // (0.1), così i contorni restano il segno principale. Un mondo può
  // chiedere un riempimento più pieno/diverso con world.landFillOpacity /
  // world.landFillColor (vedi Lavoro in data/worlds.js: col bianco al 10%
  // sul globo quasi nero i continenti sembravano grigio scuro). I contorni
  // sono del colore dell'atmosfera, oppure world.landStrokeColor se il mondo
  // ne chiede uno diverso (Animali: bianchi).
  useEffect(() => {
    landLodRef.current?.setColors({
      fillColor: world.landFillColor ?? world.atmosphereColor,
      fillOpacity: world.landFillOpacity,
      strokeColor: world.landStrokeColor ?? world.atmosphereColor,
    });
  }, [landPolygons, world.landFillColor, world.landFillOpacity, world.landStrokeColor, world.atmosphereColor]);

  useEffect(() => {
    if (overlayRef.current) applyOverlayColor(overlayRef.current, world.atmosphereColor, world.lineColor);
  }, [world.atmosphereColor, world.lineColor]);

  // Nodi luminosi della rete esterna spenti nei mondi di
  // HIDE_SHELL_NODES_WORLDS; linee e categorie restano come sono.
  useEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.shell.nodes.visible = !HIDE_SHELL_NODES_WORLDS.has(world.id);
    globeActivity.wake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.id]);

  // Nomi dei luoghi: livello HTML sopra il canvas (vedi globe/placeLabels.js).
  // Si aggiornano dal giro di disegno (render wrapper sopra), solo quando la
  // camera si muove; l'oggetto del globo si cerca al momento (vedi il
  // commento sui continenti più giù). Solo nel mondo Lavoro
  // (PLACE_LABEL_WORLDS): negli altri il livello è spento, senza calcoli, e
  // i marker restano come senza nomi (niente pillole, spirale né "+N").
  const placeLabelsEnabled = PLACE_LABEL_WORLDS.has(world.id);
  const placeLabelsEnabledRef = useRef(placeLabelsEnabled);
  placeLabelsEnabledRef.current = placeLabelsEnabled;
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return undefined;
    let root = null;
    const labels = createPlaceLabels({
      enabled: placeLabelsEnabledRef.current,
      canvas: g.renderer().domElement,
      getRoot: () => root ?? (root = findGlobeRootObject(g.scene())),
      getMarkers: () =>
        displayItemsRef.current
          .filter((item) => markerElsRef.current.has(item))
          .map((item) => ({ item, el: markerElsRef.current.get(item) })),
      // Pillola di una città: zoom come expandCluster (un livello più
      // vicino); chip "+N" di un centro piccolo: ancora più vicino, così gli
      // avatar si aprono.
      onZoomTo: (lat, lng, closer) => {
        startupViewActiveRef.current = false;
        const altitude = g.pointOfView().altitude;
        const target = closer
          ? Math.max(0.02, altitude * 0.45)
          : altitude >= ZOOM_TIER_COUNTRY
          ? ZOOM_TIER_COUNTRY - 0.15
          : altitude >= ZOOM_TIER_CITY
          ? ZOOM_TIER_CITY - 0.15
          : Math.max(0.02, altitude * 0.5);
        g.pointOfView({ ...toWorldLatLng(lat, lng), altitude: target }, 1200);
      },
    });
    placeLabelsRef.current = labels;
    return () => {
      labels.dispose();
      placeLabelsRef.current = null;
    };
  }, []);

  useEffect(() => {
    placeLabelsRef.current?.setEnabled(placeLabelsEnabled);
  }, [placeLabelsEnabled]);

  useEffect(() => {
    placeLabelsRef.current?.setTheme({
      landFillColor: world.landFillColor ?? world.atmosphereColor,
      landFillOpacity: world.landFillOpacity ?? 0.1,
      accentColor: world.color,
    });
  }, [world.landFillColor, world.landFillOpacity, world.atmosphereColor, world.color]);

  // Categorie "incastonate" nel guscio (solo dove servono, es. mondo Arte & Musica):
  // ogni categoria riempie il triangolo più vicino alla sua posizione lat/lng, con
  // un'etichetta sempre rivolta verso la camera (quindi sempre dritta e leggibile).
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !categories || categories.length === 0) {
      categoryShellRef.current = null;
      return undefined;
    }

    const scene = g.scene();
    // Al posto del triangolo, ogni mondo ha la sua sagoma di categoria
    // (richiesta esplicita, dopo la prova con l'UFO sul mondo Nerd): stesso
    // colore/trasparenza di sempre (vedi categoryShell.js), cambia solo la
    // forma — tranne il mondo Bambini, dove ogni categoria ha una forma E
    // un colore diversi dalle altre (vedi buildCategoryFaceShape 'kids'),
    // con forme piene e luminose, bordo bianco, alone, pulsazione e hover
    // (il guscio "vivace", vedi buildCategoryShell e l'update nel giro di
    // disegno più giù).
    // Vetrina: triangoli con sopra i modelli 3D (vedi categoryShell.js).
    const shell = buildCategoryShell(categories, {
      radius: 122,
      color: world.color,
      shapeType: CATEGORY_SHAPE_BY_WORLD[world.id] ?? 'triangle',
      marginRings: CATEGORY_MARGIN_RINGS_BY_WORLD[world.id] ?? 1,
      ...(CATEGORY_LOOK_BY_WORLD[world.id] ?? {}),
      // M gotica pronta (font caricato): pieno regime per l'intro a particelle.
      onAnimatedReady: () => globeActivity.wake(3000),
      // Valigetta 3D del mondo Lavoro: env map del cromo (solo sui suoi materiali).
      renderer: g.renderer(),
    });
    scene.add(shell.group);
    categoryShellRef.current = shell;
    categoryPositionsRef.current = shell.positions;
    // Mondo nuovo: la rotazione riparte (una categoria aperta nel mondo di
    // prima non la tiene più ferma).
    spinFrozenRef.current = false;
    shell.setActive(activeCategory);
    onCategoryPositionsReady?.(shell.positions);

    // Toglie i puntini dei continenti e i nodi luminosi della rete da dentro ai
    // triangoli, per lasciare le etichette leggibili; tornano completi appena si
    // esce da questo mondo.
    if (overlayRef.current && landPointsRef.current) {
      rebuildLandDots(overlayRef.current, landPointsRef.current, shell.triangles, world.atmosphereColor);
    }
    if (overlayRef.current) {
      rebuildShellNodes(overlayRef.current, shell.triangles);
    }

    return () => {
      scene.remove(shell.group);
      shell.dispose();
      categoryShellRef.current = null;
      if (overlayRef.current && landPointsRef.current) {
        rebuildLandDots(overlayRef.current, landPointsRef.current, [], world.atmosphereColor);
      }
      if (overlayRef.current) {
        rebuildShellNodes(overlayRef.current, []);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, world.color]);

  const prevActiveCategoryRef = useRef(activeCategory);
  useEffect(() => {
    categoryShellRef.current?.setActive(activeCategory);
    // Categoria chiusa (da qualunque strada): il globo riprende a girare.
    if (prevActiveCategoryRef.current && !activeCategory) spinFrozenRef.current = false;
    prevActiveCategoryRef.current = activeCategory;
  }, [activeCategory]);

  // Rileva i click sui triangoli delle categorie, distinguendoli da un trascinamento
  // (che serve invece a ruotare il globo con OrbitControls).
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !categories || !onCategorySelect) return undefined;

    const canvas = g.renderer().domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos = null;

    const onPointerDown = (e) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e) => {
      if (!downPos) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 6) return;

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, g.camera());
      // noHit: lettera gotica in uscita o spenta (vedi categoryShell).
      const hit = raycaster.intersectObjects(categoryShellRef.current?.faceMeshes ?? []).find((h) => !h.object.userData.noHit);
      if (hit) onCategorySelect(hit.object.userData.categoryId);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, [categories, onCategorySelect]);

  // Hover del mouse sulle forme del mondo Bambini (solo desktop, e solo se il
  // guscio lo supporta — negli altri mondi non si aggiunge nemmeno
  // l'ascoltatore): la forma sotto il puntatore cresce e si accende di più
  // (vedi categoryShell.js setHovered). Il raycast è su una decina di mesh
  // piatte, si fa per evento senza bisogno di limitarne la frequenza.
  useEffect(() => {
    if (isTouchDevice) return undefined;
    const g = globeRef.current;
    const shell = categoryShellRef.current;
    if (!g || !shell?.supportsHover) return undefined;

    const canvas = g.renderer().domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredId = null;
    const setHovered = (id) => {
      if (id === hoveredId) return;
      hoveredId = id;
      shell.setHovered(id);
      canvas.style.cursor = id ? 'pointer' : '';
      globeActivity.wake();
    };

    const onPointerMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, g.camera());
      const hit = raycaster.intersectObjects(shell.faceMeshes).find((h) => !h.object.userData.noHit);
      setHovered(hit ? hit.object.userData.categoryId : null);
    };
    const onPointerLeave = () => setHovered(null);

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    return () => {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.style.cursor = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, world.color]);

  // I 5 globi satellite (i mondi non attivi) vivono nella STESSA scena/
  // renderer del globo grande — mai un secondo <Globe>, che vorrebbe dire un
  // secondo WebGLRenderer per ognuno e su mobile non reggerebbe (vedi
  // globe/satelliteGlobes.js). Un satellite per mondo si costruisce UNA SOLA
  // VOLTA IN ASSOLUTO qui (deps [], mai più): ricrearli ad ogni warp
  // costringeva il driver a ricompilare gli shader dei loro materiali ad
  // ogni cambio di mondo, il vero costo del blocco misurato durante il volo
  // (~250ms). La loro geometria non dipende dal livello di qualità grafica
  // (vedi SATELLITE_DETAIL in satelliteGlobes.js): farla dipendere causava
  // un cambio di forma a scatto se "Auto" declassava la qualità a metà
  // sessione, proprio mentre l'utente li guardava. Il cambio di mondo
  // attivo (sotto) si limita a mostrare/nascondere/riposizionare questi
  // stessi oggetti già pronti.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return undefined;
    const scene = g.scene();
    const sats = buildSatelliteGlobes({ worlds: WORLDS, referenceDistance: WEB_STARTUP_DIST });
    scene.add(sats.group);
    satellitesRef.current = sats;
    globeActivity.wake();
    return () => {
      scene.remove(sats.group);
      sats.dispose();
      satellitesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quale mondo è attivo adesso (quindi quali sono satelliti, e dove):
  // nessuna geometria/materiale nuovo, solo setActiveWorld() sul pool già
  // costruito sopra — l'unica cosa che un warp deve davvero fare a runtime.
  // Le posizioni sono assolute (vedi satelliteGlobes.js wavePoint/RING_ORDER,
  // l'anello a zigzag attorno al globo), non legate alla camera: non serve
  // ricalcolarle ad ogni frame, ci pensa già la correzione anti-sparizione
  // dentro update() quando la camera si avvicina troppo.
  useEffect(() => {
    const g = globeRef.current;
    const sats = satellitesRef.current;
    if (!g || !sats) return undefined;
    sats.setActiveWorld(world.id, { animateSpawn: hasPositionedSatellitesRef.current });
    hasPositionedSatellitesRef.current = true;
    globeActivity.wake();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.id]);

  // Galleggiamento/rotazione dei satelliti + rotazione del globo centrale su
  // se stesso: tutti agganciati allo stesso giro di disegno del globo grande
  // (un wrapper attorno a renderer.render, non un requestAnimationFrame a
  // parte; il salto dei fotogrammi è sul composer, vedi sotto) così si
  // fermano da soli solo a scheda nascosta (vedi
  // globeActivity). Qui anche il risparmio: senza interazioni da IDLE_MS
  // un fotogramma viene saltato se dall'ultimo disegno sono passati meno di
  // FRAME_MS_IDLE (~30 fps), o FRAME_MS_COVERED (~10 fps) con un pannello
  // sopra. In più il tetto adattivo di fx/quality.js (createAdaptiveFrameCap):
  // se il ciclo resta lento per qualche secondo, ~15 fps anche durante le
  // interazioni, finché non torna leggero. elapsed/deltaSec sono sempre tempo reale
  // misurato fra un disegno vero e il successivo (lastElapsed si aggiorna
  // solo quando si disegna), quindi a 30 fps satelliti e globo girano alla
  // stessa velocità, solo con meno fotogrammi. idleFactor (0..1, calcolato al volo da
  // computeIdleFactor — la rampa morbida di IDLE_EASE_IN_S/IDLE_EASE_OUT_S
  // secondi impostata da globeActivity.startAutoRotate/stopAutoRotate) è la
  // "velocità" di entrambi i movimenti: a 0 tutto è fermo (mouse dentro), a
  // 1 velocità piena (mouse fuori da IDLE_EASE_IN_S secondi). Il globo
  // centrale, il guscio a rete (overlayRef) e i triangoli delle categorie
  // (categoryShellRef) condividono lo STESSO angolo accumulato
  // (globeSpinAngleRef): mai calcolato tre volte separatamente, altrimenti
  // andrebbero fuori sincrono fra loro nel tempo.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return undefined;
    const renderer = g.renderer();
    const composer = g.postProcessingComposer();
    const originalRender = renderer.render.bind(renderer);
    const originalComposerRender = composer.render.bind(composer);
    const startedAt = performance.now();
    let lastElapsed = 0;
    let lastDrawAt = 0;
    const frameCap = createAdaptiveFrameCap();
    const shellViewportSize = new THREE.Vector2();
    // reduceMotionActiveRef si aggiorna solo da startAutoRotate (desktop):
    // per le forme vivaci si legge anche la preferenza di sistema diretta,
    // così vale pure su telefono.
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Il salto dei fotogrammi sta sul composer, non su renderer.render:
    // three-render-objects disegna sempre passando dall'EffectComposer, il
    // cui RenderPass chiama renderer.clear() PRIMA di renderer.render. Se si
    // saltava solo renderer.render, nei fotogrammi saltati il canvas veniva
    // comunque pulito e il browser mostrava un fotogramma vuoto: il
    // mappamondo "tremava" e a tratti diventava tutto nero. Saltando il
    // composer, in quei fotogrammi il canvas non si tocca e resta
    // l'immagine precedente.
    composer.render = (deltaTime) => {
      const now = performance.now();
      frameCap.tick(now);
      const idleFrameMs = globeCoverRef.current ? FRAME_MS_COVERED : FRAME_MS_IDLE;
      const minFrameMs = Math.max(now > fullFpsUntilRef.current ? idleFrameMs : 0, frameCap.frameMs());
      if (now - lastDrawAt < minFrameMs) return;
      lastDrawAt = now;
      originalComposerRender(deltaTime);
    };
    renderer.render = (scene, camera) => {
      const now = performance.now();
      const elapsed = (now - startedAt) / 1000;
      const deltaSec = elapsed - lastElapsed;
      lastElapsed = elapsed;

      const idleFactor = computeIdleFactor(now);
      const reduceMotion = reduceMotionActiveRef.current;
      if (!reduceMotion) {
        if (!spinFrozenRef.current) globeSpinAngleRef.current += IDLE_GLOBE_SPIN_DEG_S * DEG2RAD * deltaSec * idleFactor;
        const angle = globeSpinAngleRef.current;
        if (globeRootRef.current) globeRootRef.current.rotation.y = angle;
        if (overlayRef.current) overlayRef.current.group.rotation.y = angle;
        if (categoryShellRef.current) categoryShellRef.current.group.rotation.y = angle;
      }
      satellitesRef.current?.update(elapsed, deltaSec, camera, reduceMotion ? 0 : idleFactor, reduceMotion);
      // Forme "vivaci" del mondo Bambini (pulsazione, galleggiamento, hover)
      // e M gotica del mondo Social: stesso giro di disegno, niente ciclo a
      // parte (vedi categoryShell.js update). Negli altri mondi non si chiama.
      if (categoryShellRef.current?.animated) {
        categoryShellRef.current.update(elapsed, deltaSec, {
          reduceMotion: reduceMotion || reducedMotionQuery.matches,
          viewportSize: renderer.getSize(shellViewportSize),
          // Brillantini delle lettere: stessa compensazione dei punti.
          pixelRatio: renderer.getPixelRatio() * pointSizeFactor(),
          camera,
        });
      }
      compensatePointSizes(scene);
      originalRender(scene, camera);
      placeLabelsRef.current?.update(camera, camera.position.length() / 100 - 1, now);
    };
    return () => {
      renderer.render = originalRender;
      composer.render = originalComposerRender;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Il warp vero e proprio (Fase 2b): la camera vola verso la direzione del
  // satellite scelto mentre lui cresce, un flash copre lo scambio (il globo
  // grande è un sistema visivo diverso dal satellite — contorni reali contro
  // icosaedro leggero, vedi satelliteGlobes.js — un morph continuo fra i due
  // richiederebbe unificarli, fuori scopo qui), poi la camera torna alla
  // vista di sempre sul nuovo mondo e onWarpArrived lo rende quello attivo
  // (App.jsx cambia `world`, i satelliti si ricostruiscono da soli, vedi
  // sopra). Rispetta prefers-reduced-motion: in quel caso passa dritto al
  // nuovo mondo, senza volo né flash.
  const runWarp = (worldId) => {
    startupViewActiveRef.current = false;
    if (warpingRef.current || !onWarpArrived) return;
    const g = globeRef.current;
    const sats = satellitesRef.current;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const latLng = sats?.getWorldLatLng(worldId);
    if (!g || !sats || !latLng || reduceMotion) {
      onWarpArrived(worldId);
      return;
    }

    warpingRef.current = true;
    globeActivity.stopAutoRotate();
    globeActivity.wake(WARP_DIVE_MS + WARP_FLASH_MS + 600);
    sats.setWarpTarget(worldId, WARP_DIVE_MS);
    g.pointOfView({ lat: latLng.lat, lng: latLng.lng, altitude: 1.1 }, WARP_DIVE_MS);

    window.setTimeout(() => {
      warpFlashRef.current?.classList.add('active');
      window.setTimeout(() => {
        sats.setWarpTarget(null);
        // lat/lng espliciti (non solo altitude): altrimenti la camera resta
        // orientata verso la direzione del satellite appena raggiunto, e i
        // nuovi satelliti (compreso il mondo appena lasciato) apparirebbero
        // in posizioni diverse dalla disposizione consueta a seconda di quale
        // satellite si è cliccato — la vista di arrivo deve essere sempre la
        // stessa, comoda e prevedibile.
        g.pointOfView({ lat: 0, lng: 0, altitude: defaultAltitude() }, 0);
        onWarpArrived(worldId);
        window.setTimeout(() => {
          warpFlashRef.current?.classList.remove('active');
          warpingRef.current = false;
        }, 80);
      }, WARP_FLASH_MS);
    }, WARP_DIVE_MS);
  };

  // Mondi disattivati dall'utente: buco nero al posto del satellite (vedi
  // globe/blackHole.js). disabledWorlds = { key: 'id1,id2', animate }
  // (vedi App.jsx): animate solo per un cambio fatto adesso dall'utente,
  // mai al primo giro (stato già salvato all'apertura dell'app). Durante
  // l'animazione il disegno resta a pieno regime.
  const disabledFirstRunRef = useRef(true);
  useEffect(() => {
    const sats = satellitesRef.current;
    if (!sats || !disabledWorlds) return;
    const ids = disabledWorlds.key ? disabledWorlds.key.split(',') : [];
    const animate = disabledWorlds.animate && !disabledFirstRunRef.current;
    disabledFirstRunRef.current = false;
    sats.setDisabledWorlds(ids, { animate });
    if (animate) globeActivity.wake(8000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabledWorlds]);

  // Scorciatoia da App.jsx: il selettore a icone a destra fa partire lo
  // stesso identico warp di un click sul satellite, non un cambio istantaneo.
  useEffect(() => {
    if (warpRequest) runWarp(warpRequest.worldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warpRequest]);

  // Click su un satellite: fa partire il warp verso quel mondo. Su un buco
  // nero (mondo disattivato) invece niente warp: App.jsx mostra lì accanto
  // "Riattiva mondo".
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !onWarpArrived) return undefined;
    const canvas = g.renderer().domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos = null;

    const onPointerDown = (e) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e) => {
      if (!downPos || !satellitesRef.current) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 6) return;

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, g.camera());
      const hits = raycaster.intersectObjects(satellitesRef.current.getHitMeshes());
      if (hits.length === 0) return;
      const worldId = hits[0].object.userData.worldId;
      if (satellitesRef.current.isDisabled(worldId) && onDisabledWorldClick) {
        onDisabledWorldClick({ worldId, x: e.clientX, y: e.clientY });
        return;
      }
      runWarp(worldId);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onWarpArrived, onDisabledWorldClick]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    // OrbitControls.autoRotate resta sempre false: la camera non orbita
    // mai da sola (vedi globeActivity sopra e il wrapper di
    // renderer.render più giù per il movimento vero, sul globo/satelliti).
    g.controls().enableZoom = true;
    g.camera().far = CAMERA_FAR;
    g.camera().updateProjectionMatrix();
    // Vista iniziale panoramica (vedi startupFov): a ogni
    // avvio, e di nuovo al resize/rotazione del telefono finché l'utente
    // non ha mosso la camera (trascinamento, zoom, voli).
    // Distanza iniziale e fattore di scala della vista per lo schermo di
    // adesso; il fattore vale anche dopo che l'utente ha mosso la camera
    // (voli e ritorno dopo il cambio mondo lo usano).
    // Campo visivo per lo schermo di adesso (vedi startupFov): vale sempre,
    // anche dopo che l'utente ha mosso la camera.
    const measureStartup = () => {
      // Stesse misure dello stato `size` (il canvas può non essere ancora
      // stato ridimensionato quando arriva l'evento resize).
      const w = window.visualViewport?.width ?? window.innerWidth;
      const h = window.visualViewport?.height ?? window.innerHeight;
      const fov = startupFov(w, h, satelliteLayout(satellitesRef.current));
      const camera = g.camera();
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      halfFovTan = Math.tan((fov * Math.PI) / 360);
      applyRotateSpeed();
    };
    const applyStartupView = () => {
      measureStartup();
      g.pointOfView({ lat: STARTUP_ELEVATION_DEG, lng: 0, altitude: WEB_STARTUP_DIST / GLOBE_RADIUS - 1 }, 0);
      syncEventZoom();
    };
    applyStartupView();
    const markMoved = () => {
      startupViewActiveRef.current = false;
    };
    g.controls().addEventListener('start', markMoved);
    const onResize = () => {
      if (!startupViewActiveRef.current) {
        window.requestAnimationFrame(() => {
          measureStartup();
          syncEventZoom();
        });
        return;
      }
      // dopo il resize del canvas (setSize parte dallo stesso evento)
      window.requestAnimationFrame(applyStartupView);
    };
    window.addEventListener('resize', onResize);
    if (isTouchDevice) globeActivity.wake();
    else globeActivity.startAutoRotate();
    return () => {
      g.controls().removeEventListener('start', markMoved);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando cambia ciò che si vede (marker, continenti, mondo, categorie,
  // dimensioni) si ridisegna a pieno regime per un attimo.
  useEffect(() => {
    globeActivity.wake();
  }, [globeActivity, displayItems, landPolygons, world, categories, activeCategory, size]);

  // Solo su desktop: passando il mouse sopra il globo, il movimento idle si
  // ferma (rampa di IDLE_EASE_OUT_S secondi); togliendolo, riparte (rampa di
  // IDLE_EASE_IN_S secondi) e resta attivo finché il mouse non rientra, senza
  // un tetto massimo (è un salvaschermo). Su mobile non c'e' mai
  // auto-rotazione, quindi non serve gestire l'hover (il touch non "passa
  // sopra", tocca e basta).
  useEffect(() => {
    if (isTouchDevice) return undefined;
    const g = globeRef.current;
    if (!g) return undefined;
    const canvas = g.renderer().domElement;
    const onEnter = () => {
      isHoveringRef.current = true;
      globeActivity.stopAutoRotate();
    };
    const onLeave = () => {
      isHoveringRef.current = false;
      globeActivity.startAutoRotate();
    };
    canvas.addEventListener('pointerenter', onEnter);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      canvas.removeEventListener('pointerenter', onEnter);
      canvas.removeEventListener('pointerleave', onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando si cerca una città nota nei filtri, il globo smette di ruotare da solo
  // e vola sopra quella città con una transizione morbida.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !flyTo) return undefined;
    startupViewActiveRef.current = false;

    globeActivity.stopAutoRotate();
    // Volo verso una categoria: rotazione ferma subito (non con la rampa di
    // stopAutoRotate) e finché la categoria resta aperta; lo zoom indietro
    // (chiusura) la fa ripartire.
    if (flyTo.categoryId) spinFrozenRef.current = true;
    else if (flyTo.lat === undefined) spinFrozenRef.current = false;
    // Il volo è animato dal ciclo di disegno: a pieno regime finché dura.
    globeActivity.wake(CATEGORY_FLY_MS + IDLE_MS);
    const pov = { altitude: flyTo.altitude ?? 1.3 };
    // Posizione ATTUALE: quella della stella calcolata dal guscio (più
    // precisa dell'anchor passata da App), poi riportata alla rotazione del
    // momento (vedi toWorldLatLng).
    const local = (flyTo.categoryId && categoryPositionsRef.current[flyTo.categoryId]) || (flyTo.lat !== undefined ? flyTo : null);
    if (local && local.lat !== undefined && local.lng !== undefined) {
      const container = flyTo.categoryId ? categoryShellRef.current?.group : undefined;
      Object.assign(pov, toWorldLatLng(local.lat, local.lng, container));
      // Categoria su un polo (Stanza MOD del mondo FAQ, lat 90): la camera
      // sale sopra il polo restando alla longitudine attuale, senza girare
      // attorno all'asse né capovolgersi (esattamente a ±90° lookAt è
      // indeterminato). 88° è già "sopra al polo" a schermo.
      if (Math.abs(pov.lat) > POLE_FLY_MAX_LAT) {
        pov.lat = Math.sign(pov.lat) * POLE_FLY_MAX_LAT;
        pov.lng = g.pointOfView().lng;
      }
    }
    g.pointOfView(pov, CATEGORY_FLY_MS);

    // Su mobile il globo resta sempre fermo (si muove solo con le dita), quindi
    // dopo il volo non riparte mai da solo.
    if (isTouchDevice) return undefined;

    const resumeTimer = setTimeout(() => {
      if (!isHoveringRef.current) globeActivity.startAutoRotate();
    }, 4000);

    return () => clearTimeout(resumeTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  return (
    <div className="rb-globe-shell" ref={containerRef} data-far-user-dots={farUserDotsWorld ? 'true' : undefined}>
      <Globe
        ref={globeRef}
        rendererConfig={{ antialias: initialAntialias, alpha: true }}
        globeMaterial={globeMaterial}
        backgroundColor="rgba(0,0,0,0)"
        // Hover/click degli oggetti di globe.gl non usati (categorie e
        // satelliti hanno i loro raycaster, i marker sono HTML): senza questo
        // three-render-objects rifaceva ogni 50 ms un raycast su tutta la
        // scena, continenti compresi (~80% del JavaScript durante un
        // trascinamento, vedi globe/landLod.js).
        enablePointerInteraction={false}
        showAtmosphere={quality.atmosphere}
        atmosphereColor={world.atmosphereColor}
        atmosphereAltitude={0.3}
        htmlElementsData={displayItems}
        htmlLat="lat"
        htmlLng="lng"
        // Marker sulla superficie (raggio 100, come continenti e sfera): a
        // quota 0.03 (raggio 103) da vicino la parallasse li faceva
        // scivolare rispetto alla costa ruotando il globo. Il controllo
        // "dietro al globo" della libreria funziona anche a quota 0.
        htmlAltitude={0}
        htmlElementVisibilityModifier={(el) => setMarkerVisibility(el)}
        htmlElement={(item) =>
          registerMarkerEl(
            item,
            item.kind === 'cluster'
              ? makeClusterEl(item, world, expandCluster)
              : item.kind === 'event'
              ? makeEventMarkerEl(item, onSelectEvent)
              : makeMarkerEl(item, world, onSelectUser)
          )
        }
        width={size.width}
        height={size.height}
      />
      <div className="rb-globe-warp-flash" ref={warpFlashRef} aria-hidden="true" />
    </div>
  );
}

// Di solito un solo colore vale per tutto (linee + puntini), ma un mondo può
// avere un world.lineColor separato per le sole linee del guscio (vedi
// Incontri in data/worlds.js): puntini/continenti restano sul colore
// principale, dotColor.
function applyOverlayColor(overlay, dotColor, lineColor = dotColor) {
  if (overlay.landDots) overlay.landDots.material.color.set(dotColor);
  overlay.shell.lineMaterial.color.set(lineColor);
  overlay.shell.nodeMaterial.color.set(dotColor);
}

// Ricostruisce i puntini dei continenti, escludendo (o meno) quelli dentro ai
// triangoli delle categorie attive.
function rebuildLandDots(overlay, landPoints, excludeTriangles, color) {
  const old = overlay.landDots;
  if (old) {
    overlay.group.remove(old);
    old.geometry.dispose();
    old.material.dispose();
  }
  const landDots = buildLandDots(landPoints, excludeTriangles);
  landDots.material.color.set(color);
  overlay.group.add(landDots);
  overlay.landDots = landDots;
}

// Rifà la geometria dei nodi luminosi del guscio, escludendo quelli dentro ai
// triangoli delle categorie attive (il materiale/colore resta lo stesso).
function rebuildShellNodes(overlay, excludeTriangles) {
  const newGeometry = buildShellNodeGeometry(overlay.shell.icoGeometry, excludeTriangles);
  overlay.shell.nodes.geometry.dispose();
  overlay.shell.nodes.geometry = newGeometry;
}

// Margine (px) dal bordo del canvas sotto il quale un'etichetta si nasconde
// invece di restare a metà tagliata dal bordo della finestra.
const LABEL_EDGE_MARGIN = 16;

// Nasconde (sprite.visible, mai un remove dalla scena) l'etichetta di una
// categoria quando: è sul retro del globo rispetto alla camera (prodotto
// scalare fra la normale del punto e la direzione verso la camera), è
// troppo vicina al bordo dello schermo, o cade sopra al menu testuale delle
// categorie in basso a sinistra (.rb-world-tagline-list, vedi App.jsx) — lì
// il nome è già leggibile e cliccabile, l'etichetta 3D sarebbe solo
// un'etichetta doppia che si accavalla.
function updateCategoryLabelVisibility(g, shell, activeCategoryId) {
  const sprites = shell.labelSprites;
  if (!sprites || sprites.length === 0) return;
  const camera = g.camera();
  const canvas = g.renderer().domElement;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const taglineEl = document.querySelector('.rb-world-tagline-list');
  const taglineRect = taglineEl ? taglineEl.getBoundingClientRect() : null;

  sprites.forEach((sprite) => {
    // Posizione VERA in scena, non quella locale (sprite.position): il
    // gruppo delle categorie ora ruota assieme al globo (vedi
    // globeSpinAngleRef in WorldGlobe.jsx), quindi la posizione locale da
    // sola non basta più a sapere dove lo sprite si trova davvero.
    const worldPos = sprite.getWorldPosition(new THREE.Vector3());
    const outwardNormal = worldPos.clone().normalize();
    const toCamera = camera.position.clone().sub(worldPos).normalize();
    const facingAway = outwardNormal.dot(toCamera) < 0.08;

    const ndc = worldPos.clone().project(camera);
    const behindCamera = ndc.z > 1;
    const screenX = rect.left + (ndc.x * 0.5 + 0.5) * rect.width;
    const screenY = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
    const nearEdge =
      screenX < rect.left + LABEL_EDGE_MARGIN ||
      screenX > rect.right - LABEL_EDGE_MARGIN ||
      screenY < rect.top + LABEL_EDGE_MARGIN ||
      screenY > rect.bottom - LABEL_EDGE_MARGIN;
    const overTagline =
      taglineRect &&
      screenX >= taglineRect.left &&
      screenX <= taglineRect.right &&
      screenY >= taglineRect.top &&
      screenY <= taglineRect.bottom;

    // La categoria attiva non mostra la propria etichetta sul globo mentre
    // il suo pannello è aperto (Fase 2c): l'etichetta "è diventata" il
    // titolo del pannello (vedi LabelMorphTitle), tenerla anche qui sarebbe
    // un doppione proprio al centro dello schermo, dove il volo l'ha appena
    // portata.
    const isActivePanel = sprite.userData.categoryId === activeCategoryId;
    sprite.visible = !isActivePanel && !facingAway && !behindCamera && !nearEdge && !overTagline;
  });
}

export { WORLDS };
