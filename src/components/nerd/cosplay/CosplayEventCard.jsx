import { EVENT_TYPES, formatEventDates } from '../../../data/cosplay';
import { countryFlag } from '../../../data/citta';
import { linkToCosplayEvent } from '../../../data/deepLinks';
import ShareLinkButton from '../../shared/ShareLinkButton';
import Icon from '../../shared/Icon';

// Card di un evento Cosplay: titolo, badge tipo, date "28 ott – 1 nov
// 2026", città + bandierina, "a 27 km", conteggi, badge Verificato
// (fonte curato) e "In attesa di approvazione" (solo l'autore lo vede: il
// server non mostra agli altri gli eventi in attesa), pulsanti Ci vado /
// Mi interessa (ritocco = toglie), Sito ufficiale, Cerca gruppo, Condividi
// (link #/nerd/cosplay/evento/<id>).
// types/shareLink: per altre categorie con eventi (es. Teatro); shareLink
// null = niente pulsante Condividi.
export default function CosplayEventCard({ event, user, busy, onAttend, onLfgFor, compact = false, types = EVENT_TYPES, shareLink = linkToCosplayEvent }) {
  const type = types[event.tipo] ?? types.altro ?? EVENT_TYPES.altro;
  const mine = Boolean(user) && event.autoreId === user.id;
  const going = event.mioStato === 'partecipa';
  const interested = event.mioStato === 'interessato';
  return (
    <li className={`rb-cev ${event.inCorso ? 'is-live' : ''} ${compact ? 'is-compact' : ''}`} data-event-id={event.id}>
      {event.fotoUrl ? <img className="rb-cev-photo" src={event.fotoUrl} alt="" loading="lazy" /> : <div className="rb-cev-photo rb-cev-photo--empty">{type.iconName ? <Icon name={type.iconName} size={30} /> : type.icon}</div>}
      <div className="rb-cev-body">
        <div className="rb-cev-badges">
          {event.inCorso && <span className="rb-cev-live">LIVE</span>}
          <span className="rb-cev-type">
            {type.iconName ? <Icon name="{type.iconName}" size={16} className="rb-icon--inline" /> : type.icon} {type.label}
          </span>
          {event.fonte === 'curato' && <span className="rb-cev-verified" title="Evento verificato dalla redazione">
              <Icon name="check" size={14} className="rb-icon--inline" /> Verificato
            </span>}
          {event.stato === 'in_attesa' && mine && <span className="rb-cev-pending">
              <Icon name="clock" size={14} className="rb-icon--inline" /> In attesa di approvazione
            </span>}
        </div>
        <strong className="rb-cev-title">{event.titolo}</strong>
        <span className="rb-cev-when">
            <Icon name="calendar" size={14} className="rb-icon--inline" /> {formatEventDates(event.dataEvento, event.dataFine)}</span>
        <span className="rb-cev-where">
          <Icon name="pin" size={14} className="rb-icon--inline" /> {event.citta || 'Luogo da definire'} {countryFlag(event.paese)}
          {event.distanzaKm != null && <em> · a {Math.round(event.distanzaKm)} km</em>}
        </span>
        <span className="rb-cev-counts">
          {event.nPartecipa} {event.nPartecipa === 1 ? 'ci va' : 'ci vanno'} · {event.nInteressati} {event.nInteressati === 1 ? 'interessato' : 'interessati'}
        </span>
        {!compact && event.descrizione && <p className="rb-cev-desc">{event.descrizione}</p>}
        <div className="rb-cev-actions">
          <button type="button" className={`rb-vroom-btn ${going ? 'rb-vroom-btn--primary' : ''}`} disabled={busy} onClick={() => onAttend(event, going ? null : 'partecipa')} aria-pressed={going}>
            <Icon name="check" size={16} className="rb-icon--inline" /> Ci vado
          </button>
          <button type="button" className={`rb-vroom-btn ${interested ? 'rb-vroom-btn--primary' : ''}`} disabled={busy} onClick={() => onAttend(event, interested ? null : 'interessato')} aria-pressed={interested}>
            <Icon name="star" size={16} className="rb-icon--inline" /> Mi interessa
          </button>
          {event.urlUfficiale && (
            <a className="rb-vroom-btn rb-cev-link" href={event.urlUfficiale} target="_blank" rel="noopener noreferrer">
            <Icon name="link" size={16} className="rb-icon--inline" /> Sito ufficiale
          </a>
          )}
          {event.stato === 'approvato' && shareLink && (
            <ShareLinkButton
              className="rb-vroom-btn"
              label={<><Icon name="link" size={16} className="rb-icon--inline" /> Condividi</>}
              copiedLabel={<><Icon name="check" size={16} className="rb-icon--inline" /> Link copiato</>}
              url={() => shareLink(event.id)} title={event.titolo} text={`${event.titolo} · ${formatEventDates(event.dataEvento, event.dataFine)}`} />
          )}
          {onLfgFor && !event.inCorso && (
            <button type="button" className="rb-vroom-btn" onClick={() => onLfgFor(event)}>
            <Icon name="users" size={16} className="rb-icon--inline" /> Cerca gruppo per questo evento
          </button>
          )}
        </div>
      </div>
    </li>
  );
}
