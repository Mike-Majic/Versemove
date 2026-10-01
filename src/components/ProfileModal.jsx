import { useState } from 'react';
import ModalOverlay from './ModalOverlay';
import ReportModal from './shared/ReportModal';
import './ProfileModal.css';
import AvatarImg from './shared/AvatarImg';

// "user" qui è il profilo che si sta guardando (non chi è loggato: quello
// arriva come "viewer", serve solo per sapere se mostrare/abilitare il
// pulsante Segnala oppure aprire il login).
export default function ProfileModal({ user, world, onClose, viewer, onOpenAuth }) {
  const [reporting, setReporting] = useState(false);
  if (!user) return null;

  const handleReport = () => {
    if (!viewer) {
      onOpenAuth?.();
      return;
    }
    setReporting(true);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-profile-card" style={{ '--accent': world.color }} onClick={(e) => e.stopPropagation()}>
        <button className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        {onOpenAuth && (
          <button type="button" className="rb-profile-report-btn" title="Segnala profilo" onClick={handleReport}>
            🚩 Segnala
          </button>
        )}

        <div className="rb-profile-head">
          <AvatarImg src={user.avatar} name={user?.name || user?.nickname} seed={user?.id} alt={user.name} className="rb-profile-avatar" />
          <div>
            <h2>{user.name}{user.age ? `, ${user.age}` : ''}</h2>
            <p className="rb-profile-location">📍 {user.city}, {user.country}</p>
          </div>
        </div>

        {world.id === 'lavoro' ? (
          <div className="rb-profile-job">
            <div className="rb-profile-tag">{user.jobType}</div>
            <h3>{user.jobTitle}</h3>
            <div className="rb-cv-box">
              <span className="rb-cv-icon">📄</span>
              <div>
                <strong>{user.cvFile}</strong>
                <p>Curriculum allegato dal candidato</p>
              </div>
              <button className="rb-btn-primary" disabled title="Disponibile quando arriverà il backend">
                Scarica CV
              </button>
            </div>
          </div>
        ) : world.id === 'arte' ? (
          <div>
            {user.artType && <div className="rb-profile-tag">{user.artType}</div>}
            {user.bio && <p className="rb-profile-bio">{user.bio}</p>}
            <div className="rb-portfolio-grid">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="rb-portfolio-tile" />
              ))}
            </div>
          </div>
        ) : (
          <div>
            {user.gender && <div className="rb-profile-tag">{user.gender === 'donna' ? 'Donna' : 'Uomo'}</div>}
            {user.bio && <p className="rb-profile-bio">{user.bio}</p>}
          </div>
        )}
      </div>

      {reporting && (
        <ReportModal
          targetType="profilo"
          targetId={user.id}
          targetLabel={`il profilo di ${user.name}`}
          onClose={() => setReporting(false)}
        />
      )}
    </ModalOverlay>
  );
}
