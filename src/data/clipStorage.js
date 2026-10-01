import { supabase } from './supabaseClient';
import { translateUploadError } from './contents';

// Storage delle clip video della scheda "Clip" (Musica), volutamente
// separato dal bucket "content-media" delle foto/video di Arte: in futuro,
// per spostarlo su Cloudflare R2 (object storage compatibile S3), basterà
// riscrivere queste tre funzioni contro l'API di R2 — nessun altro file del
// resto dell'app tocca direttamente lo storage delle clip.
const BUCKET = 'music-clips';

export async function uploadClip(file, ownerId) {
  // mp4 o webm, secondo cosa ha registrato il browser (vedi videoCompress.js).
  const ext = /mp4/.test(file.type) ? 'mp4' : 'webm';
  const path = `${ownerId}/${Date.now()}-clip.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) return { error: translateUploadError(error) };
  return { path, url: getClipUrl(path) };
}

export function getClipUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteClipFile(path) {
  return supabase.storage.from(BUCKET).remove([path]);
}
