import { useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import '../EventLikersModal.css';

// Generalizzazione di EventLikersModal per le reazioni culturali (Cinema,
// Teatro, Arte, Live): stessa lista con "Messaggio"/"+ Amico" per ognuno,
// solo con reazioni/titolo passati come prop invece di un evento del mondo
// Social — così un utente che vede "5 persone vogliono andarci" può
// contattarle per organizzarsi.
export default function ReactorsModal({ title, subtitle, reactors, user, onOpenAuth, friends, friendRequestsSent, onSendRequest, onOpenChat, onClose }) {
  const [error, setError] = useState('');

  if (!reactors) return null;

  const handleAction = async (id, action) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setError('');
    const result = await action(id);
    if (result?.error) setError(result.error);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-event-likers-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h3>{title}</h3>
        <p className="rb-event-likers-subtitle">{subtitle}</p>
        {error && <p className="rb-privacy-error">⚠️ {error}</p>}

        <ul className="rb-event-likers-list">
          {reactors.map((l) => {
            const isMe = l.id === user?.id;
            const isFriend = !isMe && friends.includes(l.id);
            const requested = !isMe && friendRequestsSent.includes(l.id);
            return (
              <li key={l.id} className="rb-event-likers-item">
                <img src={l.avatar} alt="" />
                <strong>{isMe ? 'Tu' : l.name}</strong>
                {!isMe && (
                  isFriend ? (
                    <button type="button" onClick={() => handleAction(l.id, onOpenChat)}>Messaggio</button>
                  ) : requested ? (
                    <button type="button" disabled>Richiesta inviata</button>
                  ) : (
                    <button type="button" onClick={() => handleAction(l.id, onSendRequest)}>+ Amico</button>
                  )
                )}
              </li>
            );
          })}
          {reactors.length === 0 && <p className="rb-event-likers-empty">Nessuno ancora.</p>}
        </ul>
      </div>
    </ModalOverlay>
  );
}
