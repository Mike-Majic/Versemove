// Nomi di città, regioni, stati e mari per il globo (vedi
// globe/placeLabels.js), da Natural Earth (dominio pubblico). Scarica i
// GeoJSON da GitHub (nvkelso/natural-earth-vector) in una cache locale e
// scrive file compatti in public/geo/labels/:
// - states.json:   stati, punto dell'etichetta di ne_50m_admin_0_countries;
// - cities-1.json: capitali e città con scalerank <= 4 (zoom lontano/medio);
// - cities-2.json: le altre città fino a scalerank 9 (zoom ravvicinato);
// - regions.json:  regioni, dal punto dell'etichetta di
//                  ne_10m_admin_1_states_provinces;
// - seas.json:     mari, punto interno a ne_10m_geography_marine_polys.
// Ogni file è un array di righe [nome, lat, lng, rango, ...]: nomi in
// italiano quando Natural Earth li ha (name_it), altrimenti il nome.
//
// Uso: node scripts/build-place-labels.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { geoArea, geoContains, geoBounds } from 'd3-geo';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheDir = join(root, 'node_modules/.cache/natural-earth');
const outDir = join(root, 'public/geo/labels');
const SOURCE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';

async function load(name) {
  const file = join(cacheDir, `${name}.geojson`);
  if (!existsSync(file)) {
    mkdirSync(cacheDir, { recursive: true });
    console.log(`Scarico ${name}...`);
    const res = await fetch(`${SOURCE}/${name}.geojson`);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return JSON.parse(readFileSync(file, 'utf8')).features;
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const write = (name, rows) => {
  const file = join(outDir, name);
  writeFileSync(file, JSON.stringify(rows));
  console.log(`${name}: ${rows.length} righe, ${(statSync(file).size / 1024).toFixed(0)} KB`);
};

// --- Stati -------------------------------------------------------------
// Fuori i micro-stati (Vaticano, Monaco, San Marino...): il loro nome
// finirebbe sopra quello della città che li circonda o gli sta accanto.
const MIN_STATE_KM2 = 1000;
const EARTH_RADIUS_KM = 6371;

function states(features) {
  return features
    .filter(({ geometry }) => geometry && geoArea(geometry) * EARTH_RADIUS_KM ** 2 >= MIN_STATE_KM2)
    .map(({ properties: p }) => [p.NAME_IT || p.NAME, r3(p.LABEL_Y), r3(p.LABEL_X), p.LABELRANK])
    .filter((row) => row[0] && Number.isFinite(row[1]))
    .sort((a, b) => a[3] - b[3]);
}

// --- Città -------------------------------------------------------------
// Riga: [nome, lat, lng, scalerank, abitanti, capitale (1/0)].
function cities(features) {
  const rows = features
    .map(({ properties: p }) => [
      p.NAME_IT || p.NAME,
      r3(p.LATITUDE),
      r3(p.LONGITUDE),
      p.SCALERANK,
      p.POP_MAX || 0,
      /Admin-0 capital/.test(p.FEATURECLA) ? 1 : 0,
    ])
    .filter((row) => row[0] && row[3] <= 9)
    .sort((a, b) => a[3] - b[3] || b[4] - a[4]);
  return {
    big: rows.filter((row) => row[5] === 1 || row[3] <= 4),
    small: rows.filter((row) => row[5] === 0 && row[3] > 4),
  };
}

// --- Regioni -----------------------------------------------------------
// Dove admin_1 è un livello sotto la regione (province in Italia e Spagna,
// dipartimenti in Francia...), le voci si raggruppano per il campo region:
// almeno REGION_MIN_GROUPS regioni con in media REGION_MIN_PER_GROUP voci
// l'una. Altrimenti (stati USA, Länder, cantoni...) si usano così come
// sono; così non si prendono per regioni le macro-aree di USA, Russia o
// Cina ("South", "Siberian", ...).
const REGION_MIN_GROUPS = 8;
const REGION_MIN_PER_GROUP = 2.5;
// Nomi italiani per le regioni che Natural Earth riporta in inglese.
const REGION_IT = { Apulia: 'Puglia', Sicily: 'Sicilia' };

function regions(features) {
  const byCountry = new Map();
  for (const { properties: p } of features) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue;
    if (!byCountry.has(p.admin)) byCountry.set(p.admin, []);
    byCountry.get(p.admin).push(p);
  }
  const rows = [];
  for (const list of byCountry.values()) {
    const groups = new Map();
    for (const p of list) {
      if (!p.region) continue;
      if (!groups.has(p.region)) groups.set(p.region, []);
      groups.get(p.region).push(p);
    }
    const aggregate = groups.size >= REGION_MIN_GROUPS && list.length / groups.size >= REGION_MIN_PER_GROUP;
    if (aggregate) {
      for (const [region, members] of groups) {
        const lat = members.reduce((s, p) => s + p.latitude, 0) / members.length;
        const lng = members.reduce((s, p) => s + p.longitude, 0) / members.length;
        const rank = Math.min(...members.map((p) => p.labelrank ?? 9));
        rows.push([REGION_IT[region] ?? region, r3(lat), r3(lng), rank]);
      }
    } else {
      for (const p of list) rows.push([p.name_it || p.name, r3(p.latitude), r3(p.longitude), p.labelrank ?? 9]);
    }
  }
  return rows.filter((row) => row[0]).sort((a, b) => a[3] - b[3]);
}

// --- Mari --------------------------------------------------------------
// Natural Earth non dà un punto per l'etichetta dei mari: si cerca su una
// griglia il punto interno più lontano dai vertici del contorno (una
// versione grezza del "polo di inaccessibilità"), così il nome cade in
// mezzo al mare e non su una costa.
function interiorPoint(geometry) {
  const [[x0, y0], [x1, y1]] = geoBounds(geometry);
  const width = x1 >= x0 ? x1 - x0 : x1 + 360 - x0;
  const step = Math.max(0.1, Math.min(width, y1 - y0) / 40);
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  const vertices = rings.flat();
  let best = null;
  let bestDist = -1;
  for (let y = y0 + step / 2; y < y1; y += step) {
    for (let dx = step / 2; dx < width; dx += step) {
      const x = ((x0 + dx + 540) % 360) - 180;
      if (!geoContains(geometry, [x, y])) continue;
      let min = Infinity;
      const cos = Math.cos((y * Math.PI) / 180);
      for (let k = 0; k < vertices.length; k += 4) {
        const [vx, vy] = vertices[k];
        let ddx = Math.abs(vx - x);
        if (ddx > 180) ddx = 360 - ddx;
        const d = (ddx * cos) ** 2 + (vy - y) ** 2;
        if (d < min) min = d;
      }
      if (min > bestDist) {
        bestDist = min;
        best = [x, y];
      }
    }
  }
  return best;
}

function seas(features) {
  const rows = [];
  for (const { properties: p, geometry } of features) {
    if (!geometry || p.scalerank > 6) continue;
    const point = interiorPoint(geometry);
    if (!point) continue;
    rows.push([capitalize(p.name_it || p.name), r3(point[1]), r3(point[0]), p.scalerank]);
  }
  return rows.sort((a, b) => a[3] - b[3]);
}

mkdirSync(outDir, { recursive: true });
write('states.json', states(await load('ne_50m_admin_0_countries')));
const { big, small } = cities(await load('ne_10m_populated_places'));
write('cities-1.json', big);
write('cities-2.json', small);
write('regions.json', regions(await load('ne_10m_admin_1_states_provinces')));
write('seas.json', seas(await load('ne_10m_geography_marine_polys')));
