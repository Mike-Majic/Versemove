import { useEffect, useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import GamertagChips from '../shared/GamertagChips';
import { fetchGamertagsMap } from '../../data/gaming';
import './contactProfile.css';

// Anteprima minimale del profilo di un contatto della chat: oggi il backend
// espone solo nickname e avatar per un utente reale (vista public_profiles,
// vedi data/posts.js), niente età/città/bio come nei profili mock del
// globo — quando quella parte verrà estesa, questo pannello si arricchisce
// di conseguenza senza cambiare i punti da cui viene aperto.
export default function ContactProfileModal({ contact, onClose }) {
  // Gamertag del contatto (chip con Copia), se il server li espone.
  const [gamertags, setGamertags] = useState(null);
  useEffect(() => {
    if (!contact?.id) return undefined;
    let cancelled = false;
    fetchGamertagsMap([contact.id]).then((m) => {
      if (!cancelled) setGamertags(m.get(contact.id) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [contact?.id]);
  if (!contact) return null;
  return (
    <ModalOverlay onClose={onClose}>
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
        <GamertagChips gamertags={gamertags} />
      </div>
    </ModalOverlay>
  );
}
