// Compressione lato client delle clip prima dell'upload: taglia a un massimo
// di durata e ridisegna ogni fotogramma su un canvas più piccolo (max 720px
// di altezza), poi lo registra di nuovo con MediaRecorder — niente librerie
// pesanti (tipo ffmpeg.wasm), solo API native del browser. Se il browser non
// supporta captureStream/MediaRecorder (es. Safari più vecchi), fallisce e
// chi chiama può decidere se caricare comunque il file originale.
export function isCompressionSupported() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

// Bitrate video di destinazione (~1,5 Mbit/s a 720p: circa 11 MB al minuto).
const VIDEO_BITS_PER_SECOND = 1_500_000;
// Formati in ordine di preferenza: mp4 (H.264) si vede ovunque, iPhone
// compresi; webm solo dove mp4 non si può registrare.
const RECORDER_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export async function compressVideoClip(file, { maxDurationSec = 60, maxHeight = 720 } = {}) {
  if (!isCompressionSupported()) {
    throw new Error('unsupported');
  }

  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    let raf = null;
    let settled = false;
    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      URL.revokeObjectURL(objectUrl);
    };
    const fail = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error('Compressione fallita.'));
    };

    video.onerror = () => fail(new Error('Impossibile leggere il video.'));

    video.onloadedmetadata = () => {
      try {
        const duration = Math.min(video.duration || maxDurationSec, maxDurationSec);
        const scale = Math.min(1, maxHeight / (video.videoHeight || maxHeight));
        const width = Math.max(2, Math.round((video.videoWidth || 720) * scale / 2) * 2);
        const height = Math.max(2, Math.round((video.videoHeight || maxHeight) * scale / 2) * 2);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        const canvasStream = canvas.captureStream(30);
        let audioTracks = [];
        try {
          audioTracks = typeof video.captureStream === 'function' ? video.captureStream().getAudioTracks() : [];
        } catch {
          audioTracks = [];
        }
        const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);

        const mimeType = RECORDER_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
        if (!mimeType) throw new Error('unsupported');
        const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: VIDEO_BITS_PER_SECOND });
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        recorder.onerror = (e) => fail(e.error);
        recorder.onstop = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(new Blob(chunks, { type: mimeType.split(';')[0] }));
        };

        const draw = () => {
          ctx.drawImage(video, 0, 0, width, height);
          raf = requestAnimationFrame(draw);
        };

        video.currentTime = 0;
        video
          .play()
          .then(() => {
            recorder.start(250);
            draw();
          })
          .catch(fail);

        const stop = () => {
          if (recorder.state === 'recording') {
            video.pause();
            recorder.stop();
          }
        };
        video.ontimeupdate = () => {
          if (video.currentTime >= duration) stop();
        };
        // Durata sconosciuta (alcuni webm) o fine del file prima del limite.
        video.onended = stop;
      } catch (err) {
        fail(err);
      }
    };
  });
}
