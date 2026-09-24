// Nomi di città, regioni, stati e mari sul globo grande (dati:
// scripts/build-place-labels.mjs, file in public/geo/labels/).
//
// Chi compare a quale zoom (altitudine della camera):
// - sopra ALT_NONE niente (vista d'insieme con i satelliti);
// - lontano (fino a ALT_FAR): stati e capitali;
// - medio (fino a ALT_CLOSE): città con scalerank <= 4, regioni, mari;
// - vicino: anche le città più piccole (fino a scalerank 9) e la regione
//   in grande, in trasparenza e con lettere spaziate.
// I file si scaricano solo quando la fascia li chiede.
//
// Collisioni: le etichette si piazzano in ordine di importanza (stato ->
// città grande -> regione -> città piccola -> mare); una che toccherebbe
// una già piazzata non si mostra (la regione in grande prova prima qualche
// posizione vicina). Sul retro del globo o fuori schermo: nascoste.
//
// Marker (avatar, grumi, eventi, vedi WorldGlobe): mai sopra una scritta.
// - Città con etichetta mostrata, a zoom lontano/medio (o con più di
//   PILL_MIN_USERS_CLOSE utenti anche da vicino): i marker attorno diventano
//   un'unica pillola "👥 N" sotto il nome; un clic zooma lì.
// - Da vicino, centri piccoli: al massimo pochi avatar a spirale intorno al
//   punto (di più zoomando), saltando le posizioni che toccano una scritta o
//   un altro marker, più un chip "+N" per gli altri.
// - Qualunque altro marker che finirebbe su una scritta si sposta fuori
//   lungo una spirale (CSS translate, che si somma al transform con cui
//   react-globe.gl lo posiziona); se non c'è posto, si nasconde.
// - Il proprio avatar (posizione dal vivo) si vede sempre: mai nella
//   pillola, al massimo spostato accanto al nome.
//
// Tecnica: un livello HTML sopra il canvas con un pool di elementi
// riusati (niente creazione/distruzione a ogni fotogramma). Chi si vede e
// dove (collisioni) si ricalcola al massimo RELAYOUT_MS volte al secondo e
// solo se la camera si è mossa; nei fotogrammi in mezzo le etichette già
// scelte seguono la camera con un solo transform ciascuna.
import * as THREE from 'three';

const ALT_NONE = 3;
const ALT_FAR = 1.6;
const ALT_CLOSE = 0.6;
const RELAYOUT_MS = 100;
const MAX_LABELS = 100;
// Raggio a cui stanno le etichette: appena sopra i continenti (0.006).
const LABEL_RADIUS = 100 * 1.007;
// Un punto è sul lato visibile se l'angolo fra lui e la camera (visti dal
// centro) è sotto quello dell'orizzonte, acos(raggio / distanza della
// camera); si tiene solo questa frazione dell'orizzonte per scartare anche
// quelli troppo di taglio, vicino al bordo del globo. Proporzionale, così
// funziona anche da vicinissimo, dove l'orizzonte è a pochi gradi.
const HORIZON_FRACTION = 0.92;
// Margini liberi per i controlli dell'interfaccia sopra al globo: barra in
// alto, pulsante dei mondi in basso a sinistra, colonna dei mondi in basso
// a destra. Un'etichetta non ci finisce mai sotto.
const MARGIN = { top: 60, bottom: 56, left: 6, right: 70 };

// Marker di react-globe.gl: stanno ad altitudine 0.03 (vedi htmlAltitude in
// WorldGlobe).
const MARKER_RADIUS = 100 * 1.03;
// Un marker entro questa distanza (px) dal punto di una città con etichetta
// finisce nella sua pillola.
const PILL_RADIUS_PX = 40;
// Da vicino la pillola resta solo per le città con almeno tanti utenti.
const PILL_MIN_USERS_CLOSE = 5000;
// Marker entro questa distanza (px) l'uno dall'altro sono lo stesso centro.
const GROUP_RADIUS_PX = 10;
// Posizioni a spirale (angolo aureo) per spostare un marker: la prima è il
// punto stesso.
const SPIRAL = Array.from({ length: 36 }, (_, i) => {
  if (i === 0) return [0, 0];
  const r = 30 * Math.sqrt(i);
  const a = i * 2.39996;
  return [Math.round(r * Math.cos(a)), Math.round(r * Math.sin(a))];
});

// Quanti avatar al massimo per centro piccolo, secondo l'altitudine:
// zoomando si aprono sempre di più.
function avatarsPerCenter(alt) {
  if (alt > 0.05) return 3;
  if (alt > 0.025) return 6;
  if (alt > 0.012) return 12;
  return Infinity;
}
// Spazio minimo fra un marker e una scritta o un altro marker.
const MARKER_GAP = 2;

// "2,1 mln", "370k", "1,5k", "12".
export function formatCount(n) {
  const fmt = (v) => (v >= 10 ? Math.round(v).toString() : v.toFixed(1).replace('.', ',').replace(/,0$/, ''));
  if (n >= 1e6) return `${fmt(n / 1e6)} mln`;
  if (n >= 1e3) return `${fmt(n / 1e3)}k`;
  return String(n);
}

const FONT_SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const FONT_SERIF = "Georgia, 'Times New Roman', serif";

// Stili per tipo: font (per misurare il testo), spaziatura delle lettere
// in em, maiuscolo.
const STYLES = {
  state: { font: `600 11px ${FONT_SANS}`, size: 11, spacing: 0.3, upper: true },
  cityXL: { font: `700 16px ${FONT_SANS}`, size: 16, spacing: 0, upper: false },
  cityL: { font: `700 13px ${FONT_SANS}`, size: 13, spacing: 0, upper: false },
  cityS: { font: `700 11px ${FONT_SANS}`, size: 11, spacing: 0, upper: false },
  region: { font: `600 10px ${FONT_SANS}`, size: 10, spacing: 0.25, upper: true },
  regionBig: { font: `700 24px ${FONT_SANS}`, size: 24, spacing: 0.45, upper: true },
  sea: { font: `italic 12px ${FONT_SERIF}`, size: 12, spacing: 0.04, upper: false },
  pill: { font: `700 11px ${FONT_SANS}`, size: 11, spacing: 0, upper: false },
};

function unitVector(lat, lng) {
  // Stessa convenzione di three-globe (polar2Cartesian).
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  const s = Math.sin(phi);
  return new THREE.Vector3(s * Math.cos(theta), Math.cos(phi), s * Math.sin(theta));
}

// Luminanza relativa (0..1) di un colore sRGB.
function luminance(hex) {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

export function createPlaceLabels({ canvas, getRoot, getMarkers, onZoomTo }) {
  const layer = document.createElement('div');
  layer.className = 'rb-place-labels';
  // Subito sopra il canvas e sotto i marker HTML di react-globe.gl, che
  // stanno nel livello successivo.
  canvas.insertAdjacentElement('afterend', layer);

  const measureCtx = document.createElement('canvas').getContext('2d');
  const widthCache = new Map();
  const measure = (text, styleKey) => {
    const key = `${styleKey}|${text}`;
    let w = widthCache.get(key);
    if (w === undefined) {
      const st = STYLES[styleKey];
      measureCtx.font = st.font;
      w = measureCtx.measureText(text).width + text.length * st.spacing * st.size;
      widthCache.set(key, w);
    }
    return w;
  };

  // Dati caricati: nome file -> array di voci { text, vec, rank, ... }.
  const data = {};
  const loading = new Set();
  const base = import.meta.env.BASE_URL;
  const ensure = (name) => {
    if (data[name] || loading.has(name)) return;
    loading.add(name);
    fetch(`${base}geo/labels/${name}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`richiesta fallita (${res.status})`);
        return res.json();
      })
      .then((rows) => {
        data[name] = rows.map((row) => ({
          name: row[0],
          lat: row[1],
          lng: row[2],
          rank: row[3],
          pop: row[4] ?? 0,
          capital: row[5] === 1,
          vec: unitVector(row[1], row[2]),
        }));
        dataVersion += 1;
        needsLayout = true;
      })
      .catch((err) => console.error(`Impossibile caricare le etichette ${name}`, err))
      .finally(() => loading.delete(name));
  };

  // Pool di elementi. Ognuno ha anche la pillola (nascosta se non serve);
  // pillola e chip "+N" sono gli unici pezzi cliccabili del livello.
  const pool = [];
  const getEl = (i) => {
    if (!pool[i]) {
      const el = document.createElement('div');
      const text = document.createElement('span');
      text.className = 'rb-pl-text';
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'rb-pl-pill';
      pill.style.display = 'none';
      el.append(text, pill);
      layer.appendChild(el);
      const slot = { el, text, pill, className: '', label: '', pillLabel: '', current: null };
      const zoom = (e) => {
        e.stopPropagation();
        const pl = slot.current;
        if (pl && (pl.pillText || pl.kind === 'chip')) onZoomTo?.(pl.item.lat, pl.item.lng, pl.kind === 'chip' && pl.item.closer);
      };
      pill.addEventListener('click', zoom);
      el.addEventListener('click', (e) => {
        if (slot.current?.kind === 'chip') zoom(e);
      });
      pool[i] = slot;
    }
    return pool[i];
  };

  let placed = []; // { item, kind, styleKey, dx, dy, w, h, el }
  let lastLayoutAt = 0;
  let needsLayout = true;
  let layoutStale = false;
  let lastCamKey = '';
  const tmp = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const rootMatrix = new THREE.Matrix4();

  const project = (vec, camera, width, height, radius = LABEL_RADIUS) => {
    tmp.copy(vec).multiplyScalar(radius).applyMatrix4(rootMatrix).project(camera);
    return { x: ((tmp.x + 1) / 2) * width, y: ((1 - tmp.y) / 2) * height, z: tmp.z };
  };

  // Candidati della fascia di zoom attuale, già in ordine di priorità
  // (ricostruiti solo quando cambia la fascia o arrivano dati nuovi).
  let dataVersion = 0;
  let candidatesCache = { key: '', list: [] };
  const candidates = (alt) => {
    const tier = alt > ALT_FAR ? 'far' : alt > ALT_CLOSE ? 'medium' : 'close';
    const key = `${tier}|${dataVersion}`;
    if (candidatesCache.key !== key) candidatesCache = { key, list: buildCandidates(alt) };
    return candidatesCache.list;
  };
  const buildCandidates = (alt) => {
    const list = [];
    const add = (name, filter, kindOf) => {
      ensure(name);
      for (const item of data[name] ?? []) {
        if (!filter || filter(item)) list.push([item, kindOf(item)]);
      }
    };
    // Prima fascia (testo grande e anello): le città più importanti e le
    // capitali grandi; le capitali dei micro-stati (Monaco, Andorra...) no.
    const cityKind = (item) => ({
      kind: 'city',
      styleKey: item.rank <= 2 || (item.capital && item.pop >= 1e6) ? 'cityXL' : item.rank <= 4 || item.capital ? 'cityL' : 'cityS',
    });
    if (alt > ALT_FAR) {
      add('states', (s) => s.rank <= 4, () => ({ kind: 'state', styleKey: 'state' }));
      add('cities-1', (c) => c.capital, cityKind);
      return list;
    }
    add('states', null, () => ({ kind: 'state', styleKey: 'state' }));
    add('cities-1', null, cityKind);
    if (alt > ALT_CLOSE) {
      add('regions', (r) => r.rank <= 4, () => ({ kind: 'region', styleKey: 'region' }));
      add('seas', (s) => s.rank <= 4, () => ({ kind: 'sea', styleKey: 'sea' }));
      return list;
    }
    add('regions', (r) => r.rank <= 6, () => ({ kind: 'region', styleKey: 'region' }));
    add('cities-2', null, cityKind);
    add('seas', (s) => s.rank <= 6, () => ({ kind: 'sea', styleKey: 'sea' }));
    return list;
  };

  // Rettangolo occupato rispetto al punto. Le città hanno il pallino sul
  // punto e il nome a destra; se lì è occupato si prova a sinistra, sopra e
  // sotto (pos). Il resto è centrato.
  const CITY_POSITIONS = ['r', 'l', 't', 'b'];
  // Con la pillola sotto il nome restano solo destra e sinistra.
  const PILL_POSITIONS = ['r', 'l'];
  const PILL_HEIGHT = 20;
  const boxOf = (text, kind, styleKey, pos = 'r', pillText = null) => {
    const st = STYLES[styleKey];
    const w = measure(text, styleKey);
    const h = st.size * 1.25;
    if (kind !== 'city') return { left: -w / 2, top: -h / 2, right: w / 2, bottom: h / 2 };
    const box =
      pos === 'l'
        ? { left: -9 - w, top: -2 - h / 2, right: 5, bottom: Math.max(5, -2 + h / 2) }
        : pos === 't'
        ? { left: -Math.max(5, w / 2), top: -6 - h, right: Math.max(5, w / 2), bottom: 5 }
        : pos === 'b'
        ? { left: -Math.max(5, w / 2), top: -5, right: Math.max(5, w / 2), bottom: 6 + h }
        : { left: -5, top: -2 - h / 2, right: 9 + w, bottom: Math.max(5, -2 + h / 2) };
    if (pillText) {
      const pw = measure(pillText, 'pill') + 18;
      box.bottom += PILL_HEIGHT;
      if (pos === 'l') box.left = Math.min(box.left, -8 - pw);
      else box.right = Math.max(box.right, 8 + pw);
    }
    return box;
  };

  const overlaps = (a, list) => list.some((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);

  // Offerte alternative per la regione in grande (se il suo punto è già
  // occupato, per esempio dal nome del capoluogo).
  const REGION_OFFSETS = [[0, 0], [0, -34], [0, 34], [60, -24], [-60, -24], [60, 24], [-60, 24], [0, -64]];

  const isFacing = (item, cosLimit) => tmp.copy(item.vec).transformDirection(rootMatrix).dot(camDir) >= cosLimit;

  // A zoom ravvicinato una sola regione va in grande: quella più vicina al
  // centro dello schermo (le altre restano col nome piccolo).
  const pickBigRegion = (camera, width, height, cosLimit) => {
    let best = null;
    let bestDist = Math.min(width, height) * 0.35;
    for (const item of data.regions ?? []) {
      if (item.rank > 6 || !isFacing(item, cosLimit)) continue;
      const p = project(item.vec, camera, width, height);
      const d = Math.hypot(p.x - width / 2, p.y - height / 2);
      if (d < bestDist) {
        bestDist = d;
        best = item;
      }
    }
    return best;
  };

  // Piazzamento delle etichette (una passata). pills: città -> testo della
  // pillola da tenere sotto il nome (spazio riservato nel rettangolo).
  const labelsPass = (camera, width, height, alt, cosLimit, bigRegion, pills) => {
    const boxes = [];
    const next = [];
    for (const [item, kinds] of candidates(alt)) {
      if (next.length >= MAX_LABELS) break;
      const { kind } = kinds;
      const styleKey = item === bigRegion ? 'regionBig' : kinds.styleKey;
      // Retro del globo o troppo di taglio.
      if (!isFacing(item, cosLimit)) continue;
      const p = project(item.vec, camera, width, height);
      if (p.z > 1) continue;
      const text = STYLES[styleKey].upper ? item.name.toUpperCase() : item.name;
      const pillText = pills?.get(item) ?? null;
      // Tentativi: spostamenti del testo per le città, del blocco intero per
      // la regione in grande, nessuno per il resto.
      const tries =
        kind === 'city'
          ? (pillText ? PILL_POSITIONS : CITY_POSITIONS).map((pos) => ({ pos, ox: 0, oy: 0 }))
          : (styleKey === 'regionBig' ? REGION_OFFSETS : [[0, 0]]).map(([ox, oy]) => ({ pos: 'c', ox, oy }));
      for (const { pos, ox, oy } of tries) {
        const box = boxOf(text, kind, styleKey, pos, pillText);
        const abs = { left: p.x + ox + box.left, top: p.y + oy + box.top, right: p.x + ox + box.right, bottom: p.y + oy + box.bottom };
        if (abs.left < MARGIN.left || abs.top < MARGIN.top || abs.right > width - MARGIN.right || abs.bottom > height - MARGIN.bottom) continue;
        if (overlaps(abs, boxes)) continue;
        boxes.push(abs);
        next.push({ item, kind, styleKey, text, ox, oy, box, pos, px: p.x + ox, py: p.y + oy, pillText });
        break;
      }
    }
    return { next, boxes };
  };

  // --- Marker ------------------------------------------------------------
  const markerVecs = new WeakMap();
  const markerVec = (item) => {
    let v = markerVecs.get(item);
    if (!v) {
      v = unitVector(item.lat, item.lng);
      markerVecs.set(item, v);
    }
    return v;
  };
  const setMarker = (m, state, dx = 0, dy = 0) => {
    const translate = state === 'shown' && (dx || dy) ? `${dx}px ${dy}px` : '';
    if (m.el.style.translate !== translate) m.el.style.translate = translate;
    m.el.classList.toggle('rb-marker--merged', state === 'hidden');
  };
  const resetMarkers = () => {
    for (const m of getMarkers?.() ?? []) setMarker(m, 'shown');
  };

  // Misura vera dell'elemento (bordo compreso), letta una volta sola.
  const markerSizes = new WeakMap();
  const markerSize = (el, kind) => {
    let size = markerSizes.get(el);
    if (!size) {
      const measured = Math.max(el.offsetWidth, el.offsetHeight);
      if (!measured) return kind === 'cluster' ? 48 : 44;
      size = measured;
      markerSizes.set(el, size);
    }
    return size;
  };

  const collectMarkers = (camera, width, height) => {
    const camDist = camera.position.length();
    return (getMarkers?.() ?? []).map(({ item, el }) => {
      const vec = markerVec(item);
      const facing = tmp.copy(vec).transformDirection(rootMatrix).dot(camDir) >= MARKER_RADIUS / camDist;
      const p = project(vec, camera, width, height, MARKER_RADIUS);
      return {
        item,
        el,
        vec,
        x: p.x,
        y: p.y,
        facing,
        priority: Boolean(item.isLive || item.id === 'me-live'),
        count: item.kind === 'cluster' ? item.count : item.kind === 'user' ? 1 : 0,
        size: markerSize(el, item.kind) + MARKER_GAP * 2,
      };
    });
  };

  // Città con etichetta -> marker che finiscono nella sua pillola.
  const assignPills = (next, markers, alt) => {
    const cities = next.filter((pl) => pl.kind === 'city');
    const groups = new Map();
    for (const m of markers) {
      if (!m.facing || m.priority || !m.count) continue;
      let best = null;
      let bestD = PILL_RADIUS_PX;
      for (const pl of cities) {
        const d = Math.hypot(pl.px - m.x, pl.py - m.y);
        if (d < bestD) {
          bestD = d;
          best = pl.item;
        }
      }
      if (!best) continue;
      if (!groups.has(best)) groups.set(best, { count: 0, markers: [] });
      const g = groups.get(best);
      g.count += m.count;
      g.markers.push(m);
    }
    for (const [city, g] of groups) {
      if (alt <= ALT_CLOSE && g.count < PILL_MIN_USERS_CLOSE) groups.delete(city);
    }
    return groups;
  };

  // Sposta fuori dalle scritte (e dagli altri marker) chi non è finito in
  // una pillola; da vicino limita gli avatar per centro e aggiunge "+N".
  const placeMarkers = (markers, merged, obstacles, width, height, alt) => {
    const chips = [];
    const taken = [];
    const cap = alt <= ALT_CLOSE ? avatarsPerCenter(alt) : Infinity;
    // Centri: utenti allo stesso punto (entro GROUP_RADIUS_PX).
    const centers = [];
    for (const m of markers) {
      if (m.item.kind !== 'user' || !m.facing || merged.has(m)) continue;
      let c = centers.find((cc) => Math.hypot(cc.x - m.x, cc.y - m.y) < GROUP_RADIUS_PX);
      if (!c) {
        c = { x: m.x, y: m.y, vec: m.vec, lat: m.item.lat, lng: m.item.lng, members: [], shown: 0, hidden: 0 };
        centers.push(c);
      }
      c.members.push(m);
      m.center = c;
    }
    const crowded = [];
    const order = (m) => (m.priority ? 0 : m.item.kind === 'event' ? 1 : m.item.kind === 'cluster' ? 2 : 3);
    const sorted = [...markers].sort((a, b) => order(a) - order(b) || b.count - a.count);
    for (const m of sorted) {
      if (!m.facing) {
        setMarker(m, 'shown');
        continue;
      }
      if (merged.has(m)) {
        setMarker(m, 'hidden');
        continue;
      }
      const c = m.center;
      if (c && c.shown >= cap && !m.priority) {
        c.hidden += 1;
        setMarker(m, 'hidden');
        continue;
      }
      // In un centro con più persone nessuno sta sul punto della città:
      // tutti a spirale intorno.
      const start = c && c.members.length > 1 ? 1 : 0;
      let spot = null;
      for (let i = start; i < SPIRAL.length && !spot; i += 1) {
        const [dx, dy] = SPIRAL[i];
        const half = m.size / 2;
        const box = { left: m.x + dx - half, top: m.y + dy - half, right: m.x + dx + half, bottom: m.y + dy + half };
        if (box.left < 0 || box.top < MARGIN.top || box.right > width || box.bottom > height) continue;
        if (overlaps(box, obstacles) || overlaps(box, taken)) continue;
        spot = { dx, dy, box };
      }
      if (!spot && m.priority) {
        // Il proprio avatar si vede comunque: accanto, anche se stretto.
        const [dx, dy] = SPIRAL[1];
        spot = { dx, dy, box: { left: m.x + dx - 20, top: m.y + dy - 20, right: m.x + dx + 20, bottom: m.y + dy + 20 } };
      }
      if (!spot) {
        if (c) c.hidden += 1;
        // Un grumo senza posto diventa un chip compatto "👥 N" lì vicino.
        else if (m.item.kind === 'cluster') crowded.push(m);
        setMarker(m, 'hidden');
        continue;
      }
      taken.push(spot.box);
      setMarker(m, 'shown', spot.dx, spot.dy);
      if (c) c.shown += 1;
    }
    // Chip "+N" per i centri con persone nascoste (un clic avvicina ancora,
    // così si aprono) e "👥 N" per i grumi senza posto (un clic zooma come
    // sul grumo).
    const chipSources = [
      ...centers.filter((c) => c.hidden).map((c) => ({ x: c.x, y: c.y, lat: c.lat, lng: c.lng, vec: c.vec, text: `+${c.hidden}`, closer: true })),
      ...crowded.map((m) => ({ x: m.x, y: m.y, lat: m.item.lat, lng: m.item.lng, vec: m.vec, text: `👥 ${formatCount(m.count)}`, closer: false })),
    ];
    for (const c of chipSources) {
      const { text } = c;
      const w = measure(text, 'pill') + 18;
      for (let i = 0; i < SPIRAL.length; i += 1) {
        const [dx, dy] = SPIRAL[i];
        const box = { left: c.x + dx - w / 2, top: c.y + dy - 10, right: c.x + dx + w / 2, bottom: c.y + dy + 10 };
        if (box.left < 0 || box.top < MARGIN.top || box.right > width || box.bottom > height) continue;
        if (overlaps(box, obstacles) || overlaps(box, taken)) continue;
        taken.push(box);
        chips.push({
          item: { name: text, lat: c.lat, lng: c.lng, vec: c.vec, closer: c.closer },
          kind: 'chip',
          styleKey: 'pill',
          text,
          ox: dx,
          oy: dy,
          pos: 'c',
          radius: MARKER_RADIUS,
          box: { left: -w / 2, top: -10, right: w / 2, bottom: 10 },
        });
        break;
      }
    }
    return chips;
  };

  const layout = (camera, width, height, alt) => {
    camDir.copy(camera.position).normalize();
    const cosLimit = Math.cos(Math.acos(Math.min(1, LABEL_RADIUS / camera.position.length())) * HORIZON_FRACTION);
    const bigRegion = alt <= ALT_CLOSE ? pickBigRegion(camera, width, height, cosLimit) : null;
    const markers = collectMarkers(camera, width, height);
    // Prima passata senza pillole; se qualche città ne riceve una, seconda
    // passata con lo spazio della pillola riservato sotto il nome.
    let { next, boxes } = labelsPass(camera, width, height, alt, cosLimit, bigRegion, null);
    let groups = assignPills(next, markers, alt);
    if (groups.size) {
      const pills = new Map([...groups].map(([city, g]) => [city, `👥 ${formatCount(g.count)}`]));
      ({ next, boxes } = labelsPass(camera, width, height, alt, cosLimit, bigRegion, pills));
      // Tengono la pillola solo le città rimaste dopo la seconda passata.
      const shown = new Set(next.filter((pl) => pl.pillText).map((pl) => pl.item));
      groups = new Map([...groups].filter(([city]) => shown.has(city)));
      for (const pl of next) {
        if (pl.pillText && !groups.has(pl.item)) pl.pillText = null;
      }
    }
    const merged = new Set();
    for (const g of groups.values()) g.markers.forEach((m) => merged.add(m));
    const chips = placeMarkers(markers, merged, boxes, width, height, alt);
    placed = [...next, ...chips];
  };

  const render = (camera, width, height) => {
    for (let i = 0; i < placed.length; i += 1) {
      const pl = placed[i];
      const slot = getEl(i);
      const className = `rb-pl rb-pl--${pl.kind} rb-pl--${pl.styleKey} rb-pl--pos-${pl.pos}`;
      if (slot.className !== className) {
        slot.el.className = className;
        slot.className = className;
      }
      if (slot.label !== pl.text) {
        slot.text.textContent = pl.text;
        slot.label = pl.text;
      }
      const pillText = pl.pillText ?? '';
      if (slot.pillLabel !== pillText) {
        slot.pill.textContent = pillText;
        slot.pill.style.display = pillText ? '' : 'none';
        slot.pill.setAttribute('aria-label', pillText ? `${pl.item.name}: ${pillText.replace('👥 ', '')} persone, avvicina` : '');
        slot.pillLabel = pillText;
      }
      slot.current = pl;
      const p = project(pl.item.vec, camera, width, height, pl.radius);
      slot.el.style.transform = `translate3d(${(p.x + pl.ox).toFixed(1)}px, ${(p.y + pl.oy).toFixed(1)}px, 0)`;
      slot.el.style.display = '';
      pl.screen = { x: p.x + pl.ox, y: p.y + pl.oy };
    }
    for (let i = placed.length; i < pool.length; i += 1) {
      if (pool[i].el.style.display !== 'none') pool[i].el.style.display = 'none';
    }
  };

  // Chiamata a ogni disegno del globo (il ciclo è già limitato a 30/10 fps
  // o fermo, vedi WorldGlobe): lavora solo se la camera si è mossa o sono
  // arrivati dati nuovi.
  const update = (camera, altitude, now = performance.now()) => {
    const width = layer.clientWidth;
    const height = layer.clientHeight;
    const root = getRoot?.();
    if (root) rootMatrix.copy(root.matrixWorld);
    else rootMatrix.identity();

    if (altitude > ALT_NONE || !width || !height) {
      if (placed.length) {
        placed = [];
        render(camera, width, height);
        resetMarkers();
      }
      lastCamKey = '';
      return;
    }
    const e = camera.matrixWorld.elements;
    const camKey = `${e[12].toFixed(2)},${e[13].toFixed(2)},${e[14].toFixed(2)},${e[0].toFixed(3)},${e[5].toFixed(3)},${width},${height}`;
    const moved = camKey !== lastCamKey;
    lastCamKey = camKey;
    // Una camera mossa rende il piazzamento da rifare; se il tetto di
    // RELAYOUT_MS lo rimanda, resta in sospeso e si fa al primo disegno
    // utile anche a camera ferma (altrimenti dopo un salto della camera
    // resterebbero le etichette della vista di prima).
    if (moved) layoutStale = true;
    if (needsLayout || (layoutStale && now - lastLayoutAt >= RELAYOUT_MS)) {
      layout(camera, width, height, altitude);
      lastLayoutAt = now;
      needsLayout = false;
      layoutStale = false;
    } else if (!moved) {
      return;
    }
    render(camera, width, height);
  };

  // Colori secondo il mondo: testo scuro con alone chiaro sulle terre
  // chiare, il contrario sulle terre scure. La "terra" è il riempimento dei
  // continenti sopra al globo quasi nero (#050508).
  const setTheme = ({ landFillColor, landFillOpacity = 0.1, accentColor }) => {
    const lum = luminance(landFillColor) * landFillOpacity + luminance('#050508') * (1 - landFillOpacity);
    const light = lum > 0.35;
    layer.style.setProperty('--pl-text', light ? '#111318' : '#f3f4f6');
    layer.style.setProperty('--pl-halo', light ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)');
    layer.style.setProperty('--pl-muted', light ? 'rgba(17,19,24,0.55)' : 'rgba(243,244,246,0.55)');
    layer.style.setProperty('--pl-faint', light ? 'rgba(17,19,24,0.28)' : 'rgba(243,244,246,0.26)');
    layer.style.setProperty('--pl-accent', accentColor);
    needsLayout = true;
  };

  // Rettangoli (in pixel del livello) delle etichette mostrate, per chi
  // deve evitarle (marker) o agganciarsi a una città.
  const getPlaced = () =>
    placed
      .filter((pl) => pl.screen)
      .map((pl) => ({
        kind: pl.kind,
        name: pl.item.name,
        lat: pl.item.lat,
        lng: pl.item.lng,
        rank: pl.item.rank,
        capital: pl.item.capital,
        x: pl.screen.x,
        y: pl.screen.y,
        rect: {
          left: pl.screen.x + pl.box.left,
          top: pl.screen.y + pl.box.top,
          right: pl.screen.x + pl.box.right,
          bottom: pl.screen.y + pl.box.bottom,
        },
      }));

  const dispose = () => {
    resetMarkers();
    layer.remove();
    pool.length = 0;
  };

  // Da chiamare quando cambiano i marker (nuovi dati, nuovo raggruppamento).
  const invalidate = () => {
    needsLayout = true;
  };

  return { update, setTheme, getPlaced, invalidate, dispose };
}
