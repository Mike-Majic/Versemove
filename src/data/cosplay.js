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

// ---------------------------------------------------------------------------
// Eventi (RPC eventi_vicini + tabella events / event_attendees)

export const EVENTS_PAGE_SIZE = 30;

function mapEvento(row) {
  return {
    id: row.id,
    autoreId: row.autore_id,
    mondo: row.mondo,
    categoria: row.categoria,
    tipo: row.tipo ?? 'altro',
    titolo: row.titolo,
    descrizione: row.descrizione ?? '',
    citta: row.citta ?? '',
    indirizzo: row.indirizzo ?? '',
    paese: (row.paese ?? '').trim(),
    lat: row.lat,
    lng: row.lng,
    dataEvento: row.data_evento,
    dataFine: row.data_fine ?? null,
    urlUfficiale: row.url_ufficiale ?? null,
    fotoUrl: row.foto_url ?? null,
    fonte: row.fonte,
    pubblico: Boolean(row.pubblico),
    stato: row.stato,
    distanzaKm: row.distanza_km == null ? null : Number(row.distanza_km),
    inCorso: Boolean(row.in_corso),
    nPartecipa: Number(row.n_partecipa ?? 0),
    nInteressati: Number(row.n_interessati ?? 0),
    mioStato: row.mio_stato ?? null,
  };
}

// Eventi Cosplay: vicini (lat/lng/km) o di tutto il mondo (tutti null),
// prossimi (compresi quelli in corso) o passati, filtro tipo facoltativo,
// a pagine di 30. -> { events } | { error }
export async function fetchEventiVicini({ lat = null, lng = null, km = null, periodo = 'prossimi', tipo = null, limit = EVENTS_PAGE_SIZE, offset = 0 } = {}) {
  try {
    const { data, error } = await supabase.rpc('eventi_vicini', {
      p_lat: lat,
      p_lng: lng,
      p_km: km,
      p_mondo: 'nerd',
      p_categoria: COSPLAY_CATEGORY_ID,
      p_periodo: periodo,
      p_tipo: tipo,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) return { error: error.message };
    return { events: (data ?? []).map(mapEvento) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// "Ci vado" / "Mi interessa": upsert su event_attendees; stato null toglie
// la riga (ritocco sullo stesso pulsante).
export async function setEventAttendance(eventId, stato) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    if (!stato) {
      const { error } = await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', auth.user.id);
      return error ? { error: error.message } : {};
    }
    const { error } = await supabase
      .from('event_attendees')
      .upsert({ event_id: eventId, user_id: auth.user.id, stato }, { onConflict: 'event_id,user_id' });
    return error ? { error: translateInteractionError(error) } : {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// "Proponi evento": insert su events con autore, mondo nerd e categoria
// cosplay; fonte e stato li mette il server (pubblico → in attesa dei
// moderatori, raduno tra utenti → visibile subito nella propria fascia).
// La foto va nel bucket content-media come gli eventi del mondo Social.
export async function proposeEvent({ titolo, tipo, citta, lat, lng, paese, indirizzo, dataInizio, dataFine, urlUfficiale, descrizione, fotoFile, pubblico }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    let fotoUrl = null;
    if (fotoFile) {
      const path = `${auth.user.id}/event-${Date.now()}-${fotoFile.name}`;
      const { error: uploadError } = await supabase.storage.from('content-media').upload(path, fotoFile);
      if (uploadError) return { error: 'File non supportato o troppo grande.' };
      fotoUrl = supabase.storage.from('content-media').getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await supabase
      .from('events')
      .insert({
        autore_id: auth.user.id,
        mondo: 'nerd',
        categoria: COSPLAY_CATEGORY_ID,
        titolo: String(titolo ?? '').trim(),
        tipo: tipo || 'altro',
        descrizione: String(descrizione ?? '').trim(),
        citta: String(citta ?? '').trim() || null,
        indirizzo: String(indirizzo ?? '').trim() || null,
        paese: paese || null,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        data_evento: dataInizio,
        data_fine: dataFine || null,
        url_ufficiale: String(urlUfficiale ?? '').trim() || null,
        foto_url: fotoUrl,
        pubblico: Boolean(pubblico),
      })
      .select('id, stato')
      .single();
    if (error) return { error: translateInteractionError(error) };
    return { id: data.id, stato: data.stato };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Stanza MOD: eventi proposti in attesa di approvazione, con l'autore.
export async function fetchPendingEvents() {
  try {
    const { data, error } = await supabase.from('events').select('*').eq('stato', 'in_attesa').is('deleted_at', null).order('created_at', { ascending: true });
    if (error) return [];
    const list = (data ?? []).map(mapEvento);
    const profiles = await fetchProfilesMap(list.map((e) => e.autoreId));
    return list.map((e) => ({ ...e, author: profiles.get(e.autoreId) ?? { id: e.autoreId, name: 'Utente', avatar: '' } }));
  } catch {
    return [];
  }
}

export async function setEventStato(eventId, stato) {
  try {
    const { error } = await supabase.from('events').update({ stato }).eq('id', eventId);
    return error ? { error: error.message } : {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// ---------------------------------------------------------------------------
// Cerco gruppo (cosplay_lfg + cosplay_lfg_members, tutte e due su Realtime).
// L'autore è anche membro (riga in cosplay_lfg_members): "posti" conta gli
// altri, i posti occupati sono i membri meno l'autore.

export const LFG_POSTI_MIN = 1;
export const LFG_POSTI_MAX = 30;

function mapCosplayLfg(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    tipo: row.tipo,
    serie: row.serie,
    personaggi: row.personaggi ?? '',
    eventoId: row.evento_id ?? null,
    citta: row.citta ?? '',
    lat: row.lat,
    lng: row.lng,
    quando: row.quando,
    posti: row.posti,
    note: row.note ?? '',
    stato: row.stato,
    createdAt: row.created_at,
  };
}

async function fetchEventsByIds(ids) {
  const clean = Array.from(new Set(ids.filter(Boolean)));
  if (!clean.length) return new Map();
  const { data } = await supabase.from('events').select('id, titolo, tipo, citta, paese, lat, lng, data_evento, data_fine').in('id', clean);
  return new Map((data ?? []).map((e) => [e.id, mapEvento({ ...e, autore_id: null })]));
}

async function hydrateCosplayLfg(list) {
  if (!list.length) return [];
  const ids = list.map((l) => l.id);
  const { data: memberRows } = await supabase.from('cosplay_lfg_members').select('lfg_id, user_id, joined_at').in('lfg_id', ids).order('joined_at', { ascending: true });
  const members = memberRows ?? [];
  const userIds = [...list.map((l) => l.authorId), ...members.map((m) => m.user_id)];
  const [profiles, events] = await Promise.all([fetchProfilesMap(userIds), fetchEventsByIds(list.map((l) => l.eventoId))]);
  const profileOf = (id) => profiles.get(id) ?? { id, name: 'Utente', avatar: '' };
  return list.map((l) => ({
    ...l,
    author: profileOf(l.authorId),
    evento: l.eventoId ? events.get(l.eventoId) ?? null : null,
    members: members.filter((m) => m.lfg_id === l.id && m.user_id !== l.authorId).map((m) => ({ userId: m.user_id, joinedAt: m.joined_at, profile: profileOf(m.user_id) })),
  }));
}

// Annunci aperti (più quelli chiusi di cui si è membri, che la RLS lascia
// vedere), ordinati per quando, con autore, membri ed evento collegato.
export async function fetchCosplayLfgList() {
  const { data, error } = await supabase.from('cosplay_lfg').select('*').eq('stato', 'aperto').order('quando', { ascending: true });
  if (error || !data) return [];
  return hydrateCosplayLfg(data.map(mapCosplayLfg));
}

export async function fetchCosplayLfg(id) {
  if (!id) return null;
  const { data } = await supabase.from('cosplay_lfg').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  const [one] = await hydrateCosplayLfg([mapCosplayLfg(data)]);
  return one ?? null;
}

const rpcVoid = async (name, args) => {
  const { error } = await supabase.rpc(name, args);
  return error ? { error: error.message } : {};
};

// -> { id } | { error }. Con l'evento scelto città e coordinate le prende
// il server dall'evento. Massimo 5 annunci aperti, data fra ora e 400
// giorni: lo dice il server, in italiano.
export async function createCosplayLfg({ tipo, serie, quando, posti, personaggi = null, eventoId = null, citta = null, lat = null, lng = null, note = null }) {
  const { data, error } = await supabase.rpc('create_cosplay_lfg', {
    p_tipo: tipo,
    p_serie: String(serie ?? '').trim(),
    p_quando: quando,
    p_posti: posti,
    p_personaggi: personaggi?.trim() || null,
    p_evento_id: eventoId,
    p_citta: citta?.trim() || null,
    p_lat: Number.isFinite(lat) ? lat : null,
    p_lng: Number.isFinite(lng) ? lng : null,
    p_note: note?.trim() || null,
  });
  if (error) return { error: error.message };
  return { id: data };
}

export const joinCosplayLfg = (id) => rpcVoid('join_cosplay_lfg', { p_id: id });
export const leaveCosplayLfg = (id) => rpcVoid('leave_cosplay_lfg', { p_id: id });
export const kickCosplayLfg = (id, userId) => rpcVoid('kick_cosplay_lfg', { p_id: id, p_user: userId });
export const closeCosplayLfg = (id) => rpcVoid('close_cosplay_lfg', { p_id: id });

// Un canale: qualunque cambiamento agli annunci o ai membri chiama
// onChange(). Da rimuovere con supabase.removeChannel.
export function subscribeCosplayLfg(onChange) {
  return supabase
    .channel('cosplay-lfg')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cosplay_lfg' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cosplay_lfg_members' }, () => onChange())
    .subscribe();
}
