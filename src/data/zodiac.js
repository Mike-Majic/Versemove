// Segno zodiacale da giorno+mese (mai dall'anno: nel Profilo Social si
// mostra solo giorno/mese, l'anno resta privato — vedi ProfileSettingsPanel).
// "from"/"to" sono [mese, giorno]; il Capricorno scavalca l'anno (22 dic -> 19 gen).
const SIGNS = [
  { name: 'Capricorno', emoji: '♑', from: [12, 22], to: [1, 19] },
  { name: 'Acquario', emoji: '♒', from: [1, 20], to: [2, 18] },
  { name: 'Pesci', emoji: '♓', from: [2, 19], to: [3, 20] },
  { name: 'Ariete', emoji: '♈', from: [3, 21], to: [4, 19] },
  { name: 'Toro', emoji: '♉', from: [4, 20], to: [5, 20] },
  { name: 'Gemelli', emoji: '♊', from: [5, 21], to: [6, 20] },
  { name: 'Cancro', emoji: '♋', from: [6, 21], to: [7, 22] },
  { name: 'Leone', emoji: '♌', from: [7, 23], to: [8, 22] },
  { name: 'Vergine', emoji: '♍', from: [8, 23], to: [9, 22] },
  { name: 'Bilancia', emoji: '♎', from: [9, 23], to: [10, 22] },
  { name: 'Scorpione', emoji: '♏', from: [10, 23], to: [11, 21] },
  { name: 'Sagittario', emoji: '♐', from: [11, 22], to: [12, 21] },
];

export function zodiacSign(day, month) {
  if (!day || !month) return null;
  const sign = SIGNS.find(({ from: [fm, fd], to: [tm, td] }) => {
    if (fm === tm) return month === fm && day >= fd && day <= td;
    if (fm < tm) return (month === fm && day >= fd) || (month === tm && day <= td) || (month > fm && month < tm);
    return (month === fm && day >= fd) || (month === tm && day <= td); // Capricorno
  });
  return sign ?? null;
}
