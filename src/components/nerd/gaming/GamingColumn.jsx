import { useEffect, useRef, useState } from 'react';
import { GAMING_TABS, PLATFORM_BY_CATEGORY, PLATFORM_TAB } from '../../../data/gaming';
import { useCalls } from '../../../calls/CallProvider';
import GiochiTab from './GiochiTab';
import LfgTab from './LfgTab';
import GamingFeed from './GamingFeed';
import '../videoRooms.css';
import './gaming.css';

// Colonna unica per le categorie Gaming PC / PS / Xbox / Nintendo del mondo
// Nerd (montata da ArteExplorer per i quattro id, con key = categoria, quindi
// cambiando categoria riparte da capo): la piattaforma della categoria è
// il contesto di tutto. Schede in alto (stessa barra della Live): Cerco
// compagni · Giochi · Clip · Community più quella propria della
// piattaforma (Build / Trofei / Game Pass; Nintendo non ne ha).
// focus: { lfgId, seq } da una notifica di "Cerco compagni": apre quella
// scheda con l'annuncio evidenziato.
export default function GamingColumn({ category, user, onOpenAuth, focus = null }) {
  const platform = PLATFORM_BY_CATEGORY[category.id];
  const platformTab = PLATFORM_TAB[platform] ?? null;
  const tabs = [...GAMING_TABS, ...(platformTab ? [platformTab] : [])];
  const [tab, setTab] = useState(focus ? 'lfg' : 'giochi');
  // Gioco scelto da "Cerco compagni per questo gioco": precompila il form
  // della scheda Cerco compagni.
  const [lfgPrefill, setLfgPrefill] = useState(null);
  // Stanza party (video di gruppo, stessa stanza della Live): vive in
  // calls/CallProvider e resta attiva cambiando mondo; a tutto schermo
  // prende il posto della colonna (contenitore "host" qui sotto).
  const { room, views, roomExit, consumeRoomExit, openRoom, setView, hostRef } = useCalls();
  const showingRoom = Boolean(room && user && views.room === 'full');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!roomExit || roomExit.source !== 'gaming') return;
    setNotice(roomExit.message);
    setTab('lfg');
    consumeRoomExit();
  }, [roomExit, consumeRoomExit]);

  // Una nuova notifica (seq diverso) porta sulla scheda Cerco compagni.
  const focusSeqRef = useRef(focus?.seq ?? null);
  if ((focus?.seq ?? null) !== focusSeqRef.current) {
    focusSeqRef.current = focus?.seq ?? null;
    if (focus) setTab('lfg');
  }

  const openLfgFor = (title) => {
    setLfgPrefill(title);
    setTab('lfg');
  };

  if (showingRoom) return <div ref={hostRef('room')} className="rb-vroom-host" />;

  return (
    <>
      <div ref={hostRef('room')} className="rb-vroom-host" />
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
        {tab === 'lfg' && (
          <LfgTab
            category={category}
            platform={platform}
            user={user}
            onOpenAuth={onOpenAuth}
            prefill={lfgPrefill}
            onPrefillConsumed={() => setLfgPrefill(null)}
            focusId={focus?.lfgId ?? null}
            onEnterRoom={(id) => {
              setNotice('');
              if (room?.roomId === id) setView('room', 'full');
              else openRoom(id, 'gaming');
            }}
            notice={notice}
            onDismissNotice={() => setNotice('')}
          />
        )}
        {tab === 'clip' && <GamingFeed key="clip" category={category} platform={platform} tag="clip" user={user} onOpenAuth={onOpenAuth} layout="grid" />}
        {tab === 'community' && <GamingFeed key="community" category={category} platform={platform} tag="discussione" user={user} onOpenAuth={onOpenAuth} />}
        {platformTab && tab === platformTab.id && (
          <GamingFeed key={platformTab.tag} category={category} platform={platform} tag={platformTab.tag} user={user} onOpenAuth={onOpenAuth} />
        )}
      </div>
    </>
  );
}
