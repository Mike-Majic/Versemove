import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setLavoroConsent } from '../../data/lavoro';
import '../AccessGate.css';

// Schermata di consenso mostrata entrando nel mondo Lavoro senza averlo
// ancora dato (o dopo averlo revocato dalle Impostazioni): dentro Lavoro,
// a differenza di ogni altro mondo, agli altri utenti di Lavoro si vede
// nome e cognome reali (e le aziende la data di nascita completa), non
// solo il nickname — per questo serve un
// consenso esplicito e separato dai Termini generali già accettati in
// registrazione. Chi entra è anche SEMPRE visibile alle aziende verificate
// ("Cerca candidati"): non c'è un interruttore a parte, chi non vuole
// comparire disattiva il mondo Lavoro dalle Impostazioni (il server calcola
// lavoro_visibile_aziende da consenso + mondo abilitato). Stesso guscio
// visivo di AccessGate (stesse classi CSS).
export default function LavoroConsentGate({ world, onConsented, onDecline }) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setBusy(true);
    setError('');
    const { error: err } = await setLavoroConsent(true);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onConsented();
  };

  return (
    <div className="rb-adult-gate-overlay" style={{ '--accent': world.color }}>
      <div className="rb-adult-gate-card">
        <h2>{t('lavoroVisibility.consentTitle')}</h2>
        <p>{t('lavoroVisibility.consentNames')}</p>
        <p>{t('lavoroVisibility.consentCompanies')}</p>
        <p>
          <strong>{t('lavoroVisibility.consentOptOut')}</strong>
        </p>
        <label className="rb-field rb-auth-checkbox-field" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>{t('lavoroVisibility.consentCheckbox')}</span>
        </label>
        {error && <p className="rb-privacy-error">{error}</p>}
        <div className="rb-adult-gate-actions">
          <button type="button" className="rb-adult-gate-decline" onClick={onDecline}>
            {t('lavoroVisibility.consentBack')}
          </button>
          <button type="button" className="rb-adult-gate-confirm" onClick={confirm} disabled={!checked || busy}>
            {busy ? t('common.oneMoment') : t('lavoroVisibility.consentEnter')}
          </button>
        </div>
      </div>
    </div>
  );
}
