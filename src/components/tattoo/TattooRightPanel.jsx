import { useState } from 'react';
import TattooMap from './TattooMap';
import TattooRaccolta from './TattooRaccolta';

// Colonna destra della categoria Tattoo: due schede in alto, "Mappa" e
// "Raccolta" (vedi specifica) — un click su un punto della mappa passa
// direttamente alla Raccolta di quel punto, come richiesto.
export default function TattooRightPanel({ user, onOpenAuth }) {
  const [tab, setTab] = useState('mappa');
  const [point, setPoint] = useState(null);

  return (
    <div className="rb-tattoo-right">
      <div className="rb-tattoo-right-tabs">
        <button type="button" className={tab === 'mappa' ? 'active' : ''} onClick={() => setTab('mappa')}>
          Mappa
        </button>
        <button type="button" className={tab === 'raccolta' ? 'active' : ''} onClick={() => setTab('raccolta')}>
          Raccolta
        </button>
      </div>

      <div className="rb-tattoo-right-body">
        {tab === 'mappa' ? (
          <TattooMap
            onSelectPoint={(p) => {
              setPoint(p);
              setTab('raccolta');
            }}
          />
        ) : (
          <TattooRaccolta point={point} user={user} onOpenAuth={onOpenAuth} />
        )}
      </div>
    </div>
  );
}
