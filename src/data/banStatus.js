// Stato di blocco di un account, senza dipendenze (lo usano accounts.js,
// le categorie FAQ e App.jsx). Bloccato = bannato e, se c'è una scadenza,
// non ancora passata: un blocco scaduto non conta più, senza bisogno che
// qualcuno lo tolga. Si ricalcola a ogni caricamento del profilo.
export function isAccountBlocked(account) {
  if (!account?.bannato) return false;
  return !account.banFinoAl || new Date(account.banFinoAl) > new Date();
}
