import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchProfilesMap, displayName } from '../data/posts';
import {
  startDirectConversation,
  fetchMessages,
  mapMessageRow,
  sendMessage,
  markConversationRead,
  subscribeToConversationMessages,
  subscribeToConversationPresence,
  getOtherParticipantReceipts,
  subscribeToParticipantUpdates,
  setConversationArchived,
  deleteMessageForAll,
  deleteMessageForMe,
} from '../data/directChat';
import { openProfileFromMention } from '../data/mentions';
import ChatAttachment from './chat/ChatAttachment';
import TranslateHint from './shared/TranslateHint';
import MentionText from './shared/MentionText';
import MessageList from './shared/chat/MessageList';
import ChatBubble from './shared/chat/ChatBubble';
import ChatComposer from './shared/chat/ChatComposer';
import AttachmentView from './shared/chat/AttachmentView';
import Lightbox from './shared/chat/Lightbox';
import { formatDuration, inkOn, kindOfMime, newId, safeFileName, timeLabel, uploadWithProgress } from './shared/chat/chatMedia';
import { areConnected } from '../data/friends';
import { supabase } from '../data/supabaseClient';
import { WORLDS } from '../data/worlds';
import ModalOverlay from './ModalOverlay';
import { useCalls } from '../calls/CallProvider';
import Icon from './shared/Icon';
import './shared/chat/chat.css';
import './FriendChatModal.css';

const PAGE = 50;
const WORLD_BY_ID = new Map(WORLDS.map((w) => [w.id, w]));
const DEFAULT_WORLD = WORLD_BY_ID.get('social');

// Allegato di chat_messages -> formato di AttachmentView (Stanza MOD).
function toAttachment(tipo, allegato) {
  if (!allegato?.path) return null;
  const mime = allegato.mime || '';
  const kind = tipo === 'foto' ? 'immagine' : tipo === 'video' ? 'video' : tipo === 'audio' ? 'audio' : kindOfMime(mime);
  return { ...allegato, tipo: kind, dimensione: allegato.dimensione ?? allegato.size };
}

// Allegato caricato dal ChatComposer -> riga di chat_messages. Il `testo`
// resta un'etichetta breve per notifiche e client più vecchi.
function toChatMessage(a) {
  const allegato = { path: a.path, nome: a.nome, mime: a.mime, dimensione: a.dimensione, size: a.dimensione };
  if (a.tipo === 'immagine') return { tipo: 'foto', testo: '📷 Foto', allegato };
  if (a.tipo === 'video') return { tipo: 'video', testo: '🎬 Video', allegato };
  if (a.tipo === 'audio') {
    return { tipo: 'audio', testo: `🎤 Messaggio vocale · ${formatDuration(a.durata)}`, allegato: { ...allegato, durata: a.durata } };
  }
  return { tipo: 'file', testo: `📎 ${a.nome}`, allegato };
}

// Messaggi privati con un altro utente reale: una sola conversazione
// (start_direct_conversation) fra tutti i mondi, in tempo reale. Lo stile è
// quello della Stanza MOD (componenti in shared/chat), colorato col mondo
// in cui la chat è aperta: `--a` = world.color sul pannello. Ogni messaggio
// porta con sé il mondo da cui è stato scritto (`mondo`): se è diverso da
// quello attuale, sotto la bolla compare "● scritto in <Mondo>".
// autoAnswerCall: aperta da "Rispondi" nell'avviso di chiamata in arrivo
// (IncomingCallToast): la chiamata viene accettata appena arriva il ring.
// initialConversationId: conversazione già aperta da chi apre la chat (es.
// lo staff con start_staff_conversation): si usa quella invece di
// start_direct_conversation.
export default function FriendChatModal({
  friendId,
  initialConversationId = null,
  user,
  world,
  onClose,
  onMessagesRead,
  autoAnswerCall = false,
}) {
  const activeWorld = world ?? DEFAULT_WORLD;
  const [conversationId, setConversationId] = useState(null);
  const [friend, setFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  // Ricevute dell'altro partecipante (chat_participants): ✓ inviato,
  // ✓✓ grigie consegnato (created_at <= last_delivered_at), ✓✓ blu letto
  // (created_at <= last_read_at).
  const [otherLastReadAt, setOtherLastReadAt] = useState(null);
  const [otherLastDeliveredAt, setOtherLastDeliveredAt] = useState(null);
  const [friendHere, setFriendHere] = useState(false);
  // 📹 solo se la videochiamata 1:1 è già possibile (amici o match,
  // are_connected): stessa condizione della RLS del canale della chiamata.
  const [canCall, setCanCall] = useState(false);
  // La chiamata vive in calls/CallProvider (resta attiva chiudendo la chat):
  // qui la chat la "aggancia" finché è aperta, per ricevere lo squillo.
  const { attachDirect, detachDirect, startDirectCall, direct, directBusy } = useCalls();
  const otherCallBusy = directBusy && direct?.conversationId !== conversationId;
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [archived, setArchived] = useState(false);
  const [confirmLocation, setConfirmLocation] = useState(false);
  const [locationStatus, setLocationStatus] = useState('');
  const [lightbox, setLightbox] = useState(null);
  // { message, mode: 'me' | 'all' } in attesa di conferma.
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const panelRef = useRef(null);
  const retryPayloadsRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setConversationId(null);
    setMessages([]);

    const load = async () => {
      const [{ conversationId: convId, error: convError }, profilesMap, connected] = await Promise.all([
        initialConversationId ? Promise.resolve({ conversationId: initialConversationId }) : startDirectConversation(friendId),
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
      const { messages: fetched, hasMore: more, error: msgError } = await fetchMessages(convId, { limit: PAGE });
      if (cancelled) return;
      if (msgError) {
        setError(msgError);
        setLoading(false);
        return;
      }
      setMessages(fetched);
      setHasMore(more);
      setLoading(false);
      markConversationRead(convId);
      onMessagesRead?.();
      getOtherParticipantReceipts(convId, user.id).then(({ lastReadAt, lastDeliveredAt }) => {
        if (cancelled) return;
        setOtherLastReadAt(lastReadAt);
        setOtherLastDeliveredAt(lastDeliveredAt);
      });
    };
    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId, initialConversationId]);

  useEffect(() => {
    if (!canCall || !conversationId) return undefined;
    attachDirect({ conversationId, friend, autoAnswer: autoAnswerCall });
    return () => detachDirect(conversationId);
  }, [canCall, conversationId, friend, autoAnswerCall, attachDirect, detachDirect]);

  // Ultimo `friend` per la callback del canale realtime, senza riaprirlo.
  const friendRef = useRef(friend);
  useEffect(() => {
    friendRef.current = friend;
  }, [friend]);

  const me = useMemo(() => ({ id: user.id, name: displayName(user, 'Tu'), avatar: user.avatar || '' }), [user]);

  // Nuovi messaggi in tempo reale (deduplicati per id: il mio arriva anche
  // come conferma dell'invio ottimistico). Alla riconnessione si rilegge
  // l'ultima pagina e si fonde con quello che c'è.
  useEffect(() => {
    if (!conversationId) return undefined;
    const channel = subscribeToConversationMessages(
      conversationId,
      (row) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === row.id)) return prev;
          const author = row.sender_id === user.id ? me : friendRef.current;
          return [...prev, mapMessageRow(row, author)];
        });
        markConversationRead(conversationId);
        onMessagesRead?.();
      },
      () => {
        fetchMessages(conversationId, { limit: PAGE }).then(({ messages: fetched, error: msgError }) => {
          if (msgError) return;
          setMessages((prev) => {
            const ids = new Set(prev.map((m) => m.id));
            const fresh = fetched.filter((m) => !ids.has(m.id));
            if (!fresh.length) return prev;
            return [...prev, ...fresh].sort((a, b) => new Date(a.data) - new Date(b.data));
          });
        });
      },
      // Eliminato per tutti (anche dall'altra persona): la bolla cambia subito.
      (row) => {
        setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, tipo: row.tipo, testo: row.testo, allegato: row.allegato ?? null } : m)));
      }
    );
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, user.id]);

  // All'altra persona arrivano i messaggi (✓✓ grigie) o apre la chat
  // (✓✓ blu): chat_participants in tempo reale.
  useEffect(() => {
    if (!conversationId) return undefined;
    const channel = subscribeToParticipantUpdates(conversationId, (row) => {
      if (row.user_id === user.id) return;
      setOtherLastReadAt(row.last_read_at ?? null);
      setOtherLastDeliveredAt(row.last_delivered_at ?? null);
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user.id]);

  // "online" in testata quando anche l'altra persona ha la chat aperta.
  useEffect(() => {
    if (!conversationId) return undefined;
    const channel = subscribeToConversationPresence(conversationId, user.id, (ids) => setFriendHere(ids.has(friendId)));
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user.id, friendId]);

  const loadOlder = async () => {
    const oldest = messages.find((m) => !m.pending && !m.failed);
    if (!oldest || !conversationId) return false;
    const { messages: page, hasMore: more, error: msgError } = await fetchMessages(conversationId, { before: oldest.data, limit: PAGE });
    if (msgError) return false;
    setMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      return [...page.filter((m) => !ids.has(m.id)), ...prev];
    });
    setHasMore(more);
    return more;
  };

  // Invio ottimistico, come nella Stanza MOD: la bolla compare subito
  // (grigia), poi prende l'id vero; se Realtime è arrivato prima, la copia
  // provvisoria sparisce. Errore -> "Non inviato · Riprova".
  const sendPayload = async (payload, tempId = newId()) => {
    if (!conversationId) return false;
    retryPayloadsRef.current.set(tempId, payload);
    setMessages((prev) => [
      ...prev.filter((m) => m.id !== tempId),
      {
        id: tempId,
        conversationId,
        senderId: user.id,
        author: me,
        testo: payload.testo,
        tipo: payload.tipo,
        allegato: payload.allegato ?? null,
        mondo: activeWorld.id,
        menzioni: [],
        data: new Date().toISOString(),
        pending: true,
      },
    ]);
    const res = await sendMessage(conversationId, payload.testo, {
      tipo: payload.tipo,
      allegato: payload.allegato ?? null,
      mondo: activeWorld.id,
      menzioni: payload.menzioni ?? [],
    });
    setMessages((prev) => {
      if (res.error) return prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m));
      retryPayloadsRef.current.delete(tempId);
      if (prev.some((m) => m.id === res.id)) return prev.filter((m) => m.id !== tempId);
      return prev.map((m) =>
        m.id === tempId ? { ...m, id: res.id, data: res.createdAt ?? m.data, menzioni: res.menzioni ?? [], pending: false } : m
      );
    });
    return !res.error;
  };

  const retry = (tempId) => {
    const payload = retryPayloadsRef.current.get(tempId);
    if (payload) sendPayload(payload, tempId);
  };

  // Un messaggio per allegato (chat_messages ne ha uno per riga), poi il
  // testo con le menzioni.
  const onSend = async ({ testo, menzioni, allegati }) => {
    for (const a of allegati) await sendPayload(toChatMessage(a));
    if (testo) await sendPayload({ tipo: 'testo', testo, menzioni });
  };

  // Stesso percorso di uploadChatAttachment (directChat.js), con la barra
  // di avanzamento.
  const upload = (file, onProgress) =>
    uploadWithProgress(`${conversationId}/${user.id}/${Date.now()}-${safeFileName(file.name)}`, file, onProgress);

  // La posizione si manda SOLO dopo una conferma esplicita e solo quella
  // attuale (nessun tracciamento continuo, niente salvato sul profilo).
  const sendLocation = () => {
    setConfirmLocation(false);
    if (!navigator.geolocation) {
      setLocationStatus('⚠️ Il tuo dispositivo non permette di leggere la posizione.');
      return;
    }
    setLocationStatus('Rilevo la posizione…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationStatus('');
        sendPayload({
          tipo: 'posizione',
          testo: '📍 Posizione',
          allegato: {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
            precisione: Math.round(pos.coords.accuracy || 0),
          },
        });
      },
      (err) => {
        setLocationStatus(err.code === 1 ? '⚠️ Permesso alla posizione negato dal browser.' : '⚠️ Posizione non disponibile, riprova.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  const toggleArchive = async () => {
    setMenuOpen(false);
    if (!conversationId) return;
    const next = !archived;
    setArchived(next);
    await setConversationArchived(conversationId, next);
  };

  // Profilo del contatto: lo stesso che si apre dagli altri punti dell'app
  // (SocialProfileModal, via App.jsx).
  const openFriendProfile = () => {
    if (friend?.id) openProfileFromMention(friend.id);
  };

  const runDelete = async () => {
    const pending = confirmDelete;
    setConfirmDelete(null);
    if (!pending) return;
    const { message, mode } = pending;
    setDeleteError('');
    if (mode === 'all') {
      const res = await deleteMessageForAll(message.id);
      if (res.error) {
        setDeleteError(res.error);
        return;
      }
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, tipo: 'eliminato', testo: '', allegato: null } : m)));
    } else {
      const res = await deleteMessageForMe(message.id);
      if (res.error) {
        setDeleteError(res.error);
        return;
      }
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
    }
  };

  const query = search.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = messages.map((m) => ({ ...m, mine: m.senderId === user.id }));
    if (!query) return list;
    return list.filter((m) => (m.testo || '').toLowerCase().includes(query) || (m.allegato?.nome || '').toLowerCase().includes(query));
  }, [messages, query, user.id]);

  const renderMessage = (m) => {
    const sentAt = new Date(m.data);
    const read = m.mine && otherLastReadAt && new Date(otherLastReadAt) >= sentAt;
    // Letto implica consegnato, anche se last_delivered_at non è ancora arrivato.
    const delivered = m.mine && (read || (otherLastDeliveredAt && new Date(otherLastDeliveredAt) >= sentAt));
    const tickState = read ? 'read' : delivered ? 'delivered' : 'sent';
    const tickLabel = read ? 'Letto' : delivered ? 'Consegnato' : 'Inviato';
    const from = m.mondo && m.mondo !== activeWorld.id ? WORLD_BY_ID.get(m.mondo) : null;
    const att = m.tipo === 'posizione' ? null : toAttachment(m.tipo, m.allegato);
    const isText = !m.tipo || m.tipo === 'testo';
    const deleted = m.tipo === 'eliminato';
    const menu = m.pending || m.failed
      ? null
      : [
          { label: '🙈 Elimina per me', onClick: () => setConfirmDelete({ message: m, mode: 'me' }) },
          ...(m.mine && !deleted ? [{ label: '🗑️ Elimina per tutti', danger: true, onClick: () => setConfirmDelete({ message: m, mode: 'all' }) }] : []),
        ];
    return (
      <ChatBubble
        key={m.id}
        mine={m.mine}
        author={m.author}
        showHeader={false}
        pending={m.pending}
        failed={m.failed}
        onRetry={() => retry(m.id)}
        menu={menu}
        onAvatarClick={m.mine ? null : openFriendProfile}
        footer={
          from ? (
            <span className="rb-dm-from">
              <span className="rb-dm-from-dot" style={{ background: from.color }} aria-hidden="true" />
              scritto in {from.label}
            </span>
          ) : null
        }
      >
        {deleted ? (
          <p className="rb-chat-deleted">Messaggio eliminato</p>
        ) : m.tipo === 'posizione' && m.allegato ? (
          <ChatAttachment tipo="posizione" allegato={m.allegato} />
        ) : att ? (
          <div className="rb-chat-atts">
            <AttachmentView allegato={att} onOpenImage={(src, nome) => setLightbox({ src, nome })} />
          </div>
        ) : (
          <MentionText as="p" className="rb-chat-text" testo={m.testo} menzioni={m.menzioni} />
        )}
        {!m.mine && isText && !deleted && <TranslateHint text={m.testo} sourceLang={m.lingua} />}
        <span className="rb-dm-meta">
          {timeLabel(m.data)}
          {m.mine && !m.pending && !m.failed && (
            <span className={`rb-dm-ticks ${tickState}`} aria-label={tickLabel} title={tickLabel}>
              {tickState === 'sent' ? '✓' : '✓✓'}
            </span>
          )}
        </span>
      </ChatBubble>
    );
  };

  const color = activeWorld.color ?? '#1d9bf0';
  const letter = (friend?.name || '?').trim().charAt(0).toUpperCase();
  const ready = !loading && !error && Boolean(conversationId);

  return (
    <ModalOverlay onClose={onClose} hasUnsavedChanges={dirty}>
      <div
        ref={panelRef}
        className="rb-dm-chat rb-chat-scope"
        style={{ '--a': color, '--a-ink': inkOn(color) }}
        data-world={activeWorld.id}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rb-dm-chat-head">
          <button
            type="button"
            className="rb-dm-chat-avatar"
            onClick={openFriendProfile}
            aria-label={friend ? `Vedi profilo di ${friend.name}` : 'Profilo'}
            title="Vedi profilo"
          >
            {friend?.avatar ? <img src={friend.avatar} alt="" /> : <span aria-hidden="true">{letter}</span>}
          </button>
          <div className="rb-dm-chat-who">
            <div className="rb-dm-chat-name">
              <strong>{friend?.name ?? '…'}</strong>
              <span className="rb-dm-world-label">{activeWorld.label}</span>
            </div>
            <span className={`rb-dm-chat-status ${friendHere ? 'on' : ''}`}>
              {friendHere ? '● online' : archived ? 'Conversazione archiviata' : 'Chat privata'}
            </span>
          </div>
          <div className="rb-dm-chat-actions">
            {canCall && conversationId && (
              <button
                type="button"
                className="rb-dm-chat-btn"
                onClick={startDirectCall}
                disabled={otherCallBusy}
                aria-label="Videochiamata"
                title={otherCallBusy ? 'Sei già in un’altra videochiamata' : 'Videochiamata'}
              >
                📹
              </button>
            )}
            <button
              type="button"
              className={`rb-dm-chat-btn ${searchOpen ? 'on' : ''}`}
              onClick={() => {
                setSearchOpen((v) => !v);
                setSearch('');
              }}
              aria-label={searchOpen ? 'Chiudi ricerca' : 'Cerca nella conversazione'}
              title="Cerca nella conversazione"
            >
              🔍
            </button>
            <div className="rb-dm-chat-menu-wrap">
              <button
                type="button"
                className="rb-dm-chat-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Altre azioni"
                aria-expanded={menuOpen}
                title="Altre azioni"
              >
                ⋯
              </button>
              {menuOpen && (
                <div className="rb-dm-chat-menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); openFriendProfile(); }} disabled={!friend}>
                    👤 Vedi profilo
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setSearchOpen(true); }}>
                    🔍 Cerca nella conversazione
                  </button>
                  <button type="button" role="menuitem" onClick={toggleArchive} disabled={!conversationId}>
                    🗂️ {archived ? 'Ripristina conversazione' : 'Archivia conversazione'}
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">
              <Icon name="close" size={16} />
            </button>
          </div>
        </header>

        {searchOpen && (
          <div className="rb-dm-chat-search">
            <input
              type="search"
              placeholder="Cerca nella conversazione…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setSearch('');
                  setSearchOpen(false);
                }
              }}
              autoFocus
            />
            {query && (
              <small>
                {shown.length} {shown.length === 1 ? 'messaggio trovato' : 'messaggi trovati'}
              </small>
            )}
          </div>
        )}

        {loading ? (
          <p className="rb-dm-chat-empty">Caricamento…</p>
        ) : error ? (
          <p className="rb-privacy-error rb-dm-chat-empty">⚠️ {error}</p>
        ) : (
          <MessageList
            items={shown}
            renderItem={renderMessage}
            onLoadOlder={query ? null : loadOlder}
            hasMore={hasMore}
            empty={<li className="rb-chat-older">{query ? 'Nessun messaggio trovato.' : 'Nessun messaggio ancora, scrivi il primo!'}</li>}
          />
        )}

        {locationStatus && (
          <p className="rb-dm-chat-status-line">
            {locationStatus}
            <button type="button" onClick={() => setLocationStatus('')} aria-label="Chiudi avviso">✕</button>
          </p>
        )}

        {deleteError && (
          <p className="rb-dm-chat-status-line">
            ⚠️ {deleteError}
            <button type="button" onClick={() => setDeleteError('')} aria-label="Chiudi avviso">✕</button>
          </p>
        )}

        {confirmDelete && (
          <div className="rb-dm-chat-confirm" role="alertdialog" aria-label="Conferma eliminazione">
            <p>
              {confirmDelete.mode === 'all'
                ? 'Eliminare questo messaggio per tutti? Anche l\'altra persona vedrà "Messaggio eliminato" e l\'eventuale allegato verrà cancellato.'
                : 'Eliminare questo messaggio solo per te? L\'altra persona continuerà a vederlo.'}
            </p>
            <div>
              <button type="button" onClick={() => setConfirmDelete(null)}>Annulla</button>
              <button type="button" className="primary danger" onClick={runDelete}>
                {confirmDelete.mode === 'all' ? 'Elimina per tutti' : 'Elimina per me'}
              </button>
            </div>
          </div>
        )}

        {confirmLocation && (
          <div className="rb-dm-chat-confirm">
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

        <ChatComposer
          contesto="chat"
          contestoId={conversationId}
          mentionTitle="Menziona qualcuno della chat"
          placeholder="Scrivi un messaggio…"
          disabled={!ready}
          dropTargetRef={panelRef}
          upload={upload}
          onSend={onSend}
          onDirtyChange={setDirty}
          extraMenuItems={[{ label: 'Posizione', icon: '📍', quick: true, onClick: () => setConfirmLocation(true) }]}
        />
      </div>

      {lightbox && <Lightbox src={lightbox.src} nome={lightbox.nome} onClose={() => setLightbox(null)} />}

    </ModalOverlay>
  );
}
