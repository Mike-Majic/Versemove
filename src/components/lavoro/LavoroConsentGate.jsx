import { useState } from 'react';
import { setLavoroConsent } from '../../data/lavoro';
import '../AccessGate.css';

// Schermata di consenso mostrata entrando nel mondo Lavoro senza averlo
// ancora dato (o dopo averlo revocato dalle Impostazioni): dentro Lavoro,
// a differenza di ogni altro mondo, agli altri utenti di Lavoro si vede
// nome e cognome reali, non solo il nickname — per questo serve un
// consenso esplicito e separato dai Termini generali già accettati in
// registrazione. Stesso guscio visivo di AccessGate (stesse classi CSS).
export default function LavoroConsentGate({ world, onConsented, onDecline }) {
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
        <h2>Prima di entrare in Lavoro</h2>
        <p>
          In tutti gli altri mondi vedi e sei visto solo con il nickname. Nel mondo Lavoro, invece, il tuo
          nome e cognome reali saranno visibili agli altri utenti di Lavoro (aziende e candidati) — e a
          nessun altro, fuori da qui. Vedrai a tua volta il nome reale solo di chi ha dato lo stesso
          consenso.
        </p>
        <label className="rb-field rb-auth-checkbox-field" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>Acconsento al trattamento e alla visualizzazione dei miei dati personali nel mondo Lavoro</span>
        </label>
        {error && <p className="rb-privacy-error">{error}</p>}
        <div className="rb-adult-gate-actions">
          <button type="button" className="rb-adult-gate-decline" onClick={onDecline}>
            Torna indietro
          </button>
          <button type="button" className="rb-adult-gate-confirm" onClick={confirm} disabled={!checked || busy}>
            {busy ? 'Un attimo…' : 'Entra'}
          </button>
        </div>
      </div>
    </div>
  );
}
