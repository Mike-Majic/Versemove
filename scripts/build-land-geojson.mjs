// Rigenera i contorni dei continenti del globo dai dati di world-atlas
// (Natural Earth), in tre livelli di dettaglio (vedi globe/landLod.js):
// - public/geo/land-110m.geojson.json: globo intero (com'è sempre stato);
// - public/geo/land-50m.json: zoom medio, un solo file con terre e
//   confini di stato (da countries-50m);
// - public/geo/land10/{lat}_{lng}.json: zoom ravvicinato, 10m diviso in
//   riquadri da 10°×10° (lat/lng dell'angolo sud-ovest), caricati solo
//   quando il riquadro è in vista, con dentro anche i confini di stato
//   (da countries-10m); land10/index.json elenca quelli che esistono (i
//   riquadri di solo mare non ci sono).
// I confini sono solo le linee fra due paesi, niente coste.
//
// Anche il 50m è ritagliato sulla griglia da 10°, pur restando un file
// solo: ConicPolygonGeometry (le calotte) su un poligono enorme come
// l'Eurasia intera impiega decine di secondi, sui pezzi da 10° pochi ms.
//
// Formato di un riquadro (compatto; 4 decimali nel 10m, 3 nel 50m):
//   { "f": [ [anello, buco, ...], ... ],   poligoni di terra ritagliati
//     "b": [ linea, ... ] }                 confini di stato ritagliati
// ogni anello/linea è piatto: [lng, lat, lng, lat, ...]. I lati dei
// poligoni che stanno sul bordo del riquadro sono tagli, non coste: il
// client non li disegna (vedi globe/landGeometry.js tileArrays).
// land-50m.json: { "tiles": { "{lat}_{lng}": { "f": [...], "b": [...] } } }
// (stessa griglia del 10m: il client usa i riquadri 10m vicino al centro
// della vista e quelli 50m per il resto, vedi globe/landLod.js).
//
// Uso: node scripts/build-land-geojson.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { feature, mesh } from 'topojson-client';
import { geoArea } from 'd3-geo';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const atlas = (name) => JSON.parse(readFileSync(join(root, 'node_modules/world-atlas', name), 'utf8'));
const out = (rel) => join(root, 'public/geo', rel);
const kb = (file) => `${(statSync(file).size / 1024).toFixed(0)} KB`;

const TILE_DEG = 10;
const TILE_MAX_BYTES = 150 * 1024;
// Lati del riquadro lungo un parallelo: un punto ogni grado, così seguono
// il parallelo anche sulla sfera (un lato lungo 10° diventerebbe un arco
// di cerchio massimo e fra due riquadri resterebbe uno spiraglio).
const EDGE_STEP_DEG = 1;

const round = (v, decimals) => {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
};

function landPolygons(topology) {
  const fc = feature(topology, topology.objects.land);
  const polygons = [];
  let dropped = 0;
  for (const f of fc.features) {
    const list = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const poly of list) {
      // Alcuni anelli del 10m sono rovesciati (isolette delle Maldive): d3
      // li legge come "tutto il globo tranne l'isoletta" e colorerebbero
      // l'intera sfera.
      if (geoArea({ type: 'Polygon', coordinates: poly }) > 2 * Math.PI) {
        dropped += 1;
        continue;
      }
      polygons.push(poly);
    }
  }
  return { polygons, dropped };
}

// --- 110m (invariato) e 50m: GeoJSON semplice ----------------------------

function write110m() {
  const topology = atlas('land-110m.json');
  const geo = feature(topology, topology.objects.land);
  writeFileSync(out('land-110m.geojson.json'), JSON.stringify(geo));
  console.log(`land-110m.geojson.json: ${geo.features.length} feature, ${kb(out('land-110m.geojson.json'))}`);
}

// Confini di stato: solo le linee condivise da due paesi (a !== b), non le
// coste, che ci sono già.
function borderLines(name) {
  const countries = atlas(name);
  return mesh(countries, countries.objects.countries, (a, b) => a !== b).coordinates;
}

// --- Srotolamento all'antimeridiano ------------------------------------
// world-atlas taglia i poligoni a ±180°: un anello può saltare da 180 a
// -180 (Eurasia con la Čukotka, Figi) o girare attorno a un polo
// (Antartide). Per ritagliarlo sul piano lng/lat lo si rende continuo
// (lng anche fuori da ±180) e, se gira attorno al polo, lo si chiude
// passando dal polo.
function unwrap(points) {
  const res = [];
  let offset = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = points[i];
    if (i > 0) {
      const prev = points[i - 1][0];
      if (x - prev > 180) offset -= 360;
      else if (prev - x > 180) offset += 360;
    }
    res.push([x + offset, y]);
  }
  return res;
}

function unwrapRing(ring) {
  const r = unwrap(ring);
  const first = r[0];
  const last = r[r.length - 1];
  if (Math.abs(last[0] - first[0]) > 180) {
    const poleLat = r.reduce((s, p) => s + p[1], 0) / r.length < 0 ? -90 : 90;
    r.push([last[0], poleLat], [first[0], poleLat], [...first]);
  }
  return r;
}

// --- Ritaglio sul riquadro ---------------------------------------------

// Sutherland–Hodgman su un rettangolo lng/lat (anello chiuso in ingresso e
// in uscita).
function clipRing(ring, x0, y0, x1, y1) {
  const planes = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let pts = ring.slice(0, -1);
  for (const [inside, cut] of planes) {
    if (!pts.length) break;
    const next = [];
    for (let i = 0; i < pts.length; i += 1) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      const curIn = inside(cur);
      const prevIn = inside(prev);
      if (curIn) {
        if (!prevIn) next.push(cut(prev, cur));
        next.push(cur);
      } else if (prevIn) {
        next.push(cut(prev, cur));
      }
    }
    pts = next;
  }
  if (pts.length < 3) return null;
  pts.push([...pts[0]]);
  return pts;
}

// Liang–Barsky per una polilinea: i pezzi che stanno dentro al riquadro.
function clipLine(line, x0, y0, x1, y1) {
  const pieces = [];
  let current = null;
  for (let i = 1; i < line.length; i += 1) {
    const [ax, ay] = line[i - 1];
    const [bx, by] = line[i];
    const dx = bx - ax;
    const dy = by - ay;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) {
        if (q < 0) ok = false;
      } else {
        const r = q / p;
        if (p < 0) t0 = Math.max(t0, r);
        else t1 = Math.min(t1, r);
      }
    }
    if (!ok || t0 > t1) {
      current = null;
      continue;
    }
    if (!current || t0 > 0) {
      current = [[ax + t0 * dx, ay + t0 * dy]];
      pieces.push(current);
    }
    current.push([ax + t1 * dx, ay + t1 * dy]);
    if (t1 < 1) current = null;
  }
  return pieces;
}

// Aggiunge punti lungo i lati del riquadro che seguono un parallelo.
function densifyTileEdges(ring, y0, y1) {
  const res = [];
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    if (i > 0) {
      const a = ring[i - 1];
      if (a[1] === p[1] && (p[1] === y0 || p[1] === y1)) {
        const steps = Math.floor(Math.abs(p[0] - a[0]) / EDGE_STEP_DEG);
        for (let s = 1; s < steps; s += 1) res.push([a[0] + ((p[0] - a[0]) * s) / steps, p[1]]);
      }
    }
    res.push(p);
  }
  return res;
}

function bbox(points) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

// Riquadri toccati da un bbox srotolato: angolo sud-ovest riportato in
// -180..180, più lo spostamento (multiplo di 360) che serve per ritagliare
// nelle coordinate srotolate.
function* tilesFor([bx0, by0, bx1, by1]) {
  for (let lat = Math.floor(by0 / TILE_DEG) * TILE_DEG; lat < by1 && lat < 90; lat += TILE_DEG) {
    for (let lng = Math.floor(bx0 / TILE_DEG) * TILE_DEG; lng < bx1; lng += TILE_DEG) {
      const offset = Math.floor((lng + 180) / 360) * 360;
      yield { lat, lng: lng - offset, offset };
    }
  }
}

// [[x, y], ...] -> [x, y, x, y, ...] arrotondato, senza punti doppi.
function flat(points, decimals) {
  const res = [];
  let px = null;
  let py = null;
  for (const [x, y] of points) {
    const rx = round(x, decimals);
    const ry = round(y, decimals);
    if (rx === px && ry === py) continue;
    res.push(rx, ry);
    px = rx;
    py = ry;
  }
  return res;
}

// Ritaglia i poligoni di terra (e, se ci sono, le linee di confine) sulla
// griglia da TILE_DEG gradi.
function clipToTiles(polygons, borders, decimals) {
  const tiles = new Map();
  const tile = (lat, lng) => {
    const key = `${lat}_${lng}`;
    if (!tiles.has(key)) tiles.set(key, { f: [], b: [] });
    return tiles.get(key);
  };

  for (const poly of polygons) {
    const rings = poly.map(unwrapRing);
    for (const t of tilesFor(bbox(rings[0]))) {
      const x0 = t.lng + t.offset;
      const y0 = t.lat;
      const x1 = x0 + TILE_DEG;
      const y1 = y0 + TILE_DEG;
      const toTile = (r) => flat(densifyTileEdges(r, y0, y1).map(([x, y]) => [x - t.offset, y]), decimals);
      const outerClip = clipRing(rings[0], x0, y0, x1, y1);
      if (!outerClip) continue;
      const outer = toTile(outerClip);
      // Almeno 3 punti distinti più la chiusura.
      if (outer.length < 8) continue;
      const holes = rings
        .slice(1)
        .map((r) => clipRing(r, x0, y0, x1, y1))
        .filter(Boolean)
        .map(toTile)
        .filter((r) => r.length >= 8);
      tile(t.lat, t.lng).f.push([outer, ...holes]);
    }
  }

  for (const line of borders) {
    const u = unwrap(line);
    for (const t of tilesFor(bbox(u))) {
      const x0 = t.lng + t.offset;
      const y0 = t.lat;
      for (const piece of clipLine(u, x0, y0, x0 + TILE_DEG, y0 + TILE_DEG)) {
        const f = flat(piece.map(([x, y]) => [x - t.offset, y]), decimals);
        if (f.length >= 4) tile(t.lat, t.lng).b.push(f);
      }
    }
  }
  return tiles;
}

function write50m() {
  const { polygons, dropped } = landPolygons(atlas('land-50m.json'));
  const tiles = {};
  let count = 0;
  for (const [key, data] of clipToTiles(polygons, borderLines('countries-50m.json'), 3)) {
    if (!data.f.length && !data.b.length) continue;
    tiles[key] = data;
    count += 1;
  }
  writeFileSync(out('land-50m.json'), JSON.stringify({ tiles }));
  console.log(`land-50m.json: ${count} riquadri (${dropped} poligoni rovesciati scartati), ${kb(out('land-50m.json'))}`);
}

function write10m() {
  const { polygons, dropped } = landPolygons(atlas('land-10m.json'));
  const tiles = clipToTiles(polygons, borderLines('countries-10m.json'), 4);

  rmSync(out('land10'), { recursive: true, force: true });
  mkdirSync(out('land10'), { recursive: true });
  let total = 0;
  let biggest = { key: '', size: 0 };
  const index = [];
  for (const [key, data] of tiles) {
    if (!data.f.length && !data.b.length) continue;
    const json = JSON.stringify(data);
    writeFileSync(out(`land10/${key}.json`), json);
    total += json.length;
    if (json.length > biggest.size) biggest = { key, size: json.length };
    index.push(key);
  }
  index.sort();
  writeFileSync(out('land10/index.json'), JSON.stringify(index));
  console.log(
    `land10/: ${index.length} riquadri (${dropped} poligoni rovesciati scartati), totale ${(total / 1024).toFixed(0)} KB, ` +
      `il più grande ${biggest.key} ${(biggest.size / 1024).toFixed(0)} KB`
  );
  if (biggest.size > TILE_MAX_BYTES) {
    console.error(`ERRORE: il riquadro ${biggest.key} supera ${TILE_MAX_BYTES / 1024} KB`);
    process.exitCode = 1;
  }
}

mkdirSync(out(''), { recursive: true });
write110m();
write50m();
write10m();
