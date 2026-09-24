import { useEffect, useRef, useState } from 'react';
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
import useBotDriver from './useBotDriver';
import FrenchCard from './FrenchCard';
import Skeleton from '../../Skeleton';
// Riusa il guscio del tavolo di Scopa (badge giocatore, banner turno, barra
// azioni, mano, ricapitolo...): stesso linguaggio visivo per tutti i giochi,
// qui solo le regole/classi specifiche di Burraco (feltro, combinazioni).
import './scopaTable.css';
import './burracoTable.css';

// Tavolo di Burraco: da 2 a 4 giocatori, a coppie (posti 0/2 vs 1/3, solo
// con 4 giocatori) oppure tutti contro tutti. Stessa impostazione di
// ScopaTable (stato pubblico + mano privata + eventi della stanza, rifatti
// ad ogni tick). Il turno ha due fasi (pesca -> gioco): prima si pesca
// (mazzo o scarti), poi si possono calare/aggiungere combinazioni più
// volte — anche a quelle del compagno, a coppie — infine si scarta per
// passare il turno. Tutte le regole (combinazioni valide, punteggio, chi
// vince, il burraco obbligatorio per chiudere) restano nel database.
export default function BurracoTable({ roomId, room, user, eventTick, onLeave }) {
  const [state, setState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [melds, setMelds] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recap, setRecap] = useState(null);
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
  const canAct = isMyTurn && state?.fase === 'gioco';
  const meEntry = room.giocatori.find((g) => g.userId === user.id);
  const iAmHost = firstHumanHostId(room.giocatori) === user.id;
  const { isBotTurn, botName } = useBotDriver({ roomId, room, turnUserId: state?.turnoUserId, user, eventTick });

  // A coppie (solo con 4 giocatori) i posti 0/2 fanno squadra A, 1/3
  // squadra B; altrimenti (2, 3 giocatori, o "tutti contro tutti") ognuno
  // fa squadra da solo — così tutto il resto (combinazioni "di squadra",
  // punteggio) funziona allo stesso modo senza doverlo distinguere ovunque.
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
  // Disposizione intorno al tavolo: con 1 avversario va sopra (come prima),
  // con 2 sinistra/destra, con 3 sinistra/sopra/destra — a coppie il
  // compagno finisce sempre al centro (sopra), essendo il posto "di
  // fronte" a qualunque posto tu occupi.
  const seatSlots =
    orderedOthers.length === 1
      ? { top: orderedOthers[0] }
      : orderedOthers.length === 2
        ? { left: orderedOthers[0], right: orderedOthers[1] }
        : { left: orderedOthers[0], top: orderedOthers[1], right: orderedOthers[2] };

  const myMelds = melds.filter((m) => teamOf(posizioneOf(m.ownerId)) === myTeam);
  const opposingTeamIds = [...new Set(others.map((g) => teamOf(g.posizione)))];
  const opposingGroups = opposingTeamIds.map((teamId) => {
    const members = room.giocatori.filter((g) => teamOf(g.posizione) === teamId);
    const memberIds = members.map((g) => g.userId);
    return {
      teamId,
      title: isCoppie
        ? `Squadra di ${members.map((m) => m.profilo.name).join(' e ')}`
        : `Combinazioni di ${members[0]?.profilo.name ?? 'avversario'}`,
      melds: melds.filter((m) => memberIds.includes(m.ownerId)),
    };
  });

  const toggleCard = (card) => {
    if (!canAct) return;
    setSelected((prev) => (prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]));
  };

  const refreshAfterMove = async () => {
    const [pub, hand, m] = await Promise.all([fetchBurracoState(roomId), fetchMyHand(roomId), fetchMelds(roomId)]);
    setState(pub);
    setMyHand(hand);
    setMelds(m);
  };

  const handleDraw = async (da) => {
    setBusy(true);
    setError('');
    const { error: err } = await drawCard(roomId, da);
    setBusy(false);
    if (err) return setError(err);
    await refreshAfterMove();
  };

  const handleNewMeld = async () => {
    if (selected.length < 3) return;
    setBusy(true);
    setError('');
    const { error: err } = await layCards(roomId, null, selected);
    setBusy(false);
    if (err) return setError(err);
    setSelected([]);
    await refreshAfterMove();
  };

  // meldId può essere anche di una combinazione del compagno (myMelds le
  // include entrambe): la RPC lato server verifica che sia lecito.
  const handleAddToMeld = async (meldId) => {
    if (selected.length === 0) return;
    setBusy(true);
    setError('');
    const { error: err } = await layCards(roomId, meldId, selected);
    setBusy(false);
    if (err) return setError(err);
    setSelected([]);
    await refreshAfterMove();
  };

  const handleDiscard = async () => {
    if (selected.length !== 1) return;
    setBusy(true);
    setError('');
    const { error: err } = await discardCard(roomId, selected[0]);
    setBusy(false);
    if (err) return setError(err);
    setSelected([]);
    await refreshAfterMove();
  };

  // Fra una mano e l'altra: stessa logica "pronto + parte da sola" di Scopa,
  // ma è l'umano con la posizione più bassa a far partire la mano (non più
  // "chi sta al posto 0": con i posti scelti a piacere e i bot potrebbe non
  // esserci nessuno lì).
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

  return (
    <div className="rb-burraco-table">
      {recap && <BurracoRecap recap={recap} room={room} user={user} isCoppie={isCoppie} teamOf={teamOf} onClose={() => setRecap(null)} />}

      <div className="rb-burraco-opponents-row">
        {seatSlots.left && <OpponentSlot entry={seatSlots.left} state={state} isTeammate={isCoppie && teamOf(seatSlots.left.posizione) === myTeam} />}
        {seatSlots.top && <OpponentSlot entry={seatSlots.top} state={state} isTeammate={isCoppie && teamOf(seatSlots.top.posizione) === myTeam} />}
        {seatSlots.right && <OpponentSlot entry={seatSlots.right} state={state} isTeammate={isCoppie && teamOf(seatSlots.right.posizione) === myTeam} />}
      </div>

      <div className="rb-burraco-felt">
        <div className={`rb-scopa-turn-banner ${isMyTurn ? 'mine' : ''}`}>
          {isMyTurn
            ? state.fase === 'pesca' ? 'Tocca a te — pesca una carta' : 'Tocca a te — cala o scarta'
            : isBotTurn ? `🤖 ${botName ?? 'Il computer'} sta pensando…` : `Turno di ${room.giocatori.find((g) => g.userId === state.turnoUserId)?.profilo.name ?? 'avversario'}`}
        </div>

        <p className="rb-giochi-hint rb-burraco-closing-hint">Per chiudere serve almeno un burraco (combinazione da 7 carte).</p>

        <div className="rb-burraco-melds">
          <MeldGroup title={isCoppie ? 'La tua squadra' : 'Le tue combinazioni'} melds={myMelds} onAdd={canAct && selected.length > 0 ? handleAddToMeld : null} />
          {opposingGroups.map((g) => (
            <MeldGroup key={g.teamId} title={g.title} melds={g.melds} />
          ))}
        </div>

        <div className="rb-scopa-deck-and-table">
          <button
            type="button"
            className="rb-burraco-pile"
            onClick={() => (isMyTurn && state.fase === 'pesca' ? handleDraw('mazzo') : undefined)}
            disabled={!(isMyTurn && state.fase === 'pesca') || busy}
          >
            <FrenchCard faceDown size="md" />
            <span>{state.carteRimaste} nel mazzo</span>
          </button>

          <button
            type="button"
            className="rb-burraco-pile"
            onClick={() => (isMyTurn && state.fase === 'pesca' && state.scartoCima ? handleDraw('scarti') : undefined)}
            disabled={!(isMyTurn && state.fase === 'pesca' && state.scartoCima) || busy}
          >
            {state.scartoCima ? <FrenchCard card={state.scartoCima} size="md" /> : <div className="rb-scopa-empty-table">Scarti vuoti</div>}
            <span>Pila scarti</span>
          </button>
        </div>

        {canAct && (
          <div className="rb-scopa-action-bar">
            <span>{selected.length > 0 ? `${selected.length} carte selezionate` : 'Seleziona delle carte dalla mano'}</span>
            {error && <span className="rb-giochi-error">{error}</span>}
            <div className="rb-scopa-action-buttons">
              <button type="button" className="rb-reset-filters-btn" onClick={() => setSelected([])} disabled={selected.length === 0}>
                Annulla
              </button>
              <button type="button" className="rb-reset-filters-btn" onClick={handleNewMeld} disabled={selected.length < 3 || busy}>
                Nuova combinazione
              </button>
              <button type="button" className="rb-btn-primary" onClick={handleDiscard} disabled={selected.length !== 1 || busy}>
                Scarta
              </button>
            </div>
          </div>
        )}
        {!canAct && error && <p className="rb-giochi-error">{error}</p>}
      </div>

      <div className="rb-scopa-me-bar">
        <BurracoPlayerBadge entry={meEntry} me meldCount={myMelds.length} />
        <div className="rb-scopa-hand">
          {myHand.map((card, i) => (
            <FrenchCard
              key={`${card}-${i}`}
              card={card}
              size="lg"
              selected={selected.includes(card)}
              disabled={!canAct}
              onClick={() => toggleCard(card)}
            />
          ))}
        </div>
        <button type="button" className="rb-scopa-leave-btn" onClick={onLeave}>Abbandona</button>
      </div>
    </div>
  );
}

function OpponentSlot({ entry, state, isTeammate }) {
  return (
    <div className="rb-burraco-opponent-slot">
      {isTeammate && <span className="rb-burraco-team-tag">Compagno</span>}
      <BurracoPlayerBadge entry={entry} meldCount={undefined} showMeldless />
      <div className="rb-scopa-opponent-hand">
        {Array.from({ length: state.carteInMano?.[entry.userId] ?? 0 }).map((_, i) => (
          <FrenchCard key={i} faceDown size="sm" />
        ))}
      </div>
    </div>
  );
}

function MeldGroup({ title, melds, onAdd }) {
  if (melds.length === 0) return null;
  return (
    <div className="rb-burraco-meld-group">
      <span className="rb-burraco-meld-title">{title}</span>
      <div className="rb-burraco-meld-list">
        {melds.map((m) => (
          <div key={m.id} className="rb-burraco-meld">
            <div className="rb-burraco-meld-cards">
              {m.carte.map((c, i) => (
                <FrenchCard key={`${c}-${i}`} card={c} size="sm" />
              ))}
            </div>
            {onAdd && (
              <button type="button" className="rb-burraco-meld-add" onClick={() => onAdd(m.id)}>
                + Aggiungi
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// showMeldless: l'elenco delle combinazioni sta già in "Le tue combinazioni"
// / gruppi avversari sopra al feltro, qui nella fila degli avversari basta
// nome + eventuale badge bot, senza ripetere il conteggio combinazioni.
function BurracoPlayerBadge({ entry, me = false, meldCount, showMeldless = false }) {
  if (!entry) return <div className="rb-scopa-player-badge empty">In attesa…</div>;
  return (
    <div className={`rb-scopa-player-badge ${me ? 'me' : ''}`}>
      {entry.isBot ? (
        <span className="rb-scopa-bot-avatar">🤖</span>
      ) : (
        <img src={entry.profilo.avatar || undefined} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      )}
      <div>
        <strong>{entry.profilo.name}{me ? ' (tu)' : ''}</strong>
        {!showMeldless && <span>{entry.punteggio} punti · {meldCount ?? 0} combinazioni</span>}
      </div>
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
