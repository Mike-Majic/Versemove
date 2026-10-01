import { EVENT_TYPES } from './cosplay';

// Eventi della categoria Teatro del mondo Arte: stessa tabella events e
// stessa RPC eventi_vicini di Cosplay (mondo 'arte', categoria 'teatro').
// Li inserisce ogni giorno il bot, per questo niente "Proponi evento".
// Icone: iconName = icona a linea di shared/Icon.jsx (niente emoji nel
// mondo Intrattenimento); le card e la mappa degli eventi la preferiscono
// all'emoji `icon` dei tipi Cosplay.
export const TEATRO_EVENT_TYPES = {
  spettacolo: { label: 'Spettacolo', plural: 'Spettacoli', iconName: 'mask' },
  festival: { label: 'Festival', plural: 'Festival', iconName: 'ticket' },
  altro: { ...EVENT_TYPES.altro, iconName: 'pin' },
};

export const TEATRO_EVENTS_CONFIG = {
  mondo: 'arte',
  categoria: 'teatro',
  types: TEATRO_EVENT_TYPES,
  chips: ['spettacolo', 'festival', 'altro'],
  canPropose: false,
  shareLink: null,
  emptyIcon: 'mask', // nome di un'icona di shared/Icon.jsx
};

// Arte (mostre) e Live (concerti) del mondo Intrattenimento: stessa
// interfaccia, eventi inseriti ogni giorno dal bot (events-bot). Prima il
// bot li scriveva ma le due categorie mostravano solo gli eventi proposti
// dagli utenti (community_events), quindi non si vedevano.
export const ARTI_VISIVE_EVENTS_CONFIG = {
  mondo: 'arte',
  categoria: 'arti-visive',
  types: {
    mostra: { label: 'Mostra', plural: 'Mostre', iconName: 'palette' },
    altro: { ...EVENT_TYPES.altro, iconName: 'pin' },
  },
  chips: ['mostra', 'altro'],
  canPropose: false,
  shareLink: null,
  emptyIcon: 'palette',
};

export const LIVE_EVENTS_CONFIG = {
  mondo: 'arte',
  categoria: 'live',
  types: {
    concerto: { label: 'Concerto', plural: 'Concerti', iconName: 'music' },
    festival: { label: 'Festival', plural: 'Festival', iconName: 'ticket' },
    altro: { ...EVENT_TYPES.altro, iconName: 'pin' },
  },
  chips: ['concerto', 'festival', 'altro'],
  canPropose: false,
  shareLink: null,
  emptyIcon: 'music',
};

// Fiere del videogioco, tornei esports e incontri con i creator (bot, feed
// 'nerd-live'): scheda Eventi delle categorie Gaming del mondo Nerd.
export const GAMING_EVENTS_CONFIG = {
  mondo: 'nerd',
  categoria: 'nerd-live',
  types: {
    fiera: { ...EVENT_TYPES.fiera },
    torneo: { label: 'Torneo', plural: 'Tornei', icon: '🏆' },
    raduno: { ...EVENT_TYPES.raduno },
    altro: { ...EVENT_TYPES.altro },
  },
  chips: ['fiera', 'torneo', 'raduno', 'altro'],
  canPropose: false,
  shareLink: null,
  emptyIcon: '🎮',
};

export const EVENTS_CONFIG_BY_ARTE_CATEGORY = {
  teatro: TEATRO_EVENTS_CONFIG,
  'arti-visive': ARTI_VISIVE_EVENTS_CONFIG,
  live: LIVE_EVENTS_CONFIG,
};
