import { useEffect, useRef, useState } from 'react';

// Ponte con un player YouTube incorporato via postMessage: ascolta la
// telemetria che il player manda da solo grazie a enablejsapi=1 nell'url
// (vedi data/youtubeSearch.js — nessuno script iframe_api caricato) e sa
// anche mandare comandi in senso opposto (play/pausa/stop/vai a un punto
// preciso), col protocollo standard {event:'command', func, args}. Usato
// sia dal mini-player di Musica sia dal player grande di Video così i due
// posti restano identici e i bug si sistemano in un punto solo.
export default function useYoutubeBridge(videoId, { onEnded } = {}) {
  const iframeRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    setIsPlaying(true);
    setDuration(0);
    setCurrentTime(0);
    if (!videoId) return undefined;
    const onMessage = (e) => {
      if (typeof e.origin !== 'string' || !e.origin.includes('youtube')) return;
      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      if (data.event === 'infoDelivery' && data.info) {
        const { currentTime: ct, duration: d, playerState } = data.info;
        if (typeof d === 'number' && d > 0) setDuration(d);
        if (typeof ct === 'number') setCurrentTime(ct);
        if (playerState === 1) setIsPlaying(true);
        else if (playerState === 2) setIsPlaying(false);
        if (playerState === 0) onEnded?.();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const postCommand = (func, args = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  };

  const togglePlay = () => {
    postCommand(isPlaying ? 'pauseVideo' : 'playVideo');
    setIsPlaying((v) => !v);
  };

  const stop = () => {
    postCommand('pauseVideo');
    postCommand('seekTo', [0, true]);
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const seekTo = (seconds) => {
    postCommand('seekTo', [seconds, true]);
    setCurrentTime(seconds);
  };

  return { iframeRef, isPlaying, duration, currentTime, togglePlay, stop, seekTo };
}

export function formatPlaybackTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
