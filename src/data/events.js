import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';
import { translateInteractionError } from './errors';
import { safeFileName } from './storagePath';

// Eventi reali del mondo Social (tabelle events + event_attendees), al posto
// del vecchio stato locale/localStorage di App.jsx. La foto va nel bucket
// "content-media" già usato da contents.js (stesso path sotto il proprio
// uid), ma non passa dal sistema contents/content_placements: un evento non
// va cross-postato o "mi piace condiviso" come le foto di Arte, gli basta un
// url diretto nella nuova colonna events.foto_url.

// Un evento "scade" a fine giornata della sua data (dataEvento è un vero
// timestamptz): dopo la mezzanotte del giorno dell'evento non deve più
// comparire, né sul globo né in colonna.
export function isEventExpired(event) {
  const d = new Date(event.dataEvento);
  const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  return Date.now() > endOfDay.getTime();
}

function mapEvent(row, attendeeIds, likers, myId) {
  return {
    id: row.id,
    autoreId: row.autore_id,
    author: row.author ?? { id: row.autore_id, name: 'Utente', avatar: '' },
    titolo: row.titolo,
    citta: row.citta,
    lat: row.lat,
    lng: row.lng,
    dataEvento: row.data_evento,
    bio: row.descrizione ?? '',
    fotoUrl: row.foto_url ?? null,
    createdAt: row.created_at,
    mi_piace: attendeeIds,
    likers,
    likedByMe: myId ? attendeeIds.includes(myId) : false,
  };
}

// Eventi non scaduti/non cancellati di un mondo, con autore e "mi piace"
// (event_attendees, stato "interessato") già risolti — la RLS
// (events_select_visible) esclude già da sola gli eventi dell'altra fascia
// d'età o di un mondo non accessibile.
export async function fetchEvents({ mondo = 'social' } = {}) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth?.user?.id ?? null;

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('mondo', mondo)
      .is('deleted_at', null)
      .order('data_evento', { ascending: true });
    if (error) return { error: error.message };
    if (!data) return { events: [] };

    const eventIds = data.map((e) => e.id);
    const attendeesRes = eventIds.length
      ? await supabase.from('event_attendees').select('event_id, user_id').in('event_id', eventIds)
      : { data: [] };

    const attendeesByEvent = new Map();
    for (const a of attendeesRes.data ?? []) {
      if (!attendeesByEvent.has(a.event_id)) attendeesByEvent.set(a.event_id, []);
      attendeesByEvent.get(a.event_id).push(a.user_id);
    }

    const profilesMap = await fetchProfilesMap([
      ...data.map((e) => e.autore_id),
      ...(attendeesRes.data ?? []).map((a) => a.user_id),
    ]);

    const events = data.map((row) => {
      const attendeeIds = attendeesByEvent.get(row.id) ?? [];
      const likers = attendeeIds.map((id) => profilesMap.get(id) ?? { id, name: 'Utente', avatar: '' });
      return mapEvent({ ...row, author: profilesMap.get(row.autore_id) }, attendeeIds, likers, myId);
    });
    return { events };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function createEvent({ titolo, citta, lat, lng, data, ora, bio, fotoFile, mondo = 'social' }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };

    let fotoUrl = null;
    if (fotoFile) {
      const path = `${auth.user.id}/event-${Date.now()}-${safeFileName(fotoFile.name)}`;
      const { error: uploadError } = await supabase.storage.from('content-media').upload(path, fotoFile);
      if (uploadError) return { error: 'File non supportato o troppo grande.' };
      fotoUrl = supabase.storage.from('content-media').getPublicUrl(path).data.publicUrl;
    }

    const dataEvento = new Date(`${data}T${ora}:00`).toISOString();
    const { data: row, error } = await supabase
      .from('events')
      .insert({
        autore_id: auth.user.id,
        mondo,
        titolo,
        descrizione: bio ?? '',
        citta,
        lat,
        lng,
        data_evento: dataEvento,
        foto_url: fotoUrl,
      })
      .select()
      .single();
    if (error) return { error: translateInteractionError(error) };
    return { id: row.id };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// "Mi piace" di un evento = riga in event_attendees (stato "interessato"):
// la RLS richiede di non essere bloccati con l'autore, stessa fascia d'età,
// e che il mondo sia accessibile — un tentativo respinto arriva come il
// solito errore generico di row-level security, qui tradotto.
export async function toggleEventLike(eventId, currentlyLiked) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    if (currentlyLiked) {
      const { error } = await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', auth.user.id);
      if (error) return { error: error.message };
      return { liked: false };
    }
    const { error } = await supabase
      .from('event_attendees')
      .insert({ event_id: eventId, user_id: auth.user.id, stato: 'interessato' });
    if (error) return { error: translateInteractionError(error) };
    return { liked: true };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Canale realtime per i nuovi eventi di un mondo: la RLS di "events" limita
// già la consegna a chi può davvero vederlo (fascia d'età, mondo
// accessibile), così anche un evento creato da un altro utente compare da
// solo senza dover ricaricare la pagina.
export function subscribeToNewEvents(mondo, onInsert) {
  return supabase
    .channel(`events-${mondo}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `mondo=eq.${mondo}` }, (payload) =>
      onInsert(payload.new)
    )
    .subscribe();
}
