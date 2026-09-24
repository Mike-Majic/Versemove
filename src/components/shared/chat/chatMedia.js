import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../../data/supabaseClient';

// Allegati delle chat (Stanza MOD e chat dirette): tutti nel bucket privato
// chat-media, letti con URL firmati (vedi getChatAttachmentUrl in
// data/directChat.js). Stessi limiti del bucket, controllati qui PRIMA
// dell'upload per dare un messaggio chiaro invece di un errore del server.
export const BUCKET = 'chat-media';
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 10;
export const MAX_VOICE_SECONDS = 120;

const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'text/plain',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac',
  'video/mp4', 'video/quicktime',
]);

const BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip', txt: 'text/plain',
  webm: 'audio/webm', ogg: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac',
  mp4: 'video/mp4', mov: 'video/quicktime',
};

// Tipo MIME senza parametri (es. "audio/webm;codecs=opus" -> "audio/webm"),
// indovinato dall'estensione se il browser non lo dà (capita con HEIC).
export function mimeOf(file) {
  const raw = (file?.type || '').split(';')[0].trim().toLowerCase();
  if (raw && raw !== 'application/x-zip-compressed') return raw;
  if (raw === 'application/x-zip-compressed') return 'application/zip';
  const ext = (file?.name || '').split('.').pop()?.toLowerCase();
  return BY_EXT[ext] ?? '';
}

export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// null se va bene, altrimenti il motivo in italiano.
export function validateFile(file) {
  if (!file) return 'File non valido.';
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" pesa ${formatSize(file.size)}: il massimo è 20 MB.`;
  }
  if (!ALLOWED.has(mimeOf(file))) {
    return `"${file.name}": tipo di file non ammesso (foto, video, audio, PDF, Office, ZIP o TXT).`;
  }
  return null;
}

// 'immagine' | 'video' | 'audio' | 'documento'
export function kindOfMime(mime = '') {
  if (mime.startsWith('image/')) return 'immagine';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'documento';
}

// Etichetta e colore della scheda di un documento.
export function docBadge(mime = '', nome = '') {
  const ext = nome.split('.').pop()?.toLowerCase() ?? '';
  if (mime === 'application/pdf' || ext === 'pdf') return { label: 'PDF', color: '#e5484d' };
  if (mime.includes('word') || ext === 'doc' || ext === 'docx') return { label: 'DOC', color: '#2f7de1' };
  if (mime.includes('sheet') || mime.includes('excel') || ext === 'xls' || ext === 'xlsx') return { label: 'XLS', color: '#1f9d55' };
  if (mime.includes('presentation') || mime.includes('powerpoint') || ext === 'ppt' || ext === 'pptx') return { label: 'PPT', color: '#e8743b' };
  if (mime.includes('zip') || ext === 'zip') return { label: 'ZIP', color: '#8a8aa0' };
  if (mime === 'text/plain' || ext === 'txt') return { label: 'TXT', color: '#9aa0b4' };
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), color: '#6b6b80' };
}

export function safeFileName(name) {
  return (name || 'file').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-80) || 'file';
}

export function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Upload con avanzamento (supabase-js non lo dà): stessa richiesta
// dell'SDK (POST /storage/v1/object/<bucket>/<path>) fatta con XHR.
// onProgress(0..1). Risolve { path } oppure { error }.
export async function uploadWithProgress(path, file, onProgress) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { error: 'Devi essere loggato.' };
  const mime = mimeOf(file) || 'application/octet-stream';
  const url = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.setRequestHeader('content-type', mime);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve({ path });
        return;
      }
      let message = `Caricamento non riuscito (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText);
        if (/mime|type/i.test(body.message || body.error || '')) message = 'Tipo di file non ammesso.';
        else if (/size|large|exceed/i.test(body.message || body.error || '')) message = 'Il file supera i 20 MB.';
        else if (/row-level|policy|unauthor/i.test(body.message || body.error || '')) message = 'Non hai il permesso di caricare qui.';
        else if (body.message) message = body.message;
      } catch {
        // risposta non JSON: resta il messaggio generico.
      }
      resolve({ error: message });
    };
    xhr.onerror = () => resolve({ error: 'Errore di rete durante il caricamento.' });
    xhr.send(file);
  });
}

// Separatori di giorno: "Oggi", "Ieri", poi la data.
export function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return 'Oggi';
  if (dayKey(d) === dayKey(yesterday)) return 'Ieri';
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function timeLabel(date) {
  return new Date(date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// Un solo AudioContext per le forme d'onda e il registratore.
let sharedCtx = null;
export function audioContext() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new Ctx();
  return sharedCtx;
}
