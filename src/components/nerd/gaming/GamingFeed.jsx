import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addComment as addCommentApi,
  createPost as createPostApi,
  deleteComment as deleteCommentApi,
  fetchComments,
  fetchFeed,
  softDeletePost as softDeletePostApi,
  togglePostLike as togglePostLikeApi,
  toggleSavedPost as toggleSavedPostApi,
  updatePostText as updatePostTextApi,
  applyCommentReaction,
  toggleCommentReaction,
} from '../../../data/posts';
import { toggleContentLike as toggleContentLikeApi } from '../../../data/contents';
import { POST_TAGS, fetchTitles } from '../../../data/gaming';
import PostCard from '../../social/PostCard';
import PostComposer from '../../social/PostComposer';
import EmptyState from '../../EmptyState';
import Skeleton from '../../Skeleton';
import Lightbox from '../../shared/chat/Lightbox';
import { BuildFields, ClipFields, GamePassFields, TrofeoFields } from './GamingComposers';
import { GAMEPASS_ACTIONS, emptyFields, fieldsToPost, formatDay } from './gamingPost';

// Feed di posts filtrati per categoria + tag (Clip, Community, Build,
// Trofei, Game Pass), o di tutto il mondo Nerd se categoria e tag sono
// null (bacheca, vedi nerd/NerdBachecaColumn.jsx): stesso compositore della bacheca (testo, foto/video,
// menzioni) con i campi strutturati del tag sotto il testo, e le stesse
// PostCard (commenti, reazioni, salva, modifica, segnala). Dopo ogni azione
// si ricarica da capo, come nel profilo pubblico: qui non serve la
// reattività ottimistica del feed Social.
// layout 'grid' (Clip): griglia di foto/video con il gioco, tap = schermo
// intero (livello viewer di useBackLayer).
const GAMEPASS_WINDOW_DAYS = 60;

const PLACEHOLDERS = {
  clip: 'Racconta la clip (facoltativo)…',
  discussione: 'Di cosa vuoi parlare?',
  build: 'Due righe sulla build: uso, budget, dubbi…',
  trofeo: 'Come l\'hai preso, o cosa ti blocca…',
  gamepass: 'Perché vale la pena (o no)…',
};

function GamePassLists({ posts }) {
  const since = Date.now() - GAMEPASS_WINDOW_DAYS * 24 * 3600 * 1000;
  const pick = (azione) => {
    const seen = new Set();
    return posts
      .filter((p) => p.extra?.azione === azione && new Date(p.data).getTime() >= since)
      .map((p) => ({ id: p.id, nome: p.title?.nome ?? '—', data: p.extra?.data ?? null }))
      .filter((x) => {
        const k = x.nome.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => String(a.data ?? '').localeCompare(String(b.data ?? '')));
  };
  const entra = pick('entra');
  const esce = pick('esce');
  if (!entra.length && !esce.length) return null;
  return (
    <div className="rb-gamepass-lists">
      {[
        ['entra', entra],
        ['esce', esce],
      ].map(([k, list]) => (
        <section key={k} className={`rb-gamepass-list rb-gamepass-list--${k}`}>
          <div className="rb-gaming-section-title">{GAMEPASS_ACTIONS[k].icon} {GAMEPASS_ACTIONS[k].label}</div>
          {list.length === 0 ? (
            <p className="rb-gaming-note">Niente segnalato negli ultimi {GAMEPASS_WINDOW_DAYS} giorni.</p>
          ) : (
            <ul>
              {list.map((x) => (
                <li key={x.id}>
                  <strong>{x.nome}</strong>
                  {x.data && <span> · {formatDay(x.data)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function ClipGrid({ posts, onOpen }) {
  const clips = posts.filter((p) => p.mediaUrl);
  if (!clips.length) return <EmptyState icon="🎬" title="Nessuna clip ancora" subtitle="Carica un video o uno screenshot con il gioco collegato." />;
  return (
    <ul className="rb-clip-grid">
      {clips.map((p) => (
        <li key={p.id}>
          <button type="button" className="rb-clip-tile" onClick={() => onOpen(p)} aria-label={`Apri la clip di ${p.author?.name ?? 'utente'}`}>
            {p.mediaType === 'video' ? <video src={p.mediaUrl} muted preload="metadata" playsInline /> : <img src={p.mediaUrl} alt="" loading="lazy" />}
            {p.mediaType === 'video' && <span className="rb-clip-play" aria-hidden="true">▶</span>}
            <span className="rb-clip-caption">
              {p.title && <strong>🎮 {p.title.nome}</strong>}
              <span>{p.author?.name ?? 'Utente'}{p.testo ? ` — ${p.testo}` : ''}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function GamingFeed({ category, platform, tag, user, onOpenAuth, layout = 'list' }) {
  const [posts, setPosts] = useState(null);
  const [comments, setComments] = useState([]);
  const [error, setError] = useState('');
  const [fields, setFields] = useState(() => emptyFields(tag));
  const [fieldsError, setFieldsError] = useState('');
  const [viewer, setViewer] = useState(null);

  const reload = useCallback(async () => {
    const res = await fetchFeed({ mondo: 'nerd', categoria: category?.id ?? null, tag: tag ?? null });
    if (res.error) {
      setError(res.error);
      setPosts([]);
      return;
    }
    const list = res.posts ?? [];
    const titles = await fetchTitles(list.map((p) => p.titleId));
    const withTitles = list.map((p) => ({ ...p, title: p.titleId ? titles.get(p.titleId) ?? null : null }));
    setPosts(withTitles);
    const { comments: c } = await fetchComments(withTitles.map((p) => p.id));
    setComments(c ?? []);
  }, [category?.id, tag]);

  useEffect(() => {
    reload();
  }, [reload]);

  const requireAuth = () => {
    if (user) return false;
    onOpenAuth?.();
    return true;
  };

  const createPost = async (data) => {
    if (requireAuth()) return;
    const parsed = fieldsToPost(tag, fields);
    if (!parsed.ok) {
      setFieldsError(parsed.why);
      return;
    }
    if (tag === 'clip' && !data.mediaUrl && !data.gif) {
      setFieldsError('Una clip vuole un video o uno screenshot.');
      return;
    }
    setFieldsError('');
    const { error: err } = await createPostApi({
      ...data,
      gruppoId: undefined,
      mondo: 'nerd',
      categoria: category?.id ?? null,
      tag: tag ?? null,
      titleId: parsed.titleId,
      extra: parsed.extra,
    });
    if (err) {
      setError(err);
      return;
    }
    setFields(emptyFields(tag));
    reload();
  };

  const withReload = (fn) => async (...args) => {
    if (requireAuth()) return;
    const { error: err } = await fn(...args);
    if (err) {
      setError(err);
      return;
    }
    reload();
  };

  const handleToggleLike = withReload((postId) => {
    const target = posts.find((p) => p.id === postId);
    return togglePostLikeApi(postId, target?.mi_piace.includes(user.id));
  });
  const handleToggleContentLike = withReload((post) => toggleContentLikeApi(post.contentId, post.contentLiked));
  const handleToggleSave = withReload((postId) => {
    const target = posts.find((p) => p.id === postId);
    return toggleSavedPostApi(postId, target?.savedByMe);
  });
  const handleAddComment = withReload((postId, { testo, gif, menzioni }) => addCommentApi({ postId, testo, gif, menzioni }));
  const handleDeleteComment = withReload((commentId) => deleteCommentApi(commentId));
  const handleEditPost = withReload((postId, testo) => updatePostTextApi(postId, testo));
  const handleDeletePost = withReload((postId) => softDeletePostApi(postId));
  const handleReactToComment = async (commentId, emoji) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const had = (comments.find((c) => c.id === commentId)?.mieReazioni ?? []).includes(emoji);
    setComments((prev) => applyCommentReaction(prev, commentId, emoji));
    const { error: reactErr } = await toggleCommentReaction(commentId, emoji, had);
    if (reactErr) {
      setComments((prev) => applyCommentReaction(prev, commentId, emoji));
      setError(reactErr);
    }
  };

  const fieldsNode = useMemo(() => {
    const common = { value: fields, onChange: setFields, platform, user, onOpenAuth };
    if (tag === 'build') return <BuildFields value={fields} onChange={setFields} />;
    if (tag === 'trofeo') return <TrofeoFields {...common} />;
    if (tag === 'gamepass') return <GamePassFields {...common} />;
    if (tag === 'clip') return <ClipFields {...common} />;
    return null;
  }, [tag, fields, platform, user, onOpenAuth]);

  const info = tag ? POST_TAGS[tag] : null;

  return (
    <>
      <PostComposer
        user={user}
        onOpenAuth={onOpenAuth}
        onSubmit={createPost}
        placeholder={PLACEHOLDERS[tag] ?? 'Cosa succede nel mondo Nerd?'}
        submitLabel={`Pubblica ${info?.label?.toLowerCase() ?? ''}`.trim()}
        mondo="nerd"
        placementCategory={category?.id ?? null}
        allowEmptyText={tag === 'build' || tag === 'trofeo' || tag === 'gamepass'}
      >
        {fieldsNode}
        {fieldsError && <p className="rb-gaming-error" role="alert">{fieldsError}</p>}
      </PostComposer>

      {error && <p className="rb-gaming-error" role="alert">{error}</p>}

      {posts === null ? (
        <Skeleton lines={4} />
      ) : (
        <>
          {tag === 'gamepass' && <GamePassLists posts={posts} />}
          {layout === 'grid' ? (
            <ClipGrid posts={posts} onOpen={setViewer} />
          ) : posts.length === 0 ? (
            <EmptyState icon={info?.icon ?? '📰'} title={info ? `Nessun post in ${info.label}` : 'Nessun post ancora nel mondo Nerd'} subtitle="Sii il primo a scrivere." />
          ) : (
            <ul className="rb-gaming-posts">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  comments={comments}
                  user={user}
                  onOpenAuth={onOpenAuth}
                  onToggleLike={handleToggleLike}
                  onToggleContentLike={handleToggleContentLike}
                  onAddComment={handleAddComment}
                  onReactToComment={handleReactToComment}
                  onDeleteComment={handleDeleteComment}
                  saved={post.savedByMe}
                  onToggleSave={handleToggleSave}
                  onEditPost={handleEditPost}
                  onDeletePost={handleDeletePost}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {viewer && (
        <Lightbox
          src={viewer.mediaUrl}
          kind={viewer.mediaType === 'video' ? 'video' : 'image'}
          nome={viewer.title?.nome ?? 'Clip'}
          caption={`${viewer.title ? `🎮 ${viewer.title.nome} · ` : ''}${viewer.author?.name ?? 'Utente'}${viewer.testo ? ` — ${viewer.testo}` : ''}`}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}
