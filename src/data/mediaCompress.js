import { supabase } from './supabaseClient';
import { compressVideoClip } from './videoCompress';

// Compressione di foto e video PRIMA di ogni caricamento (post, album,
// avatar, chat, annunci, eventi, documenti in foto...): meno spazio occupato
// e soprattutto meno traffico, perché ogni visualizzazione scarica il file.
// Mai bloccante: se il browser non sa comprimere, o il risultato non è più
// leggero, si carica l'originale.
//
// Foto: lato lungo al massimo PHOTO_MAX_SIDE, WebP (JPEG dove il browser non
// sa scrivere WebP). GIF lasciate stare (perderebbero l'animazione).
// Video: oltre VIDEO_MIN_BYTES, ricodificati a 720p (~1,5 Mbit/s).

const PHOTO_MAX_SIDE = 2048;
const PHOTO_QUALITY = 0.82;
// Sotto questa soglia una foto già entro le misure resta com'è.
const PHOTO_MIN_BYTES = 300 * 1024;
const VIDEO_MIN_BYTES = 8 * 1024 * 1024;
// Durata massima di un video ricompresso (oltre, resta l'originale): la
// ricompressione nel browser dura quanto il video.
const VIDEO_MAX_SECONDS = 10 * 60;
const COMPRESSIBLE_IMAGES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

// Spazio per utente (deve coincidere con storage_quota_bytes() sul server).
export const USER_STORAGE_QUOTA_BYTES = 200 * 1024 * 1024;

function renamed(name, ext) {
  const base = String(name || 'file').replace(/\.[^.]*$/, '');
  return `${base}.${ext}`;
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // formato non decodificabile così (es. HEIC fuori da Safari): si prova con <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export async function compressPhoto(file) {
  if (!COMPRESSIBLE_IMAGES.has(file.type)) return file;
  const source = await decodeImage(file);
  const w = source.width;
  const h = source.height;
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h));
  if (scale === 1 && file.size < PHOTO_MIN_BYTES && file.type !== 'image/heic' && file.type !== 'image/heif') return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  let blob = await toBlob(canvas, 'image/webp', PHOTO_QUALITY);
  let ext = 'webp';
  if (!blob || blob.type !== 'image/webp') {
    // Browser senza WebP in scrittura: JPEG, ma non per i PNG (la
    // trasparenza diventerebbe nera).
    if (file.type === 'image/png') return file;
    blob = await toBlob(canvas, 'image/jpeg', PHOTO_QUALITY);
    ext = 'jpg';
  }
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], renamed(file.name, ext), { type: blob.type, lastModified: Date.now() });
}

async function videoDuration(file) {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    return video.duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressVideo(file, { allowWebm = true } = {}) {
  if (file.size < VIDEO_MIN_BYTES) return file;
  const duration = await videoDuration(file);
  if (Number.isFinite(duration) && duration > VIDEO_MAX_SECONDS) return file;
  // Durata sconosciuta (webm registrati da un browser): si va fino alla fine
  // del video (compressVideoClip si ferma su 'ended').
  const maxDurationSec = Number.isFinite(duration) ? duration + 1 : VIDEO_MAX_SECONDS;
  const blob = await compressVideoClip(file, { maxDurationSec, maxHeight: 720 });
  if (!blob || blob.size >= file.size) return file;
  const ext = /mp4/.test(blob.type) ? 'mp4' : 'webm';
  // La chat non accetta webm (vedi bucket chat-media): lì resta l'originale.
  if (ext === 'webm' && !allowWebm) return file;
  return new File([blob], renamed(file.name, ext), { type: blob.type, lastModified: Date.now() });
}

// Il file da caricare al posto di `file`: compresso se conviene,
// altrimenti l'originale. Non lancia mai errori.
export async function compressForUpload(file, options = {}) {
  if (!file?.type) return file;
  try {
    if (file.type.startsWith('image/')) return await compressPhoto(file);
    if (file.type.startsWith('video/')) return await compressVideo(file, options);
  } catch {
    // compressione non riuscita: si carica l'originale
  }
  return file;
}

// Spazio già usato da chi è loggato ({ used, limit } in byte), o null se
// non si riesce a saperlo (in quel caso decide il server).
export async function myStorageUsage() {
  try {
    const { data, error } = await supabase.rpc('my_storage_usage');
    if (error || !data) return null;
    // limit null = nessun tetto (owner e moderatori).
    return { used: Number(data.used) || 0, limit: data.limit == null ? Infinity : Number(data.limit) };
  } catch {
    return null;
  }
}

const formatMb = (bytes) => `${Math.round(bytes / (1024 * 1024))} MB`;

export const QUOTA_ERROR = `Hai finito lo spazio a disposizione (${formatMb(USER_STORAGE_QUOTA_BYTES)}). Elimina qualche foto o video per caricarne altri.`;

// Da chiamare prima di ogni caricamento: { file } compresso e pronto,
// oppure { error } se lo spazio dell'utente è finito. Il controllo vero lo
// fa il server (policy su storage.objects), questo evita solo di caricare
// per niente.
export async function prepareUpload(file, options = {}) {
  const ready = await compressForUpload(file, options);
  const usage = await myStorageUsage();
  if (usage && usage.used + ready.size > usage.limit) return { error: QUOTA_ERROR };
  return { file: ready };
}
