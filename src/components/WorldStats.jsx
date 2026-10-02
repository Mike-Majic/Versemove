import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getWorldStats, compactCount } from '../data/worldStats';
import './WorldStats.css';

// Contatori accanto al nome del mondo nella barra in alto: iscritti e
// online (world_stats). Si aggiornano al cambio di mondo e ogni 60 s, solo
// a scheda visibile. I numeri scorrono fino al valore nuovo (niente scatto,
// salvo "riduci animazioni"). Sugli schermi stretti resta solo il numero
// online: gli iscritti compaiono al tocco. Forma lunga "N iscritti in
// questo mondo · N online"; se a quella larghezza toccherebbe i pulsanti a
// destra della barra torna alla forma corta "N iscritti" (data-short).

const REFRESH_MS = 60_000;
// Spazio minimo (px) fra il contatore e i pulsanti a destra della barra.
const ACTIONS_GAP_PX = 8;
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
  const { t, i18n } = useTranslation();
  const buttonRef = useRef(null);

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

  // Forma lunga o corta: si prova la lunga e, se arriva sopra ai pulsanti a
  // destra, si passa alla corta. L'attributo lo gestisce solo questo
  // effetto (React non lo tocca), così niente render in più.
  const hasStats = Boolean(stats);
  useLayoutEffect(() => {
    const el = buttonRef.current;
    if (!el) return undefined;
    const fit = () => {
      const actions = document.querySelector('.rb-topbar-actions');
      el.removeAttribute('data-short');
      if (!actions) return;
      const tooWide = el.getBoundingClientRect().right + ACTIONS_GAP_PX > actions.getBoundingClientRect().left;
      if (tooWide) el.setAttribute('data-short', '');
    };
    fit();
    window.addEventListener('resize', fit);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    const actions = document.querySelector('.rb-topbar-actions');
    if (actions) ro?.observe(actions);
    return () => {
      window.removeEventListener('resize', fit);
      ro?.disconnect();
    };
  }, [hasStats, expanded, i18n.language, world.id]);

  if (disabled || !stats) return null;

  const fmt = (n) => n.toLocaleString(i18n.language);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`rb-world-stats ${expanded ? 'expanded' : ''}`}
      onClick={() => setExpanded((v) => !v)}
      disabled={locked}
      aria-label={t('topbar.statsLabel', { subscribers: fmt(stats.iscritti), online: fmt(stats.online) })}
      title={t('topbar.statsLabel', { subscribers: fmt(stats.iscritti), online: fmt(stats.online) })}
    >
      <span className="rb-world-stats-iscritti">
        <strong>{compactCount(iscritti, i18n.language)}</strong>{' '}
        <span className="rb-world-stats-label-long">{t('topbar.statsSubscribersInWorld')}</span>
        <span className="rb-world-stats-label-short">{t('topbar.statsSubscribers')}</span>
      </span>
      <span className="rb-world-stats-sep" aria-hidden="true">·</span>
      <span className="rb-world-stats-online">
        <span className="rb-world-stats-dot" aria-hidden="true" />
        <strong>{compactCount(online, i18n.language)}</strong>
        <span className="rb-world-stats-online-label"> {t('topbar.statsOnline')}</span>
      </span>
    </button>
  );
}
