import { supabase } from './supabaseClient';
import { translateInteractionError } from './errors';
import i18n from '../i18n';

// Feed Social reale (tabelle posts/comments/post_likes/saved_posts), al
// posto del vecchio localStorage di SocialFeed.jsx. La colonna "media"
// (jsonb) di posts/comments è generica: qui dentro ci mettiamo un piccolo
// array con al massimo un item per "tipo" (content = foto/video caricata
// col sistema contents.js già esistente, gif, link) così non servivano
// nuove colonne per gif/link_esterno.
function mediaFromFields({ gif, link_esterno, contentId, mediaUrl, mediaType, tags }) {
  const items = [];
  if (contentId) items.push({ kind: 'content', content_id: contentId, media_type: mediaType, url: mediaUrl, tags: tags ?? [] });
  if (gif) items.push({ kind: 'gif', url: gif });
  if (link_esterno?.url) items.push({ kind: 'link', url: link_esterno.url });
  return items;
}

function fieldsFromMedia(media) {
  const arr = Array.isArray(media) ? media : [];
  const content = arr.find((m) => m.kind === 'content');
  const gifItem = arr.find((m) => m.kind === 'gif');
  const linkItem = arr.find((m) => m.kind === 'link');
  return {
    contentId: content?.content_id ?? null,
    mediaUrl: content?.url ?? null,
    mediaType: content?.media_type ?? null,
    contentTags: content?.tags ?? [],
    gif: gifItem?.url ?? null,
    link_esterno: linkItem ? { url: linkItem.url } : null,
  };
}

// Nome mostrato ovunque tranne "Il mio profilo"/Impostazioni e il pannello
// Admin: SEMPRE il nickname, mai nome+cognome reali (vedi migrazione
// nickname_required_lavoro_consent_match_recycle — nickname è ora
// obbligatorio, quindi non dovrebbe più mancare, ma restano i fallback per
// righe vecchie/incomplete).
export function displayName(profile, fallback = 'Utente') {
  return profile?.nickname || profile?.username || profile?.name || fallback;
}

// profiles ha la SELECT ristretta alla propria riga (protegge dati
// personali): per il nome pubblico/avatar di autori diversi da sé si passa
// sempre dalla vista public_profiles (vedi migrazione), mai da profiles.
export async function fetchProfilesMap(ids) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from('public_profiles').select('id, nickname, username, avatar_url').in('id', unique);
  if (error || !data) return new Map();
  const map = new Map();
  for (const p of data) map.set(p.id, { id: p.id, name: displayName(p), avatar: p.avatar_url || '' });
  return map;
}

async function fetchGroupsMap(ids) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from('groups').select('id, nome, icona, colore').in('id', unique);
  if (error || !data) return new Map();
  const map = new Map();
  for (const g of data) map.set(g.id, { id: g.id, name: g.nome, icon: g.icona || '👥', color: g.colore || '#1d9bf0' });
  return map;
}

// Feed di un mondo (Social di default): post più recenti prima, con
// autore/gruppo già risolti e like/salvataggio dell'utente loggato già
// calcolati, per evitare una richiesta in più per ogni post mostrato.
export async function fetchFeed({ mondo = 'social' } = {}) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth?.user?.id ?? null;

    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('mondo', mondo)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return { error: error.message };
    if (!data) return { posts: [] };

    const postIds = data.map((p) => p.id);
    const authorIds = data.map((p) => p.author_id);
    const groupIds = data.map((p) => p.gruppo_id).filter(Boolean);

    const [profilesMap, groupsMap, likesRes, savedRes] = await Promise.all([
      fetchProfilesMap(authorIds),
      fetchGroupsMap(groupIds),
      postIds.length
        ? supabase.from('post_likes').select('post_id, user_id').in('post_id', postIds)
        : Promise.resolve({ data: [] }),
      myId && postIds.length
        ? supabase.from('saved_posts').select('post_id').eq('user_id', myId).in('post_id', postIds)
        : Promise.resolve({ data: [] }),
    ]);

    const likesByPost = new Map();
    for (const l of likesRes.data ?? []) {
      if (!likesByPost.has(l.post_id)) likesByPost.set(l.post_id, []);
      likesByPost.get(l.post_id).push(l.user_id);
    }
    const savedSet = new Set((savedRes.data ?? []).map((r) => r.post_id));

    const posts = data.map((row) => ({
      id: row.id,
      fromPostsTable: true,
      autoreId: row.author_id,
      author: profilesMap.get(row.author_id) ?? { id: row.author_id, name: 'Utente', avatar: '' },
      testo: row.testo ?? '',
      lingua: row.lingua ?? null,
      data: row.created_at,
      mi_piace: likesByPost.get(row.id) ?? [],
      commenti: [],
      gruppo_id: row.gruppo_id,
      group: row.gruppo_id ? groupsMap.get(row.gruppo_id) ?? null : null,
      savedByMe: savedSet.has(row.id),
      contentLiked: false,
      contentLikeCount: 0,
      ...fieldsFromMedia(row.media),
    }));
    return { posts };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Commenti (non cancellati) di uno o più post, più vecchi prima, con
// l'autore già risolto.
export async function fetchComments(postIds) {
  try {
    if (!postIds?.length) return { comments: [] };
    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .in('post_id', postIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) return { error: error.message };
    if (!data) return { comments: [] };

    const profilesMap = await fetchProfilesMap(data.map((c) => c.author_id));
    const comments = data.map((row) => {
      const media = Array.isArray(row.media) ? row.media : [];
      const gifItem = media.find((m) => m.kind === 'gif');
      return {
        id: row.id,
        post_id: row.post_id,
        autoreId: row.author_id,
        author: profilesMap.get(row.author_id) ?? { id: row.author_id, name: 'Utente', avatar: '' },
        testo: row.testo ?? '',
        data: row.created_at,
        gif: gifItem?.url ?? null,
        reazioni: {},
      };
    });
    return { comments };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function createPost({ testo, gif, link_esterno, gruppoId, contentId, mediaUrl, mediaType, tags, mondo = 'social' }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const media = mediaFromFields({ gif, link_esterno, contentId, mediaUrl, mediaType, tags });
    const { data, error } = await supabase
      .from('posts')
      .insert({ author_id: auth.user.id, mondo, testo: testo ?? '', media, gruppo_id: gruppoId ?? null, lingua: i18n.language })
      .select()
      .single();
    if (error) return { error: translateInteractionError(error) };
    return { id: data.id, createdAt: data.created_at };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function updatePostText(postId, testo) {
  try {
    const { error } = await supabase.from('posts').update({ testo, updated_at: new Date().toISOString() }).eq('id', postId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Cancellazione morbida: la RLS permette solo all'autore o allo staff di
// aggiornare la riga (non esiste una policy DELETE, di proposito — la
// segnalazione/moderazione deve poter risalire a un post anche cancellato).
export async function softDeletePost(postId) {
  try {
    const { error } = await supabase.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', postId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function togglePostLike(postId, currentlyLiked) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    if (currentlyLiked) {
      const { error } = await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', auth.user.id);
      if (error) return { error: error.message };
      return { liked: false };
    }
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, user_id: auth.user.id });
    if (error) return { error: translateInteractionError(error) };
    return { liked: true };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function toggleSavedPost(postId, currentlySaved) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    if (currentlySaved) {
      const { error } = await supabase.from('saved_posts').delete().eq('post_id', postId).eq('user_id', auth.user.id);
      if (error) return { error: error.message };
      return { saved: false };
    }
    const { error } = await supabase.from('saved_posts').insert({ post_id: postId, user_id: auth.user.id });
    if (error) return { error: error.message };
    return { saved: true };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function addComment({ postId, testo, gif }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const media = gif ? [{ kind: 'gif', url: gif }] : [];
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, author_id: auth.user.id, testo: testo ?? '', media })
      .select()
      .single();
    if (error) return { error: translateInteractionError(error) };
    return { id: data.id, createdAt: data.created_at };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Cancellazione morbida di un proprio commento (o dello staff): stessa
// logica dei post, nessuna policy DELETE vera.
export async function deleteComment(commentId) {
  try {
    const { error } = await supabase.from('comments').update({ deleted_at: new Date().toISOString() }).eq('id', commentId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}
