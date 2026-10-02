// Microfono e fotocamera per le videochiamate (1:1 in CallModal, stanze in
// useMeshCall). Prima si chiedevano insieme (getUserMedia audio+video): se
// la fotocamera mancava o era occupata falliva tutto. Qui si chiedono uno
// alla volta, così si entra anche con il solo microfono o il solo video.
//
// Al posto del dispositivo che manca si mette una traccia "segnaposto"
// (video nero / audio muto): la connessione ha sempre una traccia audio e
// una video, e cambiare dispositivo dopo (o collegarne uno nuovo) è un
// semplice replaceTrack, senza rinegoziare la chiamata.

const LABELS = {
  audio: { il: 'il microfono', al: 'al microfono', Il: 'Il microfono', nessuno: 'Nessun microfono trovato', occupato: 'occupato' },
  video: { il: 'la fotocamera', al: 'alla fotocamera', Il: 'La fotocamera', nessuno: 'Nessuna fotocamera trovata', occupato: 'occupata' },
};

// Tipo di errore di getUserMedia: 'denied' | 'none' | 'busy' | 'other'.
export function mediaErrorKind(err) {
  const name = err?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'none';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'busy';
  return 'other';
}

// Messaggio per l'utente: permesso negato / nessun dispositivo / occupato.
export function mediaErrorMessage(kind, errKind) {
  const l = LABELS[kind];
  if (errKind === 'denied') return `Permesso ${l.al} negato: consentilo dalle impostazioni del browser.`;
  if (errKind === 'none') return `${l.nessuno}.`;
  if (errKind === 'busy') return `${l.Il} è ${l.occupato} da un'altra app.`;
  return `Non riesco ad accedere ${l.al}.`;
}

function constraintsFor(kind, deviceId) {
  const value = deviceId ? { deviceId: { exact: deviceId } } : true;
  return kind === 'audio' ? { audio: value } : { video: value };
}

async function getTrack(kind, deviceId) {
  const stream = await navigator.mediaDevices.getUserMedia(constraintsFor(kind, deviceId));
  return kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
}

// Traccia segnaposto: audio muto o video nero. isPlaceholder(track) la
// riconosce; stop() libera anche l'AudioContext/la canvas.
const placeholders = new WeakSet();
export const isPlaceholder = (track) => Boolean(track) && placeholders.has(track);

function placeholderTrack(kind) {
  try {
    if (kind === 'audio') {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const track = ctx.createMediaStreamDestination().stream.getAudioTracks()[0];
      const stop = track.stop.bind(track);
      track.stop = () => {
        stop();
        ctx.close().catch(() => {});
      };
      placeholders.add(track);
      return track;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const g = canvas.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, canvas.width, canvas.height);
    const track = canvas.captureStream(1).getVideoTracks()[0];
    placeholders.add(track);
    return track;
  } catch {
    return null;
  }
}

// -> { stream, hasAudio, hasVideo, warnings: [testo] }. Se nessuno dei due
// dispositivi è disponibile lancia un Error con i messaggi di entrambi.
export async function acquireLocalMedia({ audioDeviceId = null, videoDeviceId = null } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Questo browser non permette di usare microfono e fotocamera.');
  }
  const tracks = {};
  const warnings = [];
  // Uno alla volta: due richieste insieme su alcuni browser si pestano i
  // piedi (doppia finestra di permesso).
  for (const kind of ['audio', 'video']) {
    try {
      tracks[kind] = await getTrack(kind, kind === 'audio' ? audioDeviceId : videoDeviceId);
    } catch (err) {
      tracks[kind] = null;
      warnings.push(mediaErrorMessage(kind, mediaErrorKind(err)));
    }
  }
  if (!tracks.audio && !tracks.video) throw new Error(warnings.join(' '));
  const audio = tracks.audio ?? placeholderTrack('audio');
  const video = tracks.video ?? placeholderTrack('video');
  const stream = new MediaStream([audio, video].filter(Boolean));
  return { stream, hasAudio: Boolean(tracks.audio), hasVideo: Boolean(tracks.video), warnings };
}

// Microfoni e fotocamere del dispositivo (i nomi arrivano solo dopo il
// primo permesso). -> { audio: [{ deviceId, label }], video: [...] }
export async function listMediaDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    const pick = (type, base) =>
      all
        .filter((d) => d.kind === type && d.deviceId)
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${base} ${i + 1}` }));
    return { audio: pick('audioinput', 'Microfono'), video: pick('videoinput', 'Fotocamera') };
  } catch {
    return { audio: [], video: [] };
  }
}

// Cambia microfono o fotocamera durante la chiamata: nuova traccia nello
// stream locale e su tutte le connessioni (replaceTrack sui sender che
// mandano la traccia vecchia). La traccia nuova eredita acceso/spento.
// senders: RTCRtpSender[]; skipSenders: true per non toccarli (es. video
// mentre si condivide lo schermo). -> { track } | { error }
export async function switchLocalDevice(stream, kind, deviceId, senders = [], { skipSenders = false } = {}) {
  let track;
  try {
    track = await getTrack(kind, deviceId);
  } catch (err) {
    return { error: mediaErrorMessage(kind, mediaErrorKind(err)) };
  }
  const old = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
  if (old) {
    track.enabled = old.enabled || isPlaceholder(old);
    stream.removeTrack(old);
  }
  stream.addTrack(track);
  if (!skipSenders) {
    await Promise.all(
      senders.filter((s) => s.track?.kind === kind).map((s) => s.replaceTrack(track).catch(() => {}))
    );
  }
  old?.stop();
  return { track };
}

// Id del dispositivo che sta usando una traccia (per il selettore).
export function deviceIdOf(track) {
  if (!track || isPlaceholder(track)) return '';
  try {
    return track.getSettings?.().deviceId ?? '';
  } catch {
    return '';
  }
}
