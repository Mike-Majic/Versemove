import { isAccountBlocked } from '../../data/banStatus';
import { isStaff } from '../../data/roles';
import InfoBanUserChat from './InfoBanUserChat';
import InfoBanStaffView from './InfoBanStaffView';
import './infoBan.css';

// Categoria INFO BAN del mondo FAQ: per l'utente bloccato la sua chat con
// lo staff (solo testo); per owner e moderatori la stessa vista della
// scheda "Info ban" del Backend. Un moderatore bloccato vede la chat da
// utente bloccato. Gli altri non vedono la categoria (getFaqCategories).
export default function InfoBanColumn({ user, onClose }) {
  const blocked = isAccountBlocked(user);
  const staffView = isStaff(user?.ruolo) && !blocked;
  if (!user || (!blocked && !staffView)) return null;
  return (
    <div className={`rb-infoban-panel ${staffView ? 'staff' : 'user'} ${blocked ? 'blocked' : ''}`}>
      <header className="rb-infoban-panel-head">
        <div>
          <h2>⛔ INFO BAN</h2>
          <p>
            {staffView
              ? 'Chat con gli account bloccati: chi aspetta una risposta è in cima.'
              : 'Scrivi allo staff per avere informazioni sul blocco del tuo account.'}
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Chiudi" title="Chiudi">
            ✕
          </button>
        )}
      </header>
      {staffView ? <InfoBanStaffView /> : <InfoBanUserChat user={user} />}
    </div>
  );
}
