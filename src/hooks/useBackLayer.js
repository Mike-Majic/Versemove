import { useEffect, useRef, useState } from 'react';
import { isDeepLinkHash } from '../data/deepLinks';

// Tasto/gesto "Indietro" del telefono (e del browser) = un passo indietro
// nell'app, un livello alla volta, invece di chiudere la PWA.
//
// Come funziona: ogni cosa "aperta" (categoria, sottopagina di una colonna,
// pannello a comparsa, visore a schermo intero) registra un livello con
// useBackLayer. Per ogni livello aperto c'è una voce in cronologia
// (history.pushState, solo `state`: l'URL non cambia mai, i deep link
// restano come sono). Le voci sono anonime: conta solo quante sono, e il
// livello da chiudere è sempre quello più interno della pila (livello più
// alto, a parità il più recente) — così due livelli aperti nello stesso
// render non si scambiano di posto.
//
// - Indietro (popstate): chiude il livello in cima chiamando il suo onBack
//   (o onClose). Se onBack restituisce false il livello non si chiude (es.
//   modulo con modifiche non salvate: il pannello mostra la sua conferma) e
//   la voce viene rimessa subito in cronologia, così un nuovo Indietro
//   funziona ancora; scegliendo poi "Chiudi" il pannello si chiude come da
//   interfaccia (punto sotto).
// - Chiusura dall'interfaccia (✕, clic fuori, Esc): il livello consuma la
//   sua voce con history.back(); il popstate che ne deriva viene ignorato,
//   altrimenti chiuderebbe anche il livello sotto. Più chiusure nello stesso
//   render diventano un solo history.go(-n); un'apertura nello stesso
//   momento si limita ad annullare una di quelle voci invece di aggiungerne.
// - Sotto a tutti i livelli c'è una voce "sentinella", messa all'avvio: il
//   primo Indietro a mappamondo pulito la toglie e mostra "Premi di nuovo
//   Indietro per uscire" per 2 secondi. Un secondo Indietro in quei 2
//   secondi trova la cronologia originale ed esce davvero; passati i 2
//   secondi la sentinella torna al suo posto.
// - Avanti del browser su una voce nostra viene annullato: riaprire un
//   pannello già chiuso da lì non avrebbe senso.

export const BACK_LEVELS = { world: 1, subpage: 2, modal: 3, viewer: 4 };
const EXIT_WINDOW_MS = 2000;

let orderSeq = 0;
// Numero d'ordine per i livelli: ModalOverlay lo prende al primo render
// (un genitore renderizza prima dei figli, quindi un modale annidato ha un
// numero più alto anche se i due effect partono nell'ordine opposto).
export const nextLayerOrder = () => ++orderSeq;

const layers = [];
let currentIdx = 0; // vmIdx della voce di cronologia attuale (0 = non nostra)
let sentinel = false;
// vmIdx della sentinella: sotto di lei le voci non sono di questo documento
// (o sono di un caricamento precedente della pagina), e tornarci con
// history.go vorrebbe dire uscire dal documento e ricaricare la pagina.
let sentinelIdx = 0;
let ignorePops = 0;
let pendingBack = 0;
let exitArmedUntil = 0;
let exitTimer = null;
let toastListener = null;
let rootMounted = false;
// La sentinella e le voci dei livelli già aperti si mettono una volta sola:
// in sviluppo React (StrictMode) smonta e rimonta subito gli effect, e un
// secondo giro aggiungerebbe voci doppie.
let rootInitialized = false;

// Solo in sviluppo: traccia di ogni go/back/popstate, per poter
// riprodurre un eventuale giro strano della cronologia.
function debugLog(event, extra) {
  if (!import.meta.env.DEV) return;
  console.debug(`[back] ${event}`, {
    ...extra,
    currentIdx,
    ignorePops,
    sentinel: sentinel ? sentinelIdx : null,
    layers: layers.map((l) => l.id),
  });
}

const topLayer = () =>
  layers.reduce(
    (top, l) => (!top || l.level > top.level || (l.level === top.level && l.order > top.order) ? l : top),
    null,
  );

function pushEntry() {
  currentIdx += 1;
  window.history.pushState({ vmIdx: currentIdx }, '');
}

function ensureSentinel() {
  if (sentinel) return;
  sentinel = true;
  pushEntry();
  sentinelIdx = currentIdx;
}

function flushBack() {
  const requested = pendingBack;
  pendingBack = 0;
  // Mai più indietro delle voci nostre sopra la sentinella: un go(-n) troppo
  // lungo uscirebbe dal documento e la pagina si ricaricherebbe.
  const n = Math.min(requested, currentIdx - (sentinel ? sentinelIdx : 0));
  if (n !== requested) debugLog('go limitato', { requested, n });
  if (n <= 0) return;
  ignorePops += 1;
  currentIdx -= n;
  debugLog('go', { delta: -n });
  window.history.go(-n);
}

function addLayer(layer) {
  layers.push(layer);
  exitArmedUntil = 0;
  if (!rootMounted) return;
  if (pendingBack > 0) {
    // Una chiusura dall'interfaccia nello stesso momento stava per togliere
    // una voce: la si tiene per questo livello invece di aggiungerne una.
    pendingBack -= 1;
    return;
  }
  ensureSentinel();
  pushEntry();
}

function removeLayer(layer) {
  const i = layers.indexOf(layer);
  if (i === -1) return; // già chiuso dal tasto Indietro: voce già consumata
  layers.splice(i, 1);
  if (!rootMounted) return;
  pendingBack += 1;
  if (pendingBack === 1) queueMicrotask(flushBack);
}

function showExitToast() {
  exitArmedUntil = Date.now() + EXIT_WINDOW_MS;
  toastListener?.(true);
  clearTimeout(exitTimer);
  exitTimer = setTimeout(() => {
    exitArmedUntil = 0;
    toastListener?.(false);
    if (layers.length === 0) ensureSentinel();
  }, EXIT_WINDOW_MS);
}

function onPopState(e) {
  const newIdx = e.state?.vmIdx ?? 0;
  debugLog('popstate', { newIdx });
  // Link condiviso incollato con l'app aperta (#/…, vedi data/deepLinks.js):
  // è una voce nuova senza stato, non un Indietro. Lo apre App.jsx.
  if (e.state === null && isDeepLinkHash()) {
    debugLog('link condiviso');
    return;
  }
  if (ignorePops > 0) {
    ignorePops -= 1;
    currentIdx = newIdx;
    return;
  }
  if (newIdx > currentIdx) {
    // Avanti del browser verso una voce nostra: si torna dove si era.
    ignorePops += 1;
    debugLog('go (annulla Avanti)', { delta: currentIdx - newIdx });
    window.history.go(currentIdx - newIdx);
    return;
  }
  let steps = Math.max(1, currentIdx - newIdx);
  currentIdx = newIdx;
  while (steps > 0) {
    steps -= 1;
    const top = topLayer();
    if (!top) {
      if (Date.now() < exitArmedUntil) {
        // Secondo Indietro, ma sotto c'erano ancora voci nostre rimaste da
        // un ricaricamento della pagina: si continua a scendere per uscire.
        if (e.state?.vmIdx) {
          debugLog('back (uscita)');
          window.history.back();
        }
        return;
      }
      sentinel = false;
      showExitToast();
      return;
    }
    layers.splice(layers.indexOf(top), 1);
    const closed = top.back() !== false;
    if (!closed) {
      // Il livello resta aperto (es. conferma modifiche non salvate): si
      // rimettono in cronologia la sua voce e quelle ancora da consumare.
      layers.push(top);
      for (let i = 0; i <= steps; i += 1) pushEntry();
      return;
    }
  }
}

// Montato una sola volta, in App.jsx: listener globale popstate + voce
// sentinella all'avvio. Restituisce se l'avviso "Premi di nuovo Indietro
// per uscire" va mostrato.
export function useBackNavigationRoot() {
  const [exitToastVisible, setExitToastVisible] = useState(false);
  useEffect(() => {
    rootMounted = true;
    toastListener = setExitToastVisible;
    if (!rootInitialized) {
      rootInitialized = true;
      const state = window.history.state;
      if (state && typeof state.vmIdx === 'number') {
        // Pagina ricaricata su una voce nostra: la si riusa come sentinella.
        currentIdx = state.vmIdx;
        sentinel = true;
        sentinelIdx = currentIdx;
      } else {
        currentIdx = 0;
        sentinel = false;
        ensureSentinel();
      }
      // Livelli aperti prima del montaggio della radice (gli effect dei
      // figli partono prima dei suoi): una voce ciascuno.
      layers.forEach(() => pushEntry());
    }
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      rootMounted = false;
      toastListener = null;
      clearTimeout(exitTimer);
    };
  }, []);
  return exitToastVisible;
}

// isOpen: il livello è aperto. onClose: come chiuderlo (lo stesso della ✕).
// id: nome del livello, il prefisso sceglie la profondità (world, subpage,
// modal, viewer — es. 'subpage:giochi'). options.onBack: se c'è, viene
// chiamato al posto di onClose quando si preme Indietro; restituendo false
// il livello resta aperto (es. per mostrare una conferma).
// options.order: numero d'ordine già preso con nextLayerOrder().
export function useBackLayer(isOpen, onClose, id, options = {}) {
  const { onBack, order } = options;
  const level = options.level ?? BACK_LEVELS[id.split(':')[0]] ?? BACK_LEVELS.modal;
  const handlers = useRef({ onClose, onBack });
  useEffect(() => {
    handlers.current = { onClose, onBack };
  });

  useEffect(() => {
    if (!isOpen) return undefined;
    const layer = {
      id,
      level,
      order: order ?? nextLayerOrder(),
      back: () => {
        const h = handlers.current;
        if (h.onBack) return h.onBack();
        if (!h.onClose) return false;
        h.onClose();
        return true;
      },
    };
    addLayer(layer);
    return () => removeLayer(layer);
  }, [isOpen, id, level, order]);
}
