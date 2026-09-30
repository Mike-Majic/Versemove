import i18n from '../i18n';
import './eventMarkers.css';

// Marker degli eventi sul globo: esagono neon con la data (mese + giorno),
// asticella e punto luminoso sulla coordinata dell'evento. Diversi apposta
// dai marker tondi degli utenti.
//
// L'elemento esterno (.rb-event-marker) lo posiziona la libreria del globo
// riscrivendo a ogni fotogramma il suo style.transform: qui è largo e alto
// 0, così la sua origine È la coordinata dell'evento, e tutto ciò che scala
// sta in un figlio (.rb-ev-pin). La grandezza non si aggiorna marker per
// marker: applyEventZoom scrive una sola variabile CSS (--ev-scale) e un
// attributo (data-ev-zoom) sul contenitore del globo, il resto è CSS.

const SVG_NS = 'http://www.w3.org/2000/svg';
const GRADIENT_ID = 'rbEvHexGrad';

// Gradiente del bordo definito una volta sola nella pagina (niente id
// duplicati dentro ogni marker).
function ensureHexGradient() {
  if (typeof document === 'undefined' || document.getElementById(GRADIENT_ID)) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.id = GRADIENT_ID;
  [['x1', '0'], ['y1', '0'], ['x2', '1'], ['y2', '1']].forEach(([k, v]) => grad.setAttribute(k, v));
  [['0', '#5fe8ff'], ['.55', '#3a8bff'], ['1', '#c25bff']].forEach(([offset, color]) => {
    const stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    grad.append(stop);
  });
  defs.append(grad);
  svg.append(defs);
  document.body.append(svg);
}

function svgEl(tag, attrs, text) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text != null) el.textContent = text;
  return el;
}

// Lingua dell'utente, solo se Intl la accetta (lingue del browser come
// "en-US@posix" farebbero lanciare un errore a Intl e a toLocaleUpperCase).
function currentLocale() {
  const candidates = [i18n?.language, typeof navigator !== 'undefined' ? navigator.language : ''];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const [canonical] = Intl.getCanonicalLocales(c);
      if (canonical) return canonical;
    } catch {
      // lingua non valida: si prova la prossima
    }
  }
  return 'it';
}

// Mese corto, maiuscolo, senza punto finale, al massimo 4 caratteri (per
// stare nell'esagono in ogni lingua); giorno sempre a due cifre.
export function eventDateParts(value, requestedLocale) {
  const locale = requestedLocale ?? currentLocale();
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { month: '', day: '--', full: '' };
  let month = '';
  let full = '';
  try {
    month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(d);
    full = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(d);
  } catch {
    month = new Intl.DateTimeFormat('it', { month: 'short' }).format(d);
    full = new Intl.DateTimeFormat('it', { dateStyle: 'full', timeStyle: 'short' }).format(d);
  }
  month = month.replace(/[.\s]+$/u, '');
  try {
    month = month.toLocaleUpperCase(locale);
  } catch {
    month = month.toUpperCase();
  }
  if ([...month].length > 4) month = [...month].slice(0, 4).join('');
  return { month, day: String(d.getDate()).padStart(2, '0'), full };
}

const LABEL_MAX = 22;
function shortTitle(title) {
  const chars = [...String(title ?? '')];
  return chars.length > LABEL_MAX ? `${chars.slice(0, LABEL_MAX - 1).join('').trimEnd()}…` : chars.join('');
}

export function makeEventMarkerEl(event, onOpen) {
  ensureHexGradient();
  const { month, day, full } = eventDateParts(event.dataEvento);

  const el = document.createElement('div');
  el.className = 'rb-event-marker';
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.setAttribute('aria-label', [event.titolo, full].filter(Boolean).join(' · '));
  el.title = [event.titolo, event.citta].filter(Boolean).join(' · ');

  const pin = document.createElement('div');
  pin.className = 'rb-ev-pin';

  const hex = svgEl('svg', { class: 'rb-ev-hex', width: '46', height: '50', viewBox: '0 0 46 50', 'aria-hidden': 'true' });
  hex.append(
    svgEl('path', {
      d: 'M23 2 L42 12.5 V37.5 L23 48 L4 37.5 V12.5 Z',
      fill: 'rgba(5,13,27,.94)',
      stroke: `url(#${GRADIENT_ID})`,
      'stroke-width': '2',
      'stroke-linejoin': 'round',
    })
  );
  const fullGroup = svgEl('g', { class: 'rb-ev-full' });
  fullGroup.append(
    svgEl('text', { class: 'rb-ev-month', x: '23', y: '18.5' }, month),
    svgEl('path', { d: 'M13 22.2h20', stroke: '#38c6ff', 'stroke-opacity': '.55', 'stroke-width': '1' }),
    svgEl('text', { class: 'rb-ev-day', x: '23', y: '38.2' }, day),
    svgEl('circle', { cx: '23', cy: '43', r: '1.5', fill: '#ff5fd0' })
  );
  const compactGroup = svgEl('g', { class: 'rb-ev-compact' });
  compactGroup.append(svgEl('text', { class: 'rb-ev-day rb-ev-day-big', x: '23', y: '32.5' }, day));
  hex.append(fullGroup, compactGroup);

  const stem = document.createElement('div');
  stem.className = 'rb-ev-stem';
  const base = document.createElement('div');
  base.className = 'rb-ev-base';
  const label = document.createElement('div');
  label.className = 'rb-ev-label';
  label.textContent = shortTitle(event.titolo);
  pin.append(hex, stem, base, label);

  const dot = document.createElement('div');
  dot.className = 'rb-ev-dot';

  el.append(pin, dot);
  const open = (e) => {
    e.stopPropagation();
    onOpen(event.id);
  };
  el.addEventListener('click', open);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(e);
    }
  });
  return el;
}

// --- Grandezza legata allo zoom --------------------------------------------
// Altitudine della camera (unità di pointOfView: distanza dalla superficie
// in raggi del globo). Soglie per uno schermo orizzontale; su uno schermo
// verticale il globo riempie prima la larghezza, quindi si moltiplicano per
// il rapporto altezza/larghezza (al massimo 2.2).
//   far   (> 2.2)          globo intero: solo il punto magenta
//   mid   (2.2 → ~0.58)    continente: pin compatto (solo il giorno), scala 0.55 → 0.85
//   near  (~0.58 → 0.12)   nazione: pin pieno (mese + giorno), scala 0.85 → 1 (1 da 0.3)
//   close (< 0.12)         regione/città: scala 1 → 1.3 (a 0.03), titolo sotto
// Fra una fascia e l'altra la scala è interpolata sul logaritmo
// dell'altitudine (lo zoom si percepisce in proporzione, non in unità).
const ALT_FAR = 2.2;
const ALT_FULL_SIZE = 0.3;
const ALT_CLOSE = 0.12;
const ALT_MIN = 0.03;
const SCALE_MID_MIN = 0.55;
const SCALE_CLOSE_MAX = 1.3;
const SCALE_FULL_VERSION = 0.85;

function logLerp(alt, fromAlt, toAlt, fromScale, toScale) {
  const t = Math.min(1, Math.max(0, Math.log(fromAlt / alt) / Math.log(fromAlt / toAlt)));
  return fromScale + (toScale - fromScale) * t;
}

export function eventZoomFor(altitude, aspect = 1) {
  const k = Math.min(2.2, Math.max(1, aspect));
  const alt = Math.max(altitude, 0.001);
  if (alt > ALT_FAR * k) return { band: 'far', scale: SCALE_MID_MIN };
  if (alt < ALT_CLOSE * k) {
    return { band: 'close', scale: logLerp(alt, ALT_CLOSE * k, ALT_MIN * k, 1, SCALE_CLOSE_MAX) };
  }
  const scale = logLerp(alt, ALT_FAR * k, ALT_FULL_SIZE * k, SCALE_MID_MIN, 1);
  return { band: scale < SCALE_FULL_VERSION ? 'mid' : 'near', scale };
}

// Scrive --ev-scale e data-ev-zoom sul contenitore solo se cambiano.
export function applyEventZoom(container, altitude, aspect) {
  if (!container) return;
  const { band, scale } = eventZoomFor(altitude, aspect);
  const scaleStr = scale.toFixed(3);
  if (container.dataset.evZoom !== band) container.dataset.evZoom = band;
  // Area 3D più alta che larga: anche i marker degli utenti seguono le
  // fasce (vedi WorldGlobe.css, solo in verticale).
  const portrait = aspect > 1 ? '1' : '0';
  if (container.dataset.portrait !== portrait) container.dataset.portrait = portrait;
  if (container.style.getPropertyValue('--ev-scale') !== scaleStr) container.style.setProperty('--ev-scale', scaleStr);
}
