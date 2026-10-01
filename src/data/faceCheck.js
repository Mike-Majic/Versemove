// Controllo che nella prima foto del Profilo Incontri si veda un viso.
// TensorFlow.js + BlazeFace (modello leggero di rilevamento volti) si
// caricano SOLO qui, al primo controllo, mai all'apertura dell'app.
//
// Risponde true / false; null se il controllo non si può fare (modello non
// scaricabile, browser senza WebGL...): in quel caso decide chi chiama, e
// l'editor lascia passare la foto invece di bloccare per un nostro limite.

let modelPromise = null;

function loadModel() {
  if (!modelPromise) {
    modelPromise = Promise.all([import('@tensorflow/tfjs'), import('@tensorflow-models/blazeface')])
      .then(([, blazeface]) => blazeface.load({ maxFaces: 3, scoreThreshold: 0.75 }))
      .catch((err) => {
        modelPromise = null;
        throw err;
      });
  }
  return modelPromise;
}

async function toImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    // Il modello lavora a 128 px: ridurre prima evita di passare a WebGL
    // foto da 12 megapixel.
    const scale = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// file: File/Blob di un'immagine, oppure un URL già caricabile.
export async function hasFace(source) {
  try {
    const [model, input] = await Promise.all([loadModel(), source instanceof Blob ? toImage(source) : urlToCanvas(source)]);
    const faces = await model.estimateFaces(input, false);
    return faces.length > 0;
  } catch {
    return null;
  }
}

async function urlToCanvas(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('foto non raggiungibile');
  return toImage(await res.blob());
}
