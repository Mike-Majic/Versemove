import { useEffect, useRef, useState } from 'react';

const LONG_PRESS_MS = 480;

// Bolla di un messaggio: avatar, nome, etichetta (OWNER/MOD o mondo), ora,
// contenuto e sotto la bolla il piè di pagina (spunte, "scritto in…").
// pending: grigia finché il server non conferma; failed: "Non inviato ·
// Riprova".
// onAvatarClick: avatar cliccabile (es. apre il profilo).
// menu: [{ label, onClick, danger }] — azioni sul messaggio: pulsante "⋯"
// al passaggio del mouse, pressione lunga (o tasto destro) sul telefono.
// authorMenu: [{ label, onClick }] — avatar E nome diventano un pulsante
// che apre un menu sull'autore (es. "Vedi profilo", "Scrivi in privato",
// solo per lo staff nella chat FAQ). Senza, avatar e nome non sono
// cliccabili (salvo onAvatarClick).
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
  onAvatarClick = null,
  menu = null,
  authorMenu = null,
  children,
}) {
  const name = mine ? 'Tu' : author?.name ?? 'Utente';
  const letter = (author?.name ?? 'U').charAt(0).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authorMenuOpen, setAuthorMenuOpen] = useState(false);
  const pressTimer = useRef(null);
  const rowRef = useRef(null);
  const hasMenu = Array.isArray(menu) && menu.length > 0 && !pending;
  const hasAuthorMenu = !mine && Array.isArray(authorMenu) && authorMenu.length > 0;

  // Chiude i menu toccando fuori.
  useEffect(() => {
    if (!menuOpen && !authorMenuOpen) return undefined;
    const close = (e) => {
      if (!rowRef.current?.contains(e.target)) {
        setMenuOpen(false);
        setAuthorMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen, authorMenuOpen]);

  useEffect(() => () => clearTimeout(pressTimer.current), []);

  const pressHandlers = hasMenu
    ? {
        onTouchStart: () => {
          clearTimeout(pressTimer.current);
          pressTimer.current = setTimeout(() => {
            setMenuOpen(true);
            if (navigator.vibrate) navigator.vibrate(15);
          }, LONG_PRESS_MS);
        },
        onTouchMove: () => clearTimeout(pressTimer.current),
        onTouchEnd: () => clearTimeout(pressTimer.current),
        onContextMenu: (e) => {
          e.preventDefault();
          setMenuOpen(true);
        },
      }
    : {};

  const avatar = author?.avatar ? <img src={author.avatar} alt="" /> : letter;

  const toggleAuthorMenu = () => {
    setMenuOpen(false);
    setAuthorMenuOpen((v) => !v);
  };

  return (
    <li ref={rowRef} className={`rb-chat-row ${mine ? 'mine' : ''} ${pending ? 'pending' : ''} ${failed ? 'failed' : ''} ${hasMenu ? 'has-menu' : ''}`}>
      {hasAuthorMenu ? (
        <button
          type="button"
          className="rb-chat-avatar rb-chat-avatar-btn"
          onClick={toggleAuthorMenu}
          aria-label={`Azioni su ${author?.name ?? 'utente'}`}
          aria-expanded={authorMenuOpen}
          title={author?.name ?? 'Utente'}
        >
          {avatar}
        </button>
      ) : onAvatarClick ? (
        <button
          type="button"
          className="rb-chat-avatar rb-chat-avatar-btn"
          onClick={onAvatarClick}
          aria-label={`Vedi profilo di ${author?.name ?? 'utente'}`}
          title="Vedi profilo"
        >
          {avatar}
        </button>
      ) : (
        <span className="rb-chat-avatar" aria-hidden="true">
          {avatar}
        </span>
      )}
      <div className="rb-chat-col">
        <div className="rb-chat-bubble-wrap">
          <div className="rb-chat-bubble" {...pressHandlers}>
            {showHeader && (
              <div className="rb-chat-head">
                {hasAuthorMenu ? (
                  <button
                    type="button"
                    className="rb-chat-name-btn"
                    onClick={toggleAuthorMenu}
                    aria-expanded={authorMenuOpen}
                    aria-label={`Azioni su ${name}`}
                  >
                    <strong>{name}</strong>
                  </button>
                ) : (
                  <strong>{name}</strong>
                )}
                {badge && <span className={`rb-chat-badge ${badge.toLowerCase()}`}>{badge}</span>}
                {time && <span className="rb-chat-time">{time}</span>}
              </div>
            )}
            {children}
          </div>
          {hasMenu && (
            <button
              type="button"
              className="rb-chat-msg-menu-btn"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Azioni sul messaggio"
              aria-expanded={menuOpen}
              title="Azioni sul messaggio"
            >
              ⋯
            </button>
          )}
          {hasAuthorMenu && authorMenuOpen && (
            <div className="rb-chat-msg-menu rb-chat-author-menu" role="menu">
              {authorMenu.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAuthorMenuOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
          {hasMenu && menuOpen && (
            <div className="rb-chat-msg-menu" role="menu">
              {menu.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  className={item.danger ? 'danger' : ''}
                  onClick={() => {
                    setMenuOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
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
