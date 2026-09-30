import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WORLDS } from '../data/worlds';
import './UpdateToast.css';

// Bordo coi colori di tutti i mondi, come l'hub dei messaggi (DMHub).
const WORLD_COLORS = WORLDS.map((w) => w.color);
const TOAST_STYLE = { '--update-conic': `conic-gradient(${[...WORLD_COLORS, WORLD_COLORS[0]].join(', ')})` };

// Avviso "Nuova versione disponibile, ricarica." dopo un deploy.
//
// Non si appoggia all'aggiornamento del service worker (registration.update()
// in Chromium a volte resta in sospeso senza nemmeno chiedere sw.js: è il
// motivo per cui dopo un deploy servivano due ricariche). Si guarda invece
// l'index.html vero in rete: il nome del bundle principale
// (assets/index-<hash>.js) cambia a ogni build, quindi se quello online è
// diverso da quello in esecuzione c'è una versione nuova. Il ?v= impedisce
// alla precache di Workbox di rispondere con l'index.html vecchio.
//
// "Ricarica" toglie il service worker e le sue cache e ricarica: alla
// riapertura la pagina è quella nuova e il worker nuovo si reinstalla da sé.
// La ✕ rimanda al prossimo caricamento. Controllo dopo 10 s, poi ogni 5
// minuti finché la pagina resta aperta (solo con la scheda in primo piano)
// e ogni volta che si torna sulla scheda/finestra: con i soli 30 minuti di
// prima chi aveva il sito già aperto durante un deploy non vedeva l'avviso.
// Primo controllo subito dopo l'avvio: se online c'è già una versione più
// nuova (tipico dell'app installata, servita dal service worker con i file
// vecchi) la si prende da sola, senza chiedere.
const FIRST_CHECK_DELAY_MS = 1_500;
// Aggiornamento automatico anche tornando all'app dopo almeno un minuto in
// background (l'app installata spesso non viene mai chiusa del tutto).
const AUTO_UPDATE_AFTER_HIDDEN_MS = 60_000;
// Contro i giri infiniti: una sola ricarica automatica per versione online.
const AUTO_KEY = 'rb-auto-updated-to';
const CHECK_EVERY_MS = 5 * 60 * 1000;
// Tornando sulla scheda non più di un controllo ogni 30 s.
const MIN_GAP_MS = 30_000;
const BUNDLE_RE = /assets\/index-[\w-]+\.js/;

function runningBundle() {
  for (const s of document.scripts) {
    const m = String(s.src).match(BUNDLE_RE);
    if (m) return m[0];
  }
  return null;
}

async function onlineBundle() {
  const url = `${import.meta.env.BASE_URL}index.html?v=${Date.now()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.text()).match(BUNDLE_RE)?.[0] ?? null;
}

async function reloadToNewVersion() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Anche senza riuscire a pulire, la ricarica prova comunque.
  }
  window.location.reload();
}

export default function UpdateToast() {
  const { t } = useTranslation();
  const [newVersion, setNewVersion] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // In sviluppo (vite dev) non c'è un bundle con hash: niente controllo.
    const current = runningBundle();
    if (!current) return undefined;
    let stopped = false;
    let lastCheck = 0;
    let hiddenAt = 0;
    const check = async ({ auto = false } = {}) => {
      if (stopped || document.visibilityState === 'hidden') return;
      if (!auto && Date.now() - lastCheck < MIN_GAP_MS) return;
      lastCheck = Date.now();
      try {
        const online = await onlineBundle();
        if (stopped || !online || online === current) return;
        let already = null;
        try {
          already = sessionStorage.getItem(AUTO_KEY);
        } catch {
          // sessionStorage non disponibile: niente ricarica automatica.
          already = online;
        }
        if (auto && already !== online) {
          try {
            sessionStorage.setItem(AUTO_KEY, online);
          } catch {
            // ignorato
          }
          reloadToNewVersion();
          return;
        }
        setNewVersion(true);
      } catch {
        // Offline o rete che non risponde: si riprova al prossimo giro.
      }
    };
    const first = setTimeout(() => check({ auto: true }), FIRST_CHECK_DELAY_MS);
    const every = setInterval(check, CHECK_EVERY_MS);
    const onBack = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const longAway = hiddenAt && Date.now() - hiddenAt >= AUTO_UPDATE_AFTER_HIDDEN_MS;
      hiddenAt = 0;
      check({ auto: Boolean(longAway) });
    };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(every);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, []);

  if (!newVersion || dismissed) return null;

  return (
    <div className="rb-update-toast" style={TOAST_STYLE} role="status" aria-live="polite">
      <div className="rb-update-inner">
        <span className="rb-update-text">{t('common.updateAvailable')}</span>
        <button type="button" className="rb-update-btn" onClick={reloadToNewVersion}>
          {t('common.reload')}
        </button>
        <button type="button" className="rb-update-close" aria-label={t('common.close')} onClick={() => setDismissed(true)}>
          ✕
        </button>
      </div>
    </div>
  );
}
