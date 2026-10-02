import { useEffect, useRef, useState } from 'react';
import { listMediaDevices, deviceIdOf, isPlaceholder } from './localMedia';
import './calls.css';

// Livello del microfono: barra che si riempie con la voce (analyser Web
// Audio sulla traccia del microfono). Aggiorna il DOM direttamente, senza
// rendere React a ogni fotogramma.
export function MicLevel({ track }) {
  const barRef = useRef(null);
  useEffect(() => {
    if (!track || isPlaceholder(track) || track.readyState === 'ended') return undefined;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return undefined;
    let ctx;
    let raf = 0;
    try {
      ctx = new Ctx();
      // Creato fuori da un gesto può partire sospeso: senza resume() la
      // barra resterebbe ferma.
      ctx.resume?.().catch(() => {});
      const source = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        const level = track.enabled ? Math.min(1, rms * 4) : 0;
        if (barRef.current) barRef.current.style.transform = `scaleX(${level.toFixed(3)})`;
        raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      return undefined;
    }
    return () => {
      cancelAnimationFrame(raf);
      ctx?.close().catch(() => {});
    };
  }, [track]);
  const off = !track || isPlaceholder(track);
  return (
    <div className={`rb-mic-level ${off ? 'is-off' : ''}`} role="meter" aria-label="Livello del microfono" aria-valuemin={0} aria-valuemax={1}>
      <span ref={barRef} className="rb-mic-level-bar" />
    </div>
  );
}

// Scelta di microfono e fotocamera durante la chiamata, con il livello del
// microfono. stream: lo stream locale; onSwitch(kind, deviceId) ->
// Promise<{ error? }>; version: cambia quando cambiano le tracce.
export default function DevicePicker({ stream, onSwitch, version = 0, warning = '' }) {
  const [devices, setDevices] = useState({ audio: [], video: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const audioTrack = stream?.getAudioTracks()[0] ?? null;
  const videoTrack = stream?.getVideoTracks()[0] ?? null;

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listMediaDevices().then((d) => {
        if (!cancelled) setDevices(d);
      });
    load();
    navigator.mediaDevices?.addEventListener?.('devicechange', load);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', load);
    };
  }, [version]);

  const pick = async (kind, deviceId) => {
    if (!deviceId) return;
    setBusy(true);
    setError('');
    const res = await onSwitch(kind, deviceId);
    if (res?.error) setError(res.error);
    setBusy(false);
  };

  const select = (kind, label, track) => {
    const list = devices[kind];
    const current = deviceIdOf(track);
    return (
      <label className="rb-device-picker-field">
        <span>{label}</span>
        <select value={current} onChange={(e) => pick(kind, e.target.value)} disabled={busy || list.length === 0}>
          {!current && <option value="">{list.length ? 'Scegli…' : kind === 'audio' ? 'Nessun microfono' : 'Nessuna fotocamera'}</option>}
          {list.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="rb-device-picker" onClick={(e) => e.stopPropagation()}>
      {select('audio', '🎙️ Microfono', audioTrack)}
      <MicLevel key={audioTrack?.id ?? 'none'} track={audioTrack} />
      {select('video', '📷 Fotocamera', videoTrack)}
      {(error || warning) && <p className="rb-device-picker-warn">⚠️ {error || warning}</p>}
    </div>
  );
}
