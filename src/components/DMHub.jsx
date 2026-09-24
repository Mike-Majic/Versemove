import { useEffect, useRef, useState } from 'react';
import ModalOverlay from './ModalOverlay';
import ContactsPanel from './ContactsPanel';
import ContactProfileModal from './chat/ContactProfileModal';
import { formatRelativeDate } from './social/resolveAuthor';
import { listMyConversations, setConversationArchived } from '../data/directChat';
import { WORLDS } from '../data/worlds';
import { inkOn } from './shared/chat/chatMedia';
import './FriendsModal.css';
import './DMHub.css';

// Colore del mondo da cui è arrivato l'ultimo messaggio di una
// conversazione, per il bordo della card (richiesta di Mike): un solo
// contatto, una sola chat unificata fra tutti i mondi (vedi
// start_direct_conversation, che riusa sempre la stessa conversazione),
// ma il bordo cambia colore in base a dove si è scritto per ultimo.
const WORLD_BY_ID = new Map(WORLDS.map((w) => [w.id, w]));
const WORLD_COLOR_BY_ID = new Map(WORLDS.map((w) => [w.id, w.color]));

// Bordo, titolo e scheda attiva passano per i colori di tutti i mondi,
// presi da WORLD_COLOR_BY_ID (un mondo nuovo entra da solo nel giro).
const HUB_COLORS = [...WORLD_COLOR_BY_ID.values()];
const HUB_STYLE = {
  '--hub-conic': `conic-gradient(${[...HUB_COLORS, HUB_COLORS[0]].join(', ')})`,
  '--hub-linear': `linear-gradient(90deg, ${HUB_COLORS.join(', ')})`,
};

function ConversationRow({ conv, onOpen, onArchiveToggle, onOpenProfile }) {
  const w = WORLD_BY_ID.get(conv.lastMessageMondo) ?? null;
  const color = w?.color ?? null;
  return (
    <li className="rb-dm-row">
      <button
        type="button"
        className="rb-dm-row-main"
        style={color ? { borderColor: color, '--row': color } : undefined}
        onClick={() => onOpen(conv.other.id)}
      >
        <span
          className="rb-dm-row-avatar-btn"
          role="button"
          tabIndex={0}
          aria-label={`Vedi profilo di ${conv.other.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenProfile(conv.other);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onOpenProfile(conv.other);
            }
          }}
        >
          <img src={conv.other.avatar} alt="" />
        </span>
        <div className="rb-dm-row-text">
          <span className="rb-dm-row-name">
            <strong>{conv.other.name}</strong>
            {w && <span className="rb-dm-row-world" style={{ color, borderColor: color }}>{w.label}</span>}
          </span>
          <p>{conv.lastMessage ?? 'Nessun messaggio ancora'}</p>
        </div>
        <div className="rb-dm-row-meta">
          {conv.lastMessageAt && <span className="rb-dm-row-time">{formatRelativeDate(conv.lastMessageAt)}</span>}
          {conv.unread > 0 && (
            <span
              className="rb-friends-tab-badge rb-dm-row-unread"
              style={color ? { background: color, color: inkOn(color) } : undefined}
              aria-label={`${conv.unread} non letti`}
            >
              {conv.unread}
            </span>
          )}
        </div>
      </button>
      <button type="button" className="rb-dm-row-archive" onClick={() => onArchiveToggle(conv)}>
        {conv.archived ? 'Ripristina' : 'Archivia'}
      </button>
    </li>
  );
}

// Rotazione lentissima del bordo solo mentre l'hub si vede davvero:
// in pausa con la scheda del browser nascosta o l'hub fuori schermo.
function useHubVisible(ref) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    let inView = true;
    const update = () => setVisible(inView && document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    let io = null;
    if (el && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        update();
      });
      io.observe(el);
    }
    return () => {
      document.removeEventListener('visibilitychange', update);
      io?.disconnect();
    };
  }, [ref]);
  return visible;
}

// Hub messaggi stile WhatsApp (bottone 💬 nella TopBar, al posto del vecchio
// "Amici"): lista conversazioni con anteprima dell'ultimo messaggio invece
// della semplice lista amici, più Archiviati e Contatti (ricerca/richieste/
// amici, contenuto della vecchia FriendsModal, vedi ContactsPanel.jsx).
export default function DMHub({ onClose, onOpenChat, onFriendsChanged, initialTab = 'messaggi' }) {
  const [tab, setTab] = useState(initialTab); // 'messaggi' | 'archiviati' | 'contatti'
  const [conversations, setConversations] = useState(null);
  const [profilePreview, setProfilePreview] = useState(null);
  const frameRef = useRef(null);
  const hubVisible = useHubVisible(frameRef);

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
      <div
        ref={frameRef}
        className={`rb-dm-hub-frame ${hubVisible ? '' : 'paused'}`}
        style={HUB_STYLE}
        onClick={(e) => e.stopPropagation()}
      >
      <div className="rb-friends-card rb-dm-hub">
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h3 className="rb-dm-hub-title">
          <span aria-hidden="true">💬</span> <span className="rb-dm-hub-title-text">Messaggi</span>
        </h3>

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
              <ConversationRow
                key={c.conversationId}
                conv={c}
                onOpen={onOpenChat}
                onArchiveToggle={toggleArchive}
                onOpenProfile={setProfilePreview}
              />
            ))}
          </ul>
        )}

        {tab !== 'contatti' && (
          <p className="rb-dm-hub-legend">Il bordo di ogni conversazione ha il colore del mondo in cui vi siete scritti l'ultima volta.</p>
        )}
      </div>
      </div>

      {profilePreview && <ContactProfileModal contact={profilePreview} onClose={() => setProfilePreview(null)} />}
    </ModalOverlay>
  );
}
