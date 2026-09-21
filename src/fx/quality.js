// Livelli di qualità grafica del globo: "Auto" li sceglie da sé (hardware +
// un campione reale di FPS appena montato, con downgrade automatico se il
// frame rate cala e resta basso), gli altri tre sono scelte esplicite fatte
// dall'utente in Impostazioni. Persistito in localStorage come sound.js.
//
// Pensato già da ora per la scena a 6 globi della Fase 2 (un globo grande
// attivo + 5 satelliti fluttuanti più leggeri, vedi MINI_GLOBE_QUALITY):
// GLOBE_QUALITY sotto è il budget del globo GRANDE, che dovrà restare
// sostenibile anche quando i 5 satelliti gli staranno intorno, non più solo
// mentre è l'unico globo in scena.

const STORAGE_KEY = 'rb-quality-mode';
const MODES = ['auto', 'high', 'medium', 'low'];

// Budget del globo grande (quello attivo/centrale) per livello: pixelRatio
// tenuto sotto controllo è la leva col maggior impatto sulla GPU (ogni pixel
// del canvas costa), antialias/atmosfera sono le prossime più a buon mercato
// da spegnere.
export const GLOBE_QUALITY = {
  high: { pixelRatioCap: 2, antialias: true, atmosphere: true },
  medium: { pixelRatioCap: 1.5, antialias: true, atmosphere: true },
  low: { pixelRatioCap: 1, antialias: false, atmosphere: false },
};

// Budget dei 5 globi satellite della Fase 2 (non ancora costruiti: nessun
// codice li consuma oggi, ma il tavolo va apparecchiato ora così il chunk
// Three.js/WorldGlobe non va ripensato da capo quando arriveranno). Molto
// più leggeri del globo grande per definizione — niente etichette categoria,
// niente contorni dei continenti in "low", pixelRatio ancora più basso dato
// che sono piccoli e visti da lontano.
export const MINI_GLOBE_QUALITY = {
  high: { pixelRatioCap: 1.25, showContinentOutline: true, showLabels: false },
  medium: { pixelRatioCap: 1, showContinentOutline: true, showLabels: false },
  low: { pixelRatioCap: 1, showContinentOutline: false, showLabels: false },
};

export function getQualityMode() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return MODES.includes(raw) ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

const listeners = new Set();

export function setQualityMode(mode) {
  if (!MODES.includes(mode)) return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage non disponibile (es. modalità privata): la scelta vale
    // solo per questa sessione, niente di grave.
  }
  autoTierOverride = null;
  notify();
}

// WorldGlobe si iscrive per aggiornare pixelRatio/antialias a caldo quando
// l'utente cambia scelta in Impostazioni, senza dover riavviare la scena.
export function subscribeQualityMode(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

function detectAutoTier() {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = navigator.deviceMemory ?? 4; // non su tutti i browser: undefined -> si ignora
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 480;
  if (cores <= 4 || mem <= 4) return 'low';
  if (cores <= 6 || mem <= 6 || smallScreen) return 'medium';
  return 'high';
}

// In modalità Auto, il downgrade da FPS bassi sovrascrive il livello scelto
// dall'euristica hardware finché non si ricarica la pagina o l'utente sceglie
// un livello esplicito (setQualityMode lo azzera, vedi sopra).
let autoTierOverride = null;

export function getResolvedTier() {
  const mode = getQualityMode();
  if (mode !== 'auto') return mode;
  return autoTierOverride ?? detectAutoTier();
}

export function getGlobeQuality(tier = getResolvedTier()) {
  return GLOBE_QUALITY[tier] ?? GLOBE_QUALITY.medium;
}

const FPS_SAMPLE_MS = 3000;
const FPS_DOWNGRADE_THRESHOLD = 45;

// Chiamata una volta da WorldGlobe dopo il primo render: per qualche secondo
// misura gli FPS reali (rAF) e, solo in modalità Auto e solo se restano sotto
// soglia per tutta la finestra di campionamento, scende di un livello e
// avvisa gli iscritti. Mai più aggressivo di un downgrade per sessione: non
// c'è bisogno di inseguire ogni micro-scatto.
export function startAutoQualityMonitor() {
  if (getQualityMode() !== 'auto' || autoTierOverride) return () => {};

  let frames = 0;
  let rafId = null;
  const start = performance.now();

  const tick = () => {
    frames += 1;
    const elapsed = performance.now() - start;
    if (elapsed >= FPS_SAMPLE_MS) {
      const fps = (frames / elapsed) * 1000;
      if (fps < FPS_DOWNGRADE_THRESHOLD) {
        const current = getResolvedTier();
        const currentIndex = ['high', 'medium', 'low'].indexOf(current);
        const downgraded = ['high', 'medium', 'low'][Math.min(currentIndex + 1, 2)];
        if (downgraded !== current) {
          autoTierOverride = downgraded;
          notify();
        }
      }
      return;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}
