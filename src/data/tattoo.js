import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';
import { translateUploadError } from './contents';

// Mondo Social, categoria "Tattoo": foto di tatuaggi ancorate allo studio
// del tatuatore (mai la posizione dell'utente, vedi createPost). Backend
// Supabase (tabelle tattoo_studios/tattoo_posts/tattoo_studio_ratings +
// tattoo_post_likes/tattoo_post_comments (per il like/commento richiesti
// dalla specifica, non elencati nel suo schema dati ma serve una tabella
// dedicata: content_likes non si può riusare, è agganciata a "contents",
// non a tattoo_posts) + viste tattoo_post_stats/tattoo_studio_stats (stesso
// principio di dog_place_stats) + RPC tattoo_photos_near/
// tattoo_points_in_bbox/tattoo_nearest_studio, RLS, PostGIS) creato da
// Cowork — qui solo lettura/scrittura con i nomi già decisi, nessuna
// tabella nuova. Finché non esistono le funzioni sotto restituiscono
// liste vuote/errori gestiti, mai un'eccezione.

function mapPost(row, statsByPost, myLikes, profilesMap, studiosMap) {
  const stats = statsByPost?.get(row.id);
  const author = profilesMap?.get(row.author_id);
  const studio = studiosMap?.get(row.studio_id);
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: author?.name ?? 'Utente',
    authorAvatar: author?.avatar ?? '',
    studioId: row.studio_id,
    studioNome: studio?.nome ?? null,
    studioCitta: studio?.citta ?? null,
    foto: (row.foto ?? []).map(getTattooPhotoUrl),
    stile: row.stile,
    parteCorpo: row.parte_corpo,
    colore: !!row.colore,
    dimensione: row.dimensione,
    artistaNome: row.artista_nome,
    voto: row.voto,
    testo: row.testo,
    prezzoIndicativo: row.prezzo_indicativo != null ? Number(row.prezzo_indicativo) : null,
    createdAt: row.created_at,
    nLike: stats?.n_like ?? 0,
    nCommenti: stats?.n_commenti ?? 0,
    piaceAMe: myLikes?.has(row.id) ?? false,
  };
}

const ORDER_COLUMNS = {
  recenti: 'created_at',
  vicini: null, // richiede una posizione: gestito solo dentro Raccolta/Mappa, non nel feed testuale
};

// Feed di sinistra: filtri lato query (stile, parte del corpo, colore,
// città, voto minimo), ordinamento "più votati" calcolato dalla vista
// stats (non lato query, come "caldo" in vetrinaDeals.js).
export async function listPosts({ stile, parteCorpo, colore, citta, votoMin, ordinamento = 'recenti' } = {}) {
  let query = supabase.from('tattoo_posts').select('*').is('deleted_at', null);
  if (stile) query = query.eq('stile', stile);
  if (parteCorpo) query = query.eq('parte_corpo', parteCorpo);
  if (colore === true) query = query.eq('colore', true);
  if (colore === false) query = query.eq('colore', false);
  if (votoMin) query = query.gte('voto', votoMin);

  const orderColumn = ORDER_COLUMNS[ordinamento];
  if (orderColumn) query = query.order(orderColumn, { ascending: false });

  const { data, error } = await query.limit(60);
  if (error || !data) return [];

  let rows = data;
  if (citta) {
    const studioIds = Array.from(new Set(rows.map((r) => r.studio_id).filter(Boolean)));
    const studiosMap = await fetchStudiosMap(studioIds);
    rows = rows.filter((r) => studiosMap.get(r.studio_id)?.citta?.toLowerCase() === citta.toLowerCase());
  }

  const ids = rows.map((r) => r.id);
  const studioIds = Array.from(new Set(rows.map((r) => r.studio_id).filter(Boolean)));
  const [statsByPost, myLikes, profilesMap, studiosMap] = await Promise.all([
    fetchPostStats(ids),
    fetchMyLikes(ids),
    fetchProfilesMap(rows.map((r) => r.author_id)),
    fetchStudiosMap(studioIds),
  ]);

  const posts = rows.map((row) => mapPost(row, statsByPost, myLikes, profilesMap, studiosMap));
  if (ordinamento === 'votati') posts.sort((a, b) => b.nLike - a.nLike);
  return posts;
}

async function fetchPostStats(postIds) {
  const map = new Map();
  if (!postIds.length) return map;
  const { data, error } = await supabase.from('tattoo_post_stats').select('post_id, n_like, n_commenti').in('post_id', postIds);
  if (error || !data) return map;
  data.forEach((row) => map.set(row.post_id, row));
  return map;
}

async function fetchMyLikes(postIds) {
  const set = new Set();
  if (!postIds.length) return set;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return set;
  const { data, error } = await supabase.from('tattoo_post_likes').select('post_id').eq('user_id', auth.user.id).in('post_id', postIds);
  if (error || !data) return set;
  data.forEach((row) => set.add(row.post_id));
  return set;
}

async function fetchStudiosMap(studioIds) {
  const map = new Map();
  if (!studioIds.length) return map;
  const { data, error } = await supabase.from('tattoo_studios').select('id, nome, citta, indirizzo').in('id', studioIds);
  if (error || !data) return map;
  data.forEach((row) => map.set(row.id, row));
  return map;
}

// Like ottimista lato chiamante (vedi TattooPostCard): qui solo la
// scrittura. Un like/utente/post, un secondo tap lo toglie.
export async function toggleLike(postId, currentlyLiked) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per mettere like.' };
  if (currentlyLiked) {
    const { error } = await supabase.from('tattoo_post_likes').delete().eq('post_id', postId).eq('user_id', auth.user.id);
    if (error) return { error: error.message };
    return {};
  }
  const { error } = await supabase.from('tattoo_post_likes').upsert({ post_id: postId, user_id: auth.user.id }, { onConflict: 'post_id,user_id' });
  if (error) return { error: error.message };
  return {};
}

function mapComment(row, profilesMap) {
  const author = profilesMap.get(row.author_id);
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id,
    authorName: author?.name ?? 'Utente',
    authorAvatar: author?.avatar ?? '',
    testo: row.testo,
    createdAt: row.created_at,
  };
}

export async function listComments(postId) {
  const { data, error } = await supabase
    .from('tattoo_post_comments')
    .select('id, post_id, author_id, testo, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  const profilesMap = await fetchProfilesMap(data.map((r) => r.author_id));
  return data.map((row) => mapComment(row, profilesMap));
}

export async function addComment(postId, testo) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per commentare.' };
  if (!testo?.trim()) return { error: 'Scrivi un commento.' };
  const { data, error } = await supabase
    .from('tattoo_post_comments')
    .insert({ post_id: postId, author_id: auth.user.id, testo: testo.trim() })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

// Voto a stelle allo STUDIO (non al singolo post, vedi tattoo_studio_ratings
// nella specifica): un voto per utente per studio, un secondo voto lo
// sostituisce (mai lo toglie: a differenza di un like, "non avere ancora
// votato" e "aver tolto il voto" non hanno lo stesso significato per una
// media stelle).
export async function rateStudio(studioId, voto) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per votare.' };
  if (!(voto >= 1 && voto <= 5)) return { error: 'Il voto deve essere da 1 a 5.' };
  const { error } = await supabase
    .from('tattoo_studio_ratings')
    .upsert({ studio_id: studioId, user_id: auth.user.id, voto }, { onConflict: 'studio_id,user_id' });
  if (error) return { error: error.message };
  return {};
}

export async function getStudioStats(studioId) {
  const { data, error } = await supabase.from('tattoo_studio_stats').select('media_stelle, n_recensioni').eq('studio_id', studioId).maybeSingle();
  if (error || !data) return { mediaStelle: null, nRecensioni: 0 };
  return { mediaStelle: data.media_stelle != null ? Number(data.media_stelle) : null, nRecensioni: data.n_recensioni ?? 0 };
}

// Studio più vicino entro raggioM (default 150, per il controllo doppioni
// in pubblicazione — "È questo studio?"): RPC lato database, non un filtro
// lato client su tutta la tabella.
export async function findNearbyStudio(lat, lng, raggioM = 150) {
  const { data, error } = await supabase.rpc('tattoo_nearest_studio', { p_lat: lat, p_lng: lng, p_raggio_m: raggioM });
  if (error || !data?.length) return null;
  return data[0];
}

export async function createStudio({ nome, lat, lng, indirizzo, citta, instagram }) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato.' };
  if (!nome?.trim()) return { error: 'Manca il nome dello studio.' };
  const { data, error } = await supabase
    .from('tattoo_studios')
    .insert({
      nome: nome.trim(),
      location: `SRID=4326;POINT(${lng} ${lat})`,
      indirizzo: indirizzo?.trim() || null,
      citta: citta?.trim() || null,
      instagram: instagram?.trim() || null,
      created_by: auth.user.id,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function createPost({ studioId, foto, stile, parteCorpo, colore, dimensione, artistaNome, voto, testo, prezzoIndicativo }) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per pubblicare.' };
  if (!studioId) return { error: 'Manca lo studio.' };
  if (!foto?.length) return { error: 'Aggiungi almeno una foto.' };
  const { data, error } = await supabase
    .from('tattoo_posts')
    .insert({
      author_id: auth.user.id,
      studio_id: studioId,
      foto,
      stile: stile || null,
      parte_corpo: parteCorpo || null,
      colore: !!colore,
      dimensione: dimensione || null,
      artista_nome: artistaNome?.trim() || null,
      voto: voto || null,
      testo: testo?.trim() || null,
      prezzo_indicativo: prezzoIndicativo ?? null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

// Stesso bucket pubblico "content-media" già usato dal resto dell'app
// (vedi data/contents.js/dogWorld.js), prefisso dedicato.
export async function uploadTattooPhoto(file) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato.' };
  const path = `${auth.user.id}/tattoo-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('content-media').upload(path, file);
  if (error) return { error: translateUploadError(error) };
  return { path };
}

export function getTattooPhotoUrl(path) {
  const { data } = supabase.storage.from('content-media').getPublicUrl(path);
  return data.publicUrl;
}

// Scheda Mappa: punti raggruppati per zona nel riquadro visibile, con
// miniatura della foto più votata e conteggio — tutto calcolato lato
// database (RPC, come dog_places_in_bbox), mai scaricando tutta la
// tabella per raggrupparla qui.
export async function pointsInBbox({ minLng, minLat, maxLng, maxLat, stile, parteCorpo, colore }) {
  const { data, error } = await supabase.rpc('tattoo_points_in_bbox', {
    p_min_lng: minLng,
    p_min_lat: minLat,
    p_max_lng: maxLng,
    p_max_lat: maxLat,
    p_stile: stile || null,
    p_parte_corpo: parteCorpo || null,
    p_colore: colore ?? null,
  });
  if (error || !data) return [];
  return data.map((row) => ({
    lat: row.lat,
    lng: row.lng,
    nFoto: row.n_foto,
    miniaturaUrl: row.miniatura_path ? getTattooPhotoUrl(row.miniatura_path) : null,
    studioNome: row.studio_nome,
  }));
}

// Scheda Raccolta: tutte le foto entro raggioM (default 500) da un punto
// cliccato sulla mappa, per voto, a blocchi (infinite scroll) — RPC lato
// database con limit/offset, non un'unica richiesta con migliaia di righe.
export async function photosNear({ lat, lng, raggioM = 500, limit = 30, offset = 0, stile, parteCorpo, colore }) {
  const { data, error } = await supabase.rpc('tattoo_photos_near', {
    p_lat: lat,
    p_lng: lng,
    p_raggio_m: raggioM,
    p_limit: limit,
    p_offset: offset,
    p_stile: stile || null,
    p_parte_corpo: parteCorpo || null,
    p_colore: colore ?? null,
  });
  if (error || !data) return [];

  const profilesMap = await fetchProfilesMap(data.map((r) => r.author_id));
  const studiosMap = await fetchStudiosMap(Array.from(new Set(data.map((r) => r.studio_id).filter(Boolean))));
  const statsByPost = await fetchPostStats(data.map((r) => r.id));
  const myLikes = await fetchMyLikes(data.map((r) => r.id));
  return data.map((row) => mapPost(row, statsByPost, myLikes, profilesMap, studiosMap));
}
