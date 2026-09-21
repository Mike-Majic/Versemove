import { supabase } from './supabaseClient';

// Playlist personali del mondo Arte & Musica: music_playlists + playlist_tracks
// (RLS: solo il proprietario le vede/modifica, vedi migrazione music_playlists).
// I brani sono quelli trovati con la ricerca (data/musicSearch.js, iTunes),
// salvati con i dati che servono a riascoltarli senza richiamare l'API.
export async function listMyPlaylists() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const { data, error } = await supabase
      .from('music_playlists')
      .select('id, nome, descrizione, created_at, playlist_tracks(id, track_id, title, artist, artwork_url, preview_url, added_at)')
      .eq('owner_id', auth.user.id)
      .order('created_at', { ascending: false })
      .order('added_at', { referencedTable: 'playlist_tracks', ascending: false });
    if (error || !data) return [];
    return data.map((p) => ({ ...p, tracks: p.playlist_tracks ?? [] }));
  } catch {
    return [];
  }
}

export async function createPlaylist({ nome, descrizione = '' }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { data, error } = await supabase
      .from('music_playlists')
      .insert({ owner_id: auth.user.id, nome: nome.trim(), descrizione: descrizione.trim() })
      .select()
      .single();
    if (error) return { error: error.message };
    return { playlist: { ...data, tracks: [] } };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function deletePlaylist(playlistId) {
  try {
    const { error } = await supabase.from('music_playlists').delete().eq('id', playlistId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function addTrackToPlaylist(playlistId, track) {
  try {
    const { data, error } = await supabase
      .from('playlist_tracks')
      .insert({
        playlist_id: playlistId,
        track_id: track.id,
        title: track.title,
        artist: track.artist,
        artwork_url: track.artworkUrl,
        preview_url: track.previewUrl,
      })
      .select()
      .single();
    if (error) return { error: error.message };
    return { track: data };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function removeTrackFromPlaylist(trackRowId) {
  try {
    const { error } = await supabase.from('playlist_tracks').delete().eq('id', trackRowId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}
