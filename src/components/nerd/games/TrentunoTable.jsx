import { useEffect, useRef, useState } from 'react';
import {
  fetchTrentunoState,
  fetchMyHand,
  fetchHandResults,
  startTrentunoHand,
  drawCard,
  knock,
  discardCard,
} from '../../../data/trentuno';
import { setRoomReady } from '../../../data/gameRooms';
import PlayingCard from './PlayingCard';
import Skeleton from '../../Skeleton';
import './scopaTable.css';
import './trentunoTable.css';

const MODO_LABEL = { trentuno: 'Trentuno!', confronto: 'Confronto mani', esaurito: 'Mazzo esaurito' };

// Tavolo di Trentuno (31): stessa impostazione di ScopaTable/BurracoTable.
// Il turno ha due fasi (pesca -> scarta); si può "bussare" invece di
// pescare per chiedere l'ultimo giro all'avversario e poi confrontare le
// mani, oppure vincere all'istante facendo 31 (asso + 2 figure dello
// stesso seme) scartando. Chi perde una mano perde una vita (max 3, tenute
// nel campo "punteggio" della stanza); tutte le regole restano nel database.
export default function TrentunoTable({ roomId, room, user, eventTick, onLeave }) {
  const [state, setState] = useState(null);
  const [myHand, setMyHand] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recap, setRecap] = useState(null);
  const lastResultIdRef = useRef(null);
  const startAttemptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pub, hand, results] = await Promise.all([fetchTrentunoState(roomId), fetchMyHand(roomId), fetchHandResults(roomId)]);
      if (cancelled) return;
      setState(pub);
      setMyHand(hand);
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
  useEffect(() => { setSelected(null); }, [state?.turnoUserId, state?.fase, isHandActive]);

  const isMyTurn = state?.turnoUserId === user.id;
  const opponentEntry = room.giocatori.find((g) => g.userId !== user.id);
  const meEntry = room.giocatori.find((g) => g.userId === user.id);
  const canDraw = isMyTurn && state?.fase === 'pesca';
  const canDiscard = isMyTurn && state?.fase === 'scarta';
  const canKnock = canDraw && !state?.bussatoDa;

  const refreshAfterMove = async () => {
    const [pub, hand] = await Promise.all([fetchTrentunoState(roomId), fetchMyHand(roomId)]);
    setState(pub);
    setMyHand(hand);
  };

  const handleDraw = async (da) => {
    setBusy(true);
    setError('');
    const { error: err } = await drawCard(roomId, da);
    setBusy(false);
    if (err) return setError(err);
    await refreshAfterMove();
  };

  const handleKnock = async () => {
    setBusy(true);
    setError('');
    const { error: err } = await knock(roomId);
    setBusy(false);
    if (err) return setError(err);
    await refreshAfterMove();
  };

  const handleDiscard = async () => {
    if (!selected) return;
    setBusy(true);
    setError('');
    const { error: err } = await discardCard(roomId, selected);
    setBusy(false);
    if (err) return setError(err);
    setSelected(null);
    await refreshAfterMove();
  };

  const bothReady = room.giocatori.length === 2 && room.giocatori.every((g) => g.pronto);
  useEffect(() => {
    if (state === null && bothReady && meEntry?.posizione === 0 && !startAttemptedRef.current) {
      startAttemptedRef.current = true;
      startTrentunoHand(roomId);
    }
    if (!bothReady) startAttemptedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, bothReady, meEntry?.posizione]);

  const toggleReady = () => setRoomReady(roomId, !meEntry?.pronto);

  if (state === null) {
    return (
      <div className="rb-scopa-table">
        {recap && <TrentunoRecap recap={recap} room={room} user={user} onClose={() => setRecap(null)} />}
        <div className="rb-scopa-between-hands">
          <h3>Mano finita — vite aggiornate</h3>
          <LivesRow room={room} />
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

  const bussatoDaMe = state.bussatoDa === user.id;

  return (
    <div className="rb-scopa-table">
      {recap && <TrentunoRecap recap={recap} room={room} user={user} onClose={() => setRecap(null)} />}

      <div className="rb-scopa-opponent-bar">
        <TrentunoPlayerBadge entry={opponentEntry} />
        <div className="rb-scopa-opponent-hand">
          {Array.from({ length: state.carteInMano?.[opponentEntry?.userId] ?? 0 }).map((_, i) => (
            <PlayingCard key={i} faceDown size="sm" />
          ))}
        </div>
      </div>

      <div className="rb-scopa-felt">
        <div className={`rb-scopa-turn-banner ${isMyTurn ? 'mine' : ''}`}>
          {isMyTurn
            ? state.fase === 'pesca' ? 'Tocca a te — pesca o bussa' : 'Tocca a te — scarta una carta'
            : `Turno di ${opponentEntry?.profilo.name ?? 'avversario'}`}
        </div>

        {state.bussatoDa && (
          <div className="rb-trentuno-bussa-banner">
            {bussatoDaMe ? 'Hai bussato: ultimo giro per l\'avversario, poi si confrontano le mani.' : `${opponentEntry?.profilo.name ?? 'L\'avversario'} ha bussato: questo è il tuo ultimo giro.`}
          </div>
        )}

        <div className="rb-scopa-deck-and-table">
          <button type="button" className="rb-burraco-pile" onClick={() => canDraw && handleDraw('mazzo')} disabled={!canDraw || busy}>
            <PlayingCard faceDown size="md" />
            <span>{state.carteRimaste} nel mazzo</span>
          </button>

          <button type="button" className="rb-burraco-pile" onClick={() => canDraw && state.scartoCima && handleDraw('scarti')} disabled={!(canDraw && state.scartoCima) || busy}>
            {state.scartoCima ? <PlayingCard card={state.scartoCima} size="md" /> : <div className="rb-scopa-empty-table">Scarti vuoti</div>}
            <span>Pila scarti</span>
          </button>
        </div>

        {canKnock && (
          <button type="button" className="rb-reset-filters-btn" onClick={handleKnock} disabled={busy}>
            Bussa (chiedi l'ultimo giro)
          </button>
        )}

        {canDiscard && (
          <div className="rb-scopa-action-bar">
            <span>{selected ? `Scarti ${selected}` : 'Scegli una carta da scartare'}</span>
            {error && <span className="rb-giochi-error">{error}</span>}
            <div className="rb-scopa-action-buttons">
              <button type="button" className="rb-btn-primary" onClick={handleDiscard} disabled={!selected || busy}>
                Scarta
              </button>
            </div>
          </div>
        )}
        {!canDiscard && error && <p className="rb-giochi-error">{error}</p>}
      </div>

      <div className="rb-scopa-me-bar">
        <TrentunoPlayerBadge entry={meEntry} me />
        <div className="rb-scopa-hand">
          {myHand.map((card, i) => (
            <PlayingCard
              key={`${card}-${i}`}
              card={card}
              size="lg"
              selected={selected === card}
              disabled={!canDiscard}
              onClick={() => setSelected((prev) => (prev === card ? null : card))}
            />
          ))}
        </div>
        <button type="button" className="rb-scopa-leave-btn" onClick={onLeave}>Abbandona</button>
      </div>
    </div>
  );
}

// count = vite perse: mostra prima i cuori ancora vivi (pieni), poi quelli
// persi (spenti) — così le vite rimaste restano il segnale più leggibile.
function LivesPips({ count }) {
  const rimaste = 3 - count;
  return (
    <span className="rb-trentuno-lives">
      {Array.from({ length: 3 }).map((_, i) => (
        <span key={i} className={`rb-trentuno-life ${i >= rimaste ? 'persa' : ''}`}>♥</span>
      ))}
    </span>
  );
}

function TrentunoPlayerBadge({ entry, me = false }) {
  if (!entry) return <div className="rb-scopa-player-badge empty">In attesa…</div>;
  return (
    <div className={`rb-scopa-player-badge ${me ? 'me' : ''}`}>
      <img src={entry.profilo.avatar || undefined} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      <div>
        <strong>{entry.profilo.name}{me ? ' (tu)' : ''}</strong>
        <LivesPips count={entry.punteggio} />
      </div>
    </div>
  );
}

function LivesRow({ room }) {
  return (
    <div className="rb-scopa-score-row">
      {room.giocatori.map((g) => (
        <div key={g.userId} className="rb-scopa-score-item">
          <strong>{g.profilo.name}</strong>
          <LivesPips count={g.punteggio} />
        </div>
      ))}
    </div>
  );
}

function TrentunoRecap({ recap, room, user, onClose }) {
  const perGiocatore = recap.dettaglio.per_giocatore;
  return (
    <div className="rb-scopa-recap-overlay" onClick={onClose}>
      <div className="rb-scopa-recap-card" onClick={(e) => e.stopPropagation()}>
        <h3>{MODO_LABEL[recap.dettaglio.modo] ?? 'Fine mano'}</h3>
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
            <tr>
              <td>Valore mano</td>
              {room.giocatori.map((g) => (
                <td key={g.userId}>{perGiocatore[g.userId]?.valore_mano ?? '—'}</td>
              ))}
            </tr>
            <tr className="rb-scopa-recap-total">
              <td>Vita persa</td>
              {room.giocatori.map((g) => (
                <td key={g.userId}>{perGiocatore[g.userId]?.vita_persa_questa_mano ? '💔' : '—'}</td>
              ))}
            </tr>
          </tbody>
        </table>
        <button type="button" className="rb-btn-primary" onClick={onClose}>Continua</button>
      </div>
    </div>
  );
}
