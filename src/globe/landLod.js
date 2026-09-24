// Continenti del globo grande a più livelli di dettaglio (vedi
// scripts/build-land-geojson.mjs per i file):
// - lontano (altitudine > ALT_DETAIL): land-110m, costruito subito sul
//   thread principale (125 poligoni, pochi ms), come sempre;
// - zoom medio e ravvicinato: land-50m, ritagliato in riquadri da 10°;
// - zoom ravvicinato (altitudine < ALT_10M): i riquadri land10 vicini al
//   centro della vista prendono il posto dei riquadri 50m corrispondenti.
// 50m e 10m si costruiscono nel worker (globe/landWorker.js) e arrivano
// come array; qui si uniscono in UNA Mesh (calotte), UNA LineSegments
// (coste) e UNA LineSegments tratteggiata (confini di stato) per tutto il
// livello "dettaglio": 3 draw call, qualunque sia il numero di riquadri.
// Mai un buco: finché il 50m non è pronto resta il 110m, e un riquadro 10m
// non ancora arrivato resta al 50m.
import * as THREE from 'three';
import { polygonsArrays, concatIndexed, concatDashed } from './landGeometry';

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
// Riquadri 50m: solo quelli dal lato visibile del globo (raggio visibile
// più questo margine), il retro non si disegna comunque.
const VISIBLE_50M_MARGIN_DEG = 15;
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

function indexedGeometry({ position, index }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeBoundingSphere();
  return g;
}

function dashedGeometry({ position, lineDistance }) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('lineDistance', new THREE.BufferAttribute(lineDistance, 1));
  g.computeBoundingSphere();
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
    return { level, set, dispose };
  };

  // Livello lontano: 110m, subito.
  const polygons110 = [];
  features110.forEach((f) => {
    const geometry = f.geometry;
    if (geometry?.type === 'Polygon') polygons110.push(geometry.coordinates);
    else if (geometry?.type === 'MultiPolygon') polygons110.push(...geometry.coordinates);
  });
  const far = makeLevel();
  far.set(polygonsArrays(polygons110));

  // Livello dettaglio: 50m + riquadri 10m, costruito dal worker.
  const detail = makeLevel();
  detail.level.visible = false;

  let worker = null;
  let nextId = 1;
  const pending = new Map();
  const tiles50 = new Map(); // key -> arrays
  let land50Ready = false;
  let land50Requested = false;
  let index10 = null; // Set delle chiavi esistenti
  let index10Requested = false;
  const tiles10 = new Map(); // key -> arrays (LRU: ordine di inserimento)
  const tiles10Loading = new Set();
  let detailKey = null; // quali riquadri 50m e 10m sono dentro la geometria attuale
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

  const ensure50 = () => {
    if (land50Requested) return;
    land50Requested = true;
    request({ kind: 'land50', url: `${base}geo/land-50m.json` }, (msg) => {
      if (disposed) return;
      if (msg.error) {
        console.error('Impossibile caricare i continenti 50m', msg.error);
        return;
      }
      if (msg.key) tiles50.set(msg.key, msg.arrays);
      if (msg.done) {
        land50Ready = true;
        detailKey = null; // forza la costruzione al prossimo update
      }
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

  const evictTiles10 = (keep) => {
    for (const key of tiles10.keys()) {
      if (tiles10.size <= MAX_CACHED_TILES) break;
      if (!keep.has(key)) tiles10.delete(key);
    }
  };

  const rebuildDetail = (active50, active10) => {
    const caps = [];
    const strokes = [];
    const borders = [];
    for (const key of active50) {
      const arrays = tiles50.get(key);
      caps.push(arrays.cap);
      strokes.push(arrays.stroke);
      borders.push(arrays.borders);
    }
    for (const key of active10) {
      const arrays = tiles10.get(key);
      caps.push(arrays.cap);
      strokes.push(arrays.stroke);
      borders.push(arrays.borders);
    }
    detail.set({ cap: concatIndexed(caps), stroke: concatIndexed(strokes), borders: concatDashed(borders) });
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
      const radius50 = visibleRadiusDeg(alt, camera) + VISIBLE_50M_MARGIN_DEG;
      const active50 = tilesNear(tiles50.keys(), pov.lat, pov.lng, radius50).filter((key) => !active10.has(key));
      const key = `${active50.sort().join(',')}|${[...active10].sort().join(',')}`;
      if (key !== detailKey) {
        rebuildDetail(active50, active10);
        detailKey = key;
      }
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
    capMaterial.dispose();
    strokeMaterial.dispose();
    borderMaterial.dispose();
  };

  return { group, update, setColors, dispose };
}
