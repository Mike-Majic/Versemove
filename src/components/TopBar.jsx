import { isStaff } from '../data/roles';
import './TopBar.css';

export default function TopBar({
  world,
  user,
  onOpenAuth,
  onLogout,
  onOpenSettings,
  onOpenAdmin,
  onOpenProfile,
  onOpenFriends,
  onOpenNotifications,
  unreadMessagesCount = 0,
  unreadNotifCount = 0,
}) {
  return (
    <header className="rb-topbar" style={{ '--accent': world.color }}>
      <div className="rb-topbar-brand">
        <span className="rb-logo-wordmark">
          <img className="rb-logo-icon" src={`${import.meta.env.BASE_URL}icons/logo-160.png`} alt="" />
          <span className="rb-logo-text notranslate" translate="no">Versemove</span>
        </span>
        <span className="rb-world-pill">{world.label}</span>
      </div>

      <div className="rb-topbar-actions">
        {user ? (
          <div className="rb-user-chip">
            <button className="rb-icon-btn rb-friends-btn" onClick={onOpenNotifications} aria-label="Notifiche" title="Notifiche">
              🔔
              {unreadNotifCount > 0 && (
                <span className="rb-friends-badge">{unreadNotifCount}</span>
              )}
            </button>
            <button className="rb-icon-btn rb-friends-btn" onClick={onOpenFriends} aria-label="Messaggi" title="Messaggi">
              💬
              {unreadMessagesCount > 0 && (
                <span className="rb-friends-badge">{unreadMessagesCount}</span>
              )}
            </button>
            {isStaff(user.ruolo) && (
              <button className="rb-icon-btn" onClick={onOpenAdmin} aria-label="Backend" title="Backend">
                🛠️
              </button>
            )}
            <button type="button" className="rb-user-chip-identity" onClick={onOpenProfile} title="Il mio profilo">
              <img src={user.avatar} alt={user.name} />
              <span>{user.name}</span>
              {user.verificato && <span className="rb-verified-badge" title="Verificato">✓</span>}
            </button>
            <button className="rb-icon-btn" onClick={onOpenSettings} aria-label="Impostazioni" title="Impostazioni">
              <GearIcon />
            </button>
            <button className="rb-btn-ghost" onClick={onLogout}>Esci</button>
          </div>
        ) : (
          <button className="rb-btn-primary" onClick={onOpenAuth}>Accedi</button>
        )}
      </div>
    </header>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4.7H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.3 9c.1.31.27.6.51.85.24.24.53.42.85.51H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
