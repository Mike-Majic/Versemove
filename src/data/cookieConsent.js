import { setOwnCookieConsent } from './accounts';

// Scelta del banner cookie: sempre salvata sul dispositivo (funziona anche
// da sloggati), e se l'utente è loggato anche sull'account (vedi
// setOwnCookieConsent in data/accounts.js) — best effort, se quella
// chiamata fallisce la scelta locale resta comunque valida.
const STORAGE_KEY = 'rb-cookie-consent';

export function getStoredCookieConsent() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// 'tutto' | 'necessari' | 'personalizza'
export async function setCookieConsent(scelta, user) {
  try {
    localStorage.setItem(STORAGE_KEY, scelta);
  } catch {
    // localStorage non disponibile (navigazione privata): la scelta vale
    // solo per questa sessione, non c'è altro da fare qui.
  }
  if (user) await setOwnCookieConsent(scelta);
}
