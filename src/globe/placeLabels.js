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
// Un punto è sul lato visibile se il coseno fra lui e la camera (visti dal
// centro) supera raggio / distanza della camera; questo margine in più
// scarta anche quelli troppo di taglio, vicino al bordo del globo.
const HORIZON_MARGIN = 0.06;
// Margini liberi per i controlli dell'interfaccia sopra al globo: barra in
// alto, pulsante dei mondi in basso a sinistra, colonna dei mondi in basso
// a destra. Un'etichetta non ci finisce mai sotto.
const MARGIN = { top: 60, bottom: 56, left: 6, right: 70 };

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

export function createPlaceLabels({ canvas, getRoot }) {
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

  // Pool di elementi.
  const pool = [];
  const getEl = (i) => {
    if (!pool[i]) {
      const el = document.createElement('div');
      const text = document.createElement('span');
      text.className = 'rb-pl-text';
      el.appendChild(text);
      layer.appendChild(el);
      pool[i] = { el, text, className: '', label: '' };
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

  const project = (vec, camera, width, height) => {
    tmp.copy(vec).multiplyScalar(LABEL_RADIUS).applyMatrix4(rootMatrix).project(camera);
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
  const boxOf = (text, kind, styleKey, pos = 'r') => {
    const st = STYLES[styleKey];
    const w = measure(text, styleKey);
    const h = st.size * 1.25;
    if (kind !== 'city') return { left: -w / 2, top: -h / 2, right: w / 2, bottom: h / 2 };
    if (pos === 'l') return { left: -9 - w, top: -2 - h / 2, right: 5, bottom: Math.max(5, -2 + h / 2) };
    if (pos === 't') return { left: -Math.max(5, w / 2), top: -6 - h, right: Math.max(5, w / 2), bottom: 5 };
    if (pos === 'b') return { left: -Math.max(5, w / 2), top: -5, right: Math.max(5, w / 2), bottom: 6 + h };
    return { left: -5, top: -2 - h / 2, right: 9 + w, bottom: Math.max(5, -2 + h / 2) };
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

  const layout = (camera, width, height, alt) => {
    camDir.copy(camera.position).normalize();
    const cosLimit = LABEL_RADIUS / camera.position.length() + HORIZON_MARGIN;
    const bigRegion = alt <= ALT_CLOSE ? pickBigRegion(camera, width, height, cosLimit) : null;
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
      // Tentativi: spostamenti del testo per le città, del blocco intero per
      // la regione in grande, nessuno per il resto.
      const tries =
        kind === 'city'
          ? CITY_POSITIONS.map((pos) => ({ pos, ox: 0, oy: 0 }))
          : (styleKey === 'regionBig' ? REGION_OFFSETS : [[0, 0]]).map(([ox, oy]) => ({ pos: 'c', ox, oy }));
      for (const { pos, ox, oy } of tries) {
        const box = boxOf(text, kind, styleKey, pos);
        const abs = { left: p.x + ox + box.left, top: p.y + oy + box.top, right: p.x + ox + box.right, bottom: p.y + oy + box.bottom };
        if (abs.left < MARGIN.left || abs.top < MARGIN.top || abs.right > width - MARGIN.right || abs.bottom > height - MARGIN.bottom) continue;
        if (overlaps(abs, boxes)) continue;
        boxes.push(abs);
        next.push({ item, kind, styleKey, text, ox, oy, box, pos });
        break;
      }
    }
    placed = next;
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
      const p = project(pl.item.vec, camera, width, height);
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
    layer.remove();
    pool.length = 0;
  };

  return { update, setTheme, getPlaced, dispose };
}
