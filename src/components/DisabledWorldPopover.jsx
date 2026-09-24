import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { WORLDS } from '../data/worlds';
import { setOwnWorlds } from '../data/accounts';
import { translateWorld } from '../i18n/worldLabels';
import { useBackLayer } from '../hooks/useBackLayer';
import './DisabledWorldPopover.css';

// Riquadro che compare cliccando il buco nero di un mondo disattivato (vedi
// globe/blackHole.js): "<Mondo> è disattivato" con [Riattiva mondo] e un
// collegamento alle Impostazioni. Si apre accanto al punto cliccato,
// sempre dentro lo schermo; si chiude con un clic fuori, Esc o il tasto
// Indietro del telefono (è un livello di hooks/useBackLayer.js).
const WIDTH = 300;
const HEIGHT = 96;
const MARGIN = 12;

export default function DisabledWorldPopover({ worldId, x, y, user, onClose, onUpdateUser, onOpenSettings }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const world = WORLDS.find((w) => w.id === worldId);

  useBackLayer(true, onClose, 'modal:disabled-world');

  useEffect(() => {
    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    // Al prossimo giro: il pointerdown del clic che l'ha aperto è già passato.
    const timer = setTimeout(() => document.addEventListener('pointerdown', onPointerDown), 0);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  if (!world || !user) return null;
  const label = translateWorld(t, world).label;

  const reactivate = async () => {
    setBusy(true);
    setError('');
    const current = user.mondiAbilitati ?? [];
    const next = WORLDS.map((w) => w.id).filter((id) => id !== 'wip' && (id === 'faq' || id === worldId || current.includes(id)));
    const { account, error: err } = await setOwnWorlds(next);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onUpdateUser(account);
    onClose();
  };

  const left = Math.max(MARGIN, Math.min(x + 24, window.innerWidth - WIDTH - MARGIN));
  const top = Math.max(MARGIN, Math.min(y + 24, window.innerHeight - HEIGHT - MARGIN));
  const target = document.querySelector('.rb-app') ?? document.body;

  return createPortal(
    <div ref={ref} className="rb-disabled-world-popover" style={{ left, top, width: WIDTH }} role="dialog" aria-label={`${label} è disattivato`}>
      <strong>{label} è disattivato</strong>
      <div className="rb-disabled-world-actions">
        <button type="button" className="rb-disabled-world-reactivate" onClick={reactivate} disabled={busy}>
          {busy ? t('common.oneMoment') : 'Riattiva mondo'}
        </button>
        <button
          type="button"
          className="rb-disabled-world-settings"
          onClick={() => {
            onClose();
            onOpenSettings();
          }}
        >
          o dalle Impostazioni
        </button>
      </div>
      {error && <p className="rb-disabled-world-error">{error}</p>}
    </div>,
    target,
  );
}
