import { useEffect, useRef, useState } from 'react';
import { audioContext, formatDuration } from './chatMedia';

const BARS = 36;
const peaksCache = new Map();

// Picchi della forma d'onda calcolati dal file (AudioContext.decodeAudioData),
// una volta per URL.
async function computePeaks(url) {
  if (peaksCache.has(url)) return peaksCache.get(url);
  const ctx = audioContext();
  if (!ctx) return null;
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const audio = await ctx.decodeAudioData(buf);
  const data = audio.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / BARS));
  const peaks = [];
  for (let i = 0; i < BARS; i += 1) {
    let max = 0;
    for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += 8) max = Math.max(max, Math.abs(data[j]));
    peaks.push(max);
  }
  const top = Math.max(...peaks, 0.01);
  const norm = peaks.map((p) => Math.max(0.12, p / top));
  const result = { peaks: norm, duration: audio.duration };
  peaksCache.set(url, result);
  return result;
}

// Player dei vocali: play/pausa, onda (colorata fin dove si è ascoltato,
// clic per saltare) e durata.
export default function VoicePlayer({ src, durata }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!src) return undefined;
    let cancelled = false;
    computePeaks(src)
      .then((r) => {
        if (!cancelled) setInfo(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [src]);

  const total = durata || info?.duration || 0;
  const peaks = info?.peaks ?? Array.from({ length: BARS }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 1.7)));
  const progress = total ? Math.min(1, current / total) : 0;

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const seek = (e) => {
    const a = audioRef.current;
    if (!a || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * total;
  };

  return (
    <div className={`rb-voice ${playing ? 'playing' : ''}`}>
      <button type="button" className="rb-voice-play" onClick={toggle} aria-label={playing ? 'Pausa' : 'Ascolta il vocale'} disabled={!src}>
        {playing ? '❚❚' : '▶'}
      </button>
      <button type="button" className="rb-voice-wave" onClick={seek} aria-label="Vai a un punto del vocale" tabIndex={-1}>
        {peaks.map((p, i) => (
          <span key={i} className={i / peaks.length < progress ? 'on' : ''} style={{ height: `${Math.round(p * 100)}%` }} />
        ))}
      </button>
      <span className="rb-voice-time">{formatDuration(playing || current ? current : total)}</span>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrent(0);
          }}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        />
      )}
    </div>
  );
}
