// Riconoscimento del contenuto di foto/video DENTRO al browser di chi
// pubblica, gratuito: nessuna chiamata a un server, nessun costo per
// caricamento. Due parti, entrambe reali (non finte):
// 1) coco-ssd (modello pubblico, gira via TensorFlow.js) riconosce oggetti
//    concreti — persona, tv, laptop, cellulare, libro, ecc — utile per
//    capire "c'è uno schermo/una console" ma NON quale gioco o marca sia:
//    quello richiederebbe un modello enorme e a pagamento (vedi la
//    conversazione — questa è la parte gratuita che abbiamo scelto).
// 2) un'euristica sui pixel (colori caldi nella parte alta dell'immagine)
//    per suggerire "Tramonto": non è un modello ad hoc, ma un vero calcolo
//    sui colori reali della foto, non un tag a caso.
//
// In entrambi i casi il risultato è solo un SUGGERIMENTO: chi pubblica lo
// vede prima di postare, può togliere quello che non c'entra e aggiungere
// i suoi tag — mai un'etichetta piazzata a sua insaputa.

// TensorFlow.js + coco-ssd sono il pezzo più pesante di questo file (oltre
// 1MB): caricati solo qui, al primo utilizzo vero (prima foto/video
// analizzato), non al semplice apertura del composer o della colonna — vedi
// Fase 1 "effetto wow". `await import(...)` invece di un import statico in
// cima al file è quello che fa la differenza: il resto del modulo (le
// euristiche sui pixel, sempre leggere) resta disponibile subito.
let modelPromise = null;
function getModel() {
  if (!modelPromise) {
    modelPromise = Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/coco-ssd')]).then(
      ([, cocoSsd]) => cocoSsd.load()
    );
  }
  return modelPromise;
}

// Mappa oggetto riconosciuto -> suggerimento di tag/posizionamento. Solo
// associazioni che l'oggetto rilevato giustifica davvero: uno schermo può
// essere qualunque cosa, quindi il suggerimento resta generico ("Nerd") e
// tocca alla persona precisare console/gioco a mano.
const OBJECT_SUGGESTIONS = {
  tv: { tags: ['gaming', 'schermo'], placement: { world: 'nerd', label: 'Nerd (gaming genico)' } },
  laptop: { tags: ['tech'], placement: null },
  'cell phone': { tags: ['tech'], placement: null },
  book: { tags: ['libro'], placement: { world: 'arte', category: 'libreria', label: 'Arte & Musica · Libreria' } },
  person: { tags: ['ritratto'], placement: null },
};

// Euristica "tramonto": guarda solo il terzo superiore dell'immagine (di
// solito il cielo) e controlla se i colori medi sono caldi (arancio/rosso/
// rosa) e non troppo chiari (altrimenti è solo un cielo azzurro luminoso).
function detectSunsetHeuristic(imageEl) {
  const canvas = document.createElement('canvas');
  const w = 64;
  const h = 64;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageEl, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, Math.ceil(h / 3));

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    rSum += data[i];
    gSum += data[i + 1];
    bSum += data[i + 2];
  }
  const r = rSum / pixelCount;
  const g = gSum / pixelCount;
  const b = bSum / pixelCount;

  const isWarm = r > 140 && r > b + 35 && g > b;
  const isNotOverexposed = r < 250 || b < 200;
  return isWarm && isNotOverexposed;
}

// `source` è un <img> o <video> (o <canvas>) già caricato. Ritorna
// { tags, placements } dove placements è una lista di suggerimenti
// { world, category, subfamily, label } — ancora da confermare dall'utente.
export async function analyzeImageElement(source) {
  const tags = new Set();
  const placements = [];

  if (detectSunsetHeuristic(source)) {
    tags.add('tramonto');
    placements.push({ world: 'arte', category: 'fotografia', subfamily: 'Tramonti', label: 'Arte & Musica · Fotografia · Tramonti' });
  }

  try {
    const model = await getModel();
    const predictions = await model.detect(source);
    for (const p of predictions) {
      if (p.score < 0.5) continue;
      const suggestion = OBJECT_SUGGESTIONS[p.class];
      if (!suggestion) continue;
      suggestion.tags.forEach((t) => tags.add(t));
      if (suggestion.placement && !placements.some((pl) => pl.world === suggestion.placement.world && pl.category === suggestion.placement.category)) {
        placements.push(suggestion.placement);
      }
    }
  } catch {
    // Il modello non è riuscito a caricare (es. offline): resta comunque
    // il suggerimento dell'euristica tramonto, niente errore bloccante.
  }

  return { tags: Array.from(tags), placements };
}

// Estrae un fotogramma da un video (di default al 25% della durata: evita
// il primo istante, spesso nero/sfocato durante il caricamento) e lo
// analizza come fosse una foto — è così che i modelli di visione "vedono"
// un video gratis, senza dover elaborare ogni fotogramma.
export function extractVideoFrame(videoEl) {
  return new Promise((resolve, reject) => {
    const captureAt = () => {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 320;
      canvas.height = videoEl.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    if (videoEl.readyState >= 2) {
      videoEl.currentTime = Math.min(videoEl.duration * 0.25 || 0, videoEl.duration || 0);
      videoEl.onseeked = captureAt;
    } else {
      videoEl.onloadeddata = () => {
        videoEl.currentTime = Math.min(videoEl.duration * 0.25 || 0, videoEl.duration || 0);
        videoEl.onseeked = captureAt;
      };
      videoEl.onerror = reject;
    }
  });
}
