import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BAN_CHAT_MAX,
  getBanChat,
  getBanChatRemaining,
  sendBanChatMessage,
  subscribeToBanChat,
  mapBanChatRow,
} from '../../data/banChat';
import { displayName } from '../../data/posts';
import { supabase } from '../../data/supabaseClient';
import Skeleton from '../Skeleton';
import MessageList from '../shared/chat/MessageList';
import ChatBubble from '../shared/chat/ChatBubble';
import { newId, timeLabel } from '../shared/chat/chatMedia';
import '../shared/chat/chat.css';
import './infoBan.css';

// Chat INFO BAN dell'utente bloccato: solo testo, con lo staff. Al massimo
// 3 messaggi prima di una risposta (il conteggio lo tiene il server,
// ban_chat_rimasti): sopra il campo quanti ne restano, a 0 il campo si
// spegne; dopo ogni invio il banner "L'operatore risponderà appena sarà
// possibile."; quando lo staff risponde il contatore torna a 3.
export default function InfoBanUserChat({ user }) {
  const [messages, setMessages] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [rimasti, setRimasti] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sentBanner, setSentBanner] = useState(false);
  const textRef = useRef(null);
  const myName = displayName(user, 'Tu');

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      Promise.all([getBanChat(), getBanChatRemaining()]).then(([chat, left]) => {
        if (cancelled) return;
        setLoadError(chat.error ?? '');
        setMessages(chat.messages);
        if (left !== null) setRimasti(left);
      });
    load();
    // Risposta dello staff (o un mio messaggio da un'altra scheda) in tempo
    // reale: la RLS manda solo le righe della mia chat.
    const channel = subscribeToBanChat({
      userId: user.id,
      onInsert: (row) => {
        const msg = mapBanChatRow(row, myName);
        setMessages((prev) => {
          const list = prev ?? [];
          if (list.some((m) => m.id === msg.id)) return list;
          return [...list, msg];
        });
        if (msg.daStaff) {
          setRimasti(BAN_CHAT_MAX);
          setSentBanner(false);
        }
        getBanChatRemaining().then((left) => {
          if (!cancelled && left !== null) setRimasti(left);
        });
      },
      onReconnect: load,
    });
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const testo = text.trim();
    if (!testo || sending || rimasti === 0) return;
    setSending(true);
    setError('');
    const tempId = newId();
    setMessages((prev) => [...(prev ?? []), { id: tempId, daStaff: false, autore: myName, testo, data: new Date().toISOString(), pending: true }]);
    const res = await sendBanChatMessage(testo);
    setSending(false);
    if (res.error) {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== tempId));
      setError(res.error);
      // Il server dice che i 3 messaggi sono finiti: si riallinea.
      getBanChatRemaining().then((left) => left !== null && setRimasti(left));
      return;
    }
    setText('');
    setMessages((prev) => {
      const list = prev ?? [];
      if (res.id && list.some((m) => m.id === res.id)) return list.filter((m) => m.id !== tempId);
      return list.map((m) => (m.id === tempId ? { ...m, id: res.id ?? tempId, pending: false } : m));
    });
    if (res.rimasti !== null) setRimasti(res.rimasti);
    setSentBanner(true);
    textRef.current?.focus();
  };

  const items = useMemo(() => (messages ?? []).map((m) => ({ ...m, mine: !m.daStaff })), [messages]);
  const blockedComposer = rimasti === 0;

  return (
    <div className="rb-infoban-chat">
      {messages === null ? (
        <div className="rb-infoban-loading">
          <Skeleton lines={4} />
        </div>
      ) : (
        <MessageList
          items={items}
          renderItem={(m) => (
            <ChatBubble
              key={m.id}
              mine={m.mine}
              author={{ name: m.daStaff ? 'Staff' : m.autore }}
              badge={m.daStaff ? 'Staff' : null}
              time={timeLabel(m.data)}
              pending={m.pending}
            >
              <p className="rb-chat-text">{m.testo}</p>
            </ChatBubble>
          )}
          empty={
            <li className="rb-chat-older">
              {loadError || 'Scrivi allo staff: spiega cosa è successo o chiedi informazioni sul blocco.'}
            </li>
          }
        />
      )}

      {sentBanner && (
        <p className="rb-infoban-banner" role="status">
          ✓ L'operatore risponderà appena sarà possibile.
          <button type="button" onClick={() => setSentBanner(false)} aria-label="Chiudi avviso">
            ✕
          </button>
        </p>
      )}
      {error && (
        <p className="rb-infoban-error" role="alert">
          ⚠️ {error}
        </p>
      )}

      <div className="rb-infoban-composer">
        <p className={`rb-infoban-left ${blockedComposer ? 'none' : ''}`}>
          {rimasti === null
            ? ' '
            : blockedComposer
            ? `Hai inviato ${BAN_CHAT_MAX} messaggi: attendi la risposta di un operatore`
            : `Puoi inviare ancora ${rimasti} ${rimasti === 1 ? 'messaggio' : 'messaggi'} prima della risposta di un operatore`}
        </p>
        <div className="rb-infoban-input-row">
          <textarea
            ref={textRef}
            rows={2}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={blockedComposer ? 'Attendi la risposta di un operatore…' : 'Scrivi allo staff…'}
            disabled={blockedComposer || sending || rimasti === null}
            aria-label="Messaggio allo staff"
          />
          <button type="button" className="rb-infoban-send" onClick={send} disabled={blockedComposer || sending || !text.trim()}>
            {sending ? 'Invio…' : 'Invia'}
          </button>
        </div>
      </div>
    </div>
  );
}
