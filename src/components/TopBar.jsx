import { useTranslation } from 'react-i18next';
import Icon from './shared/Icon';
import { isStaff } from '../data/roles';
import { translateWorld } from '../i18n/worldLabels';
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
  const { t } = useTranslation();
  return (
    <header className="rb-topbar" style={{ '--accent': world.color }}>
      <div className="rb-topbar-brand">
        <span className="rb-logo-wordmark">
          <img className="rb-logo-icon" src={`${import.meta.env.BASE_URL}icons/logo-160.png`} alt="" />
          <span className="rb-logo-text notranslate" translate="no">Versemove</span>
        </span>
        <span className="rb-world-pill">{translateWorld(t, world).label}</span>
      </div>

      <div className="rb-topbar-actions">
        {user ? (
          <div className="rb-user-chip">
            <button className="rb-iconbtn lg rb-friends-btn" onClick={onOpenNotifications} aria-label={t('topbar.notifications')} title={t('topbar.notifications')}>
              <Icon name="bell" size={20} />
              {unreadNotifCount > 0 && (
                <span className="rb-friends-badge">{unreadNotifCount}</span>
              )}
            </button>
            <button className="rb-iconbtn lg rb-friends-btn" onClick={onOpenFriends} aria-label={t('topbar.messages')} title={t('topbar.messages')}>
              <Icon name="chat" size={20} />
              {unreadMessagesCount > 0 && (
                <span className="rb-friends-badge">{unreadMessagesCount}</span>
              )}
            </button>
            {isStaff(user.ruolo) && (
              <button className="rb-iconbtn lg" onClick={onOpenAdmin} aria-label={t('topbar.backend')} title={t('topbar.backend')}>
                <Icon name="tools" size={20} />
              </button>
            )}
            <button type="button" className="rb-user-chip-identity" onClick={onOpenProfile} title={t('topbar.myProfile')}>
              <img src={user.avatar} alt={user.name} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
              <span>{user.name}</span>
              {user.verificato && <span className="rb-verified-badge" title={t('topbar.verified')}>✓</span>}
            </button>
            <button className="rb-iconbtn lg" onClick={onOpenSettings} aria-label={t('topbar.settings')} title={t('topbar.settings')}>
              <Icon name="gear" size={20} />
            </button>
            <button className="rb-btn-ghost" onClick={onLogout}>{t('topbar.logout')}</button>
          </div>
        ) : (
          <button className="rb-btn-primary" onClick={onOpenAuth}>{t('topbar.login')}</button>
        )}
      </div>
    </header>
  );
}
