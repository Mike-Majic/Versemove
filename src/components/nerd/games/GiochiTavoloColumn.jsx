import { useEffect, useRef, useState } from 'react';
import {
  listLobbyRooms,
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
import ModalOverlay from '../../ModalOverlay';
import { useBackLayer } from '../../../hooks/useBackLayer';
import { useCardTable } from './cardTheme';
import { useGlobeCover } from '../../../fx/globeCover';
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

// Modalità di una stanza, per il riquadro e per i filtri a chip.
function roomMode(r) {
  if (r.maxGiocatori === 2) return '1v1';
  if (r.gioco === 'burraco' && r.modalita === 'coppie' && r.maxGiocatori === 4) return '2v2';
  return 'tutti';
}
const MODE_LABEL = { '1v1': '1 vs 1', '2v2': '2 vs 2', tutti: 'Tutti contro tutti' };

// Posti intorno al tavolino: 0 in basso, 1 a sinistra, 2 in alto, 3 a
// destra — così a coppie 0/2 e 1/3 sono uno di fronte all'altro. Con due
// giocatori i posti sono a sinistra e a destra.
function seatSide(posizione, maxGiocatori) {
  if (maxGiocatori === 2) return posizione === 0 ? 'left' : 'right';
  return ['bot', 'left', 'top', 'right'][posizione] ?? 'bot';
}

const LOBBY_REFRESH_MS = 10000;

// Lobby "a tavolini" (vedi docs/mockup/mockup_lobby_tavoli.html): un
// riquadro per stanza aperta con il tavolino visto dall'alto e le sedie;
// una sedia libera "＋ Siediti" fa entrare esattamente su quel posto. In
// cima i filtri a chip e i pulsanti per creare un tavolo (il modulo di
// sempre: gioco, giocatori, modalità, difficoltà dei bot).
function LobbyView({ user, onOpenAuth, onEnterRoom }) {
  const [rooms, setRooms] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [gameFilter, setGameFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [myTable] = useCardTable();

  const refresh = (silent = false) => {
    if (!silent) setRooms(null);
    listLobbyRooms().then(setRooms);
  };
  useEffect(() => {
    refresh();
    // Ricarica da sola ogni 10 s, ma solo mentre la scheda è visibile.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh(true);
    }, LOBBY_REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sedersi su un posto preciso: joinRoom mette nel primo posto libero,
  // poi moveSeat sposta su quello scelto. Se intanto qualcuno l'ha preso,
  // si esce di nuovo dalla stanza (per non restare seduti altrove senza
  // volerlo), si mostra l'errore e si ricarica la lista.
  const handleSit = async (room, posizione) => {
    if (!user) return onOpenAuth?.();
    setBusy(true);
    setError('');
    const alreadyIn = room.giocatori.some((g) => g.userId === user.id);
    if (!alreadyIn) {
      const { error: joinErr } = await joinRoom(room.id);
      if (joinErr) {
        setBusy(false);
        setError(joinErr);
        refresh(true);
        return;
      }
    }
    const taken = new Set(room.giocatori.map((g) => g.posizione));
    const firstFree = Array.from({ length: room.maxGiocatori }, (_, i) => i).find((i) => !taken.has(i));
    const needsMove = alreadyIn || posizione !== firstFree;
    if (needsMove) {
      const { error: moveErr } = await moveSeat(room.id, posizione);
      if (moveErr) {
        if (!alreadyIn) await leaveRoom(room.id);
        setBusy(false);
        setError(moveErr === 'Posto occupato' ? 'Quel posto è appena stato preso: scegline un altro.' : moveErr);
        refresh(true);
        return;
      }
    }
    setBusy(false);
    onEnterRoom(room.id);
  };

  const visibleRooms = (rooms ?? []).filter((r) => {
    if (gameFilter !== 'all' && r.gioco !== gameFilter) return false;
    if (modeFilter && roomMode(r) !== modeFilter) return false;
    if (freeOnly && (r.stato !== 'in_attesa' || r.postiLiberi === 0)) return false;
    return true;
  });

  return (
    <div className="rb-giochi-tavolo rb-giochi-tavolo--lobby">
      <div className="rb-lobby-head">
        <h3>Giochi da tavolo & carte</h3>
        <span className="rb-lobby-head-spacer" />
        <button type="button" className="rb-lobby-btn" onClick={() => (user ? setCreateOpen('bots') : onOpenAuth?.())}>
          🤖 Gioca col computer
        </button>
        <button type="button" className="rb-lobby-btn primary" onClick={() => (user ? setCreateOpen('humans') : onOpenAuth?.())}>
          ＋ Crea tavolo
        </button>
      </div>

      <div className="rb-lobby-chips">
        <button type="button" className={`rb-lobby-chip ${gameFilter === 'all' ? 'on' : ''}`} onClick={() => setGameFilter('all')}>Tutti</button>
        {GAMES.map((g) => (
          <button key={g.id} type="button" className={`rb-lobby-chip ${gameFilter === g.id ? 'on' : ''}`} onClick={() => setGameFilter(g.id)}>
            {g.icon} {g.label}
          </button>
        ))}
        <span className="rb-lobby-sep" />
        {Object.entries(MODE_LABEL).map(([id, label]) => (
          <button key={id} type="button" className={`rb-lobby-chip ${modeFilter === id ? 'on' : ''}`} onClick={() => setModeFilter((m) => (m === id ? null : id))}>
            {label}
          </button>
        ))}
        <span className="rb-lobby-sep" />
        <button type="button" className={`rb-lobby-chip ${freeOnly ? 'on' : ''}`} onClick={() => setFreeOnly((v) => !v)}>Solo con posti liberi</button>
        <button type="button" className="rb-lobby-chip rb-lobby-refresh" onClick={() => refresh()} disabled={busy}>↻ Aggiorna</button>
      </div>

      {error && <p className="rb-giochi-error">{error}</p>}

      {rooms === null ? (
        <Skeleton lines={3} />
      ) : visibleRooms.length === 0 ? (
        <EmptyState
          icon="🃏"
          title={rooms.length === 0 ? 'Nessun tavolo aperto' : 'Nessun tavolo con questi filtri'}
          subtitle="Creane uno tu: chi passa di qui potrà sedersi."
        />
      ) : (
        <div className="rb-lobby-grid">
          {visibleRooms.map((r) => (
            <LobbyTile key={r.id} room={r} user={user} busy={busy} tableColor={r.creatoDa === user?.id ? myTable : 'verde'} onSit={handleSit} onEnter={() => onEnterRoom(r.id)} />
          ))}
        </div>
      )}

      <p className="rb-lobby-foot">Clicca una sedia libera ＋ per sederti a quel posto. A coppie: chi ti siede di fronte è il tuo compagno.</p>

      {createOpen && (
        <CreateTableModal
          withBotsFirst={createOpen === 'bots'}
          user={user}
          onOpenAuth={onOpenAuth}
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            onEnterRoom(id);
          }}
        />
      )}
    </div>
  );
}

// Riquadro di una stanza: gioco · modalità, badge In attesa / In corso, e il
// tavolino con le sedie (occupate: avatar + nome; libere: "＋ Siediti").
function LobbyTile({ room, user, busy, tableColor, onSit, onEnter }) {
  const game = GAMES.find((g) => g.id === room.gioco);
  const mode = roomMode(room);
  const inCorso = room.stato === 'in_corso';
  const iAmIn = room.giocatori.some((g) => g.userId === user?.id);
  const seats = Array.from({ length: room.maxGiocatori }, (_, i) => ({ posizione: i, player: room.giocatori.find((g) => g.posizione === i) ?? null }));

  return (
    <div className={`rb-lobby-tile ${iAmIn ? 'mine' : ''}`}>
      <div className="rb-lobby-tile-top">
        <span className="rb-lobby-tile-game">
          {game?.icon} {game?.label ?? 'Partita'} <span className="rb-lobby-tile-mode">· {MODE_LABEL[mode]}{mode === 'tutti' ? ` · ${room.maxGiocatori}` : ''}</span>
        </span>
        <span className={`rb-lobby-badge ${inCorso ? 'live' : 'wait'}`}>{inCorso ? 'In corso' : 'In attesa'}</span>
      </div>
      <div className="rb-lobby-scene">
        <div className={`rb-lobby-tbl t-${tableColor} ${room.maxGiocatori === 2 ? 'small' : ''}`}><i /></div>
        {mode === '2v2' && <span className="rb-lobby-team">A · B</span>}
        {seats.map(({ posizione, player }) => {
          const side = seatSide(posizione, room.maxGiocatori);
          if (player) {
            const me = player.userId === user?.id;
            return (
              <div key={posizione} className={`rb-lobby-seat s-${side} ${me ? 'me' : ''}`}>
                <span className="rb-lobby-seat-c">
                  {player.isBot ? '🤖' : player.profilo.avatar ? <img src={player.profilo.avatar} alt="" /> : '🙂'}
                </span>
                <span className="rb-lobby-seat-name">{me ? 'Tu' : player.profilo.name}</span>
              </div>
            );
          }
          if (inCorso) return null;
          return (
            <button key={posizione} type="button" className={`rb-lobby-seat free s-${side}`} onClick={() => onSit(room, posizione)} disabled={busy}>
              <span className="rb-lobby-seat-c">＋</span>
              <span className="rb-lobby-seat-name">Siediti</span>
            </button>
          );
        })}
      </div>
      {iAmIn && (
        <button type="button" className="rb-lobby-enter" onClick={onEnter}>
          {inCorso ? 'Rientra al tavolo' : 'Vai al tavolo'}
        </button>
      )}
    </div>
  );
}

// "Crea tavolo" / "Gioca col computer": il modulo di sempre (gioco,
// giocatori, modalità, difficoltà dei bot) in un pannello a comparsa.
function CreateTableModal({ withBotsFirst, user, onOpenAuth, onClose, onCreated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [difficulties, setDifficulties] = useState({ scopa: 'medio', burraco: 'medio', trentuno: 'medio', cosmopoli: 'medio' });
  const [playerCounts, setPlayerCounts] = useState({ burraco: 4, cosmopoli: 4 });
  const [burracoModalita, setBurracoModalita] = useState('coppie');

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
    onCreated(id);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-lobby-create-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h3>{withBotsFirst ? '🤖 Gioca col computer' : '＋ Crea tavolo'}</h3>
        <p className="rb-giochi-hint">
          {withBotsFirst
            ? 'Scegli il gioco e la difficoltà: i posti liberi si riempiono di bot e la partita parte subito.'
            : 'Il tavolo compare nella lobby: chi passa può sedersi, e i posti vuoti si possono dare ai bot dalla sala d\'attesa.'}
        </p>
        {error && <p className="rb-giochi-error">{error}</p>}
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
                  {withBotsFirst ? (
                    <>
                      <button type="button" className="rb-btn-primary" onClick={() => handleCreate(g.id, true)} disabled={busy}>
                        🤖 Gioca col computer
                      </button>
                      <button type="button" className="rb-reset-filters-btn" onClick={() => handleCreate(g.id, false)} disabled={busy}>
                        ＋ Crea tavolo
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="rb-btn-primary" onClick={() => handleCreate(g.id, false)} disabled={busy}>
                        ＋ Crea tavolo
                      </button>
                      <button type="button" className="rb-reset-filters-btn" onClick={() => handleCreate(g.id, true)} disabled={busy}>
                        🤖 Col computer
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ModalOverlay>
  );
}

function RoomView({ roomId, user, onExit }) {
  const [room, setRoom] = useState(null);
  const [eventTick, setEventTick] = useState(0);
  const [error, setError] = useState('');
  const [addBotDifficulty, setAddBotDifficulty] = useState('medio');
  const [confirmLeave, setConfirmLeave] = useState(false);
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

  // Tasto Indietro del telefono: dalla sala d'attesa si torna alla lobby
  // con la stessa uscita del pulsante (lascia il posto, la stanza resta
  // agli altri). A partita in corso invece l'unica uscita esistente
  // (leave_game_room) chiude la partita per tutti: Indietro non lo fa di
  // nascosto, chiede prima conferma come "Abbandona".
  useBackLayer(true, onExit, 'subpage:giochi', {
    onBack: () => {
      if (!room || room.stato === 'conclusa') {
        onExit();
        return true;
      }
      if (room.stato === 'in_attesa') {
        handleLeave();
        return true;
      }
      setConfirmLeave(true);
      return false;
    },
  });

  // Partita in corso: il mappamondo dietro si ferma del tutto (torna a
  // girare appena la partita finisce o si esce dalla stanza).
  useGlobeCover(room?.stato === 'in_corso' ? 'paused' : null);

  if (!room) {
    return (
      <div className="rb-giochi-tavolo">
        <Skeleton lines={4} />
      </div>
    );
  }

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
    // Il tavolo sta nello stesso pannello della lobby (.rb-giochi-tavolo):
    // senza, restava figlio diretto di .rb-arte-explorer, che ha
    // pointer-events: none, e ogni clic su mazzo/scarti/mano finiva sul
    // mappamondo sotto (vedi giochiTavolo.css).
    return (
      <>
        <div className="rb-giochi-tavolo rb-giochi-tavolo--game">
          <Table roomId={roomId} room={room} user={user} eventTick={eventTick} onLeave={handleLeave} />
        </div>
        {confirmLeave && (
          <ModalOverlay onClose={() => setConfirmLeave(false)}>
            <div className="rb-modal-unsaved-confirm" onClick={(e) => e.stopPropagation()}>
              <p>La partita è in corso: uscendo finisce anche per gli altri giocatori. Abbandonare?</p>
              <div className="rb-modal-unsaved-actions">
                <button type="button" className="rb-modal-unsaved-close" onClick={handleLeave}>Abbandona</button>
                <button type="button" onClick={() => setConfirmLeave(false)} autoFocus>Resta</button>
              </div>
            </div>
          </ModalOverlay>
        )}
      </>
    );
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
