import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listBanChats, getBanChat, replyBanChat, subscribeToBanChat, mapBanChatRow } from '../../data/banChat';
import { unbanAccount } from '../../data/accounts';
import { logAdminAction } from '../../data/adminAuditLog';
import { mailLabel } from '../../data/adminUsers';
import { supabase } from '../../data/supabaseClient';
import { formatRelativeDate } from '../social/resolveAuthor';
import Skeleton from '../Skeleton';
import MessageList from '../shared/chat/MessageList';
import ChatBubble from '../shared/chat/ChatBubble';
import { newId, timeLabel } from '../shared/chat/chatMedia';
import { DeleteUserDialog } from '../admin/AdminUsersPane';
import '../shared/chat/chat.css';
import './infoBan.css';

const NARROW_QUERY = '(max-width: 760px)';

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

function banLine(chat) {
  if (!chat.bannato) return 'Non più bloccato';
  return chat.banFinoAl ? `Bloccato fino al ${new Date(chat.banFinoAl).toLocaleDateString('it-IT')}` : 'Bloccato senza scadenza';
}

function Avatar({ chat, size = 36 }) {
  const letter = (chat.nickname || 'U').charAt(0).toUpperCase();
  return (
    <span className="rb-infoban-avatar" style={{ width: size, height: size }} aria-hidden="true">
      {chat.avatar ? <img src={chat.avatar} alt="" /> : letter}
    </span>
  );
}

// Vista staff delle chat INFO BAN, la stessa nel Backend (scheda "Info
// ban") e dentro la categoria del mondo FAQ: a sinistra l'elenco
// (list_ban_chats, chi aspetta una risposta in cima con un segno
// evidente), a destra la conversazione (get_ban_chat con p_user_id) e la
// risposta (reply_ban_chat). Toccando il profilo dell'utente: "Sblocca"
// (unbanAccount) ed "Elimina definitivamente" (staff-actions). Su telefono
// elenco e conversazione sono due schermate.
// onWaitingChange(n): quanti aspettano una risposta (badge della scheda).
export default function InfoBanStaffView({ onWaitingChange, compact = false }) {
  const narrow = useNarrow();
  const [chats, setChats] = useState(null);
  const [listError, setListError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState(null);
  const [convError, setConvError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null); // { tone, text }
  const [profileMenu, setProfileMenu] = useState(false);
  const [deleting, setDeleting] = useState(null);
  // Esito di un'eliminazione (la chat sparisce dall'elenco).
  const [listNotice, setListNotice] = useState('');
  // Chat aperta adesso, per le risposte asincrone e il canale realtime.
  const selectedRef = useRef(null);
  const selectChat = (userId) => {
    selectedRef.current = userId;
    setSelectedId(userId);
  };

  const refreshList = useCallback(async () => {
    const res = await listBanChats();
    setListError(res.error ?? '');
    setChats(res.chats);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listBanChats().then((res) => {
      if (cancelled) return;
      setListError(res.error ?? '');
      setChats(res.chats);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (chats) onWaitingChange?.(chats.filter((c) => c.inAttesa).length);
  }, [chats, onWaitingChange]);

  const selected = useMemo(() => chats?.find((c) => c.userId === selectedId) ?? null, [chats, selectedId]);

  const openChat = useCallback(async (userId) => {
    selectChat(userId);
    setMessages(null);
    setConvError('');
    setProfileMenu(false);
    setNotice(null);
    const res = await getBanChat(userId);
    if (selectedRef.current !== userId) return;
    setConvError(res.error ?? '');
    setMessages(res.messages);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tempo reale: ogni nuovo messaggio (di qualunque utente) aggiorna
  // l'elenco; se è della chat aperta, compare anche nella conversazione.
  useEffect(() => {
    const channel = subscribeToBanChat({
      onInsert: (row) => {
        refreshList();
        if (row.user_id !== selectedRef.current) return;
        setMessages((prev) => {
          const list = prev ?? [];
          if (list.some((m) => m.id === row.id)) return list;
          const nick = chats?.find((c) => c.userId === row.user_id)?.nickname ?? 'Utente';
          return [...list, mapBanChatRow(row, nick)];
        });
      },
      onReconnect: () => {
        refreshList();
        if (selectedRef.current) openChat(selectedRef.current);
      },
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshList, openChat]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendReply = async () => {
    const testo = reply.trim();
    if (!testo || !selectedId || sending) return;
    setSending(true);
    setNotice(null);
    const tempId = newId();
    setMessages((prev) => [...(prev ?? []), { id: tempId, daStaff: true, autore: 'Staff', testo, data: new Date().toISOString(), pending: true }]);
    const res = await replyBanChat(selectedId, testo);
    setSending(false);
    if (res.error) {
      setMessages((prev) => (prev ?? []).filter((m) => m.id !== tempId));
      setNotice({ tone: 'error', text: res.error });
      return;
    }
    setReply('');
    setMessages((prev) => {
      const list = prev ?? [];
      if (list.some((m) => m.id === res.id)) return list.filter((m) => m.id !== tempId);
      return list.map((m) => (m.id === tempId ? { ...m, id: res.id, pending: false } : m));
    });
    refreshList();
  };

  const unblock = async () => {
    if (!selected) return;
    setProfileMenu(false);
    const { error } = await unbanAccount(selected.userId);
    if (error) {
      setNotice({ tone: 'error', text: error });
      return;
    }
    await logAdminAction('unban_account', selected.userId, { da: 'info_ban' });
    setNotice({ tone: 'ok', text: `${selected.nickname} sbloccato.` });
    refreshList();
  };

  const showList = !narrow || !selectedId;
  const showConv = !narrow || Boolean(selectedId);

  return (
    <div className={`rb-infoban-staff ${compact ? 'compact' : ''} ${narrow ? 'narrow' : ''}`}>
      {showList && (
        <aside className="rb-infoban-list" aria-label="Chat INFO BAN">
          <div className="rb-infoban-list-head">
            <span>Utenti bloccati</span>
            <button type="button" onClick={refreshList} aria-label="Aggiorna" title="Aggiorna">
              ↻
            </button>
          </div>
          {listNotice && (
            <p className="rb-infoban-notice ok" role="status">
              ✓ {listNotice}
              <button type="button" onClick={() => setListNotice('')} aria-label="Chiudi avviso">
                ✕
              </button>
            </p>
          )}
          {chats === null ? (
            <Skeleton lines={3} />
          ) : chats.length === 0 ? (
            <p className="rb-infoban-empty">{listError || 'Nessuna chat: nessun utente bloccato ha scritto allo staff.'}</p>
          ) : (
            <ul>
              {chats.map((c) => (
                <li key={c.userId}>
                  <button
                    type="button"
                    className={`rb-infoban-item ${c.inAttesa ? 'waiting' : ''} ${selectedId === c.userId ? 'on' : ''}`}
                    onClick={() => openChat(c.userId)}
                  >
                    <Avatar chat={c} />
                    <span className="rb-infoban-item-body">
                      <span className="rb-infoban-item-top">
                        <strong>{c.nickname}</strong>
                        {c.inAttesa && <span className="rb-infoban-waiting">● In attesa</span>}
                      </span>
                      <span className="rb-infoban-item-text">{c.ultimoTesto}</span>
                      <span className="rb-infoban-item-meta">
                        {banLine(c)} · {c.messaggi} {c.messaggi === 1 ? 'messaggio' : 'messaggi'} · {formatRelativeDate(c.ultimoAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}

      {showConv && (
        <section className="rb-infoban-conv" aria-label="Conversazione">
          {!selected ? (
            <p className="rb-infoban-empty center">Scegli una chat a sinistra per leggerla e rispondere.</p>
          ) : (
            <>
              <header className="rb-infoban-conv-head">
                {narrow && (
                  <button type="button" className="rb-infoban-back" onClick={() => selectChat(null)} aria-label="Torna all'elenco">
                    ‹
                  </button>
                )}
                <div className="rb-infoban-profile-wrap">
                  <button
                    type="button"
                    className="rb-infoban-profile"
                    onClick={() => setProfileMenu((v) => !v)}
                    aria-expanded={profileMenu}
                    title="Azioni sull'utente"
                  >
                    <Avatar chat={selected} size={38} />
                    <span>
                      <strong>{selected.nickname}</strong>
                      <small>
                        {banLine(selected)}
                        {selected.banMotivo ? ` · ${selected.banMotivo}` : ''}
                      </small>
                    </span>
                    <span className="rb-infoban-caret" aria-hidden="true">
                      ▾
                    </span>
                  </button>
                  {profileMenu && (
                    <div className="rb-infoban-profile-menu" role="menu">
                      <button type="button" role="menuitem" onClick={unblock} disabled={!selected.bannato}>
                        🔓 Sblocca
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="danger"
                        onClick={() => {
                          setProfileMenu(false);
                          setDeleting(selected);
                        }}
                      >
                        🗑️ Elimina definitivamente
                      </button>
                    </div>
                  )}
                </div>
              </header>

              {notice && (
                <p className={`rb-infoban-notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>
                  {notice.tone === 'error' ? '⚠️ ' : '✓ '}
                  {notice.text}
                </p>
              )}

              {messages === null ? (
                <div className="rb-infoban-loading">
                  <Skeleton lines={4} />
                </div>
              ) : (
                <MessageList
                  items={messages.map((m) => ({ ...m, mine: m.daStaff }))}
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
                  empty={<li className="rb-chat-older">{convError || 'Nessun messaggio.'}</li>}
                />
              )}

              <div className="rb-infoban-composer">
                <div className="rb-infoban-input-row">
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder={`Rispondi a ${selected.nickname}…`}
                    disabled={sending}
                    aria-label="Risposta dello staff"
                  />
                  <button type="button" className="rb-infoban-send" onClick={sendReply} disabled={sending || !reply.trim()}>
                    {sending ? 'Invio…' : 'Rispondi'}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {deleting && (
        <DeleteUserDialog
          account={{ id: deleting.userId, nickname: deleting.nickname }}
          onClose={() => setDeleting(null)}
          onDeleted={(account, email) => {
            setDeleting(null);
            selectChat(null);
            setNotice(null);
            refreshList();
            setListNotice(`${account.nickname} eliminato · ${mailLabel(email)}`);
          }}
        />
      )}
    </div>
  );
}
