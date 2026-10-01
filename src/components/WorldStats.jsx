import { useEffect, useRef, useState } from 'react';
import { getWorldStats, compactCount } from '../data/worldStats';
import './WorldStats.css';

// Contatori accanto al nome del mondo nella barra in alto: iscritti e
// online (world_stats). Si aggiornano al cambio di mondo e ogni 60 s, solo
// a scheda visibile. I numeri scorrono fino al valore nuovo (niente scatto,
// salvo "riduci animazioni"). Sugli schermi stretti resta solo il numero
// online: gli iscritti compaiono al tocco.

const REFRESH_MS = 60_000;
const TWEEN_MS = 700;

function useAnimatedNumber(target) {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const shownRef = useRef(target);
  useEffect(() => {
    if (target == null) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = shownRef.current ?? target;
    if (reduce || from === target) {
      shownRef.current = target;
      setShown(target);
      return undefined;
    }
    fromRef.current = from;
    const start = performance.now();
    let raf = 0;
    const step = (now) => {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      const eased = 1 - (1 - t) ** 3;
      const v = fromRef.current + (target - fromRef.current) * eased;
      shownRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
      else shownRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

// locked: account bloccato (pulsanti della barra spenti, vedi TopBar).
export default function WorldStats({ world, locked = false }) {
  const [stats, setStats] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const iscritti = useAnimatedNumber(stats?.iscritti ?? null);
  const online = useAnimatedNumber(stats?.online ?? null);
  const disabled = world.id === 'bambini';

  useEffect(() => {
    if (disabled) return undefined;
    let cancelled = false;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      getWorldStats(world.id).then((s) => {
        if (!cancelled && s) setStats(s);
      });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [world.id, disabled]);

  useEffect(() => {
    if (!expanded) return undefined;
    const t = setTimeout(() => setExpanded(false), 4000);
    return () => clearTimeout(t);
  }, [expanded]);

  if (disabled || !stats) return null;

  return (
    <button
      type="button"
      className={`rb-world-stats ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded((v) => !v)}
      disabled={locked}
      aria-label={`${stats.iscritti} iscritti, ${stats.online} online`}
      title={`${stats.iscritti.toLocaleString('it-IT')} iscritti · ${stats.online.toLocaleString('it-IT')} online`}
    >
      <span className="rb-world-stats-iscritti">
        <strong>{compactCount(iscritti)}</strong> iscritti
      </span>
      <span className="rb-world-stats-sep" aria-hidden="true">·</span>
      <span className="rb-world-stats-online">
        <span className="rb-world-stats-dot" aria-hidden="true" />
        <strong>{compactCount(online)}</strong>
        <span className="rb-world-stats-online-label"> online</span>
      </span>
    </button>
  );
}
