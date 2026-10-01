// Continenti del globo grande a più livelli di dettaglio (vedi
// scripts/build-land-geojson.mjs per i file):
// - lontano (altitudine > ALT_DETAIL): land-110m (125 poligoni), anche lui
//   nel worker: sul thread principale ConicPolygonGeometry lo costruiva in
//   ~2 s su un portatile con GPU integrata, proprio durante l'animazione
//   d'ingresso del globo (che quindi si congelava e saltava alla fine);
// - zoom medio e ravvicinato: land-50m, ritagliato in riquadri da 10°;
// - zoom ravvicinato (altitudine < ALT_10M): i riquadri land10 vicini al
//   centro della vista prendono il posto dei riquadri 50m corrispondenti.
// 50m e 10m si costruiscono nel worker (globe/landWorker.js) e arrivano
// come array. Durante la rotazione non si ricostruisce mai nessuna geometria
// (prima ogni cambio dei riquadri visibili riuniva tutto sul thread
// principale: 50-100 ms a CPU rallentata 4x, quasi 2 volte al secondo):
// - il 50m è UN gruppo di buffer per tutto il globo (3 draw call), unito
//   una volta nel worker; un riquadro coperto dal 10m si spegne riscrivendo
//   solo il suo intervallo di indici (vedi combineTiles in landGeometry.js);
// - ogni riquadro 10m è un oggetto a sé, creato alla prima volta che serve
//   e poi solo acceso/spento con visible.
// Il 10m si accende e il 50m corrispondente si spegne nello stesso
// aggiornamento: né buchi né doppio contorno. Mai un buco: finché il 50m non
// è pronto resta il 110m, e un riquadro 10m non ancora arrivato resta al
// 50m. L'unico momento senza continenti è il primo secondo dopo il mount,
// finché il worker non consegna il 110m.
//
// Nessun oggetto dei continenti risponde ai raycast: sono solo disegno (il
// globo cliccabile è la sfera di three-globe), e l'hover di
// three-render-objects li attraversava ogni 50 ms segmento per segmento
// (~80% del JavaScript durante un trascinamento).
import * as THREE from 'three';

const TILE_DEG = 10;
// Sotto questa altitudine il livello dettaglio (50m + 10m) sostituisce il
// 110m; sotto ALT_10M arrivano i riquadri 10m. HYSTERESIS evita di
// cambiare avanti e indietro stando fermi sulla soglia.
const ALT_DETAIL = 1.6;
const ALT_10M = 0.6;
const HYSTERESIS = 0.05;
// Raggio massimo (gradi dal centro della vista) entro cui si usano i
// riquadri 10m: oltre, verso i bordi dello schermo e l'orizzonte, il 50m
// basta e avanza (e ogni riquadro 10m sono decine di KB da scaricare).
const MAX_10M_RADIUS_DEG = 12;
// Margine in più sul raggio, per avere i riquadri pronti prima che entrino
// davvero in vista.
const PREFETCH_MARGIN_DEG = 3;
const MAX_CACHED_TILES = 80;
// Trattini dei confini: lunghezza proporzionale alla distanza della camera
// dalla superficie, così restano più o meno della stessa misura in pixel.
const DASH_PER_ALTITUDE = 0.9;

const DEG2RAD = Math.PI / 180;

function angularDistanceDeg(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLng = (lng2 - lng1) * DEG2RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLng / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / DEG2RAD;
}

// Distanza (approssimata per difetto) dal punto al riquadro: si porta il
// punto dentro al riquadro lungo lat e lng e si misura la distanza.
function distanceToTileDeg(lat, lng, tileLat, tileLng) {
  const cLat = Math.min(Math.max(lat, tileLat), tileLat + TILE_DEG);
  let dLng = ((lng - tileLng) % 360 + 360) % 360; // 0..360 dal bordo ovest
  let cLng;
  if (dLng <= TILE_DEG) cLng = lng;
  else cLng = dLng - TILE_DEG < 360 - dLng ? tileLng + TILE_DEG : tileLng;
  return angularDistanceDeg(lat, lng, cLat, cLng);
}

// Raggio (gradi di arco sulla superficie) visibile attorno al centro della
// vista: il raggio dell'angolo dello schermo che tocca la sfera, o
// l'orizzonte se quel raggio la manca.
function visibleRadiusDeg(altitude, camera) {
  const d = 1 + altitude;
  const halfFov = ((camera.fov ?? 50) / 2) * DEG2RAD;
  const theta = Math.atan(Math.tan(halfFov) * Math.sqrt(1 + (camera.aspect ?? 1) ** 2));
  const s = d * Math.sin(theta);
  const rad = s >= 1 ? Math.acos(1 / d) : Math.asin(s) - theta;
  return rad / DEG2RAD;
}

// Sfera di contenimento nota in anticipo (tutto sta sulla superficie del
// globo, raggio 100): niente computeBoundingSphere, che scorre tutti i
// vertici.
const LAND_BOUNDS = new THREE.Sphere(new THREE.Vector3(), 102);
const noRaycast = () => {};

function indexedGeometry({ position, index }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = LAND_BOUNDS.clone();
  return g;
}

function dashedGeometry({ position, lineDistance, index }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistance, 1));
  if (index) g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = LAND_BOUNDS.clone();
  return g;
}

export function createLandLod({ parent, features110, altitude = 0.006 }) {
  const group = new THREE.Group();
  group.name = 'rb-land';
  parent.add(group);

  // Stessi materiali per tutti i livelli (colori del mondo, vedi setColors).
  const capMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, depthWrite: true });
  const strokeMaterial = new THREE.LineBasicMaterial();
  const borderMaterial = new THREE.LineDashedMaterial({ transparent: true, opacity: 0.4, dashSize: 1, gapSize: 0.7 });

  const makeLevel = () => {
    const level = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.BufferGeometry(), capMaterial);
    const stroke = new THREE.LineSegments(new THREE.BufferGeometry(), strokeMaterial);
    const borders = new THREE.LineSegments(new THREE.BufferGeometry(), borderMaterial);
    // Come nel layer di three-globe: contorno 1e-4 sopra la calotta; i
    // confini ancora un filo più su delle coste.
    cap.scale.setScalar(1 + altitude);
    stroke.scale.setScalar(1 + altitude + 1e-4);
    borders.scale.setScalar(1 + altitude + 2e-4);
    cap.raycast = noRaycast;
    stroke.raycast = noRaycast;
    borders.raycast = noRaycast;
    level.add(cap, stroke, borders);
    group.add(level);
    const set = (arrays) => {
      cap.geometry.dispose();
      stroke.geometry.dispose();
      borders.geometry.dispose();
      cap.geometry = arrays.cap ? indexedGeometry(arrays.cap) : new THREE.BufferGeometry();
      stroke.geometry = arrays.stroke ? indexedGeometry(arrays.stroke) : new THREE.BufferGeometry();
      borders.geometry = arrays.borders ? dashedGeometry(arrays.borders) : new THREE.BufferGeometry();
      borders.visible = Boolean(arrays.borders);
    };
    const dispose = () => {
      cap.geometry.dispose();
      stroke.geometry.dispose();
      borders.geometry.dispose();
    };
    return { level, set, dispose, parts: { cap, stroke, borders } };
  };

  // Livello lontano: 110m. I poligoni si estraggono qui (istantaneo) e le
  // geometrie le fa il worker (vedi sotto, dopo `request`).
  const polygons110 = [];
  features110.forEach((f) => {
    const geometry = f.geometry;
    if (geometry?.type === 'Polygon') polygons110.push(geometry.coordinates);
    else if (geometry?.type === 'MultiPolygon') polygons110.push(...geometry.coordinates);
  });
  const far = makeLevel();

  // Livello dettaglio: 50m + riquadri 10m, costruito dal worker.
  const detail = makeLevel();
  detail.level.visible = false;

  let worker = null;
  let nextId = 1;
  const pending = new Map();
  // 50m: intervalli di indici per riquadro, copia degli indici originali
  // (per riaccendere) e riquadri spenti perché coperti dal 10m.
  let ranges50 = null;
  let original50 = null; // { cap, stroke, borders } -> Uint32Array
  let sink50 = null; // { cap, stroke, borders } -> indice del vertice pozzo
  const hidden50 = new Set();
  let land50Ready = false;
  let land50Requested = false;
  let index10 = null; // Set delle chiavi esistenti
  let index10Requested = false;
  const tiles10 = new Map(); // key -> arrays (LRU: ordine di inserimento)
  const tiles10Loading = new Set();
  const objects10 = new Map(); // key -> Group (calotta, coste, confini) già creato
  let shown10 = new Set(); // riquadri 10m accesi adesso
  let detailWanted = false;
  let tenWanted = false;
  let disposed = false;
  const base = import.meta.env.BASE_URL;

  const request = (message, onMessage) => {
    if (!worker) {
      worker = new Worker(new URL('./landWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        const handler = pending.get(event.data.id);
        if (!handler) return;
        if (event.data.done || event.data.error) pending.delete(event.data.id);
        handler(event.data);
      };
    }
    const id = nextId++;
    pending.set(id, onMessage);
    worker.postMessage({ id, ...message });
  };

  // 110m: i poligoni viaggiano nel messaggio (niente seconda richiesta del
  // file, che non è in precache), tornano gli array pronti per far.set.
  request({ kind: 'land110', polygons: polygons110 }, (msg) => {
    if (disposed) return;
    if (msg.error) {
      console.error('Impossibile costruire i continenti 110m', msg.error);
      return;
    }
    far.set(msg.arrays);
  });

  const ensure50 = () => {
    if (land50Requested) return;
    land50Requested = true;
    request({ kind: 'land50', url: `${base}geo/land-50m.json` }, (msg) => {
      if (disposed) return;
      if (msg.error) {
        console.error('Impossibile caricare i continenti 50m', msg.error);
        return;
      }
      if (!msg.done) return;
      const { cap, stroke, borders } = msg.arrays;
      detail.set({ cap, stroke, borders });
      ranges50 = msg.ranges;
      original50 = { cap: cap.index.slice(), stroke: stroke.index.slice(), borders: borders.index.slice() };
      sink50 = { cap: cap.sink, stroke: stroke.sink, borders: borders.sink };
      hidden50.clear();
      land50Ready = true;
    });
  };

  const ensureIndex10 = () => {
    if (index10Requested) return;
    index10Requested = true;
    request({ kind: 'index', url: `${base}geo/land10/index.json` }, (msg) => {
      if (disposed) return;
      if (msg.error) console.error('Impossibile caricare l’indice dei riquadri 10m', msg.error);
      else index10 = new Set(msg.data);
    });
  };

  const ensureTile10 = (key) => {
    if (tiles10.has(key) || tiles10Loading.has(key)) return;
    tiles10Loading.add(key);
    request({ kind: 'tile', key, url: `${base}geo/land10/${key}.json` }, (msg) => {
      tiles10Loading.delete(key);
      if (disposed) return;
      if (msg.error) {
        console.error(`Impossibile caricare il riquadro 10m ${key}`, msg.error);
        return;
      }
      tiles10.set(key, msg.arrays);
    });
  };

  const touchTile10 = (key) => {
    const arrays = tiles10.get(key);
    tiles10.delete(key);
    tiles10.set(key, arrays);
  };

  const disposeObject10 = (key) => {
    const obj = objects10.get(key);
    if (!obj) return;
    detail.level.remove(obj);
    obj.children.forEach((child) => child.geometry.dispose());
    objects10.delete(key);
  };

  const evictTiles10 = (keep) => {
    for (const key of tiles10.keys()) {
      if (tiles10.size <= MAX_CACHED_TILES) break;
      if (!keep.has(key) && !shown10.has(key)) {
        tiles10.delete(key);
        disposeObject10(key);
      }
    }
  };

  // Riquadro 10m come oggetto a sé (stesse scale e materiali del livello).
  const object10 = (key) => {
    let obj = objects10.get(key);
    if (obj) return obj;
    const arrays = tiles10.get(key);
    const { cap, stroke, borders } = detail.parts;
    obj = new THREE.Group();
    const add = (geometry, like, Kind, material) => {
      const o = new Kind(geometry, material);
      o.scale.copy(like.scale);
      o.raycast = noRaycast;
      obj.add(o);
    };
    if (arrays.cap) add(indexedGeometry(arrays.cap), cap, THREE.Mesh, capMaterial);
    if (arrays.stroke) add(indexedGeometry(arrays.stroke), stroke, THREE.LineSegments, strokeMaterial);
    if (arrays.borders) add(dashedGeometry(arrays.borders), borders, THREE.LineSegments, borderMaterial);
    obj.visible = false;
    detail.level.add(obj);
    objects10.set(key, obj);
    return obj;
  };

  // Spegne (hide = true) o riaccende un riquadro 50m: solo il suo intervallo
  // di indici, caricato sulla GPU con addUpdateRange (niente buffer nuovi).
  const setTile50Hidden = (key, hide) => {
    const r = ranges50?.[key];
    if (!r || hidden50.has(key) === hide) return;
    if (hide) hidden50.add(key);
    else hidden50.delete(key);
    for (const part of ['cap', 'stroke', 'borders']) {
      const [start, count] = r[part];
      if (!count) continue;
      const attr = detail.parts[part].geometry.index;
      if (hide) attr.array.fill(sink50[part], start, start + count);
      else attr.array.set(original50[part].subarray(start, start + count), start);
      attr.addUpdateRange(start, count);
      attr.needsUpdate = true;
    }
  };

  // Accende i riquadri 10m di `next` e spegne i 50m sotto di loro, e
  // viceversa per quelli che escono: tutto nello stesso aggiornamento.
  const applyTiles10 = (next) => {
    for (const key of shown10) {
      if (next.has(key)) continue;
      const obj = objects10.get(key);
      if (obj) obj.visible = false;
      setTile50Hidden(key, false);
    }
    for (const key of next) {
      if (shown10.has(key)) continue;
      object10(key).visible = true;
      setTile50Hidden(key, true);
    }
    shown10 = next;
  };

  const tilesNear = (keysIterable, lat, lng, radiusDeg) => {
    const keys = [];
    for (const key of keysIterable) {
      const [tLat, tLng] = key.split('_').map(Number);
      if (distanceToTileDeg(lat, lng, tLat, tLng) <= radiusDeg) keys.push(key);
    }
    return keys;
  };

  // Chiamata dal polling della vista (4 volte al secondo), mai a ogni
  // fotogramma. pov: { lat, lng, altitude } di g.pointOfView().
  const update = (pov, camera) => {
    if (disposed) return;
    const alt = pov.altitude;
    detailWanted = detailWanted ? alt < ALT_DETAIL + HYSTERESIS : alt < ALT_DETAIL - HYSTERESIS;
    tenWanted = detailWanted && (tenWanted ? alt < ALT_10M + HYSTERESIS : alt < ALT_10M - HYSTERESIS);
    if (detailWanted) ensure50();

    let active10 = new Set();
    if (tenWanted) {
      ensureIndex10();
      if (index10) {
        const radius = Math.min(visibleRadiusDeg(alt, camera), MAX_10M_RADIUS_DEG);
        const needed = tilesNear(index10, pov.lat, pov.lng, radius + PREFETCH_MARGIN_DEG);
        needed.forEach(ensureTile10);
        active10 = new Set(needed.filter((key) => tiles10.has(key)));
        active10.forEach(touchTile10);
        evictTiles10(new Set(needed));
      }
    }

    const showDetail = detailWanted && land50Ready;
    if (showDetail) {
      applyTiles10(active10);
      // Trattini più corti avvicinandosi (unità del globo: raggio 100).
      const dash = Math.max(0.05, DASH_PER_ALTITUDE * alt);
      borderMaterial.dashSize = dash;
      borderMaterial.gapSize = dash * 0.7;
    }
    far.level.visible = !showDetail;
    detail.level.visible = showDetail;
  };

  // Colori del mondo. Il riempimento arrivava a three-globe come stringa
  // rgba() costruita dai componenti di THREE.Color (già convertiti nello
  // spazio lineare) e riletta come sRGB: un po' più scuro del colore del
  // mondo, ed è l'aspetto a cui tutti i mondi sono tarati, quindi resta.
  const setColors = ({ fillColor, fillOpacity = 0.1, strokeColor }) => {
    const c = new THREE.Color(fillColor);
    capMaterial.color.setRGB(Math.round(c.r * 255) / 255, Math.round(c.g * 255) / 255, Math.round(c.b * 255) / 255, THREE.SRGBColorSpace);
    capMaterial.opacity = fillOpacity;
    capMaterial.transparent = fillOpacity < 1;
    strokeMaterial.color.set(strokeColor);
    borderMaterial.color.set(strokeColor);
  };

  const dispose = () => {
    disposed = true;
    worker?.terminate();
    pending.clear();
    parent.remove(group);
    far.dispose();
    detail.dispose();
    [...objects10.keys()].forEach(disposeObject10);
    capMaterial.dispose();
    strokeMaterial.dispose();
    borderMaterial.dispose();
  };

  return { group, update, setColors, dispose };
}
