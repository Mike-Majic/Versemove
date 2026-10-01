// Post condivisi prima della card: solo testo "Ho fatto N punti a "Gioco"
// su Versemove!" — si riconoscono e diventano card anche loro.
const OLD_TEXT = /^Ho fatto (\d+) punti a "(.+)" su Versemove!$/;

export function scoreFromOldText(testo) {
  const m = OLD_TEXT.exec((testo ?? '').trim());
  return m ? { gioco: m[2], icona: '🎮', punti: Number(m[1]), livello: '', dettaglio: null } : null;
}
