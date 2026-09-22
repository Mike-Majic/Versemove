import ModalOverlay from '../ModalOverlay';
import './contactProfile.css';

// Anteprima minimale del profilo di un contatto della chat: oggi il backend
// espone solo nickname e avatar per un utente reale (vista public_profiles,
// vedi data/posts.js), niente età/città/bio come nei profili mock del
// globo — quando quella parte verrà estesa, questo pannello si arricchisce
// di conseguenza senza cambiare i punti da cui viene aperto.
export default function ContactProfileModal({ contact, onClose }) {
  if (!contact) return null;
  return (
    <ModalOverlay>
      <div className="rb-contact-profile-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        {contact.avatar ? (
          <img src={contact.avatar} alt="" className="rb-contact-profile-avatar" />
        ) : (
          <span className="rb-contact-profile-avatar rb-contact-profile-avatar-empty" aria-hidden="true">
            {(contact.name || '?').trim().charAt(0).toUpperCase()}
          </span>
        )}
        <strong className="rb-contact-profile-name">{contact.name}</strong>
      </div>
    </ModalOverlay>
  );
}
