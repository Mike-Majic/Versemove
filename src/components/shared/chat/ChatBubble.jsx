// Bolla di un messaggio: avatar, nome, etichetta (OWNER/MOD o mondo), ora,
// contenuto e sotto la bolla il piè di pagina (spunte, "scritto in…").
// pending: grigia finché il server non conferma; failed: "Non inviato ·
// Riprova".
export default function ChatBubble({
  mine = false,
  author,
  badge = null,
  time,
  pending = false,
  failed = false,
  onRetry,
  showHeader = true,
  footer = null,
  children,
}) {
  const name = mine ? 'Tu' : author?.name ?? 'Utente';
  const letter = (author?.name ?? 'U').charAt(0).toUpperCase();
  return (
    <li className={`rb-chat-row ${mine ? 'mine' : ''} ${pending ? 'pending' : ''} ${failed ? 'failed' : ''}`}>
      <span className="rb-chat-avatar" aria-hidden="true">
        {author?.avatar ? <img src={author.avatar} alt="" /> : letter}
      </span>
      <div className="rb-chat-col">
        <div className="rb-chat-bubble">
          {showHeader && (
            <div className="rb-chat-head">
              <strong>{name}</strong>
              {badge && <span className={`rb-chat-badge ${badge.toLowerCase()}`}>{badge}</span>}
              {time && <span className="rb-chat-time">{time}</span>}
            </div>
          )}
          {children}
        </div>
        {failed ? (
          <button type="button" className="rb-chat-retry" onClick={onRetry}>
            Non inviato · Riprova
          </button>
        ) : pending ? (
          <span className="rb-chat-foot">Invio…</span>
        ) : (
          footer && <span className="rb-chat-foot">{footer}</span>
        )}
      </div>
    </li>
  );
}
