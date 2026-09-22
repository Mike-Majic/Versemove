import { useTranslation } from 'react-i18next';
import { translateWorld } from '../i18n/worldLabels';
import './AccessGate.css';

// Generalizzazione del vecchio AgeGate: oggi TUTTI i mondi richiedono un
// account per essere esplorati, non solo Incontri e Lavoro — su quei due
// resta anche il controllo dei 18 anni (data di nascita vera dell'account,
// non un'auto-dichiarazione). `requireAdult` distingue i due casi nel testo
// mostrato. `disabledByUser` copre un terzo caso, indipendente dai primi
// due: un account loggato e (se serve) maggiorenne, ma che ha scelto di non
// abilitare questo mondo in registrazione/impostazioni.
export default function AccessGate({ world, user, requireAdult, disabledByUser, onOpenAuth, onDecline, onOpenSettings }) {
  const { t } = useTranslation();
  const needsAuth = !user;
  const worldLabel = translateWorld(t, world).label;

  if (!needsAuth && disabledByUser) {
    return (
      <div className="rb-adult-gate-overlay" style={{ '--accent': world.color }}>
        <div className="rb-adult-gate-card">
          <h2>{t('accessGate.worldDisabled.title')}</h2>
          <p>{t('accessGate.worldDisabled.message', { world: worldLabel })}</p>
          <div className="rb-adult-gate-actions">
            <button type="button" className="rb-adult-gate-decline" onClick={onDecline}>
              {t('accessGate.worldDisabled.back')}
            </button>
            <button type="button" className="rb-adult-gate-confirm" onClick={onOpenSettings}>
              {t('accessGate.worldDisabled.goToSettings')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rb-adult-gate-overlay" style={{ '--accent': world.color }}>
      <div className="rb-adult-gate-card">
        <h2>{requireAdult ? t('accessGate.adultTitle') : t('accessGate.loginTitle')}</h2>
        {needsAuth ? (
          <>
            <p>
              {requireAdult
                ? t('accessGate.adultNeedsAuth', { world: worldLabel })
                : t('accessGate.needsAuth', { world: worldLabel })}
            </p>
            <div className="rb-adult-gate-actions">
              <button type="button" className="rb-adult-gate-decline" onClick={onDecline}>
                {t('accessGate.back')}
              </button>
              <button type="button" className="rb-adult-gate-confirm" onClick={onOpenAuth}>
                {t('accessGate.loginOrRegister')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>{t('accessGate.adultBlocked', { world: worldLabel })}</p>
            <div className="rb-adult-gate-actions">
              <button type="button" className="rb-adult-gate-decline" onClick={onDecline}>
                {t('accessGate.back')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
