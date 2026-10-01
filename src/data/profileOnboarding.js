// "Completa il tuo profilo" dopo la registrazione (ProfileSettingsPanel
// variant="onboarding"). La registrazione può non dare subito una sessione
// (conferma via mail): si segna l'indirizzo e la schermata compare al primo
// accesso con quell'account.

const KEY = 'rb-profile-onboarding';

export function markProfileOnboarding(email) {
  try {
    localStorage.setItem(KEY, String(email ?? '').trim().toLowerCase());
  } catch {
    // storage non disponibile: la schermata non comparirà da sola
  }
}

export function needsProfileOnboarding(user) {
  try {
    const email = localStorage.getItem(KEY);
    return Boolean(email && user?.email && email === String(user.email).trim().toLowerCase());
  } catch {
    return false;
  }
}

export function clearProfileOnboarding() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // niente
  }
}

// Profilo Social obbligatorio: città scelta dall'elenco e bio.
export function isSocialProfileComplete(user) {
  return Boolean(user?.cittaSocialGeo) && Boolean(user?.bioSocial?.trim());
}
