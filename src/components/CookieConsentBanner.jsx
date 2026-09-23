import { useState } from 'react';
import { getStoredCookieConsent, setCookieConsent } from '../data/cookieConsent';
import { setProfilazioneConsent } from '../data/accounts';
import { isAdult } from '../data/age';
import './CookieConsentBanner.css';

// Banner al primo accesso (Accetta tutto / Solo necessari / Personalizza),
// come richiesto: nessuna rete pubblicitaria esterna, solo localStorage +
// (se loggato) il profilo, vedi data/cookieConsent.js. Resta visibile finché
// non si sceglie: è fisso in basso, non blocca la navigazione né il globo.
export default function CookieConsentBanner({ user, onOpenPrivacyInfo }) {
  const [choice, setChoice] = useState(() => getStoredCookieConsent());
  const [expanded, setExpanded] = useState(false);
  const [adPref, setAdPref] = useState(() => Boolean(user?.consensoProfilazioneAt));
  const [busy, setBusy] = useState(false);
  const isUserAdult = isAdult(user?.dataNascita);

  if (choice) return null;

  const save = async (scelta, { applyAdPref = false } = {}) => {
    setBusy(true);
    if (applyAdPref && user && isUserAdult && adPref !== Boolean(user?.consensoProfilazioneAt)) {
      await setProfilazioneConsent(adPref);
    }
    await setCookieConsent(scelta, user);
    setBusy(false);
    setChoice(scelta);
  };

  return (
    <div className="rb-cookie-banner" role="dialog" aria-label="Consenso cookie">
      <div className="rb-cookie-banner-inner">
        <p className="rb-cookie-banner-text">
          Usiamo solo i cookie/la memoria locale necessari a far funzionare Versemove (restare collegato, ricordare le tue
          preferenze). Niente reti pubblicitarie esterne.{' '}
          <button type="button" className="rb-cookie-banner-link" onClick={onOpenPrivacyInfo}>
            Leggi di più
          </button>
        </p>

        {expanded && (
          <div className="rb-cookie-banner-options">
            <label className="rb-cookie-banner-option">
              <input type="checkbox" checked disabled />
              <span>
                <strong>Necessari</strong>
                <small>Sempre attivi: senza questi l'app non funziona.</small>
              </span>
            </label>
            <label className="rb-cookie-banner-option">
              <input
                type="checkbox"
                checked={adPref}
                disabled={!user || !isUserAdult}
                onChange={(e) => setAdPref(e.target.checked)}
              />
              <span>
                <strong>Pubblicità personalizzata</strong>
                <small>
                  {!user
                    ? 'Accedi per gestire questa opzione: per ora resta disattivata.'
                    : !isUserAdult
                    ? 'Non disponibile sotto i 18 anni.'
                    : 'Oggi la pubblicità è comunque legata solo alla pagina che stai guardando.'}
                </small>
              </span>
            </label>
          </div>
        )}

        <div className="rb-cookie-banner-actions">
          {expanded ? (
            <button type="button" className="rb-btn-primary" disabled={busy} onClick={() => save('personalizza', { applyAdPref: true })}>
              Salva preferenze
            </button>
          ) : (
            <>
              <button type="button" className="rb-btn-ghost" disabled={busy} onClick={() => save('necessari')}>
                Solo necessari
              </button>
              <button type="button" className="rb-btn-ghost" disabled={busy} onClick={() => setExpanded(true)}>
                Personalizza
              </button>
              <button type="button" className="rb-btn-primary" disabled={busy} onClick={() => save('tutto')}>
                Accetta tutto
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
