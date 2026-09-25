import { supabase } from './supabaseClient';
import { getContentUrl, translateUploadError } from './contents';
import { safeFileName } from './storagePath';

// Album fotografici stile Facebook: photo_albums raggruppa righe già
// esistenti in "contents" (stesso storage/like/RLS del resto dell'app,
// vedi data/contents.js) tramite la colonna contents.album_id. Le foto di
// un album ricevono anche un posizionamento in content_placements
// (mondo Social, categoria sintetica "profilo_album") solo per rispettare
// la stessa regola di visibilità di tutti gli altri contenuti — non compare
// nel feed principale, che non interroga questa categoria.
const ALBUM_PLACEMENT = { world: 'social', category: 'profilo_album' };

// Ogni album porta con sé le sue foto (ordinate più recente prima): basta
// per calcolare copertina e conteggio lato client, senza query aggiuntive.
export async function listMyAlbums() {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return [];
    const { data, error } = await supabase
      .from('photo_albums')
      .select('id, nome, descrizione, created_at, contents(id, storage_path, type, created_at)')
      .eq('owner_id', auth.user.id)
      .order('created_at', { ascending: false })
      .order('created_at', { referencedTable: 'contents', ascending: false });
    if (error || !data) return [];
    return data.map((album) => ({
      ...album,
      photos: (album.contents ?? []).map((c) => ({ ...c, url: getContentUrl(c.storage_path) })),
    }));
  } catch {
    return [];
  }
}

export async function createAlbum({ nome, descrizione = '' }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { data, error } = await supabase
      .from('photo_albums')
      .insert({ owner_id: auth.user.id, nome: nome.trim(), descrizione: descrizione.trim() })
      .select()
      .single();
    if (error) return { error: error.message };
    return { album: { ...data, photos: [] } };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Cancella l'album: le foto restano (contents.album_id torna a null per
// via di ON DELETE SET NULL), solo il raggruppamento sparisce.
export async function deleteAlbum(albumId) {
  try {
    const { error } = await supabase.from('photo_albums').delete().eq('id', albumId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function addPhotoToAlbum({ file, albumId, caption = '' }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };

    const path = `${auth.user.id}/${Date.now()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from('content-media').upload(path, file);
    if (uploadError) return { error: translateUploadError(uploadError) };

    const { data: content, error: contentError } = await supabase
      .from('contents')
      .insert({
        owner_id: auth.user.id,
        type: 'foto',
        storage_path: path,
        caption: caption.trim(),
        album_id: albumId,
      })
      .select()
      .single();
    if (contentError) return { error: contentError.message };

    const { error: placementError } = await supabase.from('content_placements').insert({
      content_id: content.id,
      world_id: ALBUM_PLACEMENT.world,
      category_id: ALBUM_PLACEMENT.category,
    });
    if (placementError) return { error: placementError.message };

    return { photo: { ...content, url: getContentUrl(path) } };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete durante il caricamento.' };
  }
}

// Toglie la foto dall'album (resta come contenuto singolo, non viene
// cancellata): stesso spirito di "rimuovi da questo album" su Facebook.
export async function removePhotoFromAlbum(contentId) {
  try {
    const { error } = await supabase.from('contents').update({ album_id: null }).eq('id', contentId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}
