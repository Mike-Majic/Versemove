import { useEffect, useRef, useState } from 'react';
import { formatRelativeDate } from './social/resolveAuthor';
import { fetchProfilesMap, displayName } from '../data/posts';
import {
  startDirectConversation,
  fetchMessages,
  sendMessage,
  markConversationRead,
  subscribeToConversationMessages,
  getOtherParticipantLastRead,
  subscribeToParticipantUpdates,
} from '../data/directChat';
import { areConnected } from '../data/friends';
import { supabase } from '../data/supabaseClient';
import ModalOverlay from './ModalOverlay';
import CallModal from './CallModal';
import './FriendChatModal.css';

// Messaggi privati con un altro utente reale: apre (o riusa) una vera
// conversazione diretta su Supabase (start_direct_conversation), non più
// una copia locale per browser — chi scrive e chi legge vedono davvero lo
// stesso scambio. In tempo reale via un canale Supabase per la conversazione
// aperta: se la connessione realtime cade e si ristabilisce, i messaggi
// vengono ricaricati dal DB per non perderne nel frattempo.
export default function FriendChatModal({ friendId, user, onClose, onMessagesRead }) {
  const [conversationId, setConversationId] = useState(null);
  const [friend, setFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  // last_read_at dell'altro partecipante: per capire se il mio ultimo
  // messaggio è stato "Visualizzato" o solo "Inviato" (vedi sotto).
  const [otherLastReadAt, setOtherLastReadAt] = useState(null);
  // Il pulsante 📹 compare solo se si è amici o si ha un match (are_connected):
  // stessa condizione richiesta dalla RLS del canale della chiamata.
  const [canCall, setCanCall] = useState(false);
  const startCallRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setConversationId(null);

    const load = async () => {
      const [{ conversationId: convId, error: convError }, profilesMap, connected] = await Promise.all([
        startDirectConversation(friendId),
        fetchProfilesMap([friendId]),
        areConnected(friendId),
      ]);
      if (cancelled) return;
      setCanCall(connected);
      if (convError) {
        setError(convError);
        setLoading(false);
        return;
      }
      setFriend(profilesMap.get(friendId) ?? { id: friendId, name: 'Utente', avatar: '' });
      setConversationId(convId);
      const { messages: fetched, error: msgError } = await fetchMessages(convId);
      if (cancelled) return;
      if (msgError) {
        setError(msgError);
        setLoading(false);
        return;
      }
      setMessages(fetched);
      setLoading(false);
      markConversationRead(convId);
      onMessagesRead?.();
      getOtherParticipantLastRead(convId, user.id).then((lastReadAt) => {
        if (!cancelled) setOtherLastReadAt(lastReadAt);
      });
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [friendId]);

  // "Ultimo valore" di friend leggibile dalla callback del canale realtime
  // sotto (che altrimenti vedrebbe sempre il friend della sottoscrizione
  // iniziale), senza riaprire il canale ogni volta che friend cambia.
  const friendRef = useRef(friend);
  useEffect(() => {
    friendRef.current = friend;
  }, [friend]);

  // Canale realtime per la conversazione aperta: rimosso a chiusura/cambio
  // chat, così non ne resta nessuno appeso.
  useEffect(() => {
    if (!conversationId) return undefined;

    const channel = subscribeToConversationMessages(
      conversationId,
      (row) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          const isMine = row.sender_id === user.id;
          const author = isMine
            ? { id: user.id, name: displayName(user, 'Tu'), avatar: user.avatar || '' }
            : friendRef.current ?? { id: row.sender_id, name: 'Utente', avatar: '' };
          return [...prev, { id: row.id, conversationId: row.conversation_id, senderId: row.sender_id, author, testo: row.testo, data: row.created_at }];
        });
        markConversationRead(conversationId);
        onMessagesRead?.();
      },
      () => {
        // Riconnessione dopo una caduta della connessione realtime: ricarica
        // dal DB per non perdere messaggi arrivati nel frattempo.
        fetchMessages(conversationId).then(({ messages: fetched, error: msgError }) => {
          if (!msgError) setMessages(fetched);
        });
      }
    );

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user.id]);

  // Canale realtime su chat_participants: quando l'altra persona apre la
  // chat (mark_conversation_read aggiorna la sua riga), il mio ultimo
  // messaggio passa da "Inviato" a "Visualizzato" senza dover ricaricare.
  useEffect(() => {
    if (!conversationId) return undefined;
    const channel = subscribeToParticipantUpdates(conversationId, (row) => {
      if (row.user_id !== user.id) setOtherLastReadAt(row.last_read_at);
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user.id]);

  const send = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !conversationId || sending) return;
    setSending(true);
    const { id, createdAt, error: sendError } = await sendMessage(conversationId, text);
    setSending(false);
    if (sendError) {
      setError(sendError);
      return;
    }
    setMessages((prev) => [
      ...prev,
      {
        id,
        conversationId,
        senderId: user.id,
        author: { id: user.id, name: displayName(user, 'Tu'), avatar: user.avatar || '' },
        testo: text,
        data: createdAt,
      },
    ]);
    setDraft('');
  };

  // Solo l'ULTIMO messaggio mio ha lo stato "Inviato"/"Visualizzato" sotto
  // (non ogni messaggio: sarebbe ridondante, come in qualunque chat).
  const lastMineId = [...messages].reverse().find((m) => m.senderId === user.id)?.id ?? null;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-friend-chat-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <div className="rb-friend-chat-header">
          {friend && (
            <>
              <img src={friend.avatar} alt="" />
              <strong>{friend.name}</strong>
            </>
          )}
          {canCall && (
            <button
              type="button"
              className="rb-friend-chat-call-btn"
              onClick={() => startCallRef.current?.()}
              aria-label="Videochiamata"
              title="Videochiamata"
            >
              📹
            </button>
          )}
        </div>

        {loading && <p className="rb-friend-chat-empty">Caricamento...</p>}
        {error && <p className="rb-privacy-error">⚠️ {error}</p>}

        {!loading && !error && (
          <ul className="rb-friend-chat-messages">
            {messages.length === 0 && <p className="rb-friend-chat-empty">Nessun messaggio ancora, scrivi il primo!</p>}
            {messages.map((m) => (
              <li key={m.id} className={`rb-friend-chat-msg ${m.senderId === user.id ? 'me' : ''}`}>
                <span>{m.testo}</span>
                <span className="rb-friend-chat-date">{formatRelativeDate(m.data)}</span>
                {m.id === lastMineId && (
                  <span className="rb-friend-chat-receipt">
                    {otherLastReadAt && new Date(otherLastReadAt) >= new Date(m.data) ? 'Visualizzato' : 'Inviato'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <form className="rb-friend-chat-form" onSubmit={send}>
          <input
            type="text"
            placeholder="Scrivi un messaggio..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={loading || Boolean(error) || !conversationId}
          />
          <button type="submit" disabled={sending || loading || Boolean(error) || !conversationId}>Invia</button>
        </form>
      </div>

      {canCall && conversationId && (
        <CallModal
          conversationId={conversationId}
          user={user}
          friend={friend}
          registerStart={(fn) => { startCallRef.current = fn; }}
        />
      )}
    </ModalOverlay>
  );
}
