import { supabase } from './supabaseClient';

// Eventi caricati dagli utenti per le categorie senza un catalogo esterno
// affidabile e gratuito (Teatro, Arte/musei, Live/concerti — a differenza
// di Cinema, che usa TMDB, vedi data/tmdb.js): opere, mostre, concerti, con
// data facoltativa. Le reazioni sono in data/culturalReactions.js.
export async function listCommunityEvents(categoryId) {
  try {
    const { data, error } = await supabase
      .from('community_events')
      .select('id, title, description, location, event_date, created_by, created_at')
      .eq('category_id', categoryId)
      .order('event_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

export async function createCommunityEvent({ categoryId, title, description, location, eventDate }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { data, error } = await supabase
      .from('community_events')
      .insert({
        category_id: categoryId,
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        event_date: eventDate || null,
        created_by: auth.user.id,
      })
      .select()
      .single();
    if (error) return { error: error.message };
    return { event: data };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function deleteCommunityEvent(eventId) {
  try {
    const { error } = await supabase.from('community_events').delete().eq('id', eventId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}
