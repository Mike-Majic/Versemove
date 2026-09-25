import { EVENT_TYPES, formatEventDates } from '../../../data/cosplay';
import { countryFlag } from '../../../data/citta';

// Card di un evento Cosplay: titolo, badge tipo, date "28 ott – 1 nov
// 2026", città + bandierina, "a 27 km", conteggi, badge Verificato
// (fonte curato) e "In attesa di approvazione" (solo l'autore lo vede: il
// server non mostra agli altri gli eventi in attesa), pulsanti Ci vado /
// Mi interessa (ritocco = toglie), Sito ufficiale, Cerca gruppo.
export default function CosplayEventCard({ event, user, busy, onAttend, onLfgFor, compact = false }) {
  const type = EVENT_TYPES[event.tipo] ?? EVENT_TYPES.altro;
  const mine = Boolean(user) && event.autoreId === user.id;
  const going = event.mioStato === 'partecipa';
  const interested = event.mioStato === 'interessato';
  return (
    <li className={`rb-cev ${event.inCorso ? 'is-live' : ''} ${compact ? 'is-compact' : ''}`} data-event-id={event.id}>
      {event.fotoUrl ? <img className="rb-cev-photo" src={event.fotoUrl} alt="" loading="lazy" /> : <div className="rb-cev-photo rb-cev-photo--empty">{type.icon}</div>}
      <div className="rb-cev-body">
        <div className="rb-cev-badges">
          {event.inCorso && <span className="rb-cev-live">LIVE</span>}
          <span className="rb-cev-type">{type.icon} {type.label}</span>
          {event.fonte === 'curato' && <span className="rb-cev-verified" title="Evento verificato dalla redazione">✔ Verificato</span>}
          {event.stato === 'in_attesa' && mine && <span className="rb-cev-pending">⏳ In attesa di approvazione</span>}
        </div>
        <strong className="rb-cev-title">{event.titolo}</strong>
        <span className="rb-cev-when">📅 {formatEventDates(event.dataEvento, event.dataFine)}</span>
        <span className="rb-cev-where">
          📍 {event.citta || 'Luogo da definire'} {countryFlag(event.paese)}
          {event.distanzaKm != null && <em> · a {Math.round(event.distanzaKm)} km</em>}
        </span>
        <span className="rb-cev-counts">
          {event.nPartecipa} {event.nPartecipa === 1 ? 'ci va' : 'ci vanno'} · {event.nInteressati} {event.nInteressati === 1 ? 'interessato' : 'interessati'}
        </span>
        {!compact && event.descrizione && <p className="rb-cev-desc">{event.descrizione}</p>}
        <div className="rb-cev-actions">
          <button type="button" className={`rb-vroom-btn ${going ? 'rb-vroom-btn--primary' : ''}`} disabled={busy} onClick={() => onAttend(event, going ? null : 'partecipa')} aria-pressed={going}>
            ✅ Ci vado
          </button>
          <button type="button" className={`rb-vroom-btn ${interested ? 'rb-vroom-btn--primary' : ''}`} disabled={busy} onClick={() => onAttend(event, interested ? null : 'interessato')} aria-pressed={interested}>
            ⭐ Mi interessa
          </button>
          {event.urlUfficiale && (
            <a className="rb-vroom-btn rb-cev-link" href={event.urlUfficiale} target="_blank" rel="noopener noreferrer">🔗 Sito ufficiale</a>
          )}
          {onLfgFor && !event.inCorso && (
            <button type="button" className="rb-vroom-btn" onClick={() => onLfgFor(event)}>👥 Cerca gruppo per questo evento</button>
          )}
        </div>
      </div>
    </li>
  );
}
