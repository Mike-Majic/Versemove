import { createPortal } from 'react-dom';

// Sfondo condiviso da tutti i pannelli a comparsa. Richiesta esplicita
// dell'utente: il click sullo sfondo non chiude più nulla, nemmeno un vero
// click intenzionale — ogni pannello si chiude solo con un controllo
// esplicito (la ✕ in alto, "Annulla", "Chiudi"...). Prima chiudeva anche
// solo lo sfondo "vero" (non un trascinamento per selezionare del testo
// che finiva fuori dai bordi), ma restava comunque troppo facile chiudere
// per sbaglio un modulo compilato a metà: meglio blindarlo del tutto.
//
// Portato con createPortal dentro .rb-app (mai document.body: lì sopra
// perderebbe --accent, impostato proprio su .rb-app — vedi App.jsx) invece
// di renderizzare nel punto esatto dell'albero React in cui viene
// chiamato: un pannello categoria (Musica, Cinema, Cani...) si centra con
// `left: 50%; transform: translateX(-50%)`, e un transform su un
// antenato crea un nuovo containing block per i discendenti
// "position: fixed" — questo overlay (fixed, inset:0) finiva quindi
// confinato dentro i bordi di quel pannello invece di coprire tutto lo
// schermo (bug osservato: il modulo "Aggiungi luogo" di Cani appariva
// schiacciato e tagliato). Il portal scavalca il problema alla radice,
// qualunque antenato lo richiami.
export default function ModalOverlay({ className = 'rb-modal-overlay', children }) {
  const target = document.querySelector('.rb-app') ?? document.body;
  return createPortal(<div className={className}>{children}</div>, target);
}
