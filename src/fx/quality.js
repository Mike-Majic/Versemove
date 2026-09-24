// Livelli di qualità grafica del globo: "Auto" li sceglie da sé (hardware +
// un campione reale di FPS appena montato, con downgrade automatico se il
// frame rate cala e resta basso), gli altri tre sono scelte esplicite fatte
// dall'utente in Impostazioni. Persistito in localStorage come sound.js.
//
// GLOBE_QUALITY sotto è il budget del solo globo GRANDE. I 5 satelliti
// fluttuanti (Fase 2, src/globe/satelliteGlobes.js) non hanno un budget qui:
// costano così poco (solo LineSegments/Points, niente ombreggiatura) che
// farli dipendere dalla qualità non ha senso — e causava un difetto vero,
// un cambio di forma a scatto se "Auto" declassava a metà sessione. La loro
// geometria è fissa (SATELLITE_DETAIL in satelliteGlobes.js).

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

// Tetto adattivo dei fotogrammi del globo (letto dal wrapper di
// renderer.render in WorldGlobe): se il ciclo di disegno resta lento
// (media > SLOW_ENTER_MS per SLOW_ENTER_HOLD_MS) il tetto scende a ~15 fps,
// e torna libero quando la media scende sotto SLOW_EXIT_MS.
//
// La media è fra due GIRI del ciclo (ogni chiamata a renderer.render, anche
// quelle saltate), non fra due disegni: col tetto a 15 fps i disegni sono
// per forza a >= 66 ms l'uno dall'altro e la media non potrebbe mai tornare
// sotto 30 ms. I giri invece restano a ~16 ms se il disegno costa poco, e si
// allungano quando il disegno (CPU o GPU) non sta dietro al monitor.
const SLOW_ENTER_MS = 50;
const SLOW_ENTER_HOLD_MS = 3000;
const SLOW_EXIT_MS = 30;
const SLOW_EXIT_HOLD_MS = 1000;
// ~15 fps: 4 giri da 16,7 ms = 66,7 ms. La soglia resta un po' sotto,
// altrimenti con le piccole oscillazioni del rAF si salterebbe un giro in più.
const SLOW_FRAME_MS = 62;
// Una pausa lunga (scheda nascosta, pauseAnimation) non è lentezza.
const GAP_RESET_MS = 1000;

export function createAdaptiveFrameCap() {
  let lastTick = 0;
  let avg = 16;
  let slow = false;
  let conditionSince = 0;

  return {
    tick(now) {
      const dt = now - lastTick;
      lastTick = now;
      if (dt <= 0 || dt > GAP_RESET_MS) {
        conditionSince = 0;
        return;
      }
      // Media mobile esponenziale su ~mezzo secondo, indipendente dal
      // numero di giri al secondo.
      avg += (dt - avg) * (1 - Math.exp(-dt / 500));
      const wantsChange = slow ? avg < SLOW_EXIT_MS : avg > SLOW_ENTER_MS;
      if (!wantsChange) {
        conditionSince = 0;
        return;
      }
      if (!conditionSince) conditionSince = now;
      if (now - conditionSince >= (slow ? SLOW_EXIT_HOLD_MS : SLOW_ENTER_HOLD_MS)) {
        slow = !slow;
        conditionSince = 0;
      }
    },
    // Intervallo minimo fra due disegni imposto dal tetto (0 = nessuno).
    frameMs() {
      return slow ? SLOW_FRAME_MS : 0;
    },
    isSlow() {
      return slow;
    },
  };
}
