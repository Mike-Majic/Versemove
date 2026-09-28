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
