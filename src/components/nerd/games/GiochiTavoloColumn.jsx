import { useEffect, useRef, useState } from 'react';
import { listOpenRooms, createRoom, joinRoom, leaveRoom, setRoomReady, fetchRoom, subscribeToGameEvents, unsubscribe } from '../../../data/gameRooms';
import { startScopaHand } from '../../../data/scopa';
import ScopaTable from './ScopaTable';
import EmptyState from '../../EmptyState';
import Skeleton from '../../Skeleton';
import './giochiTavolo.css';

const GAMES = [{ id: 'scopa', label: 'Scopa', icon: '🃏', tagline: '2 giocatori, mazzo di 40 carte italiane' }];

// Guscio "Giochi da tavolo & carte" del mondo Nerd: lobby (partite aperte a
// cui unirsi + crea nuova), sala d'attesa (pronto/via) e, quando la stanza
// passa "in_corso", il tavolo di gioco vero e proprio (ScopaTable). Tutte le
// regole del gioco restano lato database (vedi data/scopa.js): qui solo
// interfaccia e sottoscrizione agli eventi della stanza.
export default function GiochiTavoloColumn({ user, onOpenAuth }) {
  const [roomId, setRoomId] = useState(null);

  if (roomId) {
    return <RoomView roomId={roomId} user={user} onExit={() => setRoomId(null)} />;
  }
  return <LobbyView user={user} onOpenAuth={onOpenAuth} onEnterRoom={setRoomId} />;
}

function LobbyView({ user, onOpenAuth, onEnterRoom }) {
  const [rooms, setRooms] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = () => {
    setRooms(null);
    listOpenRooms('scopa').then(setRooms);
  };
  useEffect(refresh, []);

  const handleCreate = async () => {
    if (!user) return onOpenAuth?.();
    setBusy(true);
    setError('');
    const { id, error: err } = await createRoom('scopa', 2);
    setBusy(false);
    if (err) return setError(err);
    onEnterRoom(id);
  };

  const handleJoin = async (id) => {
    if (!user) return onOpenAuth?.();
    setBusy(true);
    setError('');
    const { error: err } = await joinRoom(id);
    setBusy(false);
    if (err) return setError(err);
    onEnterRoom(id);
  };

  return (
    <div className="rb-giochi-tavolo">
      <div className="rb-giochi-header">
        <h3>Giochi da tavolo & carte</h3>
        <p className="rb-giochi-hint">Trova un avversario o crea una partita: le regole sono controllate dal server, nessuno può barare.</p>
      </div>

      <div className="rb-giochi-catalogo">
        {GAMES.map((g) => (
          <div key={g.id} className="rb-giochi-catalogo-card">
            <span className="rb-giochi-catalogo-icon">{g.icon}</span>
            <div>
              <strong>{g.label}</strong>
              <p>{g.tagline}</p>
            </div>
            <button type="button" className="rb-btn-primary" onClick={handleCreate} disabled={busy}>
              + Nuova partita
            </button>
          </div>
        ))}
      </div>

      {error && <p className="rb-giochi-error">{error}</p>}

      <div className="rb-giochi-lobby-header">
        <h4>Partite aperte</h4>
        <button type="button" className="rb-reset-filters-btn" onClick={refresh}>Aggiorna</button>
      </div>

      {rooms === null ? (
        <Skeleton lines={3} />
      ) : rooms.length === 0 ? (
        <EmptyState icon="🃏" title="Nessuna partita aperta" subtitle="Creane una tu: chi passa di qui potrà unirsi." />
      ) : (
        <ul className="rb-giochi-room-list">
          {rooms.map((r) => (
            <li key={r.id} className="rb-giochi-room-item">
              <span className="rb-giochi-room-game">{GAMES.find((g) => g.id === r.gioco)?.icon ?? '🎲'}</span>
              <div className="rb-giochi-room-info">
                <strong>Scopa · {r.creatore?.name ?? 'Utente'}</strong>
                <span>In attesa di un avversario</span>
              </div>
              <button type="button" className="rb-btn-primary" onClick={() => handleJoin(r.id)} disabled={busy}>
                Entra
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoomView({ roomId, user, onExit }) {
  const [room, setRoom] = useState(null);
  const [eventTick, setEventTick] = useState(0);
  const [error, setError] = useState('');
  const startAttemptedRef = useRef(false);

  const refresh = () => fetchRoom(roomId).then(setRoom);

  useEffect(() => {
    refresh();
    const channel = subscribeToGameEvents(roomId, () => {
      setEventTick((t) => t + 1);
      refresh();
    });
    return () => unsubscribe(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const me = room?.giocatori.find((g) => g.userId === user?.id);
  const bothReady = room?.giocatori.length === 2 && room.giocatori.every((g) => g.pronto);

  // Quando entrambi sono pronti, solo chi occupa la posizione 0 fa partire
  // la mano (l'RPC è comunque al sicuro da doppie chiamate: la seconda
  // fallirebbe con "mano già in corso", qui semplicemente ignorata).
  useEffect(() => {
    if (room?.stato === 'in_attesa' && bothReady && me?.posizione === 0 && !startAttemptedRef.current) {
      startAttemptedRef.current = true;
      startScopaHand(roomId);
    }
    if (!bothReady) startAttemptedRef.current = false;
  }, [room?.stato, bothReady, me?.posizione, roomId]);

  const toggleReady = async () => {
    setError('');
    const { error: err } = await setRoomReady(roomId, !me?.pronto);
    if (err) setError(err);
    else refresh();
  };

  const handleLeave = async () => {
    await leaveRoom(roomId);
    onExit();
  };

  if (!room) return <Skeleton lines={4} />;

  if (room.stato === 'conclusa') {
    const vincitore = room.giocatori.find((g) => g.userId === room.vincitoreId);
    return (
      <div className="rb-giochi-tavolo">
        <EmptyState
          icon="🏁"
          title={vincitore ? `${vincitore.profilo.name} ha vinto la partita!` : 'Partita conclusa'}
          subtitle="Un giocatore ha abbandonato o la partita è finita."
        />
        <button type="button" className="rb-btn-primary" onClick={onExit}>Torna alla lobby</button>
      </div>
    );
  }

  if (room.stato === 'in_corso') {
    return <ScopaTable roomId={roomId} room={room} user={user} eventTick={eventTick} onLeave={handleLeave} />;
  }

  const opponent = room.giocatori.find((g) => g.userId !== user?.id);

  return (
    <div className="rb-giochi-tavolo">
      <div className="rb-giochi-header">
        <h3>Scopa · Sala d'attesa</h3>
        <p className="rb-giochi-hint">Quando siete entrambi pronti la partita comincia da sola.</p>
      </div>

      {error && <p className="rb-giochi-error">{error}</p>}

      <div className="rb-giochi-waiting-players">
        {room.giocatori.map((g) => (
          <div key={g.userId} className={`rb-giochi-waiting-player ${g.pronto ? 'ready' : ''}`}>
            <img src={g.profilo.avatar || undefined} alt="" className="rb-giochi-waiting-avatar" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
            <strong>{g.profilo.name}{g.userId === user?.id ? ' (tu)' : ''}</strong>
            <span>{g.pronto ? 'Pronto' : 'In attesa'}</span>
          </div>
        ))}
        {!opponent && (
          <div className="rb-giochi-waiting-player rb-giochi-waiting-empty">
            <span className="rb-giochi-waiting-avatar-placeholder">?</span>
            <strong>In attesa di un avversario…</strong>
          </div>
        )}
      </div>

      <div className="rb-giochi-waiting-actions">
        <button type="button" className="rb-reset-filters-btn" onClick={handleLeave}>Abbandona</button>
        <button type="button" className="rb-btn-primary" onClick={toggleReady} disabled={!opponent}>
          {me?.pronto ? 'Non sono più pronto' : 'Sono pronto'}
        </button>
      </div>
    </div>
  );
}
