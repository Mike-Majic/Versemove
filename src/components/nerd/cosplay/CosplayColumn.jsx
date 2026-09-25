import { useRef, useState } from 'react';
import { COSPLAY_TABS } from '../../../data/cosplay';
import CosplayEventsTab from './CosplayEventsTab';
import CosplayLfgTab from './CosplayLfgTab';
import CosplayFeed from './CosplayFeed';
import '../videoRooms.css';
import '../gaming/gaming.css';
import './cosplay.css';

// Colonna della categoria Cosplay del mondo Nerd, stessa struttura di
// Gaming PC (barra di schede in alto + pannello; "Persone vicine" a
// destra resta com'è): Eventi · Cerco gruppo · Galleria · WIP · Community,
// scheda iniziale Eventi. locationFilters è il filtro "Dove" delle
// Impostazioni (città con coordinate e distanza), usato da Eventi e Cerco
// gruppo. focus: { lfgId, seq } da una notifica di "Cerco gruppo".
export default function CosplayColumn({ category, user, onOpenAuth, locationFilters, focus = null }) {
  const [tab, setTab] = useState(focus ? 'gruppo' : 'eventi');
  // Evento scelto da "Cerca gruppo per questo evento": precompila il form.
  const [lfgPrefillEvent, setLfgPrefillEvent] = useState(null);

  const focusSeqRef = useRef(focus?.seq ?? null);
  if ((focus?.seq ?? null) !== focusSeqRef.current) {
    focusSeqRef.current = focus?.seq ?? null;
    if (focus) setTab('gruppo');
  }

  const openLfgFor = (event) => {
    setLfgPrefillEvent(event);
    setTab('gruppo');
  };

  return (
    <>
      <div className="rb-vroom-tabs rb-gaming-tabs rb-cosplay-tabs" role="tablist" aria-label={category.label}>
        {COSPLAY_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="rb-vroom-panel rb-gaming-panel rb-cosplay-panel" key={tab}>
        {tab === 'eventi' && <CosplayEventsTab user={user} onOpenAuth={onOpenAuth} locationFilters={locationFilters} onLfgFor={openLfgFor} />}
        {tab === 'gruppo' && (
          <CosplayLfgTab
            user={user}
            onOpenAuth={onOpenAuth}
            locationFilters={locationFilters}
            prefillEvent={lfgPrefillEvent}
            onPrefillConsumed={() => setLfgPrefillEvent(null)}
            focusId={focus?.lfgId ?? null}
          />
        )}
        {tab === 'galleria' && <CosplayFeed key="galleria" tag="galleria" user={user} onOpenAuth={onOpenAuth} locationFilters={locationFilters} />}
        {tab === 'wip' && <CosplayFeed key="wip" tag="wip" user={user} onOpenAuth={onOpenAuth} locationFilters={locationFilters} />}
        {tab === 'community' && <CosplayFeed key="community" tag="discussione" user={user} onOpenAuth={onOpenAuth} locationFilters={locationFilters} />}
      </div>
    </>
  );
}
