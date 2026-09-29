import './EventCard.css';
import PublishedAt from '../shared/PublishedAt';

function formatEventDate(dataEventoISO) {
  const d = new Date(dataEventoISO);
  const oggi = new Date();
  const giornoLabel =
    d.toDateString() === oggi.toDateString() ? 'Oggi' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  return `${giornoLabel} · ${ora}`;
}

// Card di un evento nella colonna del mondo Social: stesso principio di
// PostCard (like con conteggio), ma il "mi piace" doppia anche da bottone
// per aprire la lista di chi l'ha messo (stesso elenco che appare
// cliccando il badge sul marker quadrato del globo).
export default function EventCard({ event, user, onOpenAuth, onToggleLike, onOpenLikers }) {
  const author = event.author;
  const liked = event.likedByMe;

  const handleLike = () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    onToggleLike(event.id, liked);
  };

  return (
    <li className="rb-event-card">
      {event.fotoUrl ? (
        <img className="rb-event-card-photo" src={event.fotoUrl} alt={event.titolo} />
      ) : (
        <div className="rb-event-card-photo rb-event-card-photo-gradient" />
      )}
      <div className="rb-event-card-body">
        <span className="rb-event-card-when">{formatEventDate(event.dataEvento)}</span>
        <strong className="rb-event-card-title">{event.titolo}</strong>
        <span className="rb-event-card-city">📍 {event.citta}</span>
        {event.bio && <p className="rb-event-card-bio">{event.bio}</p>}
        <span className="rb-event-card-author">Creato da {author.name}</span>
        <PublishedAt at={event.createdAt} />

        <div className="rb-event-card-actions">
          <button type="button" className={`rb-event-card-like-btn ${liked ? 'active' : ''}`} onClick={handleLike}>
            {liked ? '❤️' : '🤍'} Mi piace
          </button>
          {event.mi_piace.length > 0 && (
            <button type="button" className="rb-event-card-likers-btn" onClick={() => onOpenLikers(event.id)}>
              {event.mi_piace.length} {event.mi_piace.length === 1 ? 'persona' : 'persone'}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
