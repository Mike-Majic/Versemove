import { supabase } from './supabaseClient';
import { translateInteractionError } from './errors';
import { zodiacSign } from './zodiac';
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
  const { data, error } = await supabase
    .from('public_profiles')
    .select(
      'id, nickname, username, avatar_url, citta_social, bio_social, citta_origine, stato_relazionale, genere, pronomi, lingue_parlate, giorno_nascita, mese_nascita'
    )
    .in('id', unique);
  if (error || !data) return new Map();
  const map = new Map();
  for (const p of data) {
    map.set(p.id, {
      id: p.id,
      name: displayName(p),
      nickname: p.nickname || '',
      avatar: p.avatar_url || '',
      citta: p.citta_social || '',
      bio: p.bio_social || '',
      cittaOrigine: p.citta_origine || '',
      statoRelazionale: p.stato_relazionale || '',
      genere: p.genere || '',
      pronomi: p.pronomi || '',
      lingueParlate: p.lingue_parlate || [],
      zodiaco: zodiacSign(p.giorno_nascita, p.mese_nascita),
    });
  }
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
// authorId: per il profilo pubblico di un utente (vedi SocialProfileModal),
// gli stessi post del feed ma filtrati su un solo autore invece che su
// tutto il mondo.
// categoria/tag: post di categoria del mondo Nerd (Gaming PC/PS/Xbox, vedi
// data/gaming.js): posts.categoria, posts.tag, posts.title_id, posts.extra.
// Post a pagine: FEED_PAGE_SIZE alla volta, i più recenti prima; before
// (data ISO dell'ultimo post già mostrato) chiede la pagina successiva.
// ids: solo quei post (link condiviso a un post fuori dal feed caricato).
// -> { posts, hasMore } | { error }
export const FEED_PAGE_SIZE = 30;

export async function fetchFeed({ mondo = 'social', authorId = null, categoria = null, tag = null, ids = null, before = null, limit = FEED_PAGE_SIZE } = {}) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const myId = auth?.user?.id ?? null;

    let query = supabase.from('posts').select('*').eq('mondo', mondo).is('deleted_at', null);
    if (authorId) query = query.eq('author_id', authorId);
    if (categoria) query = query.eq('categoria', categoria);
    if (tag) query = query.eq('tag', tag);
    if (ids?.length) query = query.in('id', ids);
    if (before) query = query.lt('created_at', before);
    // Uno in più del necessario: dice se c'è un'altra pagina.
    const { data: rows, error } = await query.order('created_at', { ascending: false }).limit(limit + 1);
    if (error) return { error: error.message };
    if (!rows) return { posts: [], hasMore: false };
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;

    const postIds = data.map((p) => p.id);
    const authorIds = data.map((p) => p.author_id);
    const groupIds = data.map((p) => p.gruppo_id).filter(Boolean);

    const [profilesMap, groupsMap, likesRes, savedRes] = await Promise.all([
      fetchProfilesMap(authorIds),
      fetchGroupsMap(groupIds),
      // Conteggio e "l'ho messo io" calcolati dal DB (post_like_stats),
      // non tutte le righe di post_likes.
      postIds.length ? supabase.rpc('post_like_stats', { p_ids: postIds }) : Promise.resolve({ data: [] }),
      myId && postIds.length
        ? supabase.from('saved_posts').select('post_id').eq('user_id', myId).in('post_id', postIds)
        : Promise.resolve({ data: [] }),
    ]);

    // mi_piace resta un array (chi lo usa guarda solo length e includes
    // del mio id): il mio id se c'è, poi segnaposto null per gli altri.
    const likesByPost = new Map();
    for (const l of likesRes.data ?? []) {
      const n = Number(l.n) || 0;
      const mine = Boolean(l.mine) && myId;
      likesByPost.set(l.post_id, [...(mine ? [myId] : []), ...Array(Math.max(0, n - (mine ? 1 : 0))).fill(null)]);
    }
    const savedSet = new Set((savedRes.data ?? []).map((r) => r.post_id));

    const posts = data.map((row) => ({
      id: row.id,
      fromPostsTable: true,
      autoreId: row.author_id,
      author: profilesMap.get(row.author_id) ?? { id: row.author_id, name: 'Utente', avatar: '' },
      testo: row.testo ?? '',
      menzioni: row.menzioni ?? [],
      lingua: row.lingua ?? null,
      data: row.created_at,
      mi_piace: likesByPost.get(row.id) ?? [],
      commenti: [],
      gruppo_id: row.gruppo_id,
      group: row.gruppo_id ? groupsMap.get(row.gruppo_id) ?? null : null,
      savedByMe: savedSet.has(row.id),
      contentLiked: false,
      contentLikeCount: 0,
      categoria: row.categoria ?? null,
      tag: row.tag ?? null,
      titleId: row.title_id ?? null,
      extra: row.extra ?? null,
      ...fieldsFromMedia(row.media),
    }));
    return { posts, hasMore };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Commenti (non cancellati) di uno o più post, più vecchi prima, con
// l'autore già risolto.
// Reazioni emoji ai commenti (tabella comment_reactions): per ogni
// commento i conteggi per emoji e quelle messe da me.
export const COMMENT_REACTION_EMOJIS = ['❤️', '😂', '👍'];

async function fetchCommentReactions(commentIds) {
  const out = new Map();
  if (!commentIds?.length) return out;
  try {
    const [{ data: auth }, { data }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('comment_reactions').select('comment_id, user_id, emoji').in('comment_id', commentIds),
    ]);
    const me = auth?.user?.id ?? null;
    for (const r of data ?? []) {
      const entry = out.get(r.comment_id) ?? { counts: {}, mine: [] };
      entry.counts[r.emoji] = (entry.counts[r.emoji] ?? 0) + 1;
      if (me && r.user_id === me) entry.mine.push(r.emoji);
      out.set(r.comment_id, entry);
    }
  } catch {
    // Senza reazioni i commenti si mostrano lo stesso.
  }
  return out;
}

// Mette o toglie la mia reazione `emoji` al commento. -> {} | { error }
export async function toggleCommentReaction(commentId, emoji, alreadyMine) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    if (alreadyMine) {
      const { error } = await supabase.from('comment_reactions').delete().eq('comment_id', commentId).eq('user_id', auth.user.id).eq('emoji', emoji);
      return error ? { error: error.message } : {};
    }
    const { error } = await supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: auth.user.id, emoji });
    if (error && error.code !== '23505') return { error: translateInteractionError(error) };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Aggiornamento ottimistico della lista commenti dopo un tocco su una
// reazione (stesso calcolo per tutti i feed).
export function applyCommentReaction(comments, commentId, emoji) {
  return comments.map((c) => {
    if (c.id !== commentId) return c;
    const mine = c.mieReazioni ?? [];
    const had = mine.includes(emoji);
    const count = Math.max(0, (c.reazioni?.[emoji] ?? 0) + (had ? -1 : 1));
    return {
      ...c,
      reazioni: { ...c.reazioni, [emoji]: count },
      mieReazioni: had ? mine.filter((e) => e !== emoji) : [...mine, emoji],
    };
  });
}

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

    const [profilesMap, reactions] = await Promise.all([
      fetchProfilesMap(data.map((c) => c.author_id)),
      fetchCommentReactions(data.map((c) => c.id)),
    ]);
    const comments = data.map((row) => {
      const media = Array.isArray(row.media) ? row.media : [];
      const gifItem = media.find((m) => m.kind === 'gif');
      return {
        id: row.id,
        post_id: row.post_id,
        autoreId: row.author_id,
        author: profilesMap.get(row.author_id) ?? { id: row.author_id, name: 'Utente', avatar: '' },
        testo: row.testo ?? '',
        menzioni: row.menzioni ?? [],
        data: row.created_at,
        gif: gifItem?.url ?? null,
        reazioni: reactions.get(row.id)?.counts ?? {},
        mieReazioni: reactions.get(row.id)?.mine ?? [],
      };
    });
    return { comments };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// categoria/tag/titleId/extra solo per i post di categoria del mondo Nerd
// (il server accetta tag solo insieme a una categoria gaming e mondo nerd).
export async function createPost({ testo, gif, link_esterno, gruppoId, contentId, mediaUrl, mediaType, tags, mondo = 'social', menzioni = [], categoria = null, tag = null, titleId = null, extra = null }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const media = mediaFromFields({ gif, link_esterno, contentId, mediaUrl, mediaType, tags });
    const { data, error } = await supabase
      .from('posts')
      .insert({
        author_id: auth.user.id,
        mondo,
        testo: testo ?? '',
        media,
        gruppo_id: gruppoId ?? null,
        lingua: i18n.language,
        menzioni,
        ...(categoria ? { categoria, tag, title_id: titleId ?? null, extra: extra ?? null } : {}),
      })
      .select()
      .single();
    if (error) return { error: translateInteractionError(error) };
    return { id: data.id, createdAt: data.created_at, menzioni: data.menzioni ?? [] };
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

export async function addComment({ postId, testo, gif, menzioni = [] }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const media = gif ? [{ kind: 'gif', url: gif }] : [];
    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, author_id: auth.user.id, testo: testo ?? '', media, menzioni })
      .select()
      .single();
    if (error) return { error: translateInteractionError(error) };
    return { id: data.id, createdAt: data.created_at, menzioni: data.menzioni ?? [] };
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
