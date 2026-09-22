import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { registerAccount, loginAccount, resendConfirmationEmail } from '../data/accounts';
import { setRememberMe } from '../data/supabaseClient';
import { computeAge } from '../data/age';
import { WORLDS } from '../data/worlds';
import { SUPPORTED_LANGUAGES, setAppLanguage } from '../i18n';
import { translateWorld } from '../i18n/worldLabels';
import ModalOverlay from './ModalOverlay';
import TermsModal from './TermsModal';
import './AuthModal.css';

// Preimpostazioni più comuni per i pronomi (valori stabili, mai tradotti:
// sono ciò che si manda a registerAccount — solo l'ETICHETTA mostrata
// cambia lingua, letta da auth.pronouns.* nei file di traduzione).
const PRONOMI_PRESETS = [
  { value: 'non_specificato', key: 'unspecified' },
  { value: 'lui', key: 'he' },
  { value: 'lei', key: 'she' },
  { value: 'loro', key: 'they' },
  { value: 'altro', key: 'other' },
];

const PARTITA_IVA_PATTERN = /^\d{11}$/;
const CODICE_FISCALE_PATTERN = /^[A-Za-z0-9]{11,16}$/;
const PEC_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SDI_PATTERN = /^([A-Za-z0-9]{7}|0000000)$/;

// Accedi/Registrati con account veri, salvati su Supabase (non più solo
// localStorage): la registrazione raccoglie nome utente, nickname, mail,
// password, data di nascita, cellulare, mail di backup, tipo account
// (persona/azienda), genere, pronomi, consensi e allegati facoltativi. Il
// ruolo si assegna da solo in base alla mail (lato server, vedi la funzione
// di registrazione su Supabase) — qui non si sceglie mai.
export default function AuthModal({ open, onClose, onLogin }) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberChecked, setRememberChecked] = useState(true);
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [dataNascita, setDataNascita] = useState('');
  const [phone, setPhone] = useState('');
  const [backupEmail, setBackupEmail] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [tipoAccount, setTipoAccount] = useState('persona');
  const [ragioneSociale, setRagioneSociale] = useState('');
  const [partitaIva, setPartitaIva] = useState('');
  const [codiceFiscale, setCodiceFiscale] = useState('');
  const [pec, setPec] = useState('');
  const [codiceSdi, setCodiceSdi] = useState('');
  // Niente valore di default valido: costringe a una scelta esplicita,
  // niente "Altro"/"Preferisco non specificare" (richiesta esplicita).
  const [genere, setGenere] = useState('');
  const [pronomiPreset, setPronomiPreset] = useState('non_specificato');
  const [pronomiCustom, setPronomiCustom] = useState('');
  // Parte dalla lingua già attiva (rilevata dal browser o già scelta in
  // precedenza su questo dispositivo, vedi i18n/index.js): cambiarla qui
  // aggiorna subito TUTTO il sito (setAppLanguage), non solo il modulo —
  // è il punto "diventa della lingua selezionata" della richiesta.
  const [lingua, setLingua] = useState(i18n.language);
  // Tutti i mondi abilitati di default: chi si registra può deselezionarne
  // alcuni (es. vuole usare solo il mondo Nerd), non deve spuntarli a mano
  // uno per uno per averli tutti.
  const [mondiAbilitati, setMondiAbilitati] = useState(WORLDS.map((w) => w.id));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [consensoMarketing, setConsensoMarketing] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  // Mail per cui serve ancora confermare l'indirizzo: se valorizzata, sotto
  // al messaggio compare un pulsante per rimandare la mail (niente bisogno
  // di rifare la registrazione — l'account esiste già, solo non confermato).
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState('');
  const [resendOk, setResendOk] = useState(false);

  // Ogni volta che si riapre, si riparte dalla scheda Accedi: altrimenti
  // chi ha lasciato aperta "Registrati" senza inviare (es. per ripensarci)
  // ritroverebbe quella scheda, con i campi già scritti, la volta dopo.
  useEffect(() => {
    if (open) {
      setMode('login');
      setError('');
      setInfo('');
      setPendingConfirmEmail('');
      setResendOk(false);
      // I consensi si azzerano ad ogni riapertura: una spunta lasciata da
      // una visita precedente non deve valere come accettazione per un
      // nuovo tentativo di registrazione.
      setTermsAccepted(false);
      setConsensoMarketing(false);
    }
  }, [open]);

  if (!open) return null;

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setInfo('');
  };

  const finishAuth = (account, notice) => {
    // user.name resta popolato (dal nickname) per compatibilità con tutto
    // il resto dell'app, che già lo usa ovunque. Niente password nello
    // stato "user": qui arriva già il profilo (senza password, Supabase
    // Auth la tiene per conto suo, non passa mai dal client in chiaro).
    onLogin({ ...account, name: account.nickname }, notice);
    setError('');
    setInfo('');
  };

  const submitLogin = async (e) => {
    e.preventDefault();
    // Va scritta prima di accedere: la sessione la legge subito, appena
    // signInWithPassword la salva.
    setRememberMe(rememberChecked);
    setBusy(true);
    setResendOk(false);
    const { account, error: err, needsEmailConfirmation } = await loginAccount(loginEmail, loginPassword);
    setBusy(false);
    if (err) {
      setError(err);
      setPendingConfirmEmail(needsEmailConfirmation ? loginEmail : '');
      return;
    }
    finishAuth(account);
  };

  const resendConfirmation = async () => {
    setBusy(true);
    const { error: err } = await resendConfirmationEmail(pendingConfirmEmail);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setResendOk(true);
  };

  const onFilesChosen = (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setAttachments((prev) => [...prev, ...files]);
  };

  const submitRegister = async (e) => {
    e.preventDefault();
    setError('');
    // Chi si registra non ha ancora scelto: resta ricordato di default,
    // altrimenti erediterebbe silenziosamente un "non ricordarmi" lasciato
    // da un login precedente su questo stesso browser.
    setRememberMe(true);

    if (password !== passwordConfirm) {
      setError(t('auth.errors.passwordMismatch'));
      return;
    }
    // Il DB ora rifiuta comunque chi ha meno di 14 anni (o nessuna data di
    // nascita): qui si intercetta il caso "età troppo bassa" prima di
    // arrivare a un generico "Database error saving new user" di Supabase.
    // La data mancante resta gestita dal controllo già esistente lato
    // registerAccount, che dà un messaggio diverso e più completo.
    const age = computeAge(dataNascita);
    if (age !== null && age < 14) {
      setError(t('auth.errors.tooYoung'));
      return;
    }
    if (!genere) {
      setError(t('auth.errors.genderRequired'));
      return;
    }
    if (!mondiAbilitati.length) {
      setError(t('auth.errors.worldsRequired'));
      return;
    }
    if (!termsAccepted) {
      setError(t('auth.errors.termsRequired'));
      return;
    }
    if (tipoAccount === 'azienda') {
      if (!ragioneSociale.trim()) {
        setError(t('auth.errors.companyNameRequired'));
        return;
      }
      if (!PARTITA_IVA_PATTERN.test(partitaIva.trim())) {
        setError(t('auth.errors.vatInvalid'));
        return;
      }
      if (codiceFiscale.trim() && !CODICE_FISCALE_PATTERN.test(codiceFiscale.trim())) {
        setError(t('auth.errors.taxCodeInvalid'));
        return;
      }
      if (!pec.trim() && !codiceSdi.trim()) {
        setError(t('auth.errors.pecOrSdiRequired'));
        return;
      }
      if (pec.trim() && !PEC_PATTERN.test(pec.trim())) {
        setError(t('auth.errors.pecInvalid'));
        return;
      }
      if (codiceSdi.trim() && !SDI_PATTERN.test(codiceSdi.trim())) {
        setError(t('auth.errors.sdiInvalid'));
        return;
      }
    }

    const pronomi = pronomiPreset === 'altro'
      ? pronomiCustom.trim()
      : t(`auth.pronouns.${PRONOMI_PRESETS.find((p) => p.value === pronomiPreset)?.key}`, '');

    setBusy(true);
    const { account, error: err, needsEmailConfirmation, attachmentError } = await registerAccount({
      username,
      nickname,
      email,
      password,
      phone,
      backupEmail,
      attachments,
      dataNascita,
      tipoAccount,
      ragioneSociale: tipoAccount === 'azienda' ? ragioneSociale : '',
      partitaIva: tipoAccount === 'azienda' ? partitaIva : '',
      codiceFiscale: tipoAccount === 'azienda' ? codiceFiscale : '',
      pec: tipoAccount === 'azienda' ? pec : '',
      codiceSdi: tipoAccount === 'azienda' ? codiceSdi : '',
      genere,
      pronomi,
      termsAcceptedAt: new Date().toISOString(),
      consensoMarketing,
      mondiAbilitati,
      lingua,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    if (needsEmailConfirmation) {
      setInfo(t('auth.info.accountCreated'));
      setPendingConfirmEmail(email);
      setResendOk(false);
      setMode('login');
      return;
    }
    finishAuth(account, attachmentError);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form
        className="rb-auth-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={mode === 'login' ? submitLogin : submitRegister}
      >
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label={t('common.close')}>✕</button>
        <h2>{mode === 'login' ? t('auth.title.login') : t('auth.title.register')}</h2>

        <div className="rb-auth-tabs">
          <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>
            {t('auth.tabs.login')}
          </button>
          <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>
            {t('auth.tabs.register')}
          </button>
        </div>

        {mode === 'login' ? (
          <>
            <label className="rb-field">
              <span>{t('auth.fields.mail')}</span>
              <input
                type="email"
                name="email"
                id="login-email"
                autoFocus
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </label>
            <label className="rb-field">
              <span>{t('auth.fields.password')}</span>
              <input
                type="password"
                name="password"
                id="login-password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </label>
            <label className="rb-field rb-auth-checkbox-field">
              <input type="checkbox" checked={rememberChecked} onChange={(e) => setRememberChecked(e.target.checked)} />
              <span>{t('auth.fields.rememberMe')}</span>
            </label>
          </>
        ) : (
          <>
            <label className="rb-field">
              <span>{t('auth.fields.username')}</span>
              <input type="text" autoFocus autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
            </label>
            <label className="rb-field">
              <span>{t('auth.fields.nickname')}</span>
              <input type="text" autoComplete="off" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </label>
            <label className="rb-field">
              <span>{t('auth.fields.mail')}</span>
              <input type="email" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="rb-field">
              <span>{t('auth.fields.password')}</span>
              <input
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="rb-field">
              <span>{t('auth.fields.confirmPassword')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </label>
            <label className="rb-field">
              <span>{t('auth.fields.birthDate')}</span>
              <input
                type="date"
                autoComplete="off"
                value={dataNascita}
                min="1900-01-01"
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDataNascita(e.target.value)}
              />
              <span className="rb-auth-field-hint">{t('auth.fields.birthDateHint')}</span>
            </label>
            <label className="rb-field">
              <span>{t('auth.fields.phone')}</span>
              <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="rb-field">
              <span>{t('auth.fields.backupEmail')}</span>
              <input type="email" value={backupEmail} onChange={(e) => setBackupEmail(e.target.value)} />
            </label>
            <label className="rb-field">
              <span>{t('auth.fields.attachments')}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={onFilesChosen} />
              {attachments.length > 0 && (
                <span className="rb-auth-attachments-count">
                  {t('auth.fields.attachmentsCount', { count: attachments.length })}
                </span>
              )}
            </label>

            <label className="rb-field">
              <span>{t('auth.fields.language')}</span>
              <select
                value={lingua}
                onChange={(e) => {
                  setLingua(e.target.value);
                  setAppLanguage(e.target.value);
                }}
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>{l.nativeLabel}</option>
                ))}
              </select>
              <span className="rb-auth-field-hint">{t('auth.fields.languageHint')}</span>
            </label>

            <div className="rb-field">
              <span>{t('auth.fields.accountType')}</span>
              <div className="rb-auth-segmented">
                <button
                  type="button"
                  className={tipoAccount === 'persona' ? 'active' : ''}
                  onClick={() => setTipoAccount('persona')}
                >
                  {t('auth.accountType.person')}
                </button>
                <button
                  type="button"
                  className={tipoAccount === 'azienda' ? 'active' : ''}
                  onClick={() => setTipoAccount('azienda')}
                >
                  {t('auth.accountType.company')}
                </button>
              </div>
            </div>

            {tipoAccount === 'azienda' && (
              <>
                <label className="rb-field">
                  <span>{t('auth.fields.companyName')}</span>
                  <input
                    type="text"
                    autoComplete="organization"
                    value={ragioneSociale}
                    onChange={(e) => setRagioneSociale(e.target.value)}
                  />
                </label>
                <label className="rb-field">
                  <span>{t('auth.fields.vatNumber')}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={11}
                    autoComplete="off"
                    value={partitaIva}
                    onChange={(e) => setPartitaIva(e.target.value.replace(/\D/g, ''))}
                  />
                  <span className="rb-auth-field-hint">{t('auth.fields.vatNumberHint')}</span>
                </label>
                <label className="rb-field">
                  <span>{t('auth.fields.taxCode')}</span>
                  <input
                    type="text"
                    autoComplete="off"
                    value={codiceFiscale}
                    onChange={(e) => setCodiceFiscale(e.target.value.toUpperCase())}
                  />
                </label>
                <label className="rb-field">
                  <span>{t('auth.fields.pec')}</span>
                  <input type="email" autoComplete="off" value={pec} onChange={(e) => setPec(e.target.value)} />
                </label>
                <label className="rb-field">
                  <span>{t('auth.fields.sdiCode')}</span>
                  <input
                    type="text"
                    maxLength={7}
                    autoComplete="off"
                    value={codiceSdi}
                    onChange={(e) => setCodiceSdi(e.target.value.toUpperCase())}
                  />
                  <span className="rb-auth-field-hint">{t('auth.fields.sdiCodeHint')}</span>
                </label>
              </>
            )}

            <label className="rb-field">
              <span>{t('auth.fields.gender')}</span>
              <select value={genere} onChange={(e) => setGenere(e.target.value)}>
                <option value="" disabled>{t('auth.gender.placeholder')}</option>
                <option value="uomo">{t('auth.gender.male')}</option>
                <option value="donna">{t('auth.gender.female')}</option>
              </select>
            </label>

            <label className="rb-field">
              <span>{t('auth.fields.pronouns')}</span>
              <select value={pronomiPreset} onChange={(e) => setPronomiPreset(e.target.value)}>
                {PRONOMI_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{t(`auth.pronouns.${p.key}`)}</option>
                ))}
              </select>
              {pronomiPreset === 'altro' && (
                <input
                  type="text"
                  className="rb-auth-pronomi-custom"
                  placeholder={t('auth.pronouns.customPlaceholder')}
                  value={pronomiCustom}
                  onChange={(e) => setPronomiCustom(e.target.value)}
                />
              )}
            </label>

            <div className="rb-field">
              <span>{t('auth.fields.worldsToEnable')}</span>
              <div className="rb-auth-worlds-box">
                {WORLDS.map((w) => (
                  <label key={w.id} className="rb-auth-world-row">
                    <input
                      type="checkbox"
                      checked={mondiAbilitati.includes(w.id)}
                      onChange={() =>
                        setMondiAbilitati((prev) =>
                          prev.includes(w.id) ? prev.filter((id) => id !== w.id) : [...prev, w.id]
                        )
                      }
                    />
                    <span className="rb-auth-world-dot" style={{ background: w.color }} />
                    <span>{translateWorld(t, w).label}</span>
                  </label>
                ))}
              </div>
              <span className="rb-auth-field-hint">{t('auth.worldsHint')}</span>
            </div>

            <label className="rb-field rb-auth-checkbox-field">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              <span>
                {t('auth.terms.prefix')}{' '}
                <button
                  type="button"
                  className="rb-auth-terms-link"
                  onClick={(e) => {
                    // Sta dentro la <label> del checkbox: senza queste due
                    // righe, il click aprirebbe la modale MA farebbe anche
                    // scattare/togliere la spunta (comportamento di default
                    // del browser su un click dentro una label).
                    e.preventDefault();
                    e.stopPropagation();
                    setShowTerms(true);
                  }}
                >
                  {t('auth.terms.link')}
                </button>
                {' '}{t('auth.terms.suffix')}
              </span>
            </label>

            <label className="rb-field rb-auth-checkbox-field">
              <input
                type="checkbox"
                checked={consensoMarketing}
                onChange={(e) => setConsensoMarketing(e.target.checked)}
              />
              <span>{t('auth.marketing')}</span>
            </label>
          </>
        )}

        {error && <p className="rb-auth-error">{error}</p>}
        {info && <p className="rb-auth-info">{info}</p>}

        {pendingConfirmEmail && !resendOk && (
          <button type="button" className="rb-auth-resend-btn" onClick={resendConfirmation} disabled={busy}>
            {t('auth.resendButton', { email: pendingConfirmEmail })}
          </button>
        )}
        {resendOk && <p className="rb-auth-info">{t('auth.resendSuccess')}</p>}

        <button type="submit" className="rb-btn-primary rb-auth-submit" disabled={busy}>
          {busy ? t('auth.submit.oneMoment') : mode === 'login' ? t('auth.submit.login') : t('auth.submit.register')}
        </button>
      </form>

      <TermsModal open={showTerms} onClose={() => setShowTerms(false)} />
    </ModalOverlay>
  );
}
