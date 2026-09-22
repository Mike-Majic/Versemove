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
  uploadChatAttachment,
  CHAT_MAX_FILE_BYTES,
} from '../data/directChat';
import ChatAttachment from './chat/ChatAttachment';
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
  // Menu "+" accanto a Invia: foto, file, posizione GPS.
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachStatus, setAttachStatus] = useState('');
  const [confirmLocation, setConfirmLocation] = useState(false);
  const photoInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

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
          return [
            ...prev,
            {
              id: row.id,
              conversationId: row.conversation_id,
              senderId: row.sender_id,
              author,
              testo: row.testo,
              tipo: row.tipo ?? 'testo',
              allegato: row.allegato ?? null,
              data: row.created_at,
            },
          ];
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
    appendMine({ id, testo: text, tipo: 'testo', allegato: null, data: createdAt });
    setDraft('');
  };

  const appendMine = (msg) => {
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id)
        ? prev
        : [
            ...prev,
            {
              conversationId,
              senderId: user.id,
              author: { id: user.id, name: displayName(user, 'Tu'), avatar: user.avatar || '' },
              ...msg,
            },
          ]
    );
  };

  // Carica il file nel bucket privato della conversazione e manda il
  // messaggio che lo contiene.
  const sendFile = async (file, tipo) => {
    if (!file || !conversationId) return;
    if (file.size > CHAT_MAX_FILE_BYTES) {
      setAttachStatus('⚠️ Il file supera i 20 MB.');
      return;
    }
    setAttachMenuOpen(false);
    setAttachStatus(tipo === 'foto' ? 'Invio foto…' : 'Invio file…');
    const up = await uploadChatAttachment(conversationId, file);
    if (up.error) {
      setAttachStatus(`⚠️ ${up.error}`);
      return;
    }
    const allegato = { path: up.path, nome: up.nome, mime: up.mime, size: up.size };
    const label = tipo === 'foto' ? '📷 Foto' : `📎 ${up.nome}`;
    const res = await sendMessage(conversationId, label, { tipo, allegato });
    if (res.error) {
      setAttachStatus(`⚠️ ${res.error}`);
      return;
    }
    setAttachStatus('');
    appendMine({ id: res.id, testo: label, tipo, allegato, data: res.createdAt });
  };

  // La posizione si manda SOLO dopo una conferma esplicita e solo quella
  // attuale (nessun tracciamento continuo, niente salvato sul profilo).
  const sendLocation = () => {
    setConfirmLocation(false);
    setAttachMenuOpen(false);
    if (!navigator.geolocation) {
      setAttachStatus('⚠️ Il tuo dispositivo non permette di leggere la posizione.');
      return;
    }
    setAttachStatus('Rilevo la posizione…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const allegato = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          precisione: Math.round(pos.coords.accuracy || 0),
        };
        const res = await sendMessage(conversationId, '📍 Posizione', { tipo: 'posizione', allegato });
        if (res.error) {
          setAttachStatus(`⚠️ ${res.error}`);
          return;
        }
        setAttachStatus('');
        appendMine({ id: res.id, testo: '📍 Posizione', tipo: 'posizione', allegato, data: res.createdAt });
      },
      (err) => {
        setAttachStatus(
          err.code === 1 ? '⚠️ Permesso alla posizione negato dal browser.' : '⚠️ Posizione non disponibile, riprova.'
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  // Porta in vista l'ultimo messaggio quando ne arriva o se ne manda uno.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, loading]);

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
              {friend.avatar ? (
                <img src={friend.avatar} alt="" />
              ) : (
                <span className="rb-friend-chat-avatar-empty" aria-hidden="true">
                  {(friend.name || '?').trim().charAt(0).toUpperCase()}
                </span>
              )}
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
                {m.tipo && m.tipo !== 'testo' && m.allegato ? (
                  <div className="rb-friend-chat-bubble-att">
                    <ChatAttachment tipo={m.tipo} allegato={m.allegato} />
                  </div>
                ) : (
                  <span className="rb-friend-chat-bubble">{m.testo}</span>
                )}
                <span className="rb-friend-chat-date">{formatRelativeDate(m.data)}</span>
                {m.id === lastMineId && (
                  <span className="rb-friend-chat-receipt">
                    {otherLastReadAt && new Date(otherLastReadAt) >= new Date(m.data) ? 'Visualizzato' : 'Inviato'}
                  </span>
                )}
              </li>
            ))}
            <li ref={messagesEndRef} aria-hidden="true" className="rb-friend-chat-end" />
          </ul>
        )}

        {attachStatus && <p className="rb-friend-chat-att-status">{attachStatus}</p>}

        {confirmLocation && (
          <div className="rb-friend-chat-confirm">
            <p>
              Vuoi inviare a <strong>{friend?.name ?? 'questa persona'}</strong> la tua posizione attuale? Verrà mostrata solo in
              questa chat.
            </p>
            <div>
              <button type="button" onClick={() => setConfirmLocation(false)}>Annulla</button>
              <button type="button" className="primary" onClick={sendLocation}>Invia posizione</button>
            </div>
          </div>
        )}

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            sendFile(e.target.files?.[0], 'foto');
            e.target.value = '';
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            sendFile(f, f?.type?.startsWith('image/') ? 'foto' : 'file');
            e.target.value = '';
          }}
        />

        <form className="rb-friend-chat-form" onSubmit={send}>
          <div className="rb-friend-chat-attach">
            <button
              type="button"
              className={`rb-friend-chat-plus ${attachMenuOpen ? 'open' : ''}`}
              onClick={() => setAttachMenuOpen((v) => !v)}
              disabled={loading || Boolean(error) || !conversationId}
              aria-label="Allega foto, file o posizione"
              aria-expanded={attachMenuOpen}
              title="Allega"
            >
              <span className="rb-friend-chat-plus-glyph">+</span>
            </button>
            {attachMenuOpen && (
              <div className="rb-friend-chat-attach-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => photoInputRef.current?.click()}>
                  <span>📷</span> Foto
                </button>
                <button type="button" role="menuitem" onClick={() => fileInputRef.current?.click()}>
                  <span>📎</span> File
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    setConfirmLocation(true);
                  }}
                >
                  <span>📍</span> Posizione
                </button>
              </div>
            )}
          </div>
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
