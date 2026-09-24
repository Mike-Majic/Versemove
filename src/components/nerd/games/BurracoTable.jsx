import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBurracoState,
  fetchMyHand,
  fetchMelds,
  fetchHandResults,
  startBurracoHand,
  drawCard,
  layCards,
  discardCard,
  checkMeld,
  isWild,
  cardRankCode,
} from '../../../data/burraco';
import { setRoomReady, firstHumanHostId } from '../../../data/gameRooms';
import { useBackLayer } from '../../../hooks/useBackLayer';
import useBotDriver from './useBotDriver';
import FrenchCard from './FrenchCard';
import { CARD_SIZES, DECKS, TABLES, cardSizeScale, sortHand, useCardDeck, useCardSize, useCardTable, useHandSort } from './cardTheme';
import Skeleton from '../../Skeleton';
// Dal tavolo di Scopa restano solo il riepilogo di fine mano e la schermata
// fra una mano e l'altra (stesso linguaggio visivo per tutti i giochi).
import './scopaTable.css';
import './burracoTable.css';

const BOT_DIFFICULTY_LABEL = { facile: 'facile', medio: 'medio', difficile: 'difficile' };

// Messaggi dei controlli fatti qui prima di chiamare il server (stesse
// regole e stesse parole delle RPC, che restano comunque l'ultima parola).
const MSG_KEEP_ONE = "Per chiudere devi scartare l'ultima carta: tieni almeno una carta in mano";
const MSG_DUP_TRIS = 'La tua squadra ha già una combinazione di questo valore: attacca lì';
const MSG_LOCKED = "Non puoi riscartare subito l'unica carta raccolta dagli scarti";
const MSG_NEED_BURRACO = 'Per chiudere serve almeno un burraco (combinazione da 7 carte)';
const MSG_WILD_CLOSE = 'Non puoi chiudere scartando una matta (jolly o pinella)';
const MSG_MIN_THREE = 'Per calare una nuova combinazione servono almeno 3 carte';

const PREVIEW_DEBOUNCE_MS = 200;
const FLY_MS = 400;
const FLY_STAGGER_MS = 80;
const POZZETTO_MSG_MS = 2800;

const PULIZIA_F = { pulito: 'pulita', semipulito: 'semipulita', sporco: 'sporca' };
const meldLabel = (tipo, pulizia) => (tipo === 'scala' ? `scala ${PULIZIA_F[pulizia] ?? pulizia}` : `tris ${pulizia}`);

// Valore di un tris sul tavolo: quello della prima carta non matta.
const meldValue = (meld) => {
  const natural = meld.carte.find((c) => !isWild(c));
  return natural ? cardRankCode(natural) : null;
};

const countCards = (cards) => {
  const m = new Map();
  cards.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1));
  return m;
};

// Chiavi (vedi handItems) delle carte comparse in mano rispetto a prima.
function addedKeys(prev, next) {
  const before = countCards(prev);
  const keys = new Set();
  countCards(next).forEach((q, card) => {
    for (let n = before.get(card) ?? 0; n < q; n += 1) keys.add(`${card}#${n}`);
  });
  return keys;
}

function useNarrow() {
  const query = '(max-width: 520px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

// Pannellino a comparsa (🎨, Regole): si chiude cliccando fuori, con Esc o
// con Indietro.
function usePopup(ref, onClose, id, toggleSelector) {
  useBackLayer(true, onClose, id);
  useEffect(() => {
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.(toggleSelector)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [ref, onClose, toggleSelector]);
}

// Tavolo di Burraco (vedi docs/mockup/mockup_tavolo_burraco.html): da 2 a
// 4 giocatori, a coppie (posti 0/2 contro 1/3, solo con 4 giocatori)
// oppure tutti contro tutti. Stato pubblico + mano privata + combinazioni,
// riletti a ogni evento della stanza. Il turno ha due fasi (pesca -> gioco):
// si pesca dal mazzo o si prende tutto il monte degli scarti, poi si cala o
// si attacca (anche alle combinazioni del compagno) e si scarta per
// passare. Chi finisce le carte la prima volta prende il pozzetto della
// squadra. Tutte le regole restano nel database; qui solo la vista:
// - panno con la striscia centrale (mazzo sopra, scarti sotto), a sinistra
//   "NOI" e a destra "LORO", combinazioni in colonne verticali nell'ordine
//   in cui le manda il server (dalla più alta, matta al suo posto);
// - carta pescata che vola in mano e resta evidenziata ("NUOVA") fino alla
//   mossa dopo; monte degli scarti a ventaglio;
// - si cala cliccando la propria metà del tavolo o una colonna, con
//   l'anteprima (burraco_check_meld) che illumina dove si può;
// - ordinamento, 🎨 tavolo, mazzo e dimensione carte solo lato client
//   (vedi cardTheme.js).
export default function BurracoTable({ roomId, room, user, eventTick, onLeave }) {
  const [state, setState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [melds, setMelds] = useState([]);
  const [selected, setSelected] = useState([]); // chiavi "H7#0" (vedi handItems)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [recap, setRecap] = useState(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [fanOpen, setFanOpen] = useState(false);
  const [pileHint, setPileHint] = useState('');
  const [pozzettoMsg, setPozzettoMsg] = useState(null); // { text, mine }
  const [newInfo, setNewInfo] = useState(null); // { keys: Set, source, seq }
  const [preview, setPreview] = useState({ key: '', nuova: null, attach: {} });
  const [rootW, setRootW] = useState(0);
  const [sortMode, setSortMode] = useHandSort();
  const [tableId] = useCardTable();
  const [sizeId] = useCardSize();
  const narrow = useNarrow();
  const lastResultIdRef = useRef(null);
  const startAttemptedRef = useRef(false);
  const prevHandRef = useRef(null);
  const prevStateRef = useRef(null);
  const pendingSourceRef = useRef(null);
  const myPozzettoRef = useRef(false);
  const rootRef = useRef(null);
  const handRowRef = useRef(null);
  const deckRef = useRef(null);
  const discardRef = useRef(null);
  const feltRef = useRef(null);

  // A coppie (solo con 4 giocatori) i posti 0/2 fanno squadra A, 1/3
  // squadra B; altrimenti ognuno fa squadra da solo — così combinazioni "di
  // squadra" e punteggio funzionano allo stesso modo in tutte le modalità.
  // Le chiavi dei pozzetti sono le stesse di burraco_team_of.
  const isCoppie = room.modalita === 'coppie' && room.maxGiocatori === 4;
  const teamOf = (posizione) => (isCoppie ? posizione % 2 : posizione);
  const meEntry = room.giocatori.find((g) => g.userId === user.id);
  const myTeam = teamOf(meEntry?.posizione ?? 0);
  const posizioneOf = (uid) => room.giocatori.find((g) => g.userId === uid)?.posizione ?? -1;
  const nameOf = (uid) => room.giocatori.find((g) => g.userId === uid)?.profilo.name ?? 'Un giocatore';

  // Pozzetto appena preso (da me o da altri): messaggio grande sul tavolo.
  const notePozzetto = (prev, pub) => {
    if (!prev || !pub) return;
    Object.entries(pub.pozzetti ?? {}).forEach(([team, p]) => {
      if (!p?.preso || !prev.pozzetti?.[team] || prev.pozzetti[team].preso) return;
      const members = room.giocatori.filter((g) => String(teamOf(g.posizione)) === team);
      const taker =
        members.length === 1
          ? members[0].userId
          : members.find((g) => g.userId === prev.turnoUserId)?.userId ?? members[0]?.userId;
      const mine = taker === user.id;
      if (mine) myPozzettoRef.current = true;
      setPozzettoMsg({ text: mine ? 'Hai preso il pozzetto!' : `${nameOf(taker)} ha preso il pozzetto`, mine, seq: Date.now() });
    });
  };

  const applyState = (pub) => {
    notePozzetto(prevStateRef.current, pub);
    prevStateRef.current = pub;
    if (pub === null) prevHandRef.current = null;
    setState(pub);
  };

  // Mano nuova rispetto a prima: le carte comparse (pescata, monte degli
  // scarti, pozzetto) si evidenziano e volano in mano. La prima lettura e
  // la mano appena distribuita non contano.
  const applyHand = (hand) => {
    const prev = prevHandRef.current;
    prevHandRef.current = hand;
    setMyHand(hand);
    if (prev === null) return;
    // Pozzetto preso da me: nuove tutte le sue carte, anche quelle uguali a
    // carte appena calate (con il mazzo doppio capita).
    const tookPozzetto = myPozzettoRef.current;
    myPozzettoRef.current = false;
    const keys = tookPozzetto ? addedKeys([], hand) : addedKeys(prev, hand);
    if (keys.size === 0) return;
    const source = tookPozzetto ? 'pozzetto' : pendingSourceRef.current ?? 'pozzetto';
    pendingSourceRef.current = null;
    setNewInfo({ keys, source, seq: Date.now() });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pub, hand, m, results] = await Promise.all([
        fetchBurracoState(roomId),
        fetchMyHand(roomId),
        fetchMelds(roomId),
        fetchHandResults(roomId),
      ]);
      if (cancelled) return;
      applyState(pub);
      if (pub) applyHand(hand);
      else setMyHand(hand);
      setMelds(m);

      if (results.length) {
        if (lastResultIdRef.current !== null && results[0].id !== lastResultIdRef.current) {
          setRecap(results[0]);
        }
        lastResultIdRef.current = results[0].id;
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, eventTick]);

  const isHandActive = state !== null;
  useEffect(() => { setSelected([]); }, [state?.turnoUserId, state?.fase, isHandActive]);

  useEffect(() => {
    if (!pozzettoMsg) return undefined;
    const t = setTimeout(() => setPozzettoMsg(null), POZZETTO_MSG_MS);
    return () => clearTimeout(t);
  }, [pozzettoMsg]);

  useEffect(() => {
    if (!pileHint) return undefined;
    const t = setTimeout(() => setPileHint(''), 1600);
    return () => clearTimeout(t);
  }, [pileHint]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = () => setRootW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isHandActive]);

  const isMyTurn = state?.turnoUserId === user.id;
  const canDraw = isMyTurn && state?.fase === 'pesca';
  const canAct = isMyTurn && state?.fase === 'gioco';
  const iAmHost = firstHumanHostId(room.giocatori) === user.id;
  const { isBotTurn, botName } = useBotDriver({ roomId, room, turnUserId: state?.turnoUserId, user, eventTick });

  const others = room.giocatori.filter((g) => g.userId !== user.id);
  const orderedOthers = [...others].sort((a, b) => {
    const da = (a.posizione - (meEntry?.posizione ?? 0) + room.maxGiocatori) % room.maxGiocatori;
    const db = (b.posizione - (meEntry?.posizione ?? 0) + room.maxGiocatori) % room.maxGiocatori;
    return da - db;
  });
  // Posti intorno al tavolo: con 1 avversario in alto, con 2 ai lati, con 3
  // sinistra/alto/destra — a coppie il compagno finisce sempre in alto,
  // essendo il posto "di fronte" a qualunque posto tu occupi.
  const seatSlots =
    orderedOthers.length === 1
      ? { top: orderedOthers[0] }
      : orderedOthers.length === 2
        ? { left: orderedOthers[0], right: orderedOthers[1] }
        : { left: orderedOthers[0], top: orderedOthers[1], right: orderedOthers[2] };

  const myMelds = melds.filter((m) => teamOf(posizioneOf(m.ownerId)) === myTeam);
  const opposingTeamIds = [...new Set(others.filter((g) => teamOf(g.posizione) !== myTeam).map((g) => teamOf(g.posizione)))];
  const opposingGroups = opposingTeamIds.map((teamId) => {
    const members = room.giocatori.filter((g) => teamOf(g.posizione) === teamId);
    const memberIds = members.map((g) => g.userId);
    return {
      teamId,
      name: members.map((m) => m.profilo.name).join(' e '),
      punteggio: members[0]?.punteggio ?? 0,
      melds: melds.filter((m) => memberIds.includes(m.ownerId)),
    };
  });
  const noiScore = meEntry?.punteggio ?? 0;
  // "LORO" con un solo gruppo avversario (1 contro 1, coppie) mostra il
  // suo punteggio; tutti contro tutti ogni avversario ha il suo, accanto al nome.
  const loroScore = opposingGroups.length === 1 ? opposingGroups[0].punteggio : null;
  const pozzettoOf = (teamId) => state?.pozzetti?.[String(teamId)] ?? null;
  const myPozzettoPreso = Boolean(pozzettoOf(myTeam)?.preso);
  const teamHasBurraco = myMelds.some((m) => m.carte.length >= 7);

  // Mano ordinata solo per la vista. Due carte uguali (mazzo doppio) hanno
  // chiavi diverse ("H7#0", "H7#1"), così se ne seleziona una sola.
  const handItems = useMemo(() => {
    const seen = new Map();
    return sortHand(myHand, sortMode).map((card) => {
      const n = seen.get(card) ?? 0;
      seen.set(card, n + 1);
      return { card, key: `${card}#${n}` };
    });
  }, [myHand, sortMode]);
  const selectedCards = handItems.filter((h) => selected.includes(h.key)).map((h) => h.card);
  const selKey = [...selectedCards].sort().join(',');
  const meldsKey = myMelds.map((m) => `${m.id}:${m.carte.length}`).join('|');

  // La carta raccolta da sola dagli scarti non si riscarta in questo turno:
  // lucchetto sull'unica copia in mano.
  const lockedKey =
    isMyTurn && state?.vincoloScarto && myHand.filter((c) => c === state.vincoloScarto).length === 1 ? `${state.vincoloScarto}#0` : null;

  // --- Dimensioni (🎨 Dimensione carte: mano, colonne e pila) -----------
  const scale = cardSizeScale(sizeId);
  const pileW = Math.round((narrow ? 48 : 64) * scale);
  const colW = Math.round((narrow ? 40 : 52) * scale);
  const handBaseW = rootW && rootW < 420 ? 62 : rootW && rootW < 640 ? 84 : 108;
  const nHand = handItems.length;
  // Abbastanza stretta da starci tutta lasciando scoperto l'angolo di ogni
  // carta (34% della larghezza).
  const handFitW = rootW && nHand > 1 ? rootW / (1 + (nHand - 1) * 0.34) : Infinity;
  const handW = Math.max(40, Math.round(Math.min(handBaseW * scale, handFitW)));
  const handH = Math.round((handW * 140) / 100);

  // --- Anteprima delle mosse (burraco_check_meld) -------------------------
  useEffect(() => {
    setReason('');
    if (!canAct || selectedCards.length === 0) {
      setPreview({ key: '', nuova: null, attach: {} });
      return undefined;
    }
    let cancelled = false;
    const cards = selectedCards;
    const timer = setTimeout(async () => {
      const keepOne = cards.length >= myHand.length && myPozzettoPreso ? MSG_KEEP_ONE : null;
      const [nuovaRaw, ...attached] = await Promise.all([
        cards.length >= 3 ? checkMeld(roomId, null, cards) : Promise.resolve({ ok: false, errore: MSG_MIN_THREE }),
        ...myMelds.map((m) => checkMeld(roomId, m.id, cards).then((r) => [m.id, r])),
      ]);
      if (cancelled) return;
      let nuova = nuovaRaw;
      if (nuova.ok && nuova.tipo === 'tris' && myMelds.some((m) => m.tipo === 'tris' && meldValue(m) === nuova.valore)) {
        nuova = { ...nuova, ok: false, errore: MSG_DUP_TRIS };
      }
      if (keepOne && nuova.ok) nuova = { ...nuova, ok: false, errore: keepOne };
      const attach = Object.fromEntries(
        attached.map(([id, r]) => [id, keepOne && r.ok ? { ...r, ok: false, errore: keepOne } : r])
      );
      setPreview({ key: selKey, nuova, attach });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, canAct, meldsKey, myHand.length, myPozzettoPreso, roomId]);

  const previewReady = preview.key === selKey && selKey !== '';
  const nuovaOk = previewReady && preview.nuova?.ok;

  // --- Carte che volano in mano -------------------------------------------
  useLayoutEffect(() => {
    if (!newInfo || !handRowRef.current) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const src =
      newInfo.source === 'mazzo' ? deckRef.current : newInfo.source === 'scarti' ? discardRef.current : feltRef.current;
    if (!src) return;
    const s = src.getBoundingClientRect();
    const sx = s.left + s.width / 2;
    const sy = s.top + s.height / 2;
    let i = 0;
    handRowRef.current.querySelectorAll('.rb-bt-slot').forEach((el) => {
      if (!newInfo.keys.has(el.dataset.key)) return;
      const r = el.getBoundingClientRect();
      const dx = sx - (r.left + r.width / 2);
      const dy = sy - (r.top + r.height / 2);
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0.4 },
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        ],
        { duration: FLY_MS, delay: i * FLY_STAGGER_MS, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }
      );
      i += 1;
    });
  }, [newInfo?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCard = (key) => {
    if (!canAct) return;
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const refreshAfterMove = async () => {
    const [pub, hand, m] = await Promise.all([fetchBurracoState(roomId), fetchMyHand(roomId), fetchMelds(roomId)]);
    applyState(pub);
    if (pub) applyHand(hand);
    else setMyHand(hand);
    setMelds(m);
  };

  // Ogni mia mossa spegne l'evidenziazione delle carte nuove.
  const startMove = () => {
    setBusy(true);
    setError('');
    setReason('');
    setNewInfo(null);
  };

  const handleDraw = async (da) => {
    if (!canDraw || busy) return;
    startMove();
    setFanOpen(false);
    pendingSourceRef.current = da;
    const { error: err } = await drawCard(roomId, da);
    setBusy(false);
    if (err) {
      pendingSourceRef.current = null;
      return setError(err);
    }
    await refreshAfterMove();
  };

  const lay = async (meldId) => {
    startMove();
    const { error: err } = await layCards(roomId, meldId, selectedCards);
    setBusy(false);
    if (err) return setError(err);
    setSelected([]);
    await refreshAfterMove();
  };

  // Clic sulla propria metà del tavolo o su "Cala nuove carte": se
  // l'anteprima dice di no, niente chiamata al server, solo il motivo.
  const tryNewMeld = () => {
    if (!canAct || busy || selectedCards.length === 0) return;
    if (!previewReady) return setReason('Un attimo, controllo le carte…');
    if (!preview.nuova?.ok) return setReason(preview.nuova?.errore ?? 'Combinazione non valida');
    lay(null);
  };

  // meldId può essere anche di una combinazione del compagno (myMelds le
  // include entrambe): la RPC lato server verifica che sia lecito.
  const tryAttach = (meldId) => {
    if (!canAct || busy || selectedCards.length === 0) return;
    if (!previewReady) return setReason('Un attimo, controllo le carte…');
    const r = preview.attach[meldId];
    if (!r?.ok) return setReason(r?.errore ?? 'Non si può attaccare a questa combinazione');
    lay(meldId);
  };

  // Scarto: stessi divieti del server, detti prima di mandarlo.
  const selCard = selectedCards.length === 1 ? selectedCards[0] : null;
  let discardBlock = null;
  if (selCard) {
    if (state?.vincoloScarto && selCard === state.vincoloScarto && myHand.filter((c) => c === selCard).length === 1) {
      discardBlock = MSG_LOCKED;
    } else if (myHand.length === 1 && myPozzettoPreso) {
      if (!teamHasBurraco) discardBlock = MSG_NEED_BURRACO;
      else if (isWild(selCard)) discardBlock = MSG_WILD_CLOSE;
    }
  }

  const handleDiscard = async () => {
    if (!selCard) return;
    if (discardBlock) return setReason(discardBlock);
    startMove();
    const { error: err } = await discardCard(roomId, selCard);
    setBusy(false);
    if (err) return setError(err);
    setSelected([]);
    await refreshAfterMove();
  };

  // Monte degli scarti: con 2 o più carte il primo clic apre il ventaglio
  // (anche fuori turno, per guardare); con una sola si prende col doppio clic.
  const pila = state?.pilaScarti ?? [];
  const onDiscardPileClick = () => {
    if (pila.length >= 2) setFanOpen(true);
    else if (pila.length === 1 && canDraw) setPileHint('Doppio clic per prendere');
  };
  const onDiscardPileDouble = () => {
    if (pila.length === 1 && canDraw) handleDraw('scarti');
  };
  const closeFan = useCallback(() => setFanOpen(false), []);

  // Fra una mano e l'altra: "pronto + parte da sola", fatta partire
  // dall'umano con la posizione più bassa.
  const bothReady = room.giocatori.length === room.maxGiocatori && room.giocatori.every((g) => g.pronto);
  useEffect(() => {
    if (state === null && bothReady && iAmHost && !startAttemptedRef.current) {
      startAttemptedRef.current = true;
      startBurracoHand(roomId);
    }
    if (!bothReady) startAttemptedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, bothReady, iAmHost]);

  const toggleReady = () => setRoomReady(roomId, !meEntry?.pronto);

  if (state === null) {
    return (
      <div className="rb-burraco-table" ref={rootRef}>
        {recap && <BurracoRecap recap={recap} room={room} user={user} isCoppie={isCoppie} teamOf={teamOf} onClose={() => setRecap(null)} />}
        <div className="rb-scopa-between-hands">
          <h3>Mano finita — punteggio aggiornato</h3>
          <BurracoScoreRow room={room} isCoppie={isCoppie} teamOf={teamOf} />
          <p className="rb-giochi-hint">Quando siete tutti pronti parte la prossima mano.</p>
          <div className="rb-giochi-waiting-actions">
            <button type="button" className="rb-reset-filters-btn" onClick={onLeave}>Abbandona</button>
            <button type="button" className="rb-btn-primary" onClick={toggleReady}>
              {meEntry?.pronto ? 'Non sono più pronto' : 'Sono pronto'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!state) return <Skeleton lines={5} />;

  const turnName = room.giocatori.find((g) => g.userId === state.turnoUserId)?.profilo.name ?? 'avversario';
  const status = isMyTurn
    ? state.fase === 'pesca'
      ? 'Tocca a te — pesca dal mazzo o prendi gli scarti'
      : 'Tocca a te — cala o scarta'
    : isBotTurn
      ? `🤖 ${botName ?? 'Il computer'} sta pensando…`
      : `Turno di ${turnName}`;
  const seatProps = (entry) => ({
    entry,
    cards: state.carteInMano?.[entry.userId] ?? 0,
    isTurn: state.turnoUserId === entry.userId,
    isTeammate: isCoppie && teamOf(entry.posizione) === myTeam,
  });

  const selecting = canAct && selectedCards.length > 0;
  const noiClass = ['rb-bt-half', 'noi', selecting ? 'selecting' : '', selecting && nuovaOk ? 'can-lay' : ''].filter(Boolean).join(' ');
  const handExtra = Math.max(0, handH - 112);

  return (
    <div
      className="rb-burraco-table"
      ref={rootRef}
      style={{ '--bt-pile-w': `${pileW}px`, '--bt-hand-extra': `${handExtra}px` }}
    >
      {recap && <BurracoRecap recap={recap} room={room} user={user} isCoppie={isCoppie} teamOf={teamOf} onClose={() => setRecap(null)} />}

      <div className={`rb-bt-stage ${seatSlots.left ? 'has-left' : ''} ${seatSlots.right ? 'has-right' : ''}`}>
        {seatSlots.top && <Seat {...seatProps(seatSlots.top)} position="top" />}
        {seatSlots.left && <Seat {...seatProps(seatSlots.left)} position="left" />}
        {seatSlots.right && <Seat {...seatProps(seatSlots.right)} position="right" />}

        <div className={`rb-bt-table t-${tableId}`}>
          <div className="rb-bt-felt" ref={feltRef}>
            <div className="rb-bt-strip" />

            <div
              className={noiClass}
              onClick={selecting ? tryNewMeld : undefined}
              role={selecting ? 'button' : undefined}
              aria-label={selecting ? 'Cala le carte selezionate come nuova combinazione' : undefined}
            >
              {selecting && nuovaOk && (
                <span className="rb-bt-lay-label">Cala: {meldLabel(preview.nuova.tipo, preview.nuova.pulizia)}</span>
              )}
              {myMelds.length === 0 && !(selecting && nuovaOk) && <span className="rb-bt-empty-half">Le vostre combinazioni</span>}
              {myMelds.map((m) => (
                <MeldColumn
                  key={m.id}
                  meld={m}
                  cardW={colW}
                  attach={selecting ? (previewReady ? (preview.attach[m.id]?.ok ? 'ok' : 'no') : 'wait') : null}
                  onAttach={() => tryAttach(m.id)}
                  busy={busy}
                />
              ))}
            </div>

            <div className="rb-bt-half loro">
              {opposingGroups.every((g) => g.melds.length === 0) && <span className="rb-bt-empty-half">Le loro combinazioni</span>}
              {opposingGroups.length > 1
                ? opposingGroups.map((g) =>
                    g.melds.length > 0 ? (
                      <div key={g.teamId} className="rb-bt-group">
                        <span className="rb-bt-group-name">
                          {g.name} · {g.punteggio} · <PozzettoText p={pozzettoOf(g.teamId)} />
                        </span>
                        <div className="rb-bt-group-cols">
                          {g.melds.map((m) => <MeldColumn key={m.id} meld={m} cardW={colW} />)}
                        </div>
                      </div>
                    ) : null
                  )
                : opposingGroups[0]?.melds.map((m) => <MeldColumn key={m.id} meld={m} cardW={colW} />)}
            </div>

            <div className="rb-bt-piles">
              <button
                type="button"
                ref={deckRef}
                className={`rb-bt-pile ${canDraw ? 'can' : ''}`}
                onClick={() => handleDraw('mazzo')}
                disabled={!canDraw || busy}
              >
                <FrenchCard faceDown width={pileW} />
                <span>{state.carteRimaste} nel mazzo</span>
              </button>
              <button
                type="button"
                ref={discardRef}
                className={`rb-bt-pile ${canDraw && pila.length ? 'can' : ''}`}
                onClick={onDiscardPileClick}
                onDoubleClick={onDiscardPileDouble}
                disabled={pila.length === 0 || busy}
                title={pila.length >= 2 ? 'Guarda tutto il monte degli scarti' : pila.length === 1 && canDraw ? 'Doppio clic per prendere' : undefined}
              >
                {state.scartoCima ? <FrenchCard card={state.scartoCima} width={pileW} /> : <span className="rb-bt-empty-pile">Vuoti</span>}
                <span>{pila.length > 1 ? `Scarti · ${pila.length}` : 'Scarti'}</span>
                {pileHint && <span className="rb-bt-pile-hint">{pileHint}</span>}
              </button>
            </div>

            <span className="rb-bt-team noi">
              NOI <b>{noiScore}</b>
              <PozzettoText p={pozzettoOf(myTeam)} />
            </span>
            <span className="rb-bt-team loro">
              LORO {loroScore !== null && <b>{loroScore}</b>}
              {opposingGroups.length === 1 && <PozzettoText p={pozzettoOf(opposingGroups[0].teamId)} />}
            </span>

            {pozzettoMsg && (
              <div key={pozzettoMsg.seq} className={`rb-bt-pozzetto-msg ${pozzettoMsg.mine ? 'mine' : ''}`} role="status">
                {pozzettoMsg.text}
              </div>
            )}
          </div>

          {fanOpen && pila.length > 0 && (
            <DiscardFan cards={pila} canTake={canDraw && !busy} onTake={() => handleDraw('scarti')} onClose={closeFan} cardW={pileW} />
          )}

          <div className={`rb-bt-status ${isMyTurn ? 'mine' : ''}`}>{status}</div>

          <button type="button" className="rb-bt-gear" onClick={() => setCustomizeOpen((v) => !v)} title="Personalizza tavolo e carte" aria-label="Personalizza tavolo e carte" aria-expanded={customizeOpen}>
            🎨
          </button>
          {customizeOpen && <CustomizePanel onClose={() => setCustomizeOpen(false)} />}
        </div>
      </div>

      <div className="rb-bt-bar">
        <span className="rb-bt-bar-label">Ordina</span>
        <button type="button" className={`rb-bt-btn ${sortMode === 'seme' ? 'on' : ''}`} onClick={() => setSortMode('seme')}>♠♥ Per seme</button>
        <button type="button" className={`rb-bt-btn ${sortMode === 'numero' ? 'on' : ''}`} onClick={() => setSortMode('numero')}>1·2·3 Per numero</button>
        <button type="button" className="rb-bt-btn rb-bt-rules-btn" onClick={() => setRulesOpen((v) => !v)} aria-expanded={rulesOpen} title="Regole">
          <span aria-hidden="true">i</span> Regole
        </button>
        <button type="button" className="rb-bt-btn ghost" onClick={onLeave}>Abbandona</button>
        <span className="rb-bt-bar-spacer" />
        <span className="rb-bt-bar-count">
          {!canAct ? '' : selectedCards.length > 0 ? `${selectedCards.length} selezionate` : 'Seleziona carte'}
        </span>
        {selectedCards.length > 0 && (
          <button type="button" className="rb-bt-btn" onClick={() => setSelected([])}>Annulla</button>
        )}
        <button type="button" className="rb-bt-btn" onClick={tryNewMeld} disabled={!canAct || selectedCards.length === 0 || busy}>
          Cala nuove carte
        </button>
        <button
          type="button"
          className="rb-bt-btn primary"
          onClick={handleDiscard}
          disabled={!canAct || !selCard || Boolean(discardBlock) || busy}
          title={discardBlock ?? undefined}
        >
          Scarta
        </button>
        {rulesOpen && <RulesPanel onClose={() => setRulesOpen(false)} />}
      </div>
      {(reason || discardBlock) && selecting ? (
        <p className="rb-bt-reason" role="status">{reason || discardBlock}</p>
      ) : selecting ? (
        <p className="rb-bt-hint">Tocca la tua metà del tavolo per calare, o una colonna per attaccare.</p>
      ) : null}
      {error && <p className="rb-giochi-error rb-bt-error">{error}</p>}

      <Hand
        items={handItems}
        selected={selected}
        canAct={canAct}
        onToggle={toggleCard}
        cardW={handW}
        width={rootW}
        newKeys={newInfo?.keys}
        lockedKey={lockedKey}
        rowRef={handRowRef}
      />
    </div>
  );
}

function PozzettoText({ p }) {
  if (!p) return null;
  return <small className={`rb-bt-pozzetto ${p.preso ? 'preso' : ''}`}>Pozzetto: {p.preso ? 'preso ✓' : 'da prendere'}</small>;
}

// Monte degli scarti a ventaglio sopra il tavolo, dal più vecchio al più
// recente. Clic sul ventaglio = prendi tutto (solo nel proprio turno, in
// fase di pesca); clic fuori, Esc o Indietro lo richiudono.
function DiscardFan({ cards, canTake, onTake, onClose, cardW }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useBackLayer(true, onClose, 'modal:burraco-fan');
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
  }, []);
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const w = Math.round(cardW * 1.1);
  const n = cards.length;
  const step = n > 1 && width ? Math.max(Math.round(w * 0.36), Math.min(w * 0.7, (width - w) / (n - 1))) : w * 0.7;
  return (
    <div className="rb-bt-fan-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rb-bt-fan-box">
        <div className="rb-bt-fan-head">
          <b>{n} carte</b> negli scarti, dalla più vecchia alla più recente
          <button type="button" className="rb-bt-fan-close" onClick={onClose} aria-label="Chiudi">✕</button>
        </div>
        <button
          type="button"
          ref={ref}
          className={`rb-bt-fan ${canTake ? 'can' : ''}`}
          onClick={canTake ? onTake : undefined}
          disabled={!canTake}
          aria-label={canTake ? `Prendi tutte le ${n} carte degli scarti` : 'Monte degli scarti'}
        >
          <span className="rb-bt-fan-row">
            {cards.map((c, i) => (
              <FrenchCard key={`${c}-${i}`} card={c} width={w} style={i === 0 ? undefined : { marginLeft: step - w }} />
            ))}
          </span>
        </button>
        <p className="rb-bt-fan-foot">{canTake ? `Clic sul ventaglio per prenderle tutte (${n})` : 'Puoi prenderle quando tocca a te, prima di pescare.'}</p>
      </div>
    </div>
  );
}

// Giocatore seduto intorno al tavolo: avatar (🤖 per i bot), pallino blu
// con le carte in mano, nome e sotto "COMPAGNO/A" o la difficoltà del bot.
function Seat({ entry, cards, isTurn, isTeammate, position }) {
  return (
    <div className={`rb-bt-seat ${position} ${isTurn ? 'turn' : ''}`}>
      <div className="rb-bt-av">
        {entry.isBot ? (
          <span aria-hidden="true">🤖</span>
        ) : entry.profilo.avatar ? (
          <img src={entry.profilo.avatar} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        ) : (
          <span aria-hidden="true">🙂</span>
        )}
        <span className="rb-bt-cnt" title={`${cards} carte in mano`}>{cards}</span>
      </div>
      <span className="rb-bt-name">{entry.profilo.name}</span>
      {isTeammate ? (
        <span className="rb-bt-tag">COMPAGNO/A</span>
      ) : entry.isBot && entry.botDifficolta ? (
        <span className="rb-bt-sub">{BOT_DIFFICULTY_LABEL[entry.botDifficolta] ?? entry.botDifficolta}</span>
      ) : null}
    </div>
  );
}

// Combinazione in colonna, nell'ordine ricevuto dal server (dalla carta più
// alta, matta al suo posto): carte sovrapposte in verticale, di ognuna resta
// scoperto tutto l'angolo (valore + seme), almeno 26 px. Un burraco (7+
// carte) ha il bordo dorato. attach: null (niente selezione), 'wait'
// (anteprima in corso), 'ok' (si può attaccare: verde), 'no' (spenta).
function MeldColumn({ meld, cardW, attach = null, onAttach, busy }) {
  const cardH = Math.round((cardW * 140) / 100);
  const step = Math.max(26, Math.ceil(cardH * 0.36));
  const cls = ['rb-bt-col', meld.carte.length >= 7 ? 'burraco' : '', attach ? `attach-${attach}` : ''].filter(Boolean).join(' ');
  const cards = meld.carte.map((c, i) => (
    <FrenchCard key={`${c}-${i}`} card={c} width={cardW} className="rb-bt-col-card" style={i === 0 ? undefined : { marginTop: step - cardH }} />
  ));
  if (attach) {
    return (
      <button
        type="button"
        className={cls}
        onClick={(e) => {
          e.stopPropagation();
          onAttach?.();
        }}
        disabled={busy}
        title={attach === 'ok' ? 'Attacca le carte selezionate a questa combinazione' : undefined}
      >
        {cards}
      </button>
    );
  }
  return <div className={cls}>{cards}</div>;
}

// La mano: tutte le carte in una fila, sovrapposte quanto basta a starci
// nella larghezza disponibile (niente scroll orizzontale, anche con 20
// carte) lasciando sempre scoperto l'angolo. Larghezza delle carte decisa
// da BurracoTable (dimensione scelta nel 🎨). Le carte nuove (pescata,
// scarti, pozzetto) hanno il bordo giallo e "NUOVA" sopra; quella che non
// si può riscartare ha il lucchetto.
function Hand({ items, selected, canAct, onToggle, cardW, width, newKeys, lockedKey, rowRef }) {
  const n = items.length;
  const maxStep = cardW * 0.62;
  const step = n > 1 && width ? Math.min(maxStep, (width - cardW) / (n - 1)) : maxStep;

  return (
    <div className="rb-bt-hand">
      <div className="rb-bt-hand-row" ref={rowRef}>
        {items.map((h, i) => {
          const isSel = selected.includes(h.key);
          const isNew = Boolean(newKeys?.has(h.key));
          const isLocked = h.key === lockedKey;
          return (
            <div
              key={h.key}
              data-key={h.key}
              className={['rb-bt-slot', isSel ? 'selected' : '', isNew ? 'is-new' : '', isLocked ? 'locked' : '', canAct ? 'can' : ''].filter(Boolean).join(' ')}
              style={i === 0 ? undefined : { marginLeft: step - cardW }}
            >
              {isNew && <span className="rb-bt-new-tag">NUOVA</span>}
              <FrenchCard
                card={h.card}
                width={cardW}
                selected={isSel}
                disabled={!canAct}
                onClick={() => onToggle(h.key)}
                className="rb-bt-hand-card"
              />
              {isLocked && (
                <span className="rb-bt-lock" title="Raccolta dagli scarti: non puoi riscartarla in questo turno">🔒</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 🎨 Personalizza: tavolo, mazzo e dimensione delle carte, solo per questo
// utente (localStorage, vedi cardTheme.js).
function CustomizePanel({ onClose }) {
  const ref = useRef(null);
  const [tableId, setTableId] = useCardTable();
  const [deck, setDeck] = useCardDeck();
  const [sizeId, setSizeId] = useCardSize();
  usePopup(ref, onClose, 'modal:burraco-customize', '.rb-bt-gear');

  return (
    <div className="rb-bt-pop" ref={ref} role="dialog" aria-label="Personalizza tavolo e carte">
      <h4>🎨 Personalizza</h4>
      <div className="rb-bt-pop-sec">Tavolo</div>
      <div className="rb-bt-opts">
        {TABLES.map((t) => (
          <button key={t.id} type="button" className={`rb-bt-opt ${t.id === tableId ? 'on' : ''}`} onClick={() => setTableId(t.id)}>
            <span className="rb-bt-sw" style={{ background: t.felt, borderColor: t.frame }} />
            {t.label}
          </button>
        ))}
      </div>
      <div className="rb-bt-pop-sec">Carte</div>
      <div className="rb-bt-opts">
        {DECKS.map((d) => (
          <button key={d.id} type="button" className={`rb-bt-opt ${d.id === deck ? 'on' : ''}`} onClick={() => setDeck(d.id)}>
            <span className="rb-bt-mini">
              <FrenchCard card="HQ" size="xs" deck={d.id} />
              <FrenchCard card="S7" size="xs" deck={d.id} />
              <FrenchCard faceDown size="xs" deck={d.id} />
            </span>
            {d.label}
            {d.note && <span className="rb-bt-opt-note">{d.note}</span>}
          </button>
        ))}
      </div>
      <div className="rb-bt-pop-sec">Dimensione carte</div>
      <div className="rb-bt-opts">
        {CARD_SIZES.map((sz) => (
          <button key={sz.id} type="button" className={`rb-bt-opt ${sz.id === sizeId ? 'on' : ''}`} onClick={() => setSizeId(sz.id)}>
            <span className="rb-bt-size-sample" style={{ fontSize: 13 * sz.scale }}>A♠</span>
            {sz.label}
          </button>
        ))}
      </div>
      <p className="rb-bt-pop-note">La scelta vale solo per te e resta salvata per le prossime partite.</p>
    </div>
  );
}

// "i" Regole: il regolamento che applica il server, in breve.
function RulesPanel({ onClose }) {
  const ref = useRef(null);
  usePopup(ref, onClose, 'modal:burraco-rules', '.rb-bt-rules-btn');
  return (
    <div className="rb-bt-pop rb-bt-rules" ref={ref} role="dialog" aria-label="Regole del Burraco">
      <div className="rb-bt-rules-head">
        <h4>Regole del Burraco</h4>
        <button type="button" className="rb-bt-fan-close" onClick={onClose} aria-label="Chiudi">✕</button>
      </div>
      <h5>Carte e pozzetti</h5>
      <ul>
        <li>Due mazzi francesi con 4 jolly. 11 carte a testa e un pozzetto da 11 per squadra (tutti contro tutti in 4: pozzetti da 8).</li>
        <li>Chi finisce le carte la prima volta prende il pozzetto della squadra: se ha finito calando continua a giocare, se ha finito scartando lo prende e il turno passa.</li>
      </ul>
      <h5>Il turno</h5>
      <ul>
        <li>Pesca una carta dal mazzo <b>oppure</b> prendi tutto il monte degli scarti.</li>
        <li>Se il monte era una carta sola, quella non si può riscartare nello stesso turno (🔒).</li>
        <li>Cala o attacca quante combinazioni vuoi, poi scarta una carta per passare.</li>
      </ul>
      <h5>Combinazioni</h5>
      <ul>
        <li><b>Scala</b>: almeno 3 carte dello stesso seme in fila; l'Asso va sotto (A-2-3) o sopra (Q-K-A).</li>
        <li><b>Tris</b>: almeno 3 carte dello stesso valore. Niente tris di 2, e una squadra non può aprire due tris dello stesso valore.</li>
        <li>Al massimo <b>una</b> matta (jolly o pinella, cioè un 2) per combinazione. La pinella dello stesso seme, al suo posto nella scala, vale come 2 normale.</li>
        <li><b>Burraco</b>: combinazione da 7 carte o più. Pulito (senza matte) 200 punti, semipulito 150, sporco 100.</li>
      </ul>
      <h5>Chiusura e punti</h5>
      <ul>
        <li>Per chiudere servono il pozzetto già preso e almeno un burraco, e si chiude <b>scartando</b> l'ultima carta, che non può essere una matta.</li>
        <li>Chiusura +100; pozzetto non preso −100; le carte rimaste in mano si tolgono dal punteggio.</li>
        <li>Vince chi arriva per primo a <b>2005</b> punti.</li>
      </ul>
    </div>
  );
}

function BurracoScoreRow({ room, isCoppie, teamOf }) {
  if (!isCoppie) {
    return (
      <div className="rb-scopa-score-row">
        {room.giocatori.map((g) => (
          <div key={g.userId} className="rb-scopa-score-item">
            <strong>{g.profilo.name}</strong>
            <span>{g.punteggio} punti</span>
          </div>
        ))}
      </div>
    );
  }
  const teamIds = [...new Set(room.giocatori.map((g) => teamOf(g.posizione)))];
  return (
    <div className="rb-scopa-score-row">
      {teamIds.map((teamId) => {
        const members = room.giocatori.filter((g) => teamOf(g.posizione) === teamId);
        return (
          <div key={teamId} className="rb-scopa-score-item">
            <strong>{members.map((m) => m.profilo.name).join(' e ')}</strong>
            <span>{members[0]?.punteggio ?? 0} punti</span>
          </div>
        );
      })}
    </div>
  );
}

function BurracoRecap({ recap, room, user, isCoppie, teamOf, onClose }) {
  const perGiocatore = recap.dettaglio.per_giocatore;
  const perSquadra = recap.dettaglio.per_squadra;
  const columns = isCoppie
    ? [...new Set(room.giocatori.map((g) => teamOf(g.posizione)))].map((teamId) => ({
        key: teamId,
        label: room.giocatori.filter((g) => teamOf(g.posizione) === teamId).map((g) => (g.userId === user.id ? 'Tu' : g.profilo.name)).join(' e '),
      }))
    : room.giocatori.map((g) => ({ key: g.userId, label: g.userId === user.id ? 'Tu' : g.profilo.name }));

  return (
    <div className="rb-scopa-recap-overlay" onClick={onClose}>
      <div className="rb-scopa-recap-card" onClick={(e) => e.stopPropagation()}>
        <h3>Fine mano</h3>
        <table className="rb-scopa-recap-table">
          <thead>
            <tr>
              <th></th>
              {columns.map((c) => <th key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {!isCoppie && [
              ['combinazioni', 'Combinazioni'],
              ['bonus_burraco', 'Bonus burraco'],
              ['penalita_mano', 'Penalità mano'],
              ['uscita', 'Uscita'],
            ].map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                {columns.map((c) => {
                  const v = perGiocatore?.[c.key]?.[key];
                  return <td key={c.key}>{typeof v === 'boolean' ? (v ? '✓' : '—') : v ?? '—'}</td>;
                })}
              </tr>
            ))}
            <tr className="rb-scopa-recap-total">
              <td>Punti mano</td>
              {columns.map((c) => (
                <td key={c.key}>{isCoppie ? perSquadra?.[c.key] ?? 0 : perGiocatore?.[c.key]?.punti_mano ?? 0}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <button type="button" className="rb-btn-primary" onClick={onClose}>Continua</button>
      </div>
    </div>
  );
}
