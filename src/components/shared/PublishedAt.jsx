import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './PublishedAt.css';

// Data e ora di pubblicazione, in piccolo, su tutto ciò che pubblicano utenti
// e bot (post, commenti, offerte, annunci, eventi, clip...), nella lingua di
// chi guarda: nelle prime 24 ore "Pubblicato 3 ore fa" (si aggiorna da sé
// ogni minuto), dopo "Pubblicato il 29/09/2026 alle 14:32". Data e ora
// complete restano sempre nel title, per chi passa sopra col mouse.
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatPublishedAgo(iso, lang, now = Date.now()) {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms >= DAY_MS) return null;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const min = Math.floor(Math.max(ms, 0) / 60_000);
  if (min < 1) return rtf.format(0, 'second');
  if (min < 60) return rtf.format(-min, 'minute');
  return rtf.format(-Math.floor(min / 60), 'hour');
}
export function formatPublished(iso, lang) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }),
    full: d.toLocaleString(lang),
  };
}

export default function PublishedAt({ at, className = '' }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  const recent = at && Date.now() - new Date(at).getTime() < DAY_MS;
  // Solo le date recenti si aggiornano ("5 minuti fa" → "6 minuti fa").
  useEffect(() => {
    if (!recent) return undefined;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [recent]);
  const f = formatPublished(at, i18n.language);
  if (!f) return null;
  const ago = formatPublishedAgo(at, i18n.language, now);
  return (
    <time className={`rb-published-at ${className}`.trim()} dateTime={new Date(at).toISOString()} title={f.full}>
      {ago ? t('common.publishedAgo', { ago }) : t('common.publishedAt', { date: f.date, time: f.time })}
    </time>
  );
}
