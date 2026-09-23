// Cosmopoli: tabellone e mazzi di "Probabilità"/"Imprevisti" — stessa
// struttura numerica del gioco da tavolo di compravendita immobiliare a
// cui si ispira (40 caselle, 8 gruppi da 2-3 proprietà, 4 portali, 2
// servizi, stessi prezzi/affitti/costo case in proporzione), ma con nomi e
// tema tutti originali: i gruppi di proprietà sono gli stessi mondi di
// Versemove (stesso colore di worlds.js), i "portali" sostituiscono le
// stazioni, i "servizi" le utility. Dati puramente statici, condivisi da
// tutte le partite — lo stato dinamico (chi possiede cosa, case, ipoteche)
// vive nel database, vedi data/cosmopoli.js.

export const START_MONEY = 1500;
export const GO_BONUS = 200;
export const JAIL_FINE = 50;
export const JAIL_SQUARE = 10;
export const GO_TO_JAIL_SQUARE = 30;
export const MAX_TURNS_IN_JAIL = 3;

// Gruppi di proprietà: stesso colore del mondo corrispondente in worlds.js,
// per coerenza visiva con il resto dell'app. Ordine dal più economico (2
// proprietà) al più caro (2 proprietà), come nell'originale.
export const GROUPS = {
  bambini: { label: 'Bambini', color: '#22c55e', houseCost: 50 },
  vetrina: { label: 'Vetrina', color: '#ec4899', houseCost: 50 },
  animali: { label: 'Animali', color: '#b8794a', houseCost: 100 },
  annunci: { label: 'Annunci', color: '#ff8a1f', houseCost: 100 },
  incontri: { label: 'Incontri', color: '#ff0000', houseCost: 150 },
  arte: { label: 'Intrattenimento', color: '#8b5cf6', houseCost: 150 },
  lavoro: { label: 'Lavoro', color: '#e7eaf2', houseCost: 200 },
  nerd: { label: 'Nerd', color: '#d4f634', houseCost: 200 },
};

// tipo: 'via' | 'proprieta' | 'portale' | 'servizio' | 'probabilita' |
// 'imprevisti' | 'tassa' | 'quarantena' | 'relax' | 'vai_in_quarantena'
// rent: [base, 1casa, 2case, 3case, 4case, hotel] solo per 'proprieta'
export const BOARD = [
  { i: 0, tipo: 'via', nome: 'Lancio' },
  { i: 1, tipo: 'proprieta', nome: 'Giostra dei Piccoli', gruppo: 'bambini', prezzo: 60, rent: [2, 10, 30, 90, 160, 250] },
  { i: 2, tipo: 'imprevisti', nome: 'Imprevisti' },
  { i: 3, tipo: 'proprieta', nome: 'Cortile Giochi', gruppo: 'bambini', prezzo: 60, rent: [4, 20, 60, 180, 320, 450] },
  { i: 4, tipo: 'tassa', nome: 'Tasse sul Reddito', importo: 200 },
  { i: 5, tipo: 'portale', nome: 'Portale Nord', prezzo: 200 },
  { i: 6, tipo: 'proprieta', nome: 'Vetrina Novità', gruppo: 'vetrina', prezzo: 100, rent: [6, 30, 90, 270, 400, 550] },
  { i: 7, tipo: 'probabilita', nome: 'Probabilità' },
  { i: 8, tipo: 'proprieta', nome: 'Corridoio Offerte', gruppo: 'vetrina', prezzo: 100, rent: [6, 30, 90, 270, 400, 550] },
  { i: 9, tipo: 'proprieta', nome: 'Piazza Vetrina', gruppo: 'vetrina', prezzo: 120, rent: [8, 40, 100, 300, 450, 600] },
  { i: 10, tipo: 'quarantena', nome: 'Quarantena / Solo in visita' },
  { i: 11, tipo: 'proprieta', nome: 'Cuccia Comune', gruppo: 'animali', prezzo: 140, rent: [10, 50, 150, 450, 625, 750] },
  { i: 12, tipo: 'servizio', nome: 'Rete Energia', prezzo: 150 },
  { i: 13, tipo: 'proprieta', nome: 'Parco Cani', gruppo: 'animali', prezzo: 140, rent: [10, 50, 150, 450, 625, 750] },
  { i: 14, tipo: 'proprieta', nome: 'Rifugio Pet', gruppo: 'animali', prezzo: 160, rent: [12, 60, 180, 500, 700, 900] },
  { i: 15, tipo: 'portale', nome: 'Portale Est', prezzo: 200 },
  { i: 16, tipo: 'proprieta', nome: 'Mercatino Auto', gruppo: 'annunci', prezzo: 180, rent: [14, 70, 200, 550, 750, 950] },
  { i: 17, tipo: 'imprevisti', nome: 'Imprevisti' },
  { i: 18, tipo: 'proprieta', nome: 'Asta Case', gruppo: 'annunci', prezzo: 180, rent: [14, 70, 200, 550, 750, 950] },
  { i: 19, tipo: 'proprieta', nome: 'Bacheca Annunci', gruppo: 'annunci', prezzo: 200, rent: [16, 80, 220, 600, 800, 1000] },
  { i: 20, tipo: 'relax', nome: 'Area Relax' },
  { i: 21, tipo: 'proprieta', nome: 'Caffè Incontri', gruppo: 'incontri', prezzo: 220, rent: [18, 90, 250, 700, 875, 1050] },
  { i: 22, tipo: 'probabilita', nome: 'Probabilità' },
  { i: 23, tipo: 'proprieta', nome: 'Serata Match', gruppo: 'incontri', prezzo: 220, rent: [18, 90, 250, 700, 875, 1050] },
  { i: 24, tipo: 'proprieta', nome: 'Sala Appuntamenti', gruppo: 'incontri', prezzo: 240, rent: [20, 100, 300, 750, 925, 1100] },
  { i: 25, tipo: 'portale', nome: 'Portale Sud', prezzo: 200 },
  { i: 26, tipo: 'proprieta', nome: 'Galleria Note', gruppo: 'arte', prezzo: 260, rent: [22, 110, 330, 800, 975, 1150] },
  { i: 27, tipo: 'proprieta', nome: 'Sala Cinema', gruppo: 'arte', prezzo: 260, rent: [22, 110, 330, 800, 975, 1150] },
  { i: 28, tipo: 'servizio', nome: 'Server Provider', prezzo: 150 },
  { i: 29, tipo: 'proprieta', nome: 'Teatro Live', gruppo: 'arte', prezzo: 280, rent: [24, 120, 360, 850, 1025, 1200] },
  { i: 30, tipo: 'vai_in_quarantena', nome: 'Vai in Quarantena' },
  { i: 31, tipo: 'proprieta', nome: 'Ufficio Coworking', gruppo: 'lavoro', prezzo: 300, rent: [26, 130, 390, 900, 1100, 1275] },
  { i: 32, tipo: 'proprieta', nome: 'Sala Colloqui', gruppo: 'lavoro', prezzo: 300, rent: [26, 130, 390, 900, 1100, 1275] },
  { i: 33, tipo: 'imprevisti', nome: 'Imprevisti' },
  { i: 34, tipo: 'proprieta', nome: 'Grattacielo Carriere', gruppo: 'lavoro', prezzo: 320, rent: [28, 150, 450, 1000, 1200, 1400] },
  { i: 35, tipo: 'portale', nome: 'Portale Ovest', prezzo: 200 },
  { i: 36, tipo: 'probabilita', nome: 'Probabilità' },
  { i: 37, tipo: 'proprieta', nome: 'Arena Cosplay', gruppo: 'nerd', prezzo: 350, rent: [35, 175, 500, 1100, 1300, 1500] },
  { i: 38, tipo: 'tassa', nome: 'Tassa di Lusso', importo: 100 },
  { i: 39, tipo: 'proprieta', nome: 'Server Farm Suprema', gruppo: 'nerd', prezzo: 400, rent: [50, 200, 600, 1400, 1700, 2000] },
];

export const PROPERTY_SQUARES = BOARD.filter((s) => s.tipo === 'proprieta');
export const PORTAL_SQUARES = BOARD.filter((s) => s.tipo === 'portale');
export const SERVICE_SQUARES = BOARD.filter((s) => s.tipo === 'servizio');
export const PURCHASABLE_SQUARES = BOARD.filter((s) => ['proprieta', 'portale', 'servizio'].includes(s.tipo));

export function squareAt(i) {
  return BOARD[((i % 40) + 40) % 40];
}

export function groupSquares(gruppo) {
  return PROPERTY_SQUARES.filter((s) => s.gruppo === gruppo);
}

// Rendita di un portale in base a quanti ne possiede lo stesso proprietario
// (1→25, 2→50, 3→100, 4→200) e di un servizio in base al tiro di dadi
// appena fatto (1 posseduto→x4, 2 posseduti→x10).
export function portaleRent(numPosseduti) {
  return [0, 25, 50, 100, 200][Math.min(numPosseduti, 4)];
}
export function servizioRentMultiplier(numPosseduti) {
  return numPosseduti >= 2 ? 10 : 4;
}

// Mazzi "Probabilità" e "Imprevisti": 16 carte ciascuno, stesso spirito
// dell'originale (muovi, incassa, paga, prigione...) con testi ed effetti
// tutti originali. "effetto" è interpretato server-side (vedi RPC
// monoverse_apply_card): il client lo usa solo per mostrare il testo.
export const PROBABILITA_CARDS = [
  { id: 'pr1', testo: 'Un portale instabile ti risucchia fino a Lancio. Incassi 200.', effetto: { tipo: 'vai_a', casella: 0 } },
  { id: 'pr2', testo: 'Atterraggio di fortuna su Server Farm Suprema.', effetto: { tipo: 'vai_a', casella: 39 } },
  { id: 'pr3', testo: 'Ti risucchia il portale più vicino.', effetto: { tipo: 'vai_al_portale_piu_vicino' } },
  { id: 'pr4', testo: 'Ti risucchia il portale più vicino (di nuovo).', effetto: { tipo: 'vai_al_portale_piu_vicino' } },
  { id: 'pr5', testo: 'Guasto alla rete: sei teletrasportato al servizio più vicino.', effetto: { tipo: 'vai_al_servizio_piu_vicino' } },
  { id: 'pr6', testo: 'Rimborso spese: incassi 50.', effetto: { tipo: 'incassa', importo: 50 } },
  { id: 'pr7', testo: 'Hai vinto un concorso a premi: incassi 150.', effetto: { tipo: 'incassa', importo: 150 } },
  { id: 'pr8', testo: 'Multa per parcheggio in doppia fila: paghi 15.', effetto: { tipo: 'paga', importo: 15 } },
  { id: 'pr9', testo: 'Sei stato scelto moderatore per un giorno: incassi 200.', effetto: { tipo: 'incassa', importo: 200 } },
  { id: 'pr10', testo: 'Torna indietro di 3 caselle.', effetto: { tipo: 'muovi_relativo', delta: -3 } },
  { id: 'pr11', testo: 'Vai in Quarantena. Non passi da Lancio, non incassi 200.', effetto: { tipo: 'vai_in_quarantena' } },
  { id: 'pr12', testo: 'Manutenzione straordinaria: paghi 25 per casa e 100 per hotel posseduti.', effetto: { tipo: 'riparazioni', perCasa: 25, perHotel: 100 } },
  { id: 'pr13', testo: 'Ti eleggono presidente del server: incassi 50 da ogni giocatore.', effetto: { tipo: 'incassa_da_tutti', importo: 50 } },
  { id: 'pr14', testo: 'Hai trovato un pass gratuito: esci dalla Quarantena quando vuoi.', effetto: { tipo: 'carta_liberta' } },
  { id: 'pr15', testo: 'Vinci il torneo di Cosmopoli: incassi 100.', effetto: { tipo: 'incassa', importo: 100 } },
  { id: 'pr16', testo: 'Vai su Caffè Incontri. Se è libera puoi comprarla, altrimenti paghi l\'affitto.', effetto: { tipo: 'vai_a', casella: 21 } },
];

export const IMPREVISTI_CARDS = [
  { id: 'im1', testo: 'Torna a Lancio. Incassi 200.', effetto: { tipo: 'vai_a', casella: 0 } },
  { id: 'im2', testo: 'Rimborso iscrizione: incassi 25.', effetto: { tipo: 'incassa', importo: 25 } },
  { id: 'im3', testo: 'Hai vinto la newsletter del mese: incassi 100.', effetto: { tipo: 'incassa', importo: 100 } },
  { id: 'im4', testo: 'Bolletta arretrata: paghi 50.', effetto: { tipo: 'paga', importo: 50 } },
  { id: 'im5', testo: 'Regalo di compleanno da tutti gli altri giocatori: incassi 10 da ognuno.', effetto: { tipo: 'incassa_da_tutti', importo: 10 } },
  { id: 'im6', testo: 'Vinci una causa: incassi 150.', effetto: { tipo: 'incassa', importo: 150 } },
  { id: 'im7', testo: 'Spese mediche: paghi 100.', effetto: { tipo: 'paga', importo: 100 } },
  { id: 'im8', testo: 'Vai in Quarantena. Non passi da Lancio, non incassi 200.', effetto: { tipo: 'vai_in_quarantena' } },
  { id: 'im9', testo: 'Hai trovato un pass gratuito: esci dalla Quarantena quando vuoi.', effetto: { tipo: 'carta_liberta' } },
  { id: 'im10', testo: 'Tasse di consegna: paghi 40 a testa per ogni casa, 115 per ogni hotel.', effetto: { tipo: 'riparazioni', perCasa: 40, perHotel: 115 } },
  { id: 'im11', testo: 'Vinci il secondo premio a un contest di cosplay: incassi 10.', effetto: { tipo: 'incassa', importo: 10 } },
  { id: 'im12', testo: 'Eredità inaspettata: incassi 100.', effetto: { tipo: 'incassa', importo: 100 } },
  { id: 'im13', testo: 'Dividendo del fondo comune: incassi 20.', effetto: { tipo: 'incassa', importo: 20 } },
  { id: 'im14', testo: 'Multa per contenuti non moderati: paghi 15.', effetto: { tipo: 'paga', importo: 15 } },
  { id: 'im15', testo: 'Vinci il jackpot di un minigioco: incassi 100.', effetto: { tipo: 'incassa', importo: 100 } },
  { id: 'im16', testo: 'Rimborso viaggio: incassi 45.', effetto: { tipo: 'incassa', importo: 45 } },
];
