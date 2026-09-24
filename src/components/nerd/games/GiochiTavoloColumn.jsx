import { useEffect, useRef, useState } from 'react';
import {
  listOpenRooms,
  createRoom,
  joinRoom,
  leaveRoom,
  setRoomReady,
  fetchRoom,
  subscribeToGameEvents,
  unsubscribe,
  addBot,
  removeBot,
  setBotDifficulty,
  moveSeat,
  firstHumanHostId,
} from '../../../data/gameRooms';
import { startScopaHand } from '../../../data/scopa';
import { startBurracoHand } from '../../../data/burraco';
import { startTrentunoHand } from '../../../data/trentuno';
import { startCosmopoliGame } from '../../../data/cosmopoli';
import ScopaTable from './ScopaTable';
import BurracoTable from './BurracoTable';
import TrentunoTable from './TrentunoTable';
import CosmopoliTable from './CosmopoliTable';
import EmptyState from '../../EmptyState';
import Skeleton from '../../Skeleton';
import './giochiTavolo.css';

const GAMES = [
  { id: 'scopa', label: 'Scopa', icon: '🃏', tagline: '2 giocatori, mazzo di 40 carte italiane', playerCounts: [2] },
  { id: 'burraco', label: 'Burraco', icon: '🎴', tagline: 'Da 2 a 4 giocatori, mazzo doppio da 108 carte', playerCounts: [2, 3, 4] },
  { id: 'trentuno', label: '31', icon: '🂡', tagline: '2 giocatori, chi fa 31 o ha la mano migliore vince', playerCounts: [2] },
  { id: 'cosmopoli', label: 'Cosmopoli', icon: '🏙️', tagline: '2-4 giocatori, compra e costruisci nei mondi di Versemove', playerCounts: [2, 3, 4] },
];

const DIFFICULTIES = [
  { id: 'facile', label: '🟢 Facile' },
  { id: 'medio', label: '🟡 Medio' },
  { id: 'difficile', label: '🔴 Difficile' },
];

// Ogni gioco ha la sua funzione per far partire la mano e il suo tavolo:
// aggiungerne uno nuovo vuol dire aggiungerlo qui e alla lista GAMES sopra.
const START_HAND = { scopa: startScopaHand, burraco: startBurracoHand, trentuno: startTrentunoHand, cosmopoli: startCosmopoliGame };
const TABLES = { scopa: ScopaTable, burraco: BurracoTable, trentuno: TrentunoTable, cosmopoli: CosmopoliTable };

// Guscio "Giochi da tavolo & carte" del mondo Nerd: lobby (partite aperte a
// cui unirsi + crea nuova, per qualunque gioco del catalogo GAMES), sala
// d'attesa (pronto/via, bot e posti a sedere) e, quando la stanza passa
// "in_corso", il tavolo del gioco scelto (vedi TABLES). Tutte le regole
// restano lato database (vedi data/scopa.js, data/burraco.js): qui solo
// interfaccia e sottoscrizione agli eventi della stanza, condivisa da
// tutti i giochi.
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
  const [difficulties, setDifficulties] = useState({ scopa: 'medio', burraco: 'medio', trentuno: 'medio', cosmopoli: 'medio' });
  const [playerCounts, setPlayerCounts] = useState({ burraco: 4, cosmopoli: 4 });
  const [burracoModalita, setBurracoModalita] = useState('coppie');

  const refresh = () => {
    setRooms(null);
    Promise.all(GAMES.map((g) => listOpenRooms(g.id))).then((lists) => {
      setRooms(lists.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    });
  };
  useEffect(refresh, []);

  const maxGiocatoriOf = (game) => (game.playerCounts.length > 1 ? (playerCounts[game.id] ?? game.playerCounts[game.playerCounts.length - 1]) : game.playerCounts[0]);

  // withBots: crea la stanza, riempie ogni posto libero con un bot della
  // difficoltà scelta e si mette subito pronto — la partita parte da sola
  // (stessa logica "pieno + tutti pronti" della sala d'attesa umana).
  const handleCreate = async (gioco, withBots) => {
    if (!user) return onOpenAuth?.();
    const game = GAMES.find((g) => g.id === gioco);
    const maxGiocatori = maxGiocatoriOf(game);
    const modalita = gioco === 'burraco' && maxGiocatori === 4 ? burracoModalita : null;

    setBusy(true);
    setError('');
    const { id, error: err } = await createRoom(gioco, maxGiocatori, modalita);
    if (err) {
      setBusy(false);
      setError(err);
      return;
    }

    if (withBots) {
      const difficolta = difficulties[gioco] ?? 'medio';
      for (let i = 0; i < maxGiocatori - 1; i++) {
        const { error: botErr } = await addBot(id, difficolta);
        if (botErr) {
          setBusy(false);
          setError(botErr);
          return;
        }
      }
      const { error: readyErr } = await setRoomReady(id, true);
      if (readyErr) {
        setBusy(false);
        setError(readyErr);
        return;
      }
    }

    setBusy(false);
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
        <p className="rb-giochi-hint">Trova un avversario, gioca col computer o crea una partita: le regole sono controllate dal server, nessuno può barare.</p>
      </div>

      <div className="rb-giochi-catalogo">
        {GAMES.map((g) => {
          const maxGiocatori = maxGiocatoriOf(g);
          return (
            <div key={g.id} className="rb-giochi-catalogo-card">
              <div className="rb-giochi-catalogo-card-head">
                <span className="rb-giochi-catalogo-icon">{g.icon}</span>
                <div>
                  <strong>{g.label}</strong>
                  <p>{g.tagline}</p>
                </div>
              </div>

              <div className="rb-giochi-catalogo-options">
                {g.playerCounts.length > 1 && (
                  <select
                    className="rb-giochi-player-count"
                    value={maxGiocatori}
                    onChange={(e) => setPlayerCounts((prev) => ({ ...prev, [g.id]: Number(e.target.value) }))}
                    disabled={busy}
                  >
                    {g.playerCounts.map((n) => <option key={n} value={n}>{n} giocatori</option>)}
                  </select>
                )}
                {g.id === 'burraco' && maxGiocatori === 4 && (
                  <select
                    className="rb-giochi-player-count"
                    value={burracoModalita}
                    onChange={(e) => setBurracoModalita(e.target.value)}
                    disabled={busy}
                  >
                    <option value="coppie">A coppie</option>
                    <option value="tutti">Tutti contro tutti</option>
                  </select>
                )}
                <div className="rb-minigame-difficulty-row rb-giochi-difficulty-row">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className={`rb-minigame-difficulty-btn ${difficulties[g.id] === d.id ? 'active' : ''}`}
                      onClick={() => setDifficulties((prev) => ({ ...prev, [g.id]: d.id }))}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rb-giochi-catalogo-actions">
                <button type="button" className="rb-reset-filters-btn" onClick={() => handleCreate(g.id, false)} disabled={busy}>
                  + Nuova partita
                </button>
                <button type="button" className="rb-btn-primary" onClick={() => handleCreate(g.id, true)} disabled={busy}>
                  🤖 Gioca col computer
                </button>
              </div>
            </div>
          );
        })}
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
                <strong>{GAMES.find((g) => g.id === r.gioco)?.label ?? 'Partita'} · {r.creatore?.name ?? 'Utente'}</strong>
                <span>
                  {r.postiLiberi} post{r.postiLiberi === 1 ? 'o libero' : 'i liberi'}
                  {r.modalita === 'coppie' ? ' · a coppie' : r.modalita === 'tutti' ? ' · tutti contro tutti' : ''}
                </span>
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
  const [addBotDifficulty, setAddBotDifficulty] = useState('medio');
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
  const isFull = room?.giocatori.length === (room?.maxGiocatori ?? 2);
  const bothReady = isFull && room.giocatori.every((g) => g.pronto);
  const iAmHost = user && room && firstHumanHostId(room.giocatori) === user.id;

  // Quando la stanza è piena e tutti sono pronti, solo l'umano con la
  // posizione più bassa fa partire la mano (con posti scelti a piacere e
  // bot che possono stare ovunque, non c'è più garanzia che qualcuno stia
  // proprio al posto 0). L'RPC è comunque al sicuro da doppie chiamate: la
  // seconda fallirebbe con "mano già in corso", qui semplicemente ignorata.
  useEffect(() => {
    if (room?.stato === 'in_attesa' && bothReady && iAmHost && !startAttemptedRef.current) {
      startAttemptedRef.current = true;
      START_HAND[room.gioco]?.(roomId);
    }
    if (!bothReady) startAttemptedRef.current = false;
  }, [room?.stato, room?.gioco, bothReady, iAmHost, roomId]);

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

  const handleAddBot = async (posizione) => {
    setError('');
    const { error: err } = await addBot(roomId, addBotDifficulty, posizione);
    if (err) setError(err);
    else refresh();
  };

  const handleRemoveBot = async (botId) => {
    setError('');
    const { error: err } = await removeBot(roomId, botId);
    if (err) setError(err);
    else refresh();
  };

  const handleSetBotDifficulty = async (botId, difficolta) => {
    setError('');
    const { error: err } = await setBotDifficulty(roomId, botId, difficolta);
    if (err) setError(err);
    else refresh();
  };

  const handleSit = async (posizione) => {
    setError('');
    const { error: err } = await moveSeat(roomId, posizione);
    if (err) setError(err);
    else refresh();
  };

  if (!room) return <Skeleton lines={4} />;

  if (room.stato === 'conclusa') {
    const vincitore = room.giocatori.find((g) => g.userId === room.vincitoreId);
    // A coppie il vincitore registrato è uno dei due compagni: il titolo
    // deve nominare la squadra, non solo lui.
    const isBurracoCoppie = room.gioco === 'burraco' && room.modalita === 'coppie' && room.maxGiocatori === 4;
    const winnerTeammate = isBurracoCoppie && vincitore
      ? room.giocatori.find((g) => g.userId !== vincitore.userId && g.posizione % 2 === vincitore.posizione % 2)
      : null;
    const title = vincitore
      ? winnerTeammate
        ? `Vince la squadra di ${vincitore.profilo.name} e ${winnerTeammate.profilo.name}!`
        : `${vincitore.profilo.name} ha vinto la partita!`
      : 'Partita conclusa';
    return (
      <div className="rb-giochi-tavolo">
        <EmptyState
          icon="🏁"
          title={title}
          subtitle="Un giocatore ha abbandonato o la partita è finita."
        />
        <button type="button" className="rb-btn-primary" onClick={onExit}>Torna alla lobby</button>
      </div>
    );
  }

  if (room.stato === 'in_corso') {
    const Table = TABLES[room.gioco];
    return <Table roomId={roomId} room={room} user={user} eventTick={eventTick} onLeave={handleLeave} />;
  }

  const gameLabel = GAMES.find((g) => g.id === room.gioco)?.label ?? 'Partita';
  const seats = Array.from({ length: room.maxGiocatori }, (_, i) => room.giocatori.find((g) => g.posizione === i) ?? null);
  const isBurracoCoppie = room.gioco === 'burraco' && room.modalita === 'coppie' && room.maxGiocatori === 4;

  const renderSeat = (posizione, teamLabel) => {
    const seat = seats[posizione];
    return (
      <SeatCard
        key={posizione}
        seat={seat}
        isMe={seat?.userId === user?.id}
        teamLabel={teamLabel}
        onAddBot={() => handleAddBot(posizione)}
        onRemoveBot={seat?.isBot ? () => handleRemoveBot(seat.userId) : undefined}
        onSetDifficulty={seat?.isBot ? (d) => handleSetBotDifficulty(seat.userId, d) : undefined}
        onSit={() => handleSit(posizione)}
      />
    );
  };

  return (
    <div className="rb-giochi-tavolo">
      <div className="rb-giochi-header">
        <h3>{gameLabel} · Sala d'attesa</h3>
        <p className="rb-giochi-hint">Quando la stanza è piena e siete tutti pronti la partita comincia da sola.</p>
      </div>

      {error && <p className="rb-giochi-error">{error}</p>}

      <label className="rb-giochi-add-bot-difficulty">
        Difficoltà dei prossimi computer aggiunti
        <select value={addBotDifficulty} onChange={(e) => setAddBotDifficulty(e.target.value)} className="rb-giochi-player-count">
          {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      </label>

      {isBurracoCoppie ? (
        <div className="rb-giochi-waiting-teams">
          <div className="rb-giochi-waiting-team-group">
            <h5>Squadra A</h5>
            <div className="rb-giochi-waiting-players">
              {renderSeat(0)}
              {renderSeat(2)}
            </div>
          </div>
          <div className="rb-giochi-waiting-team-group">
            <h5>Squadra B</h5>
            <div className="rb-giochi-waiting-players">
              {renderSeat(1)}
              {renderSeat(3)}
            </div>
          </div>
        </div>
      ) : (
        <div className="rb-giochi-waiting-players">
          {seats.map((_, i) => renderSeat(i))}
        </div>
      )}

      <div className="rb-giochi-waiting-actions">
        <button type="button" className="rb-reset-filters-btn" onClick={handleLeave}>Abbandona</button>
        <button type="button" className="rb-btn-primary" onClick={toggleReady} disabled={!isFull}>
          {me?.pronto ? 'Non sono più pronto' : 'Sono pronto'}
        </button>
      </div>
    </div>
  );
}

function SeatCard({ seat, isMe, teamLabel, onAddBot, onRemoveBot, onSetDifficulty, onSit }) {
  if (!seat) {
    return (
      <div className="rb-giochi-waiting-player rb-giochi-waiting-empty">
        {teamLabel && <span className="rb-giochi-waiting-team-tag">{teamLabel}</span>}
        <span className="rb-giochi-waiting-avatar-placeholder">?</span>
        <strong>Posto libero</strong>
        <div className="rb-giochi-waiting-seat-actions">
          <button type="button" className="rb-reset-filters-btn" onClick={onAddBot}>🤖 Aggiungi computer</button>
          <button type="button" className="rb-reset-filters-btn" onClick={onSit}>Siediti qui</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rb-giochi-waiting-player ${seat.pronto ? 'ready' : ''}`}>
      {teamLabel && <span className="rb-giochi-waiting-team-tag">{teamLabel}</span>}
      {seat.isBot ? (
        <span className="rb-giochi-waiting-avatar-placeholder">🤖</span>
      ) : (
        <img src={seat.profilo.avatar || undefined} alt="" className="rb-giochi-waiting-avatar" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      )}
      <strong>{seat.profilo.name}{isMe ? ' (tu)' : ''}</strong>
      {seat.isBot ? (
        <div className="rb-giochi-waiting-seat-actions">
          <select value={seat.botDifficolta ?? 'medio'} onChange={(e) => onSetDifficulty(e.target.value)} className="rb-giochi-player-count">
            {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <button type="button" className="rb-giochi-waiting-remove-bot" onClick={onRemoveBot} aria-label="Togli bot">✕</button>
        </div>
      ) : (
        <span>{seat.pronto ? 'Pronto' : 'In attesa'}</span>
      )}
    </div>
  );
}
