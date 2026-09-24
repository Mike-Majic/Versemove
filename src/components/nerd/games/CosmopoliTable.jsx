import { useEffect, useState } from 'react';
import {
  fetchCosmopoliState,
  fetchPlayers,
  fetchProperties,
  fetchTrades,
  fetchLog,
  rollDice,
  buyProperty,
  skipPurchase,
  buildHouse,
  sellHouse,
  mortgageProperty,
  unmortgageProperty,
  payJailFine,
  useJailCard,
  endTurn,
  declareBankruptcy,
  proposeTrade,
  respondTrade,
  cancelTrade,
} from '../../../data/cosmopoli';
import { BOARD, GROUPS, squareAt, groupSquares, PURCHASABLE_SQUARES } from '../../../data/cosmopoliBoard';
import useBotDriver from './useBotDriver';
import Skeleton from '../../Skeleton';
import './cosmopoliTable.css';

const TOKEN_COLORS = ['#ff4d4f', '#4096ff', '#52c41a', '#faad14'];

// Posizione nella griglia 11x11 del tabellone classico: casella 0 = angolo
// in basso a destra (Lancio), si prosegue in senso antiorario lungo il
// bordo basso, sinistro, alto, destro — stessa disposizione dell'originale
// a cui BOARD in cosmopoliBoard.js si ispira (10=Quarantena in basso a
// sinistra, 20=Relax in alto a sinistra, 30=Vai in Quarantena in alto a
// destra).
function gridPos(i) {
  if (i === 0) return { row: 11, col: 11 };
  if (i <= 9) return { row: 11, col: 11 - i };
  if (i === 10) return { row: 11, col: 1 };
  if (i <= 19) return { row: 21 - i, col: 1 };
  if (i === 20) return { row: 1, col: 1 };
  if (i <= 29) return { row: 1, col: i - 19 };
  if (i === 30) return { row: 1, col: 11 };
  return { row: i - 29, col: 11 };
}

// Il tavolo di Cosmopoli: stesso schema degli altri (Scopa/Burraco/31) —
// legge lo stato pubblico + giocatori/proprietà/scambi/log ad ogni evento
// della stanza e scrive solo tramite le RPC monoverse_*, che validano
// turno/fase/denaro/regole. Qui: tabellone 40 caselle in griglia CSS,
// pannello azioni dipendente dalla fase corrente, gestione proprietà
// (costruzione/ipoteca) e scambi tra giocatori.
export default function CosmopoliTable({ roomId, room, user, eventTick, onLeave }) {
  const [state, setState] = useState(null);
  const [players, setPlayers] = useState([]);
  const [properties, setProperties] = useState([]);
  const [trades, setTrades] = useState([]);
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('proprieta');

  const reload = async () => {
    const [pub, pls, props, trs, lg] = await Promise.all([
      fetchCosmopoliState(roomId),
      fetchPlayers(roomId),
      fetchProperties(roomId),
      fetchTrades(roomId),
      fetchLog(roomId),
    ]);
    setState(pub);
    setPlayers(pls);
    setProperties(props);
    setTrades(trs);
    setLog(lg);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [pub, pls, props, trs, lg] = await Promise.all([
        fetchCosmopoliState(roomId),
        fetchPlayers(roomId),
        fetchProperties(roomId),
        fetchTrades(roomId),
        fetchLog(roomId),
      ]);
      if (cancelled) return;
      setState(pub);
      setPlayers(pls);
      setProperties(props);
      setTrades(trs);
      setLog(lg);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, eventTick]);

  const isBot = (uid) => room.giocatori.find((g) => g.userId === uid)?.isBot ?? false;
  // I bot rispondono da soli agli scambi ricevuti (anche fuori dal loro
  // turno): li passiamo a useBotDriver perché il "motore" chiami
  // game_bot_step anche in quel caso, non solo quando tocca a loro. Il
  // hook va chiamato sempre (mai dopo un return condizionale, vedi regole
  // degli hook), anche prima che "state" sia pronto — turnUserId sarà
  // semplicemente undefined finché non arriva.
  const pendingBotTrades = trades.filter((t) => t.stato === 'in_attesa' && isBot(t.aUserId));
  const { isBotTurn, botName } = useBotDriver({ roomId, room, turnUserId: state?.turnoUserId, user, eventTick, pendingBotTrades });

  if (!state) return <Skeleton lines={6} />;

  const me = players.find((p) => p.userId === user.id);
  const isMyTurn = state.turnoUserId === user.id;
  const colorOf = (userId) => {
    const idx = room.giocatori.findIndex((g) => g.userId === userId);
    return TOKEN_COLORS[idx % TOKEN_COLORS.length] ?? '#888';
  };
  const playerName = (uid) => room.giocatori.find((g) => g.userId === uid)?.profilo.name ?? 'Utente';
  const pendingToMe = trades.filter((t) => t.aUserId === user.id && t.stato === 'in_attesa');

  const run = async (fn, ...args) => {
    setBusy(true);
    setError('');
    const { error: err } = await fn(roomId, ...args);
    setBusy(false);
    if (err) { setError(err); return; }
    await reload();
  };

  const handleBankruptcy = () => {
    if (!window.confirm('Dichiararti fallito ti farà perdere tutte le proprietà e uscirai dalla partita. Confermi?')) return;
    run(declareBankruptcy);
  };

  const renderActionPanel = () => {
    if (!isMyTurn) return <p className="rb-giochi-hint">Turno di {playerName(state.turnoUserId)}…</p>;

    if (state.fase === 'tira_dadi') {
      if (me?.inQuarantena) {
        return (
          <div className="rb-cosmo-actions">
            <button type="button" className="rb-btn-primary" disabled={busy || me.denaro < 50} onClick={() => run(payJailFine)}>Paga 50 ed esci</button>
            <button type="button" className="rb-btn-primary" disabled={busy || me.carteLiberta <= 0} onClick={() => run(useJailCard)}>
              Usa carta "esci gratis" ({me.carteLiberta})
            </button>
            <button type="button" className="rb-btn-primary" disabled={busy} onClick={() => run(rollDice)}>🎲 Tira (doppio per uscire)</button>
          </div>
        );
      }
      return (
        <button type="button" className="rb-btn-primary rb-cosmo-roll-btn" disabled={busy} onClick={() => run(rollDice)}>🎲 Tira i dadi</button>
      );
    }

    if (state.fase === 'puo_comprare') {
      const sq = squareAt(me?.posizione ?? 0);
      return (
        <div className="rb-cosmo-actions">
          <span>Compri <strong>{sq.nome}</strong> per {sq.prezzo}?</span>
          <button type="button" className="rb-reset-filters-btn" disabled={busy} onClick={() => run(skipPurchase)}>No</button>
          <button type="button" className="rb-btn-primary" disabled={busy || (me?.denaro ?? 0) < sq.prezzo} onClick={() => run(buyProperty)}>Compra</button>
        </div>
      );
    }

    return <button type="button" className="rb-btn-primary" disabled={busy} onClick={() => run(endTurn)}>Termina turno</button>;
  };

  return (
    <div className="rb-cosmo-table">
      <div className="rb-cosmo-players-bar">
        {players.map((p) => (
          <div key={p.userId} className={`rb-cosmo-player-chip ${p.userId === state.turnoUserId ? 'turn' : ''} ${p.bancarotta ? 'bancarotta' : ''}`}>
            <span className="rb-cosmo-token" style={{ background: colorOf(p.userId) }} />
            <div>
              <strong>{isBot(p.userId) ? '🤖 ' : ''}{playerName(p.userId)}{p.userId === user.id ? ' (tu)' : ''}</strong>
              <span>{p.bancarotta ? 'Fallito' : `${p.denaro}`}{p.inQuarantena && !p.bancarotta ? ' · Quarantena' : ''}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rb-cosmo-board-wrap">
        <div className="rb-cosmo-board">
          {BOARD.map((sq) => {
            const pos = gridPos(sq.i);
            const prop = properties.find((p) => p.casella === sq.i);
            const group = sq.gruppo ? GROUPS[sq.gruppo] : null;
            const tokensHere = players.filter((p) => p.posizione === sq.i && !p.bancarotta);
            return (
              <div key={sq.i} className={`rb-cosmo-sq rb-cosmo-sq-${sq.tipo}`} style={{ gridRow: pos.row, gridColumn: pos.col }}>
                {group && <div className="rb-cosmo-sq-bar" style={{ background: group.color }} />}
                <span className="rb-cosmo-sq-name">{sq.nome}</span>
                {sq.prezzo != null && <span className="rb-cosmo-sq-price">{sq.prezzo}</span>}
                {prop?.proprietarioId && <span className="rb-cosmo-sq-owner-dot" style={{ background: colorOf(prop.proprietarioId) }} />}
                {prop?.ipotecata && <span className="rb-cosmo-sq-mortgaged">IPOTECATA</span>}
                {prop && prop.caseCostruite > 0 && (
                  <span className="rb-cosmo-sq-houses">{prop.caseCostruite === 5 ? '🏨' : '🏠'.repeat(prop.caseCostruite)}</span>
                )}
                {tokensHere.length > 0 && (
                  <div className="rb-cosmo-sq-tokens">
                    {tokensHere.map((p) => <span key={p.userId} className="rb-cosmo-token" style={{ background: colorOf(p.userId) }} title={playerName(p.userId)} />)}
                  </div>
                )}
              </div>
            );
          })}

          <div className="rb-cosmo-center">
            <div className={`rb-cosmo-turn-banner ${isMyTurn ? 'mine' : ''}`}>
              {isMyTurn ? 'Tocca a te' : isBotTurn ? `🤖 ${botName ?? 'Il computer'} sta pensando…` : `Turno di ${playerName(state.turnoUserId)}`}
            </div>
            {state.ultimoDado1 != null && (
              <div className="rb-cosmo-dice">
                <span className="rb-cosmo-die">{state.ultimoDado1}</span>
                <span className="rb-cosmo-die">{state.ultimoDado2}</span>
                {state.ultimoTiroDoppio && <span className="rb-cosmo-doppio">Doppio!</span>}
              </div>
            )}
            <div className="rb-cosmo-action-panel">
              {error && <p className="rb-giochi-error">{error}</p>}
              {renderActionPanel()}
            </div>
          </div>
        </div>
      </div>

      <div className="rb-cosmo-tabs">
        <button type="button" className={tab === 'proprieta' ? 'active' : ''} onClick={() => setTab('proprieta')}>Proprietà</button>
        <button type="button" className={tab === 'scambi' ? 'active' : ''} onClick={() => setTab('scambi')}>
          Scambi{pendingToMe.length > 0 ? ' •' : ''}
        </button>
        <button type="button" className={tab === 'log' ? 'active' : ''} onClick={() => setTab('log')}>Eventi</button>
      </div>

      {tab === 'proprieta' && (
        <PropertyPanel properties={properties} user={user} playerName={playerName} busy={busy} isMyTurn={isMyTurn} run={run} />
      )}
      {tab === 'scambi' && (
        <TradesPanel roomId={roomId} user={user} room={room} players={players} properties={properties} trades={trades}
          busy={busy} setBusy={setBusy} setError={setError} reload={reload} playerName={playerName} />
      )}
      {tab === 'log' && <LogPanel log={log} />}

      <div className="rb-cosmo-bottom-actions">
        <button type="button" className="rb-reset-filters-btn" onClick={onLeave}>Abbandona</button>
        {!me?.bancarotta && (
          <button type="button" className="rb-cosmo-bankrupt-btn" disabled={busy} onClick={handleBankruptcy}>Dichiara bancarotta</button>
        )}
      </div>
    </div>
  );
}

function PropertyPanel({ properties, user, playerName, busy, isMyTurn, run }) {
  return (
    <div className="rb-cosmo-properties">
      {PURCHASABLE_SQUARES.map((sq) => {
        const prop = properties.find((p) => p.casella === sq.i);
        const isMine = prop?.proprietarioId === user.id;
        const group = sq.gruppo ? GROUPS[sq.gruppo] : null;
        const fullGroup = sq.gruppo && groupSquares(sq.gruppo).every((s) => properties.find((p) => p.casella === s.i)?.proprietarioId === user.id);
        return (
          <div key={sq.i} className="rb-cosmo-prop-row" style={group ? { borderLeftColor: group.color } : undefined}>
            <div className="rb-cosmo-prop-info">
              <strong>{sq.nome}</strong>
              <span>
                {prop?.proprietarioId ? playerName(prop.proprietarioId) : 'Libera'}
                {prop?.ipotecata ? ' · ipotecata' : ''}
                {prop?.caseCostruite > 0 ? ` · ${prop.caseCostruite === 5 ? 'hotel' : `${prop.caseCostruite} case`}` : ''}
              </span>
            </div>
            {isMine && (
              <div className="rb-cosmo-prop-actions">
                {sq.tipo === 'proprieta' && fullGroup && !prop.ipotecata && (
                  <>
                    <button type="button" disabled={busy || !isMyTurn} onClick={() => run(buildHouse, sq.i)}>+ Costruisci</button>
                    {prop.caseCostruite > 0 && (
                      <button type="button" disabled={busy || !isMyTurn} onClick={() => run(sellHouse, sq.i)}>- Vendi casa</button>
                    )}
                  </>
                )}
                {!prop.ipotecata && prop.caseCostruite === 0 && (
                  <button type="button" disabled={busy} onClick={() => run(mortgageProperty, sq.i)}>Ipoteca</button>
                )}
                {prop.ipotecata && (
                  <button type="button" disabled={busy} onClick={() => run(unmortgageProperty, sq.i)}>Riscatta</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TradesPanel({ roomId, user, room, players, properties, trades, busy, setBusy, setError, reload, playerName }) {
  const [composing, setComposing] = useState(false);
  const otherPlayers = players.filter((p) => p.userId !== user.id && !p.bancarotta);
  const pendingToMe = trades.filter((t) => t.aUserId === user.id && t.stato === 'in_attesa');
  const pendingFromMe = trades.filter((t) => t.daUserId === user.id && t.stato === 'in_attesa');
  const propName = (casella) => squareAt(casella).nome;

  const respond = async (tradeId, accetta) => {
    setBusy(true);
    setError('');
    const { error: err } = await respondTrade(roomId, tradeId, accetta);
    setBusy(false);
    if (err) { setError(err); return; }
    await reload();
  };
  const cancel = async (tradeId) => {
    setBusy(true);
    setError('');
    const { error: err } = await cancelTrade(roomId, tradeId);
    setBusy(false);
    if (err) { setError(err); return; }
    await reload();
  };

  return (
    <div className="rb-cosmo-trades">
      {pendingToMe.map((t) => (
        <div key={t.id} className="rb-cosmo-trade-card">
          <p><strong>{playerName(t.daUserId)}</strong> ti propone uno scambio:</p>
          <TradeSummary offerta={t.offerta} richiesta={t.richiesta} propName={propName} />
          <div className="rb-cosmo-action-buttons">
            <button type="button" className="rb-reset-filters-btn" disabled={busy} onClick={() => respond(t.id, false)}>Rifiuta</button>
            <button type="button" className="rb-btn-primary" disabled={busy} onClick={() => respond(t.id, true)}>Accetta</button>
          </div>
        </div>
      ))}
      {pendingFromMe.map((t) => (
        <div key={t.id} className="rb-cosmo-trade-card">
          <p>Hai proposto uno scambio a <strong>{playerName(t.aUserId)}</strong>, in attesa di risposta.</p>
          <TradeSummary offerta={t.offerta} richiesta={t.richiesta} propName={propName} />
          <button type="button" className="rb-reset-filters-btn" disabled={busy} onClick={() => cancel(t.id)}>Annulla</button>
        </div>
      ))}
      {!composing ? (
        otherPlayers.length > 0 && (
          <button type="button" className="rb-btn-primary" onClick={() => setComposing(true)}>+ Proponi scambio</button>
        )
      ) : (
        <TradeComposer
          roomId={roomId}
          user={user}
          room={room}
          otherPlayers={otherPlayers}
          properties={properties}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          onDone={async () => { setComposing(false); await reload(); }}
          onCancel={() => setComposing(false)}
        />
      )}
    </div>
  );
}

function TradeSummary({ offerta, richiesta, propName }) {
  const describe = (side) => {
    const parts = [];
    if (side.denaro > 0) parts.push(`${side.denaro}`);
    (side.proprieta ?? []).forEach((c) => parts.push(propName(c)));
    return parts.length ? parts.join(', ') : 'niente';
  };
  return (
    <div className="rb-cosmo-trade-summary">
      <div><span>Offre:</span> {describe(offerta)}</div>
      <div><span>Chiede:</span> {describe(richiesta)}</div>
    </div>
  );
}

function TradeComposer({ roomId, user, room, otherPlayers, properties, busy, setBusy, setError, onDone, onCancel }) {
  const [target, setTarget] = useState(otherPlayers[0]?.userId ?? '');
  const [myMoney, setMyMoney] = useState(0);
  const [theirMoney, setTheirMoney] = useState(0);
  const [mySel, setMySel] = useState([]);
  const [theirSel, setTheirSel] = useState([]);

  const myProps = properties.filter((p) => p.proprietarioId === user.id);
  const theirProps = properties.filter((p) => p.proprietarioId === target);
  const targetName = (uid) => room.giocatori.find((g) => g.userId === uid)?.profilo.name ?? 'Utente';

  const toggle = (setFn, casella) => setFn((prev) => (prev.includes(casella) ? prev.filter((c) => c !== casella) : [...prev, casella]));

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    setError('');
    const { error: err } = await proposeTrade(
      roomId,
      target,
      { denaro: Number(myMoney) || 0, proprieta: mySel },
      { denaro: Number(theirMoney) || 0, proprieta: theirSel }
    );
    setBusy(false);
    if (err) { setError(err); return; }
    onDone();
  };

  return (
    <div className="rb-cosmo-trade-composer">
      <label className="rb-cosmo-trade-target">
        A chi
        <select value={target} onChange={(e) => { setTarget(e.target.value); setTheirSel([]); }}>
          {otherPlayers.map((p) => <option key={p.userId} value={p.userId}>{targetName(p.userId)}</option>)}
        </select>
      </label>
      <div className="rb-cosmo-trade-columns">
        <div>
          <strong>Offri</strong>
          <label className="rb-cosmo-trade-money">
            Denaro <input type="number" min="0" value={myMoney} onChange={(e) => setMyMoney(e.target.value)} />
          </label>
          {myProps.map((p) => (
            <label key={p.casella} className="rb-cosmo-trade-checkbox">
              <input type="checkbox" checked={mySel.includes(p.casella)} onChange={() => toggle(setMySel, p.casella)} />
              {squareAt(p.casella).nome}
            </label>
          ))}
        </div>
        <div>
          <strong>Chiedi</strong>
          <label className="rb-cosmo-trade-money">
            Denaro <input type="number" min="0" value={theirMoney} onChange={(e) => setTheirMoney(e.target.value)} />
          </label>
          {theirProps.map((p) => (
            <label key={p.casella} className="rb-cosmo-trade-checkbox">
              <input type="checkbox" checked={theirSel.includes(p.casella)} onChange={() => toggle(setTheirSel, p.casella)} />
              {squareAt(p.casella).nome}
            </label>
          ))}
        </div>
      </div>
      <div className="rb-cosmo-action-buttons">
        <button type="button" className="rb-reset-filters-btn" onClick={onCancel}>Annulla</button>
        <button type="button" className="rb-btn-primary" disabled={busy || !target} onClick={submit}>Invia proposta</button>
      </div>
    </div>
  );
}

function LogPanel({ log }) {
  if (!log.length) return <p className="rb-giochi-hint">Nessun evento ancora.</p>;
  return (
    <ul className="rb-cosmo-log">
      {log.map((l) => <li key={l.id}>{l.messaggio}</li>)}
    </ul>
  );
}
