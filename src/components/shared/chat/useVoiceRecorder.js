import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_VOICE_SECONDS, audioContext } from './chatMedia';

// Registratore dei vocali: MediaRecorder con audio/webm;codecs=opus dove
// c'è, altrimenti audio/mp4 (Safari). Massimo 2 minuti: allo scadere si
// ferma da solo e resta in attesa di Invia/Annulla. levels: le ultime 40
// intensità del microfono, per l'onda che si muove.
function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  if (MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus';
  if (MediaRecorder.isTypeSupported?.('audio/mp4')) return 'audio/mp4';
  if (MediaRecorder.isTypeSupported?.('audio/webm')) return 'audio/webm';
  return '';
}

export default function useVoiceRecorder() {
  const [state, setState] = useState('idle'); // idle | recording | stopped
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState([]);
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const stoppedRef = useRef(null); // Promise del blob finale

  const cleanupStream = () => {
    clearInterval(timerRef.current);
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => () => {
    try {
      if (recRef.current?.state === 'recording') recRef.current.stop();
    } catch {
      // già fermo
    }
    cleanupStream();
  }, []);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec || rec.state !== 'recording') return stoppedRef.current;
    rec.stop();
    return stoppedRef.current;
  }, []);

  const start = useCallback(async () => {
    setError('');
    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      setError('Questo browser non può registrare audio.');
      return false;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Non riesco ad accedere al microfono.');
      return false;
    }
    streamRef.current = stream;
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data?.size) chunksRef.current.push(e.data);
    };
    stoppedRef.current = new Promise((resolve) => {
      rec.onstop = () => {
        const durata = (Date.now() - startedAtRef.current) / 1000;
        const type = (rec.mimeType || mime || 'audio/webm').split(';')[0];
        const blob = new Blob(chunksRef.current, { type });
        cleanupStream();
        setState('stopped');
        resolve({ blob, mime: type, durata: Math.min(durata, MAX_VOICE_SECONDS) });
      };
    });
    const ctx = audioContext();
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      // Senza un'uscita Chrome può non elaborare il grafo: guadagno zero
      // verso le casse, così l'analizzatore lavora e non si sente niente.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      analyser.connect(mute);
      mute.connect(ctx.destination);
      sourceRef.current = source;
      analyserRef.current = analyser;
    }
    startedAtRef.current = Date.now();
    setElapsed(0);
    setLevels([]);
    rec.start(250);
    setState('recording');
    const buf = new Uint8Array(128);
    timerRef.current = setInterval(() => {
      const secs = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      const an = analyserRef.current;
      if (an) {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i += 1) peak = Math.max(peak, Math.abs(buf[i] - 128) / 128);
        setLevels((prev) => [...prev.slice(-39), Math.min(1, peak * 2.2)]);
      }
      if (secs >= MAX_VOICE_SECONDS) stop();
    }, 100);
    return true;
  }, [stop]);

  // Ferma (se serve) e restituisce { blob, mime, durata }.
  const finish = useCallback(async () => {
    const result = await stop();
    setState('idle');
    return result;
  }, [stop]);

  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state === 'recording') {
      rec.onstop = null;
      rec.stop();
    }
    cleanupStream();
    chunksRef.current = [];
    setState('idle');
    setElapsed(0);
    setLevels([]);
  }, []);

  return { state, elapsed, levels, error, start, finish, cancel };
}
