// Geometrie dei continenti come array puri (niente oggetti three.js da
// passare in giro): servono sia al thread principale (110m, subito) sia al
// worker che prepara 50m e riquadri 10m (globe/landWorker.js), che li
// rimanda indietro come ArrayBuffer trasferibili. Le geometrie sono quelle
// del layer polygonsData di three-globe: ConicPolygonGeometry con la sola
// calotta e GeoJsonGeometry per i contorni, risoluzione 5°.
import ConicPolygonGeometry from 'three-conic-polygon-geometry';
import GeoJsonGeometry from 'three-geojson-geometry';

const GLOBE_RADIUS = 100;
const CURVATURE_RESOLUTION_DEG = 5;

// Unisce più BufferGeometry indicizzate (solo position) in un array di
// posizioni e uno di indici, spostando gli indici di ciascuna.
function mergeIndexed(geometries) {
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geometries) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const position = new Float32Array(vertexCount * 3);
  const index = new Uint32Array(indexCount);
  let v = 0;
  let i = 0;
  for (const g of geometries) {
    const pos = g.attributes.position.array;
    position.set(pos, v * 3);
    if (g.index) {
      const src = g.index.array;
      for (let k = 0; k < src.length; k += 1) index[i + k] = src[k] + v;
      i += src.length;
    } else {
      const n = g.attributes.position.count;
      for (let k = 0; k < n; k += 1) index[i + k] = v + k;
      i += n;
    }
    v += g.attributes.position.count;
    g.dispose();
  }
  return { position, index };
}

const capGeometry = (coords) => new ConicPolygonGeometry(coords, 0, GLOBE_RADIUS, false, true, false, CURVATURE_RESOLUTION_DEG);
const lineGeometry = (geoJson) => new GeoJsonGeometry(geoJson, GLOBE_RADIUS, CURVATURE_RESOLUTION_DEG);

// Poligoni GeoJSON ([anello, buco, ...] con anelli [[lng, lat], ...]):
// calotte unite + contorni uniti (tutti i lati sono coste).
export function polygonsArrays(polygons) {
  return {
    cap: mergeIndexed(polygons.map(capGeometry)),
    stroke: mergeIndexed(polygons.map((coords) => lineGeometry({ type: 'Polygon', coordinates: coords }))),
  };
}

// Linee (MultiLineString) come segmenti NON indicizzati, con la distanza
// cumulata per LineDashedMaterial (computeLineDistances di three.js non
// funziona sulle geometrie indicizzate).
export function dashedLinesArrays(lines) {
  if (!lines.length) return null;
  const { position: src, index } = mergeIndexed([lineGeometry({ type: 'MultiLineString', coordinates: lines })]);
  const position = new Float32Array(index.length * 3);
  const lineDistance = new Float32Array(index.length);
  let total = 0;
  for (let k = 0; k < index.length; k += 2) {
    const a = index[k] * 3;
    const b = index[k + 1] * 3;
    position.set(src.subarray(a, a + 3), k * 3);
    position.set(src.subarray(b, b + 3), (k + 1) * 3);
    lineDistance[k] = total;
    total += Math.hypot(src[b] - src[a], src[b + 1] - src[a + 1], src[b + 2] - src[a + 2]);
    lineDistance[k + 1] = total;
  }
  return { position, lineDistance };
}

const unflatten = (flat) => {
  const pts = [];
  for (let k = 0; k < flat.length; k += 2) pts.push([flat[k], flat[k + 1]]);
  return pts;
};

// Riquadro land10 (vedi scripts/build-land-geojson.mjs): i lati che stanno
// sul bordo del riquadro sono tagli, non coste, e non vanno disegnati; il
// contorno si spezza lì.
export function tileArrays(tile, lat0, lng0, tileDeg) {
  const lat1 = lat0 + tileDeg;
  const lng1 = lng0 + tileDeg;
  const onSameEdge = (a, b) =>
    (a[0] === lng0 && b[0] === lng0) ||
    (a[0] === lng1 && b[0] === lng1) ||
    (a[1] === lat0 && b[1] === lat0) ||
    (a[1] === lat1 && b[1] === lat1);

  const polygons = tile.f.map((poly) => poly.map(unflatten));
  const coastLines = [];
  for (const poly of polygons) {
    for (const ring of poly) {
      let current = null;
      for (let k = 1; k < ring.length; k += 1) {
        if (onSameEdge(ring[k - 1], ring[k])) {
          current = null;
          continue;
        }
        if (!current) {
          current = [ring[k - 1]];
          coastLines.push(current);
        }
        current.push(ring[k]);
      }
    }
  }
  return {
    cap: polygons.length ? mergeIndexed(polygons.map(capGeometry)) : null,
    stroke: coastLines.length ? mergeIndexed([lineGeometry({ type: 'MultiLineString', coordinates: coastLines })]) : null,
    borders: dashedLinesArrays(tile.b.map(unflatten)),
  };
}

export function bordersArrays(flatLines) {
  return dashedLinesArrays(flatLines.map(unflatten));
}

// Concatena più risultati { position, index } (null ammessi) in uno solo.
export function concatIndexed(list) {
  const parts = list.filter(Boolean);
  let vertexCount = 0;
  let indexCount = 0;
  for (const p of parts) {
    vertexCount += p.position.length / 3;
    indexCount += p.index.length;
  }
  const position = new Float32Array(vertexCount * 3);
  const index = new Uint32Array(indexCount);
  let v = 0;
  let i = 0;
  for (const p of parts) {
    position.set(p.position, v * 3);
    for (let k = 0; k < p.index.length; k += 1) index[i + k] = p.index[k] + v;
    i += p.index.length;
    v += p.position.length / 3;
  }
  return { position, index };
}

// Concatena più risultati { position, lineDistance } (segmenti tratteggiati).
export function concatDashed(list) {
  const parts = list.filter(Boolean);
  let count = 0;
  for (const p of parts) count += p.lineDistance.length;
  const position = new Float32Array(count * 3);
  const lineDistance = new Float32Array(count);
  let n = 0;
  for (const p of parts) {
    position.set(p.position, n * 3);
    lineDistance.set(p.lineDistance, n);
    n += p.lineDistance.length;
  }
  return { position, lineDistance };
}

// Livello 50m di tutto il globo in un solo gruppo di array (costruito una
// volta nel worker, vedi landWorker.js): calotte e coste indicizzate, confini
// tratteggiati resi indicizzati (indici 0..n-1) per poterli spegnere a pezzi.
// ranges[key] = { cap, stroke, borders }, ciascuno [primo indice, quanti]:
// il thread principale spegne un riquadro coperto dal 10m riscrivendo solo
// quell'intervallo di indici verso il vertice "pozzo" (sink, l'ultimo), che
// sta al centro della Terra, nascosto dal globo — mai ricostruendo il buffer.
export function combineTiles(entries) {
  const caps = [];
  const strokes = [];
  const borders = [];
  const ranges = {};
  let capIdx = 0;
  let strokeIdx = 0;
  let borderIdx = 0;
  for (const [key, arrays] of entries) {
    const r = { cap: [capIdx, 0], stroke: [strokeIdx, 0], borders: [borderIdx, 0] };
    if (arrays.cap) {
      caps.push(arrays.cap);
      r.cap[1] = arrays.cap.index.length;
      capIdx += arrays.cap.index.length;
    }
    if (arrays.stroke) {
      strokes.push(arrays.stroke);
      r.stroke[1] = arrays.stroke.index.length;
      strokeIdx += arrays.stroke.index.length;
    }
    if (arrays.borders) {
      borders.push(arrays.borders);
      r.borders[1] = arrays.borders.lineDistance.length;
      borderIdx += arrays.borders.lineDistance.length;
    }
    ranges[key] = r;
  }
  const withSink = ({ position, index }) => {
    const pos = new Float32Array(position.length + 3);
    pos.set(position);
    return { position: pos, index, sink: position.length / 3 };
  };
  const dashed = concatDashed(borders);
  const n = dashed.lineDistance.length;
  const bPos = new Float32Array((n + 1) * 3);
  bPos.set(dashed.position);
  const bDist = new Float32Array(n + 1);
  bDist.set(dashed.lineDistance);
  const bIndex = new Uint32Array(n);
  for (let k = 0; k < n; k += 1) bIndex[k] = k;
  return {
    cap: withSink(concatIndexed(caps)),
    stroke: withSink(concatIndexed(strokes)),
    borders: { position: bPos, lineDistance: bDist, index: bIndex, sink: n },
    ranges,
  };
}
