import { useEffect, useRef } from 'react';
import { botStep, firstHumanHostId } from '../../../data/gameRooms';

// Motore dei bot, condiviso da tutti e quattro i tavoli: quando tocca a un
// bot (o, in Cosmopoli, quando un bot ha ricevuto uno scambio in attesa di
// risposta) SOLO l'umano con la posizione più bassa nella stanza (vedi
// firstHumanHostId) chiama game_bot_step dopo una breve pausa "scenica" —
// altrimenti, con più umani in stanza, tutti proverebbero a far muovere lo
// stesso bot nello stesso istante. Ogni mossa del bot genera un evento
// (game_events), quindi eventTick si aggiorna da solo e l'hook si riattiva:
// se toccano due bot di fila vanno avanti senza bisogno di altro.
const THINK_DELAY_MS = 900;
const RETRY_DELAY_MS = 3000;

export default function useBotDriver({ roomId, room, turnUserId, user, eventTick, pendingBotTrades = [] }) {
  const busyRef = useRef(false);

  const turnPlayer = room?.giocatori.find((g) => g.userId === turnUserId);
  const isBotTurn = Boolean(turnPlayer?.isBot);
  const iAmHost = Boolean(user && room && firstHumanHostId(room.giocatori) === user.id);
  const hasBotTradeWaiting = pendingBotTrades.length > 0;

  useEffect(() => {
    if (room?.stato !== 'in_corso' || !iAmHost) return undefined;
    if (!isBotTurn && !hasBotTradeWaiting) return undefined;

    let retryId;
    const runStep = (isRetry) => {
      if (busyRef.current) return;
      busyRef.current = true;
      botStep(roomId).then(({ error }) => {
        busyRef.current = false;
        if (error && !isRetry) {
          retryId = setTimeout(() => runStep(true), RETRY_DELAY_MS);
        }
      });
    };
    const stepId = setTimeout(() => runStep(false), THINK_DELAY_MS);

    return () => {
      clearTimeout(stepId);
      clearTimeout(retryId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, room?.stato, isBotTurn, iAmHost, hasBotTradeWaiting, eventTick]);

  return { isBotTurn, botName: turnPlayer?.profilo?.name ?? null };
}
