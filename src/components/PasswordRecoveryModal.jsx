import { useState } from 'react';
import { supabase } from '../data/supabaseClient';
import ModalOverlay from './ModalOverlay';
import './AuthModal.css';

// auth.updateUser risponde in inglese: qui il caso più probabile (riscrivere
// la stessa password di prima) diventa italiano, il resto un messaggio
// generico invece del testo tecnico.
function translatePasswordError(error) {
  if (/different from the old password/i.test(error?.message ?? '')) {
    return 'La nuova password deve essere diversa da quella attuale.';
  }
  return 'Non è stato possibile aggiornare la password. Riprova.';
}

// Si apre quando Supabase Auth manda l'evento PASSWORD_RECOVERY (link
// "Password dimenticata?" cliccato dalla mail, vedi App.jsx): a quel punto
// c'è già una sessione temporanea di recupero, qui basta la nuova password
// e auth.updateUser — nessuna vecchia password da chiedere.
export default function PasswordRecoveryModal({ open, onClose }) {
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('La password deve essere di almeno 8 caratteri.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('Le due password non coincidono.');
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(translatePasswordError(err));
      return;
    }
    setDone(true);
  };

  return (
    <ModalOverlay onClose={onClose} hasUnsavedChanges={!done && (password !== '' || passwordConfirm !== '')}>
      <form className="rb-auth-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h2>Scegli una nuova password</h2>

        {done ? (
          <p className="rb-auth-info">Password aggiornata.</p>
        ) : (
          <>
            <label className="rb-field">
              <span>Nuova password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label className="rb-field">
              <span>Conferma nuova password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                minLength={8}
                required
              />
            </label>
            {error && <p className="rb-auth-error">{error}</p>}
            <button type="submit" className="rb-btn-primary rb-auth-submit" disabled={busy}>
              {busy ? 'Un attimo…' : 'Aggiorna password'}
            </button>
          </>
        )}
      </form>
    </ModalOverlay>
  );
}
