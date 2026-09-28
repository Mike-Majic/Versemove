import { EVENT_TYPES } from './cosplay';

// Eventi della categoria Teatro del mondo Arte: stessa tabella events e
// stessa RPC eventi_vicini di Cosplay (mondo 'arte', categoria 'teatro').
// Li inserisce ogni giorno il bot, per questo niente "Proponi evento".
export const TEATRO_EVENT_TYPES = {
  spettacolo: { label: 'Spettacolo', plural: 'Spettacoli', icon: '🎭' },
  festival: { label: 'Festival', plural: 'Festival', icon: '🎪' },
  altro: EVENT_TYPES.altro,
};

export const TEATRO_EVENTS_CONFIG = {
  mondo: 'arte',
  categoria: 'teatro',
  types: TEATRO_EVENT_TYPES,
  chips: ['spettacolo', 'festival', 'altro'],
  canPropose: false,
  shareLink: null,
  emptyIcon: '🎭',
};
