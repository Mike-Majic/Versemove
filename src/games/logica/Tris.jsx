import { useEffect, useRef, useState } from 'react';
import '../kit/gameKit.css';
import './Tris.css';
import { KIT_COLORS } from '../kit/palette';
import { useTrayTilt } from '../kit/useTrayTilt';
import Button3D from '../kit/Button3D';
import Hud from '../kit/Hud';
import SparkBurst from '../kit/SparkBurst';

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function winningLine(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return line;
  }
  return null;
}

function checkWinner(board) {
  const line = winningLine(board);
  if (line) return board[line[0]];
  return board.every(Boolean) ? 'draw' : null;
}

function freeCells(board) {
  return board.map((v, i) => (v ? null : i)).filter((v) => v !== null);
}

// CPU "medio": vince se può, blocca l'avversario se serve, altrimenti
// preferisce il centro, poi gli angoli, altrimenti una casella a caso.
function cpuMoveMedio(board, cpuSymbol, humanSymbol) {
  const tryEach = (symbol) => {
    for (let i = 0; i < 9; i++) {
      if (board[i]) continue;
      const b = [...board];
      b[i] = symbol;
      if (checkWinner(b) === symbol) return i;
    }
    return -1;
  };
  let move = tryEach(cpuSymbol);
  if (move === -1) move = tryEach(humanSymbol);
  if (move === -1 && !board[4]) move = 4;
  if (move === -1) {
    const corners = [0, 2, 6, 8].filter((i) => !board[i]);
    if (corners.length) move = corners[Math.floor(Math.random() * corners.length)];
  }
  if (move === -1) {
    const free = freeCells(board);
    move = free[Math.floor(Math.random() * free.length)];
  }
  return move;
}

// CPU "difficile": minimax con gioco perfetto — non perde mai, vince ogni
// errore dell'avversario. Sulla griglia 3x3 (al massimo 9 mosse) esplorare
// tutto l'albero è istantaneo, nessun bisogno di potatura alpha-beta.
function minimaxScore(board, isCpuTurn, cpuSymbol, humanSymbol) {
  const winner = checkWinner(board);
  if (winner === cpuSymbol) return 10;
  if (winner === humanSymbol) return -10;
  if (winner === 'draw') return 0;

  const symbol = isCpuTurn ? cpuSymbol : humanSymbol;
  const scores = freeCells(board).map((i) => {
    const b = [...board];
    b[i] = symbol;
    return minimaxScore(b, !isCpuTurn, cpuSymbol, humanSymbol);
  });
  return isCpuTurn ? Math.max(...scores) : Math.min(...scores);
}

function cpuMoveDifficile(board, cpuSymbol, humanSymbol) {
  let best = { index: -1, score: -Infinity };
  for (const i of freeCells(board)) {
    const b = [...board];
    b[i] = cpuSymbol;
    const score = minimaxScore(b, false, cpuSymbol, humanSymbol);
    if (score > best.score) best = { index: i, score };
  }
  return best.index;
}

function cpuMove(board, cpuSymbol, humanSymbol, difficulty) {
  if (difficulty === 'facile') {
    const free = freeCells(board);
    return free[Math.floor(Math.random() * free.length)];
  }
  if (difficulty === 'difficile') return cpuMoveDifficile(board, cpuSymbol, humanSymbol);
  return cpuMoveMedio(board, cpuSymbol, humanSymbol);
}

// Famiglia 2 (logica a turni/griglia): 2 giocatori locali o contro una CPU
// semplice, nessun timer, stato locale immutabile a ogni mossa.
//
// Grafica (kit comune, vedi ../kit/gameKit.css): griglia a vassoio inclinato
// con parallasse, caselle incassate; la X è fatta di due barre-caramella
// fragola e la O è un anello-ciambella azzurro, entrambe con volume e ombra,
// disegnate con un'animazione a tratto e poi un rimbalzo. Alla vittoria una
// linea luminosa attraversa il tris, le altre caselle si scuriscono e
// partono le scintille.

const X_COLOR = KIT_COLORS.fragola;
const O_COLOR = KIT_COLORS.azzurro;

// Pezzo O: ciambella SVG. Tre cerchi: ombra sotto (spostata in basso, senza
// filtri), anello con gradiente (chiaro in alto a sinistra, scuro sotto) e
// un arco di riflesso bianco. Il "tratto" è il dashoffset dell'anello che
// va da circonferenza piena a zero (vedi Tris.css).
function PieceO() {
  return (
    <span className="rb-tris-piece rb-tris-o" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <circle className="rb-tris-o-shadow" cx="50" cy="56" r="30" />
        <circle className="rb-tris-o-ring" cx="50" cy="50" r="30" />
        <circle className="rb-tris-o-shine" cx="50" cy="50" r="30" />
      </svg>
    </span>
  );
}

// Pezzo X: due barre-caramella (div con gradiente radiale e riflesso),
// ruotate di ±45°, ognuna "tracciata" con uno scaleX da 0 a 1.
function PieceX() {
  return (
    <span className="rb-tris-piece rb-tris-x" aria-hidden="true">
      <i className="rb-tris-bar-wrap a">
        <i className="rb-tris-bar gk-candy" />
      </i>
      <i className="rb-tris-bar-wrap b">
        <i className="rb-tris-bar gk-candy" />
      </i>
    </span>
  );
}

// Definizioni del gradiente della O: una volta sola per tutto il gioco
// (gli id SVG sono globali al documento, non serve ripeterli in ogni O).
function ODefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="rb-tris-o-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9cc3ff" />
          <stop offset="0.45" stopColor={O_COLOR} />
          <stop offset="1" stopColor="#1b4fb8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// Centro (in px) della casella i dentro alla griglia: serve per la linea
// di vittoria e per il punto delle scintille. cell/gap in px, misurati dal
// DOM (la casella è responsive, vedi --cell in Tris.css).
function cellCenter(i, cell, gap) {
  const col = i % 3;
  const row = Math.floor(i / 3);
  return { x: col * (cell + gap) + cell / 2, y: row * (cell + gap) + cell / 2 };
}

export default function Tris({ onFinish, difficulty = 'medio' }) {
  const [mode, setMode] = useState(null); // null | '2p' | 'cpu'
  const [board, setBoard] = useState(Array(9).fill(null));
  const [turn, setTurn] = useState('X');
  const [winner, setWinner] = useState(null);
  const [winLine, setWinLine] = useState(null); // { x1, y1, length, angle, midX, midY }
  const [lastMove, setLastMove] = useState(-1);
  const trayRef = useTrayTilt(4);
  const gridRef = useRef(null);

  const playAt = (i) => {
    if (board[i] || winner) return;
    const next = [...board];
    next[i] = turn;
    setBoard(next);
    setLastMove(i);
    const w = checkWinner(next);
    if (w) {
      setWinner(w);
      const line = winningLine(next);
      if (line && gridRef.current) {
        const grid = gridRef.current;
        const first = grid.firstElementChild;
        const cell = first ? first.getBoundingClientRect().width : 76;
        const gap = first ? (grid.getBoundingClientRect().width - cell * 3) / 2 : 8;
        const p1 = cellCenter(line[0], cell, gap);
        const p3 = cellCenter(line[2], cell, gap);
        const mid = cellCenter(line[1], cell, gap);
        setWinLine({
          x1: p1.x,
          y1: p1.y,
          length: Math.hypot(p3.x - p1.x, p3.y - p1.y) + cell * 0.55,
          angle: (Math.atan2(p3.y - p1.y, p3.x - p1.x) * 180) / Math.PI,
          midX: mid.x,
          midY: mid.y,
          cells: line,
        });
      }
      setTimeout(() => {
        if (mode === 'cpu') {
          const score = w === 'draw' ? 50 : w === 'X' ? 100 : 0;
          const detail = w === 'draw' ? 'Pareggio!' : w === 'X' ? 'Hai vinto tu!' : 'Ha vinto il computer.';
          onFinish(score, { detail });
        } else {
          onFinish(100, { detail: w === 'draw' ? 'Pareggio!' : `Ha vinto il giocatore ${w}!` });
        }
      }, w === 'draw' ? 1100 : 1700);
    } else {
      setTurn((t) => (t === 'X' ? 'O' : 'X'));
    }
  };

  // Mossa della CPU quando tocca a "O".
  useEffect(() => {
    if (mode !== 'cpu' || winner || turn !== 'O') return undefined;
    const t = setTimeout(() => {
      const move = cpuMove(board, 'O', 'X', difficulty);
      if (move !== undefined && move !== -1) playAt(move);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, turn, board, winner]);

  if (!mode) {
    return (
      <div className="gk-mode-setup">
        <p>Scegli come giocare:</p>
        <Button3D className="wide" color={X_COLOR} onClick={() => setMode('2p')}>
          👫 2 giocatori locali
        </Button3D>
        <Button3D className="wide" color={O_COLOR} onClick={() => setMode('cpu')}>
          🤖 Contro il computer
        </Button3D>
      </div>
    );
  }

  const players = [
    { id: 'X', color: X_COLOR, label: mode === 'cpu' ? 'Tu' : 'Giocatore X', icon: '✕', active: !winner && turn === 'X' },
    { id: 'O', color: O_COLOR, label: mode === 'cpu' ? 'Computer' : 'Giocatore O', icon: '○', active: !winner && turn === 'O' },
  ];
  const status = winner
    ? winner === 'draw'
      ? 'Pareggio!'
      : mode === 'cpu'
      ? winner === 'X'
        ? 'Hai vinto tu! 🎉'
        : 'Ha vinto il computer.'
      : `Vince ${winner}! 🎉`
    : mode === 'cpu' && turn === 'O'
    ? 'Il computer sta pensando…'
    : `Tocca a ${turn}`;
  const winCells = winLine?.cells ?? null;

  return (
    <div className="rb-tris">
      <ODefs />
      <Hud players={players} status={status} />
      <div className="gk-stage">
        <div ref={trayRef} className="gk-tray rb-tris-tray">
          <div ref={gridRef} className={`rb-tris-grid ${winner === 'draw' ? 'gk-shake' : ''}`}>
            {board.map((v, i) => {
              const dim = winCells && !winCells.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  className={`gk-slot rb-tris-cell ${v ? `filled-${v}` : ''} ${dim ? 'dim' : ''} ${
                    winCells?.includes(i) ? 'win' : ''
                  }`}
                  onClick={() => playAt(i)}
                  disabled={!!v || !!winner || (mode === 'cpu' && turn === 'O')}
                  aria-label={v ? `Casella ${i + 1}: ${v}` : `Casella ${i + 1} libera`}
                >
                  {v === 'X' && <PieceX />}
                  {v === 'O' && <PieceO />}
                </button>
              );
            })}
            {winLine && (
              <span
                className="rb-tris-winline"
                style={{
                  '--c': winner === 'X' ? X_COLOR : O_COLOR,
                  left: winLine.x1,
                  top: winLine.y1,
                  width: winLine.length,
                  transform: `rotate(${winLine.angle}deg) translateX(calc(-0.27 * var(--cell)))`,
                }}
                aria-hidden="true"
              />
            )}
            {winLine && <SparkBurst x={winLine.midX} y={winLine.midY} burstKey={lastMove} count={36} />}
          </div>
        </div>
      </div>
    </div>
  );
}
