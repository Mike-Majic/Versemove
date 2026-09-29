import { useTranslation } from 'react-i18next';
import './PublishedAt.css';

// Data e ora di pubblicazione, in piccolo, su tutto ciò che pubblicano utenti
// e bot (post, commenti, offerte, annunci, eventi, clip...): "Pubblicato il
// 29/09/2026 alle 14:32", nel formato della lingua di chi guarda. Il valore
// intero (con i secondi) resta nel title, per chi passa sopra col mouse.
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
  const f = formatPublished(at, i18n.language);
  if (!f) return null;
  return (
    <time className={`rb-published-at ${className}`.trim()} dateTime={new Date(at).toISOString()} title={f.full}>
      {t('common.publishedAt', { date: f.date, time: f.time })}
    </time>
  );
}
