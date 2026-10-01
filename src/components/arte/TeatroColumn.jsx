import { useState } from 'react';
import CosplayEventsTab from '../nerd/cosplay/CosplayEventsTab';
import CommunityEventsColumn from '../cultural/CommunityEventsColumn';
import { EVENTS_CONFIG_BY_ARTE_CATEGORY, TEATRO_EVENTS_CONFIG } from '../../data/teatroEvents';
import '../nerd/videoRooms.css';
import '../nerd/gaming/gaming.css';
import '../nerd/cosplay/cosplay.css';

const TABS = [
  { id: 'eventi', label: 'Eventi' },
  { id: 'community', label: 'Community' },
];

// Categorie Teatro, Arte e Live del mondo Intrattenimento: la scheda Eventi ha la stessa
// interfaccia degli eventi Cosplay (lista e mappa, città + raggio in km dal
// filtro Dove, Prossimi/Passati, tipo: spettacolo, festival, altro) sugli
// eventi che il bot inserisce ogni giorno; "Community" è la colonna di
// prima con gli eventi proposti dagli utenti e le reazioni.
export default function TeatroColumn({ category, user, onOpenAuth, onShowReactors, locationFilters }) {
  const [tab, setTab] = useState('eventi');
  return (
    <>
      <div className="rb-vroom-tabs" role="tablist" aria-label={category.label}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'eventi' ? (
        <div className="rb-vroom-panel rb-gaming-panel rb-cosplay-panel">
          <CosplayEventsTab user={user} onOpenAuth={onOpenAuth} locationFilters={locationFilters} config={EVENTS_CONFIG_BY_ARTE_CATEGORY[category.id] ?? TEATRO_EVENTS_CONFIG} />
        </div>
      ) : (
        <CommunityEventsColumn
          categoryId={category.id}
          label={category.label}
          user={user}
          onOpenAuth={onOpenAuth}
          onShowReactors={onShowReactors}
        />
      )}
    </>
  );
}
