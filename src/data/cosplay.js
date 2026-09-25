import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';
import { translateInteractionError } from './errors';

// Categoria Cosplay del mondo Nerd (components/nerd/cosplay/): eventi
// (events + event_attendees, RPC eventi_vicini), "Cerco gruppo"
// (cosplay_lfg + cosplay_lfg_members, RPC create/join/leave/close/kick) e
// post di categoria (posts con categoria 'cosplay' e tag galleria / wip /
// discussione, come le schede gaming). Regole, fasce d'età, approvazioni e
// posti li decide il server: qui si mostra e si chiama, gli errori arrivano
// già in italiano.

export const COSPLAY_CATEGORY_ID = 'cosplay';

export const COSPLAY_TABS = [
  { id: 'eventi', label: 'Eventi' },
  { id: 'gruppo', label: 'Cerco gruppo' },
  { id: 'galleria', label: 'Galleria' },
  { id: 'wip', label: 'WIP' },
  { id: 'community', label: 'Community' },
];

// Tipi di evento (events.tipo) con etichetta e icona; i chip della scheda
// Eventi sono "Tutti" più i primi cinque.
export const EVENT_TYPES = {
  fiera: { label: 'Fiera', plural: 'Fiere', icon: '🎪' },
  gara: { label: 'Gara', plural: 'Gare', icon: '🏆' },
  raduno: { label: 'Raduno', plural: 'Raduni', icon: '🎭' },
  shooting: { label: 'Shooting', plural: 'Shooting', icon: '📸' },
  workshop: { label: 'Workshop', plural: 'Workshop', icon: '🛠️' },
  altro: { label: 'Altro', plural: 'Altro', icon: '📌' },
};
export const EVENT_TYPE_CHIPS = ['fiera', 'gara', 'raduno', 'shooting', 'workshop'];

// Tipi di annuncio "Cerco gruppo" (cosplay_lfg.tipo).
export const LFG_TYPES = {
  gruppo: { label: 'Cosplay di gruppo', short: 'Gruppo', icon: '👥', hint: 'Cerco altri cosplayer per un gruppo' },
  fotografo: { label: 'Cerco fotografo', short: 'Fotografo', icon: '📷', hint: 'Cosplayer che cerca chi scatta' },
  cosplayer: { label: 'Cerco cosplayer', short: 'Cosplayer', icon: '🎭', hint: 'Fotografo che cerca chi posare' },
  viaggio: { label: 'Andiamo insieme', short: 'Viaggio', icon: '🚗', hint: 'Compagni di viaggio per la fiera' },
};

// Fonte della serie (posts.extra.fonte_serie) della Galleria.
export const FONTE_SERIE = {
  anime: { label: 'Anime/Manga', icon: '🎌' },
  videogiochi: { label: 'Videogiochi', icon: '🎮' },
  fumetti: { label: 'Fumetti/Comics', icon: '💥' },
  film: { label: 'Film/Serie TV', icon: '🎬' },
  altro: { label: 'Altro', icon: '✨' },
};

// Tag dei post di categoria Cosplay (posts.tag).
export const COSPLAY_POST_TAGS = {
  galleria: { label: 'Galleria', icon: '📸' },
  wip: { label: 'WIP', icon: '🧵' },
  discussione: { label: 'Discussione', icon: '💬' },
};

// Argomenti rapidi della scheda Community (chip → filtro sul testo).
export const COMMUNITY_TOPICS = ['Cosplay principianti', 'Prop making fai da te', 'Costumi da videogiochi', 'Materiali economici', 'Armor in EVA foam'];

// "28 ott – 1 nov 2026", "4 ott 2026" (una sola data se fine manca o è lo
// stesso giorno).
const dayFmt = new Intl.DateTimeFormat('it', { day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat('it', { day: 'numeric', month: 'short', year: 'numeric' });
export function formatEventDates(startIso, endIso) {
  const a = new Date(startIso);
  if (Number.isNaN(a.getTime())) return '';
  const b = endIso ? new Date(endIso) : null;
  const sameDay = b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (!b || Number.isNaN(b.getTime()) || sameDay) return dayYearFmt.format(a);
  if (a.getFullYear() === b.getFullYear()) return `${dayFmt.format(a)} – ${dayYearFmt.format(b)}`;
  return `${dayYearFmt.format(a)} – ${dayYearFmt.format(b)}`;
}
