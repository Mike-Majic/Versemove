import { useEffect, useMemo, useRef, useState } from 'react';
import {
  listFaqChat,
  sendFaqChatMessage,
  deleteFaqChatMessage,
  subscribeToFaqChat,
  resolveFaqChatRow,
  faqChatFilePath,
  startStaffConversation,
} from '../../data/faqChat';
import { displayName } from '../../data/posts';
import { isStaff } from '../../data/roles';
import { openProfileFromMention } from '../../data/mentions';
import { supabase } from '../../data/supabaseClient';
import Skeleton from '../Skeleton';
import EmptyState from '../EmptyState';
import MessageList from '../shared/chat/MessageList';
import ChatBubble from '../shared/chat/ChatBubble';
import ChatComposer from '../shared/chat/ChatComposer';
import AttachmentView from '../shared/chat/AttachmentView';
import Lightbox from '../shared/chat/Lightbox';
import { inkOn, newId, timeLabel, uploadWithProgress } from '../shared/chat/chatMedia';
import '../shared/chat/chat.css';
import './faqChat.css';

// Accento della chat FAQ: azzurro della palette, per distinguerla dalla
// Stanza MOD (rossa) pur restando nello stesso mondo grigio.
const ACCENT = '#3a86ff';

// Anteprima di una riga per la citazione di una risposta.
function snippet(m) {
  if (!m) return 'Messaggio precedente';
  if (m.eliminato) return 'Messaggio eliminato';
  if (m.testo) return m.testo.length > 90 ? `${m.testo.slice(0, 90)}…` : m.testo;
  const tipo = m.allegato?.tipo;
  if (tipo === 'immagine') return '📷 Foto';
  if (tipo === 'video') return '🎬 Video';
  if (tipo === 'audio') return '🎤 Messaggio vocale';
  if (m.allegato) return `📎 ${m.allegato.nome ?? 'Allegato'}`;
  return 'Messaggio';
}

// Chat del mondo FAQ: una stanza unica, stile gruppo, fra tutti gli utenti
// con accesso e lo staff (owner e moderatori, con l'etichetta "Staff").
// Stessi componenti della Stanza MOD e delle chat private (shared/chat):
// testo, emoji, allegati e vocali; ogni messaggio con avatar e nickname
// dell'autore; solo la ✓ singola (inviato), niente consegnato/letto in un
// gruppo. Testata: titolo, cerca, chiudi (niente "Vedi profilo" né
// "Archivia conversazione": non è una conversazione a due).
// Solo owner e moderatori: avatar e nickname di un utente aprono un menu
// con "Vedi profilo" e "Scrivi in privato" (start_staff_conversation, poi la
// chat privata di sempre, FriendChatModal, via l'evento vm:open-chat). Per
// gli utenti normali avatar e nickname non sono cliccabili.
export default function FaqChatColumn({ user, onOpenAuth, onClose }) {
  const staff = isStaff(user?.ruolo);
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const panelRef = useRef(null);
  const retryPayloadsRef = useRef(new Map());

  const me = useMemo(
    () => (user ? { id: user.id, name: displayName(user, 'Tu'), avatar: user.avatar || '' } : null),
    [user]
  );

  // Prima pagina, poi Realtime: nuovi messaggi (deduplicati per id: il mio
  // arriva anche come conferma dell'invio) e modifiche (eliminazioni). Alla
  // riconnessione si rilegge l'ultima pagina e la si fonde.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const mergeFresh = (fresh) =>
      setMessages((prev) => {
        const list = prev ?? [];
        const byId = new Map(list.map((m) => [m.id, m]));
        fresh.forEach((m) => byId.set(m.id, { ...byId.get(m.id), ...m }));
        return Array.from(byId.values()).sort((a, b) => new Date(a.data) - new Date(b.data));
      });

    listFaqChat().then(({ messages: page, hasMore: more, error }) => {
      if (cancelled) return;
      if (error) setLoadError(error);
      setMessages(page);
      setHasMore(more);
    });

    const channel = subscribeToFaqChat({
      onInsert: async (row) => {
        const msg = await resolveFaqChatRow(row);
        if (cancelled) return;
        setMessages((prev) => {
          const list = prev ?? [];
          if (list.some((m) => m.id === msg.id)) return list;
          return [...list, msg];
        });
      },
      onUpdate: (row) => {
        setMessages((prev) =>
          (prev ?? []).map((m) =>
            m.id === row.id
              ? {
                  ...m,
                  eliminato: Boolean(row.deleted_at),
                  testo: row.deleted_at ? '' : row.testo ?? '',
                  allegato: row.deleted_at ? null : row.allegato ?? null,
                }
              : m
          )
        );
      },
      onReconnect: () => {
        listFaqChat().then(({ messages: page, error }) => {
          if (!cancelled && !error) mergeFresh(page);
        });
      },
    });
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadOlder = async () => {
    const oldest = messages?.find((m) => !m.pending && !m.failed);
    if (!oldest) return false;
    const { messages: page, hasMore: more, error } = await listFaqChat({ before: oldest.data });
    if (error) return false;
    setMessages((prev) => {
      const ids = new Set((prev ?? []).map((m) => m.id));
      return [...page.filter((m) => !ids.has(m.id)), ...(prev ?? [])];
    });
    setHasMore(more);
    return more;
  };

  // Invio ottimistico, come nella Stanza MOD: la bolla compare subito
  // (grigia), poi prende l'id vero; se Realtime è arrivato prima, la copia
  // provvisoria sparisce. Errore -> "Non inviato · Riprova" e il messaggio
  // del server sopra la barra di scrittura.
  const sendPayload = async (payload, tempId = newId()) => {
    retryPayloadsRef.current.set(tempId, payload);
    setNotice('');
    setMessages((prev) => [
      ...(prev ?? []).filter((m) => m.id !== tempId),
      {
        id: tempId,
        authorId: user.id,
        author: me,
        staff,
        testo: payload.testo ?? '',
        allegato: payload.allegato ?? null,
        rispostaA: payload.rispostaA ?? null,
        data: new Date().toISOString(),
        eliminato: false,
        pending: true,
      },
    ]);
    const res = await sendFaqChatMessage(payload);
    setMessages((prev) => {
      const list = prev ?? [];
      if (res.error) return list.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m));
      retryPayloadsRef.current.delete(tempId);
      if (list.some((m) => m.id === res.id)) return list.filter((m) => m.id !== tempId);
      return list.map((m) => (m.id === tempId ? { ...m, id: res.id, pending: false } : m));
    });
    if (res.error) setNotice(res.error);
    return !res.error;
  };

  const retry = (tempId) => {
    const payload = retryPayloadsRef.current.get(tempId);
    if (payload) sendPayload(payload, tempId);
  };

  // Il server accetta un allegato per messaggio: uno per allegato, con il
  // testo (se c'è) insieme all'ultimo, come una didascalia. La risposta
  // (risposta_a) vale per il primo messaggio inviato.
  const onSend = async ({ testo, allegati }) => {
    const reply = replyTo?.id ?? null;
    setReplyTo(null);
    const text = (testo ?? '').trim();
    if (!allegati.length) {
      await sendPayload({ testo: text, allegato: null, rispostaA: reply });
      return;
    }
    for (let i = 0; i < allegati.length; i++) {
      const last = i === allegati.length - 1;
      const ok = await sendPayload({ testo: last ? text : '', allegato: allegati[i], rispostaA: i === 0 ? reply : null });
      if (!ok) break;
    }
  };

  const upload = (file, onProgress) => uploadWithProgress(faqChatFilePath(user.id, file.name, newId()), file, onProgress);

  const runDelete = async () => {
    const target = confirmDelete;
    setConfirmDelete(null);
    if (!target) return;
    const res = await deleteFaqChatMessage(target.id);
    if (res.error) {
      setNotice(res.error);
      return;
    }
    setMessages((prev) => (prev ?? []).map((m) => (m.id === target.id ? { ...m, eliminato: true, testo: '', allegato: null } : m)));
  };

  const writePrivately = async (authorId) => {
    setNotice('');
    const res = await startStaffConversation(authorId);
    if (res.error) {
      setNotice(res.error);
      return;
    }
    window.dispatchEvent(new CustomEvent('vm:open-chat', { detail: { userId: authorId, conversationId: res.conversationId } }));
  };

  const byId = useMemo(() => new Map((messages ?? []).map((m) => [m.id, m])), [messages]);

  const myId = user?.id ?? null;
  const query = search.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = (messages ?? []).map((m) => ({ ...m, mine: m.authorId === myId }));
    if (!query) return list;
    return list.filter(
      (m) =>
        !m.eliminato &&
        ((m.testo || '').toLowerCase().includes(query) ||
          (m.author?.name || '').toLowerCase().includes(query) ||
          (m.allegato?.nome || '').toLowerCase().includes(query))
    );
  }, [messages, query, myId]);

  const renderMessage = (m) => {
    const canDelete = !m.eliminato && (m.mine || staff);
    const menu =
      m.pending || m.failed
        ? null
        : [
            ...(!m.eliminato ? [{ label: '↩️ Rispondi', onClick: () => setReplyTo(m) }] : []),
            ...(canDelete ? [{ label: '🗑️ Elimina', danger: true, onClick: () => setConfirmDelete(m) }] : []),
          ];
    const authorMenu =
      staff && !m.mine
        ? [
            { label: '👤 Vedi profilo', onClick: () => openProfileFromMention(m.authorId) },
            { label: '✉️ Scrivi in privato', onClick: () => writePrivately(m.authorId) },
          ]
        : null;
    const quoted = m.rispostaA ? byId.get(m.rispostaA) : null;
    return (
      <ChatBubble
        key={m.id}
        mine={m.mine}
        author={m.author}
        badge={m.staff ? 'Staff' : null}
        time={timeLabel(m.data)}
        pending={m.pending}
        failed={m.failed}
        onRetry={() => retry(m.id)}
        menu={menu}
        authorMenu={authorMenu}
        footer={
          m.mine && !m.eliminato ? (
            <span className="rb-faqchat-tick" aria-label="Inviato" title="Inviato">
              ✓
            </span>
          ) : null
        }
      >
        {m.eliminato ? (
          <p className="rb-chat-deleted">Messaggio eliminato</p>
        ) : (
          <>
            {m.rispostaA && (
              <span className="rb-faqchat-quote">
                <strong>{quoted ? (quoted.authorId === user?.id ? 'Tu' : quoted.author?.name ?? 'Utente') : 'Risposta'}</strong>
                <span>{snippet(quoted)}</span>
              </span>
            )}
            {m.allegato?.path && (
              <div className="rb-chat-atts">
                <AttachmentView allegato={m.allegato} onOpenImage={(src, nome) => setLightbox({ src, nome })} />
              </div>
            )}
            {m.testo && <p className="rb-chat-text">{m.testo}</p>}
          </>
        )}
      </ChatBubble>
    );
  };

  return (
    <div className="rb-faqchat-panel rb-chat-scope" ref={panelRef} style={{ '--a': ACCENT, '--a-ink': inkOn(ACCENT) }}>
      <header className="rb-faqchat-head">
        <div className="rb-faqchat-head-title">
          <h2>💬 Chat con lo staff</h2>
          <p>Una stanza unica per tutti: lo staff risponde con l'etichetta «Staff».</p>
        </div>
        <div className="rb-faqchat-head-actions">
          {searchOpen && (
            <input
              type="search"
              className="rb-faqchat-search"
              placeholder="Cerca nella chat…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearch('');
                  setSearchOpen(false);
                }
              }}
              autoFocus
            />
          )}
          <button
            type="button"
            className={`rb-faqchat-btn ${searchOpen ? 'on' : ''}`}
            onClick={() => {
              setSearchOpen((v) => !v);
              setSearch('');
            }}
            aria-label={searchOpen ? 'Chiudi ricerca' : 'Cerca nella chat'}
            title={searchOpen ? 'Chiudi ricerca' : 'Cerca nella chat'}
          >
            🔍
          </button>
          <button type="button" className="rb-faqchat-btn" onClick={onClose} aria-label="Chiudi la chat" title="Chiudi">
            ✕
          </button>
        </div>
      </header>

      {!user ? (
        <div className="rb-faqchat-empty">
          <EmptyState
            icon="🔒"
            title="Accedi per scrivere allo staff"
            subtitle="La chat è aperta a tutti gli utenti con un account."
            actions={[{ label: 'Accedi', primary: true, onClick: onOpenAuth }]}
          />
        </div>
      ) : (
        <>
          {searchOpen && query && (
            <p className="rb-faqchat-search-note">
              {shown.length} {shown.length === 1 ? 'messaggio trovato' : 'messaggi trovati'} per “{search.trim()}”
            </p>
          )}
          {messages === null ? (
            <div className="rb-faqchat-loading">
              <Skeleton lines={5} />
            </div>
          ) : (
            <MessageList
              items={shown}
              renderItem={renderMessage}
              onLoadOlder={query ? null : loadOlder}
              hasMore={hasMore}
              empty={
                <li className="rb-chat-older">
                  {loadError || (query ? 'Nessun messaggio trovato.' : 'Nessun messaggio ancora: scrivi il primo, lo staff ti risponde qui.')}
                </li>
              }
            />
          )}

          {notice && (
            <p className="rb-faqchat-notice" role="alert">
              ⚠️ {notice}
              <button type="button" onClick={() => setNotice('')} aria-label="Chiudi avviso">
                ✕
              </button>
            </p>
          )}

          {confirmDelete && (
            <div className="rb-faqchat-confirm" role="alertdialog" aria-label="Conferma eliminazione">
              <p>
                {confirmDelete.authorId === user.id
                  ? 'Eliminare questo messaggio? Nella chat resterà "Messaggio eliminato".'
                  : `Eliminare il messaggio di ${confirmDelete.author?.name ?? 'questo utente'}? Nella chat resterà "Messaggio eliminato".`}
              </p>
              <div>
                <button type="button" onClick={() => setConfirmDelete(null)}>
                  Annulla
                </button>
                <button type="button" className="primary danger" onClick={runDelete}>
                  Elimina
                </button>
              </div>
            </div>
          )}

          {replyTo && (
            <div className="rb-faqchat-replybar">
              <span>
                ↩️ Rispondi a <strong>{replyTo.authorId === user.id ? 'te stesso' : replyTo.author?.name ?? 'Utente'}</strong>:{' '}
                {snippet(replyTo)}
              </span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Annulla risposta">
                ✕
              </button>
            </div>
          )}

          <ChatComposer
            contesto="generale"
            mentionsEnabled={false}
            placeholder="Scrivi allo staff e agli altri utenti…"
            dropTargetRef={panelRef}
            upload={upload}
            onSend={onSend}
          />
        </>
      )}

      {lightbox && <Lightbox src={lightbox.src} nome={lightbox.nome} onClose={() => setLightbox(null)} />}
    </div>
  );
}
