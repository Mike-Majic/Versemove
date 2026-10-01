import { supabase } from './supabaseClient';

// Galleria immagini / Galleria Video (mondo Intrattenimento) alimentate dai
// post pubblici del mondo Social: la RPC galleria_social restituisce un
// elemento per ogni foto/video di un post (post_id + media_idx), con
// autore e voti. Blocchi, separazione adulti/minori, bannati, gruppi e post
// eliminati li filtra già il server; le GIF sono escluse.

export const GALLERY_PAGE = 30; // il server accetta al massimo 60

function mapRow(r) {
  return {
    key: `${r.post_id}:${r.media_idx}`,
    postId: r.post_id,
    mediaIdx: r.media_idx,
    tipo: r.tipo,
    url: r.url,
    media: r.media,
    autoreId: r.autore_id,
    autoreNickname: r.autore_nickname || 'Utente',
    autoreAvatar: r.autore_avatar || '',
    createdAt: r.created_at,
    su: Number(r.su) || 0,
    giu: Number(r.giu) || 0,
    mioVoto: r.mio_voto == null ? 0 : Number(r.mio_voto),
    seguoAutore: Boolean(r.seguo_autore),
  };
}

// tipo: 'foto' | 'video'; ordine: 'recenti' | 'top'.
export async function fetchGalleria({ tipo, ordine = 'recenti', autore = null, limit = GALLERY_PAGE, offset = 0 }) {
  const { data, error } = await supabase.rpc('galleria_social', {
    p_tipo: tipo,
    p_ordine: ordine,
    p_autore: autore,
    p_limit: Math.min(limit, 60),
    p_offset: offset,
  });
  if (error) return { items: [], error: error.message };
  return { items: (data ?? []).map(mapRow), error: null };
}

// voto: 1 (su), -1 (giù), 0 (togli). Restituisce i conteggi aggiornati.
export async function votaMedia(postId, mediaIdx, voto) {
  const { data, error } = await supabase.rpc('vota_media', { p_post_id: postId, p_media_idx: mediaIdx, p_voto: voto });
  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { error: 'Voto non registrato' };
  return { su: Number(row.su) || 0, giu: Number(row.giu) || 0, mioVoto: row.mio_voto == null ? 0 : Number(row.mio_voto) };
}

// Stato del voto dopo un clic (per l'aggiornamento ottimistico): cliccare
// di nuovo il pollice già scelto toglie il voto.
export function nextVote(item, pressed) {
  const voto = item.mioVoto === pressed ? 0 : pressed;
  let { su, giu } = item;
  if (item.mioVoto === 1) su -= 1;
  if (item.mioVoto === -1) giu -= 1;
  if (voto === 1) su += 1;
  if (voto === -1) giu += 1;
  return { voto, su: Math.max(0, su), giu: Math.max(0, giu) };
}
