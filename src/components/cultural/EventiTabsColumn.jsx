import { useState } from 'react';
import './cultural.css';

// Due schede sopra una colonna: "Eventi" (children, di solito EventiColumn)
// e "Community" (la colonna generica della categoria, con i contenuti degli
// utenti). Usata per Cosplay nel mondo Nerd, stesso pattern delle schede di
// VideoRoomsColumn.
export default function EventiTabsColumn({ children, community, eventsLabel = 'Eventi', communityLabel = 'Community' }) {
  const [tab, setTab] = useState('events');
  return (
    <>
      <div className="rb-eventi-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'events'} className={tab === 'events' ? 'is-active' : ''} onClick={() => setTab('events')}>
          {eventsLabel}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'community'} className={tab === 'community' ? 'is-active' : ''} onClick={() => setTab('community')}>
          {communityLabel}
        </button>
      </div>
      {tab === 'events' ? <div className="rb-eventi-tabs-panel">{children}</div> : community}
    </>
  );
}
