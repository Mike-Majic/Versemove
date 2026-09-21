import { useEffect, useState } from 'react';
import ModalOverlay from './ModalOverlay';
import ContactsPanel from './ContactsPanel';
import { formatRelativeDate } from './social/resolveAuthor';
import { listMyConversations, setConversationArchived } from '../data/directChat';
import './FriendsModal.css';
import './DMHub.css';

function ConversationRow({ conv, onOpen, onArchiveToggle }) {
  return (
    <li className="rb-dm-row">
      <button type="button" className="rb-dm-row-main" onClick={() => onOpen(conv.other.id)}>
        <img src={conv.other.avatar} alt="" />
        <div className="rb-dm-row-text">
          <strong>{conv.other.name}</strong>
          <p>{conv.lastMessage ?? 'Nessun messaggio ancora'}</p>
        </div>
        <div className="rb-dm-row-meta">
          {conv.lastMessageAt && <span className="rb-dm-row-time">{formatRelativeDate(conv.lastMessageAt)}</span>}
          {conv.unread > 0 && <span className="rb-friends-tab-badge">{conv.unread}</span>}
        </div>
      </button>
      <button type="button" className="rb-dm-row-archive" onClick={() => onArchiveToggle(conv)}>
        {conv.archived ? 'Ripristina' : 'Archivia'}
      </button>
    </li>
  );
}

// Hub messaggi stile WhatsApp (bottone 💬 nella TopBar, al posto del vecchio
// "Amici"): lista conversazioni con anteprima dell'ultimo messaggio invece
// della semplice lista amici, più Archiviati e Contatti (ricerca/richieste/
// amici, contenuto della vecchia FriendsModal, vedi ContactsPanel.jsx).
export default function DMHub({ onClose, onOpenChat, onFriendsChanged, initialTab = 'messaggi' }) {
  const [tab, setTab] = useState(initialTab); // 'messaggi' | 'archiviati' | 'contatti'
  const [conversations, setConversations] = useState(null);

  const refresh = () => {
    listMyConversations().then(setConversations);
  };
  useEffect(refresh, []);

  const toggleArchive = async (conv) => {
    const nextArchived = !conv.archived;
    setConversations((prev) => prev.map((c) => (c.conversationId === conv.conversationId ? { ...c, archived: nextArchived } : c)));
    await setConversationArchived(conv.conversationId, nextArchived);
  };

  const visible = (conversations ?? []).filter((c) => (tab === 'archiviati' ? c.archived : !c.archived));

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-friends-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h3>Messaggi</h3>

        <div className="rb-friends-tabs">
          <button type="button" className={`rb-friends-tab-btn ${tab === 'messaggi' ? 'active' : ''}`} onClick={() => setTab('messaggi')}>
            Messaggi
          </button>
          <button type="button" className={`rb-friends-tab-btn ${tab === 'archiviati' ? 'active' : ''}`} onClick={() => setTab('archiviati')}>
            Archiviati
          </button>
          <button type="button" className={`rb-friends-tab-btn ${tab === 'contatti' ? 'active' : ''}`} onClick={() => setTab('contatti')}>
            Contatti
          </button>
        </div>

        {tab === 'contatti' ? (
          <ContactsPanel onOpenChat={onOpenChat} onFriendsChanged={onFriendsChanged} />
        ) : conversations === null ? (
          <p className="rb-friends-empty">Caricamento...</p>
        ) : visible.length === 0 ? (
          <p className="rb-friends-empty">
            {tab === 'archiviati' ? 'Nessuna conversazione archiviata.' : 'Nessun messaggio ancora — scrivi a un amico dalla scheda Contatti.'}
          </p>
        ) : (
          <ul className="rb-dm-list">
            {visible.map((c) => (
              <ConversationRow key={c.conversationId} conv={c} onOpen={onOpenChat} onArchiveToggle={toggleArchive} />
            ))}
          </ul>
        )}
      </div>
    </ModalOverlay>
  );
}
