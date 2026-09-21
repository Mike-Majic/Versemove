// Modulo centrale per il suono dell'app: solo Web Audio, nessun file
// esterno da scaricare. Per ora offre l'interruttore "Suono" nelle
// Impostazioni (persistito qui, su questo dispositivo); gli effetti sonori
// veri e propri (whoosh al cambio mondo, tick/blip dei pannelli) passeranno
// tutti da questo stesso file quando arriveranno, così si spengono o
// regolano in un punto solo.
const STORAGE_KEY = 'rb-sound-enabled';

export function isSoundEnabled() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, String(Boolean(enabled)));
  } catch {
    // storage piena/privata: l'interruttore vale solo per questa sessione
  }
}
