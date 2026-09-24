import { useState } from 'react';
import { GAMING_TABS, PLATFORM_BY_CATEGORY, PLATFORM_TAB } from '../../../data/gaming';
import EmptyState from '../../EmptyState';
import GiochiTab from './GiochiTab';
import '../videoRooms.css';
import './gaming.css';

// Colonna unica per le categorie Gaming PC / PS / Xbox del mondo Nerd
// (montata da ArteExplorer per i tre id, con key = categoria, quindi
// cambiando categoria riparte da capo): la piattaforma della categoria è
// il contesto di tutto. Schede in alto (stessa barra della Live): Cerco
// compagni · Giochi · Clip · Community più quella propria della
// piattaforma (Build / Trofei / Game Pass).
export default function GamingColumn({ category, user, onOpenAuth }) {
  const platform = PLATFORM_BY_CATEGORY[category.id];
  const tabs = [...GAMING_TABS, PLATFORM_TAB[platform]];
  const [tab, setTab] = useState('giochi');
  // Gioco scelto da "Cerco compagni per questo gioco": precompila il form
  // della scheda Cerco compagni.
  const [lfgPrefill, setLfgPrefill] = useState(null);

  const openLfgFor = (title) => {
    setLfgPrefill(title);
    setTab('lfg');
  };

  return (
    <>
      <div className="rb-vroom-tabs rb-gaming-tabs" role="tablist" aria-label={category.label}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'is-active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rb-vroom-panel rb-gaming-panel" key={tab}>
        {tab === 'giochi' && <GiochiTab platform={platform} user={user} onOpenAuth={onOpenAuth} onLfgFor={openLfgFor} />}
        {tab !== 'giochi' && (
          <EmptyState
            icon="🚧"
            title={`${tabs.find((t) => t.id === tab)?.label ?? ''}: in arrivo`}
            subtitle={lfgPrefill && tab === 'lfg' ? `Gioco scelto: ${lfgPrefill.nome}` : 'Questa scheda arriva con la prossima parte.'}
          />
        )}
      </div>
    </>
  );
}
