import { useEffect, useState } from 'react';
import { formatRelativeDate } from './social/resolveAuthor';
import { getMyNotifications, markNotificationsRead } from '../data/notifications';
import { getReceivedRequests } from '../data/friends';
import { getReceivedFamilyRequests, familyRelationLabel } from '../data/family';
import ModalOverlay from './ModalOverlay';
import './NotificationsPanel.css';

function notificationLabel(n) {
  if (n.tipo === 'friend_request') return `${n.actor.name} ti ha mandato una richiesta di amicizia`;
  if (n.tipo === 'family_request') return `${n.actor.name} vuole essere tuo/a ${familyRelationLabel(n.relazione)}`;
  if (n.tipo === 'new_post') return `${n.actor.name} ha pubblicato qualcosa di nuovo`;
  return n.tipo === 'super_like'
    ? `${n.actor.name} ti ha mandato un Super Like ⭐`
    : `È un match con ${n.actor.name}! 🎉`;
}

// Pannello notifiche (campanella in alto): match e super like reali
// (popolati da un trigger lato DB) più le richieste di amicizia in sospeso
// (data/friends.js, non hanno un proprio trigger di notifica, si aggiungono
// qui alla lista), tutte ordinate insieme per data. Aprendolo segna subito
// come lette le notifiche vere e azzera il badge sulla campanella — le
// richieste di amicizia restano "in sospeso" finché non vengono accettate/
// rifiutate, non "lette", quindi non c'entrano con mark_notifications_read.
export default function NotificationsPanel({ onClose, onRead, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMyNotifications(30), getReceivedRequests(), getReceivedFamilyRequests()]).then(
      ([{ notifications: list }, requests, familyRequests]) => {
        if (cancelled) return;
        const requestNotifs = requests.map((r) => ({
          id: `friend-request-${r.id}`,
          tipo: 'friend_request',
          actor: r.other,
          createdAt: r.data,
          letta: false,
        }));
        const familyNotifs = familyRequests.map((r) => ({
          id: `family-request-${r.id}`,
          tipo: 'family_request',
          actor: r.other,
          relazione: r.relazione,
          createdAt: r.createdAt,
          letta: false,
        }));
        const merged = [...(list ?? []), ...requestNotifs, ...familyNotifs].sort(
          (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
        );
        setNotifications(merged);
        setLoading(false);
      }
    );
    markNotificationsRead().then(() => onRead?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-notifications-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h3>Notifiche</h3>

        {loading ? (
          <p className="rb-notifications-empty">Caricamento...</p>
        ) : (
          <ul className="rb-notifications-list">
            {notifications.length === 0 && <p className="rb-notifications-empty">Nessuna notifica ancora.</p>}
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`rb-notifications-row ${n.letta ? '' : 'unread'}`}
                  onClick={() => onNavigate(n.tipo)}
                >
                  <img src={n.actor.avatar} alt="" />
                  <span className="rb-notifications-row-text">
                    <strong>{notificationLabel(n)}</strong>
                    <span className="rb-notifications-row-date">{formatRelativeDate(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalOverlay>
  );
}
