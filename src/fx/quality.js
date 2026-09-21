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

// Budget dei 5 globi satellite (Fase 2, src/globe/satelliteGlobes.js): vivono
// nella STESSA scena/renderer del globo grande (un solo WebGLRenderer in
// tutta la pagina, vedi WorldGlobe.jsx), quindi non hanno un proprio
// pixelRatio da limitare — la sola leva è quanti nodi ha ciascuna sfera.
// `detail` è il livello di suddivisione passato a THREE.IcosahedronGeometry
// (0 = 20 facce, 1 = 80, 2 = 320): "low" resta al minimo, niente contorno a
// wireframe sopra.
export const MINI_GLOBE_QUALITY = {
  high: { detail: 2, showWireframe: true },
  medium: { detail: 1, showWireframe: true },
  low: { detail: 0, showWireframe: false },
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
  // navigator.deviceMemory non esiste su molti browser (Safari, Firefox, e
  // parecchi Chrome automatizzati): undefined NON deve contare come "poca
  // RAM" — altrimenti chiunque lo visiti da un browser che non espone questo
  // dato finirebbe sempre su "low", a prescindere dall'hardware reale.
  const mem = navigator.deviceMemory;
  const smallScreen = Math.min(window.innerWidth, window.innerHeight) < 480;
  if (cores <= 4 || (mem !== undefined && mem <= 4)) return 'low';
  if (cores <= 6 || (mem !== undefined && mem <= 6) || smallScreen) return 'medium';
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

export function getMiniGlobeQuality(tier = getResolvedTier()) {
  return MINI_GLOBE_QUALITY[tier] ?? MINI_GLOBE_QUALITY.medium;
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
