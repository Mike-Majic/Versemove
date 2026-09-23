import { useEffect, useRef, useState } from 'react';
import { fetchScopaState, fetchMyHand, fetchCaptures, fetchHandResults, playCard, startScopaHand, cardValue, cardSuit, SUITS, findCaptureCombinations } from '../../../data/scopa';
import { setRoomReady } from '../../../data/gameRooms';
import PlayingCard from './PlayingCard';
import Skeleton from '../../Skeleton';
import './scopaTable.css';

// Il tavolo di gioco vero e proprio: legge lo stato pubblico della mano, la
// propria mano privata e le prese, tutto rifatto ad ogni "tick" di eventi
// (vedi eventTick, passato da GiochiTavoloColumn/RoomView) invece che con
// un canale realtime dedicato — un solo canale per stanza, condiviso.
// L'unica scrittura è playCard: sceglie la carta e (a scelta) le carte del
// tavolo da prendere, il database valida tutto il resto.
export default function ScopaTable({ roomId, room, user, eventTick, onLeave }) {
  const [state, setState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [captures, setCaptures] = useState({});
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedTable, setSelectedTable] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recap, setRecap] = useState(null);
  const [scopaToast, setScopaToast] = useState(false);
  const lastResultIdRef = useRef(null);
  const myScopeRef = useRef(0);
  const startAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pub, hand, caps, results] = await Promise.all([
        fetchScopaState(roomId),
        fetchMyHand(roomId),
        fetchCaptures(roomId),
        fetchHandResults(roomId),
      ]);
      if (cancelled) return;
      setState(pub);
      setMyHand(hand);
      setCaptures(caps);

      if (pub) {
        const mine = pub.scope?.[user.id] ?? 0;
        if (mine > myScopeRef.current) {
          setScopaToast(true);
          setTimeout(() => setScopaToast(false), 1800);
        }
        myScopeRef.current = mine;
      }

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
  useEffect(() => {
    setSelectedCard(null);
    setSelectedTable([]);
  }, [state?.turnoUserId, isHandActive]);

  const isMyTurn = state?.turnoUserId === user.id;
  const opponentEntry = room.giocatori.find((g) => g.userId !== user.id);
  const meEntry = room.giocatori.find((g) => g.userId === user.id);

  const toggleTableCard = (card) => {
    if (!selectedCard) return;
    setSelectedTable((prev) => (prev.includes(card) ? prev.filter((c) => c !== card) : [...prev, card]));
  };

  const selectedSum = selectedTable.reduce((s, c) => s + cardValue(c), 0);
  const targetValue = selectedCard ? cardValue(selectedCard) : null;
  const canPlay = selectedCard && (selectedTable.length === 0 || selectedSum === targetValue);

  const highlightSet = selectedCard
    ? new Set(findCaptureCombinations(state?.tavolo ?? [], cardValue(selectedCard)).flat())
    : new Set();

  const handlePlay = async () => {
    if (!selectedCard) return;
    setBusy(true);
    setError('');
    const { error: err } = await playCard(roomId, selectedCard, selectedTable);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    setSelectedCard(null);
    setSelectedTable([]);
    const [pub, hand, caps] = await Promise.all([fetchScopaState(roomId), fetchMyHand(roomId), fetchCaptures(roomId)]);
    setState(pub);
    setMyHand(hand);
    setCaptures(caps);
  };

  // Fra una mano e l'altra (tavolo azzerato ma partita non ancora vinta):
  // stessa logica "pronto + parte da sola" della sala d'attesa.
  const bothReady = room.giocatori.length === 2 && room.giocatori.every((g) => g.pronto);
  useEffect(() => {
    if (state === null && bothReady && meEntry?.posizione === 0 && !startAttemptedRef.current) {
      startAttemptedRef.current = true;
      startScopaHand(roomId);
    }
    if (!bothReady) startAttemptedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, bothReady, meEntry?.posizione]);

  const toggleReady = () => setRoomReady(roomId, !meEntry?.pronto);

  if (state === null) {
    return (
      <div className="rb-scopa-table">
        {recap && <HandRecap recap={recap} room={room} user={user} onClose={() => setRecap(null)} />}
        <div className="rb-scopa-between-hands">
          <h3>Mano finita — punteggio aggiornato</h3>
          <ScoreRow room={room} user={user} />
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
    <div className="rb-scopa-table">
      {recap && <HandRecap recap={recap} room={room} user={user} onClose={() => setRecap(null)} />}
      {scopaToast && <div className="rb-scopa-toast">Scopa! 🧹</div>}

      <div className="rb-scopa-opponent-bar">
        <PlayerBadge entry={opponentEntry} captureCount={captures[opponentEntry?.userId]?.length ?? 0} />
        <div className="rb-scopa-opponent-hand">
          {Array.from({ length: state.carteInMano?.[opponentEntry?.userId] ?? 0 }).map((_, i) => (
            <PlayingCard key={i} faceDown size="sm" />
          ))}
        </div>
      </div>

      <div className="rb-scopa-felt">
        <div className={`rb-scopa-turn-banner ${isMyTurn ? 'mine' : ''}`}>
          {isMyTurn ? 'Tocca a te' : `Turno di ${opponentEntry?.profilo.name ?? 'avversario'}`}
        </div>

        <div className="rb-scopa-deck-and-table">
          <div className="rb-scopa-deck">
            <PlayingCard faceDown size="md" />
            <span>{state.carteRimaste}</span>
          </div>

          <div className="rb-scopa-table-cards">
            {state.tavolo.length === 0 && <span className="rb-scopa-empty-table">Tavolo vuoto</span>}
            {state.tavolo.map((card) => (
              <PlayingCard
                key={card}
                card={card}
                size="md"
                selected={selectedTable.includes(card)}
                disabled={!selectedCard}
                className={highlightSet.has(card) ? 'rb-scopa-highlight' : ''}
                onClick={() => toggleTableCard(card)}
              />
            ))}
          </div>
        </div>

        {selectedCard && (
          <div className="rb-scopa-action-bar">
            <span>
              Giochi <strong style={{ color: SUITS[cardSuit(selectedCard)].colore }}>{selectedCard}</strong>
              {selectedTable.length > 0 ? ` prendendo ${selectedTable.length} carte (somma ${selectedSum})` : ' senza prendere'}
            </span>
            {error && <span className="rb-giochi-error">{error}</span>}
            <div className="rb-scopa-action-buttons">
              <button type="button" className="rb-reset-filters-btn" onClick={() => { setSelectedCard(null); setSelectedTable([]); }}>
                Annulla
              </button>
              <button type="button" className="rb-btn-primary" onClick={handlePlay} disabled={!canPlay || busy}>
                Gioca
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rb-scopa-me-bar">
        <PlayerBadge entry={meEntry} me captureCount={captures[user.id]?.length ?? 0} />
        <div className="rb-scopa-hand">
          {myHand.map((card) => (
            <PlayingCard
              key={card}
              card={card}
              size="lg"
              selected={selectedCard === card}
              disabled={!isMyTurn}
              onClick={() => {
                setSelectedCard((prev) => (prev === card ? null : card));
                setSelectedTable([]);
              }}
            />
          ))}
        </div>
        <button type="button" className="rb-scopa-leave-btn" onClick={onLeave}>Abbandona</button>
      </div>
    </div>
  );
}

function PlayerBadge({ entry, me = false, captureCount = 0 }) {
  if (!entry) return <div className="rb-scopa-player-badge empty">In attesa…</div>;
  return (
    <div className={`rb-scopa-player-badge ${me ? 'me' : ''}`}>
      <img src={entry.profilo.avatar || undefined} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      <div>
        <strong>{entry.profilo.name}{me ? ' (tu)' : ''}</strong>
        <span>{entry.punteggio} punti · {captureCount} prese</span>
      </div>
    </div>
  );
}

function ScoreRow({ room }) {
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

function HandRecap({ recap, room, user, onClose }) {
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
              ['carte', 'Carte'],
              ['denari', 'Denari'],
              ['settebello', 'Settebello'],
              ['primiera', 'Primiera'],
              ['scope', 'Scope'],
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
