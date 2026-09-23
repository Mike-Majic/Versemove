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
import { setRoomReady } from '../../../data/gameRooms';
import FrenchCard from './FrenchCard';
import Skeleton from '../../Skeleton';
// Riusa il guscio del tavolo di Scopa (badge giocatore, banner turno, barra
// azioni, mano, ricapitolo...): stesso linguaggio visivo per tutti i giochi,
// qui solo le regole/classi specifiche di Burraco (feltro, combinazioni).
import './scopaTable.css';
import './burracoTable.css';

// Tavolo di Burraco: stessa impostazione di ScopaTable (stato pubblico +
// mano privata + eventi della stanza, rifatti ad ogni tick). Qui il turno
// ha due fasi (pesca -> gioco): prima si pesca (mazzo o scarti), poi si
// possono calare/aggiungere combinazioni più volte, infine si scarta per
// passare il turno. Tutte le regole (combinazioni valide, punteggio,
// chi vince) restano nel database.
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
  const opponentEntry = room.giocatori.find((g) => g.userId !== user.id);
  const meEntry = room.giocatori.find((g) => g.userId === user.id);
  const myMelds = melds.filter((m) => m.ownerId === user.id);
  const opponentMelds = melds.filter((m) => m.ownerId !== user.id);

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

  // Fra una mano e l'altra: stessa logica "pronto + parte da sola" di Scopa.
  const bothReady = room.giocatori.length === 2 && room.giocatori.every((g) => g.pronto);
  useEffect(() => {
    if (state === null && bothReady && meEntry?.posizione === 0 && !startAttemptedRef.current) {
      startAttemptedRef.current = true;
      startBurracoHand(roomId);
    }
    if (!bothReady) startAttemptedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, bothReady, meEntry?.posizione]);

  const toggleReady = () => setRoomReady(roomId, !meEntry?.pronto);

  if (state === null) {
    return (
      <div className="rb-burraco-table">
        {recap && <BurracoRecap recap={recap} room={room} user={user} onClose={() => setRecap(null)} />}
        <div className="rb-scopa-between-hands">
          <h3>Mano finita — punteggio aggiornato</h3>
          <BurracoScoreRow room={room} />
          <p className="rb-giochi-hint">Quando siete entrambi pronti parte la prossima mano.</p>
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
      {recap && <BurracoRecap recap={recap} room={room} user={user} onClose={() => setRecap(null)} />}

      <div className="rb-scopa-opponent-bar">
        <BurracoPlayerBadge entry={opponentEntry} meldCount={opponentMelds.length} />
        <div className="rb-scopa-opponent-hand">
          {Array.from({ length: state.carteInMano?.[opponentEntry?.userId] ?? 0 }).map((_, i) => (
            <FrenchCard key={i} faceDown size="sm" />
          ))}
        </div>
      </div>

      <div className="rb-burraco-felt">
        <div className={`rb-scopa-turn-banner ${isMyTurn ? 'mine' : ''}`}>
          {isMyTurn
            ? state.fase === 'pesca' ? 'Tocca a te — pesca una carta' : 'Tocca a te — cala o scarta'
            : `Turno di ${opponentEntry?.profilo.name ?? 'avversario'}`}
        </div>

        <div className="rb-burraco-melds">
          <MeldGroup title="Le tue combinazioni" melds={myMelds} onAdd={canAct && selected.length > 0 ? handleAddToMeld : null} />
          <MeldGroup title={`Combinazioni di ${opponentEntry?.profilo.name ?? 'avversario'}`} melds={opponentMelds} />
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

function BurracoPlayerBadge({ entry, me = false, meldCount = 0 }) {
  if (!entry) return <div className="rb-scopa-player-badge empty">In attesa…</div>;
  return (
    <div className={`rb-scopa-player-badge ${me ? 'me' : ''}`}>
      <img src={entry.profilo.avatar || undefined} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      <div>
        <strong>{entry.profilo.name}{me ? ' (tu)' : ''}</strong>
        <span>{entry.punteggio} punti · {meldCount} combinazioni</span>
      </div>
    </div>
  );
}

function BurracoScoreRow({ room }) {
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

function BurracoRecap({ recap, room, user, onClose }) {
  const perGiocatore = recap.dettaglio.per_giocatore;
  return (
    <div className="rb-scopa-recap-overlay" onClick={onClose}>
      <div className="rb-scopa-recap-card" onClick={(e) => e.stopPropagation()}>
        <h3>Fine mano</h3>
        <table className="rb-scopa-recap-table">
          <thead>
            <tr>
              <th></th>
              {room.giocatori.map((g) => (
                <th key={g.userId}>{g.userId === user.id ? 'Tu' : g.profilo.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['combinazioni', 'Combinazioni'],
              ['bonus_burraco', 'Bonus burraco'],
              ['penalita_mano', 'Penalità mano'],
              ['uscita', 'Uscita'],
            ].map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                {room.giocatori.map((g) => {
                  const v = perGiocatore[g.userId]?.[key];
                  return <td key={g.userId}>{typeof v === 'boolean' ? (v ? '✓' : '—') : v ?? '—'}</td>;
                })}
              </tr>
            ))}
            <tr className="rb-scopa-recap-total">
              <td>Punti mano</td>
              {room.giocatori.map((g) => (
                <td key={g.userId}>{perGiocatore[g.userId]?.punti_mano ?? 0}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <button type="button" className="rb-btn-primary" onClick={onClose}>Continua</button>
      </div>
    </div>
  );
}
