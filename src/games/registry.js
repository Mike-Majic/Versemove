import { lazy } from 'react';

// Famiglie dei minigiochi del mondo Bambini: ognuna raggruppa giochi con la
// stessa "forma" tecnica (stesso motore o stesso tipo di loop), non lo stesso
// tema.
export const MINIGAME_FAMILIES = [
  { id: 'quiz', label: 'Domanda e risposta' },
  { id: 'logica', label: 'Logica a turni' },
  { id: 'arcade', label: 'Arcade in tempo reale' },
  { id: 'sociale', label: 'Sociale/gruppo' },
];

// Registro dei minigiochi: da qui si generano sia i triangoli sul globo del
// mondo Bambini sia l'elenco di pulsanti in basso a sinistra (stesso
// meccanismo di Arte & Musica/Nerd — vedi CATEGORY_WORLDS in App.jsx). Ogni
// voce: id, nome, famiglia (uno degli id di MINIGAME_FAMILIES),
// fasciaEtaMinima, meccanica (descrizione breve), icon/anchor/aliases (per
// il triangolo sul globo e la ricerca) e Component, caricato solo quando il
// gioco viene aperto (lazy) così aggiungerne uno non appesantisce chi non lo apre.
export const MINIGAMES = [
  {
    id: 'quiz-lampo',
    nome: 'Quiz lampo',
    famiglia: 'quiz',
    fasciaEtaMinima: 6,
    meccanica: 'Trivia veloce a tempo, risposta a scelta multipla',
    icon: '⚡',
    anchor: { lat: 35.3, lng: -45 }, // distribuzione uniforme sull'oceano
    aliases: ['quiz', 'trivia', 'lampo', 'domande'],
    Component: lazy(() => import('./quiz/QuizLampo.jsx')),
  },
  {
    id: 'indovina-canzone',
    nome: 'Indovina la canzone',
    famiglia: 'quiz',
    fasciaEtaMinima: 6,
    meccanica: 'Ascolta un’anteprima musicale e indovina il titolo tra 4 opzioni',
    icon: '🎵',
    anchor: { lat: -40.8, lng: 90 }, // distribuzione uniforme sull'oceano
    aliases: ['canzone', 'musica', 'indovina la canzone'],
    Component: lazy(() => import('./quiz/IndovinaCanzone.jsx')),
  },
  {
    id: 'tris',
    nome: 'Tris',
    famiglia: 'logica',
    fasciaEtaMinima: 5,
    meccanica: '2 giocatori locali o contro una CPU semplice',
    icon: '❌',
    anchor: { lat: -10.2, lng: -107.4 }, // distribuzione uniforme sull'oceano
    aliases: ['tris', 'tic tac toe'],
    Component: lazy(() => import('./logica/Tris.jsx')),
  },
  {
    id: 'memory',
    nome: 'Memory',
    famiglia: 'logica',
    fasciaEtaMinima: 4,
    meccanica: 'Carte abbinate, da solo o in 2 giocatori locali',
    icon: '🧠',
    anchor: { lat: -49.2, lng: 0 }, // distribuzione uniforme sull'oceano
    aliases: ['memory', 'carte', 'memoria'],
    Component: lazy(() => import('./logica/Memory.jsx')),
  },
  {
    id: 'puzzle-scorrevole',
    nome: 'Puzzle scorrevole',
    famiglia: 'logica',
    fasciaEtaMinima: 6,
    meccanica: 'Rimetti in ordine i numeri facendo scorrere le tessere',
    icon: '🧩',
    anchor: { lat: 16.6, lng: 127.3 }, // distribuzione uniforme sull'oceano
    aliases: ['puzzle', 'scorrevole', '15 puzzle'],
    Component: lazy(() => import('./logica/PuzzleScorrevole.jsx')),
  },
  {
    id: 'snake',
    nome: 'Snake',
    famiglia: 'arcade',
    fasciaEtaMinima: 6,
    meccanica: 'Arcade classico: mangia i frutti ed evita muri e coda',
    icon: '🐍',
    anchor: { lat: 0, lng: -159.1 }, // distribuzione uniforme sull'oceano
    aliases: ['snake', 'serpente'],
    Component: lazy(() => import('./arcade/Snake.jsx')),
  },
  {
    id: 'corsa-spara',
    nome: 'Corsa e spara retrò',
    famiglia: 'arcade',
    fasciaEtaMinima: 7,
    meccanica: 'Cambia corsia ed elimina i droni prima che ti raggiungano',
    icon: '🤖',
    anchor: { lat: 49.2, lng: 180 }, // distribuzione uniforme sull'oceano
    aliases: ['corsa', 'spara', 'robot', 'droni'],
    Component: lazy(() => import('./arcade/CorsaSpara.jsx')),
  },
  {
    id: 'torre-blocchi',
    nome: 'Torre di blocchi',
    famiglia: 'arcade',
    fasciaEtaMinima: 5,
    meccanica: 'Impila blocchi in equilibrio, un tocco alla volta',
    icon: '🧱',
    anchor: { lat: -49.7, lng: -116.2 }, // distribuzione uniforme sull'oceano
    aliases: ['torre', 'blocchi', 'stack'],
    Component: lazy(() => import('./arcade/TorreBlocchi.jsx')),
  },
  {
    id: 'forza-quattro',
    nome: 'Forza 4',
    famiglia: 'logica',
    fasciaEtaMinima: 8,
    meccanica: 'Incolonna le pedine e fai 4 in fila prima del computer — livello difficile con una vera CPU strategica',
    icon: '🔴',
    anchor: { lat: 10.2, lng: 72.6 }, // distribuzione uniforme sull'oceano
    aliases: ['forza 4', 'forza quattro', 'connect four'],
    Component: lazy(() => import('./logica/ForzaQuattro.jsx')),
  },
  {
    id: 'disegna-indovina',
    nome: 'Disegna e indovina',
    famiglia: 'sociale',
    fasciaEtaMinima: 6,
    meccanica: 'A turni, uno disegna una parola e gli altri indovinano a voce',
    icon: '🎨',
    anchor: { lat: 0, lng: -20.9 }, // distribuzione uniforme sull'oceano
    aliases: ['disegna', 'disegno', 'indovina'],
    Component: lazy(() => import('./sociale/DisegnaIndovina.jsx')),
  },
  {
    id: 'chi-e-piu-probabile',
    nome: 'Chi è più probabile che...',
    famiglia: 'sociale',
    fasciaEtaMinima: 6,
    meccanica: 'Party game di votazione a rotazione, passando il dispositivo',
    icon: '🎉',
    anchor: { lat: -35.5, lng: 159.5 }, // distribuzione uniforme sull'oceano
    aliases: ['probabile', 'voto', 'party'],
    Component: lazy(() => import('./sociale/ChiEPiuProbabile.jsx')),
  },
];

// Forma "categoria" (id, label, icon, anchor, aliases, subfamilies) richiesta
// da buildCategoryShell/WorldGlobe: così i giochi diventano triangoli sul
// globo esattamente come le categorie di Arte & Musica e Nerd.
export const BAMBINI_CATEGORIES = MINIGAMES.map((g) => ({
  id: g.id,
  label: g.nome,
  icon: g.icon,
  anchor: g.anchor,
  aliases: g.aliases,
  subfamilies: [],
}));

// Trova il gioco il cui alias combacia (anche parzialmente) con la query digitata.
export function resolveCategoryQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = BAMBINI_CATEGORIES.find((c) => c.aliases.includes(q));
  if (exact) return exact;
  return BAMBINI_CATEGORIES.find((c) => c.aliases.some((a) => a.startsWith(q))) ?? null;
}
