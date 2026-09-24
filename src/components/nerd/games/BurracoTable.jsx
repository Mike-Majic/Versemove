import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  fetchBurracoState,
  fetchMyHand,
  fetchMelds,
  fetchHandResults,
  startBurracoHand,
  drawCard,
  layCards,
  discardCard,
} from '../../../data/burraco';
import { setRoomReady, firstHumanHostId } from '../../../data/gameRooms';
import { useBackLayer } from '../../../hooks/useBackLayer';
import useBotDriver from './useBotDriver';
import FrenchCard from './FrenchCard';
import { CARD_WIDTHS, DECKS, TABLES, sortHand, useCardDeck, useCardTable, useHandSort } from './cardTheme';
import Skeleton from '../../Skeleton';
// Dal tavolo di Scopa restano solo il riepilogo di fine mano e la schermata
// fra una mano e l'altra (stesso linguaggio visivo per tutti i giochi).
import './scopaTable.css';
import './burracoTable.css';

const BOT_DIFFICULTY_LABEL = { facile: 'facile', medio: 'medio', difficile: 'difficile' };

// Tavolo di Burraco (vedi docs/mockup/mockup_tavolo_burraco.html): da 2 a
// 4 giocatori, a coppie (posti 0/2 contro 1/3, solo con 4 giocatori)
// oppure tutti contro tutti. Stato pubblico + mano privata + combinazioni,
// riletti a ogni evento della stanza. Il turno ha due fasi (pesca -> gioco):
// si pesca dal mazzo o dagli scarti, poi si cala/attacca quante volte si
// vuole (anche alle combinazioni del compagno) e si scarta per passare.
// Tutte le regole restano nel database; qui solo la vista:
// - panno con la striscia centrale (mazzo sopra, scarti sotto), a sinistra
//   "NOI" e a destra "LORO", combinazioni in colonne verticali;
// - compagno/avversario unico in alto, avversari ai lati, con le carte in
//   mano contate in un pallino;
// - la mano in basso tutta visibile, sovrapposta quanto serve;
// - ordinamento "per seme"/"per numero" e 🎨 tavolo e mazzo, solo lato
//   client (vedi cardTheme.js).
export default function BurracoTable({ roomId, room, user, eventTick, onLeave }) {
  const [state, setState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [melds, setMelds] = useState([]);
  const [selected, setSelected] = useState([]); // chiavi "H7#0" (vedi handItems)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recap, setRecap] = useState(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [sortMode, setSortMode] = useHandSort();
  const [tableId] = useCardTable();
  const lastResultIdRef = useRef(null);
  const startAttemptedRef = useRef(false);

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
      setState(pub);
      setMyHand(hand);
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

  const isMyTurn = state?.turnoUserId === user.id;
  const canDraw = isMyTurn && state?.fase === 'pesca';
  const canAct = isMyTurn && state?.fase === 'gioco';
  const meEntry = room.giocatori.find((g) => g.userId === user.id);
  const iAmHost = firstHumanHostId(room.giocatori) === user.id;
  const { isBotTurn, botName } = useBotDriver({ roomId, room, turnUserId: state?.turnoUserId, user, eventTick });

  // A coppie (solo con 4 giocatori) i posti 0/2 fanno squadra A, 1/3
  // squadra B; altrimenti ognuno fa squadra da solo — così combinazioni "di
  // squadra" e punteggio funzionano allo stesso modo in tutte le modalità.
  const isCoppie = room.modalita === 'coppie' && room.maxGiocatori === 4;
  const teamOf = (posizione) => (isCoppie ? posizione % 2 : posizione);
  const myTeam = teamOf(meEntry?.posizione ?? 0);
  const posizioneOf = (uid) => room.giocatori.find((g) => g.userId === uid)?.posizione ?? -1;

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

  const toggleCard = (key) => {
    if (!canAct) return;
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const refreshAfterMove = async () => {
    const [pub, hand, m] = await Promise.all([fetchBurracoState(roomId), fetchMyHand(roomId), fetchMelds(roomId)]);
    setState(pub);
    setMyHand(hand);
    setMelds(m);
  };

  const handleDraw = async (da) => {
    if (!canDraw || busy) return;
    setBusy(true);
    setError('');
    const { error: err } = await drawCard(roomId, da);
    setBusy(false);
    if (err) return setError(err);
    await refreshAfterMove();
  };

  const handleNewMeld = async () => {
    if (selectedCards.length < 3) return;
    setBusy(true);
    setError('');
    const { error: err } = await layCards(roomId, null, selectedCards);
    setBusy(false);
    if (err) return setError(err);
    setSelected([]);
    await refreshAfterMove();
  };

  // meldId può essere anche di una combinazione del compagno (myMelds le
  // include entrambe): la RPC lato server verifica che sia lecito.
  const handleAddToMeld = async (meldId) => {
    if (selectedCards.length === 0) return;
    setBusy(true);
    setError('');
    const { error: err } = await layCards(roomId, meldId, selectedCards);
    setBusy(false);
    if (err) return setError(err);
    setSelected([]);
    await refreshAfterMove();
  };

  const handleDiscard = async () => {
    if (selectedCards.length !== 1) return;
    setBusy(true);
    setError('');
    const { error: err } = await discardCard(roomId, selectedCards[0]);
    setBusy(false);
    if (err) return setError(err);
    setSelected([]);
    await refreshAfterMove();
  };

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
      <div className="rb-burraco-table">
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
      ? 'Tocca a te — pesca dal mazzo o dagli scarti'
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

  return (
    <div className="rb-burraco-table">
      {recap && <BurracoRecap recap={recap} room={room} user={user} isCoppie={isCoppie} teamOf={teamOf} onClose={() => setRecap(null)} />}

      <div className={`rb-bt-stage ${seatSlots.left ? 'has-left' : ''} ${seatSlots.right ? 'has-right' : ''}`}>
        {seatSlots.top && <Seat {...seatProps(seatSlots.top)} position="top" />}
        {seatSlots.left && <Seat {...seatProps(seatSlots.left)} position="left" />}
        {seatSlots.right && <Seat {...seatProps(seatSlots.right)} position="right" />}

        <div className={`rb-bt-table t-${tableId}`}>
          <div className="rb-bt-felt">
            <div className="rb-bt-strip" />

            <div className="rb-bt-half noi">
              {myMelds.length === 0 && <span className="rb-bt-empty-half">Le vostre combinazioni</span>}
              {myMelds.map((m) => (
                <MeldColumn key={m.id} meld={m} onAttach={canAct && selectedCards.length > 0 ? () => handleAddToMeld(m.id) : null} busy={busy} />
              ))}
            </div>

            <div className="rb-bt-half loro">
              {opposingGroups.every((g) => g.melds.length === 0) && <span className="rb-bt-empty-half">Le loro combinazioni</span>}
              {opposingGroups.length > 1
                ? opposingGroups.map((g) =>
                    g.melds.length > 0 ? (
                      <div key={g.teamId} className="rb-bt-group">
                        <span className="rb-bt-group-name">{g.name} · {g.punteggio}</span>
                        <div className="rb-bt-group-cols">
                          {g.melds.map((m) => <MeldColumn key={m.id} meld={m} />)}
                        </div>
                      </div>
                    ) : null
                  )
                : opposingGroups[0]?.melds.map((m) => <MeldColumn key={m.id} meld={m} />)}
            </div>

            <div className="rb-bt-piles">
              <button type="button" className={`rb-bt-pile ${canDraw ? 'can' : ''}`} onClick={() => handleDraw('mazzo')} disabled={!canDraw || busy}>
                <FrenchCard faceDown size="md" />
                <span>{state.carteRimaste} nel mazzo</span>
              </button>
              <button
                type="button"
                className={`rb-bt-pile ${canDraw && state.scartoCima ? 'can' : ''}`}
                onClick={() => handleDraw('scarti')}
                disabled={!canDraw || !state.scartoCima || busy}
              >
                {state.scartoCima ? <FrenchCard card={state.scartoCima} size="md" /> : <span className="rb-bt-empty-pile">Vuoti</span>}
                <span>Scarti</span>
              </button>
            </div>

            <span className="rb-bt-team noi">NOI <b>{noiScore}</b></span>
            <span className="rb-bt-team loro">LORO {loroScore !== null && <b>{loroScore}</b>}</span>
          </div>

          <div className={`rb-bt-status ${isMyTurn ? 'mine' : ''}`} title="Per chiudere serve almeno un burraco (combinazione da 7 carte).">
            {status}
          </div>

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
        <button type="button" className="rb-bt-btn ghost" onClick={onLeave}>Abbandona</button>
        <span className="rb-bt-bar-spacer" />
        <span className="rb-bt-bar-count">
          {!canAct ? '' : selectedCards.length > 0 ? `${selectedCards.length} selezionate` : 'Seleziona carte'}
        </span>
        {selectedCards.length > 0 && (
          <button type="button" className="rb-bt-btn" onClick={() => setSelected([])}>Annulla</button>
        )}
        <button type="button" className="rb-bt-btn" onClick={handleNewMeld} disabled={!canAct || selectedCards.length < 3 || busy}>
          Nuova combinazione
        </button>
        <button type="button" className="rb-bt-btn primary" onClick={handleDiscard} disabled={!canAct || selectedCards.length !== 1 || busy}>
          Scarta
        </button>
      </div>
      {canAct && selectedCards.length > 0 && myMelds.length > 0 && (
        <p className="rb-bt-hint">Per attaccare, tocca una colonna di NOI.</p>
      )}
      {error && <p className="rb-giochi-error rb-bt-error">{error}</p>}

      <Hand items={handItems} selected={selected} canAct={canAct} onToggle={toggleCard} />
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

// Combinazione in colonna: carte sovrapposte in verticale, di ognuna resta
// visibile solo l'angolo in alto. Un burraco (7+ carte) ha il bordo dorato.
// Con onAttach la colonna è cliccabile: attacca le carte selezionate.
function MeldColumn({ meld, onAttach, busy }) {
  const cls = `rb-bt-col ${meld.carte.length >= 7 ? 'burraco' : ''} ${onAttach ? 'attachable' : ''}`;
  const cards = meld.carte.map((c, i) => <FrenchCard key={`${c}-${i}`} card={c} size="sm" className="rb-bt-col-card" />);
  if (onAttach) {
    return (
      <button type="button" className={cls} onClick={onAttach} disabled={busy} title="Attacca le carte selezionate a questa combinazione">
        {cards}
      </button>
    );
  }
  return <div className={cls}>{cards}</div>;
}

// La mano: tutte le carte in una fila, sovrapposte quanto basta a starci
// nella larghezza disponibile (niente scroll orizzontale, anche con 20
// carte). Su schermi stretti le carte si rimpiccioliscono.
function Hand({ items, selected, canAct, onToggle }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardW = width && width < 420 ? 52 : width && width < 640 ? CARD_WIDTHS.md : CARD_WIDTHS.lg;
  const n = items.length;
  const maxStep = cardW * 0.62;
  const step = n > 1 && width ? Math.min(maxStep, (width - cardW) / (n - 1)) : maxStep;

  return (
    <div className="rb-bt-hand" ref={ref} style={{ paddingTop: 22 }}>
      <div className="rb-bt-hand-row">
        {items.map((h, i) => (
          <FrenchCard
            key={h.key}
            card={h.card}
            width={cardW}
            selected={selected.includes(h.key)}
            disabled={!canAct}
            onClick={() => onToggle(h.key)}
            className="rb-bt-hand-card"
            style={i === 0 ? undefined : { marginLeft: step - cardW }}
          />
        ))}
      </div>
    </div>
  );
}

// 🎨 Personalizza: tavolo e mazzo, solo per questo utente (localStorage,
// vedi cardTheme.js). Si chiude cliccando fuori, con Esc o con Indietro.
function CustomizePanel({ onClose }) {
  const ref = useRef(null);
  const [tableId, setTableId] = useCardTable();
  const [deck, setDeck] = useCardDeck();
  useBackLayer(true, onClose, 'modal:burraco-customize');

  useEffect(() => {
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.rb-bt-gear')) onClose();
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
  }, [onClose]);

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
          </button>
        ))}
      </div>
      <p className="rb-bt-pop-note">La scelta vale solo per te e resta salvata per le prossime partite.</p>
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
