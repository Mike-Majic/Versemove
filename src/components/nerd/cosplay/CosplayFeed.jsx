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
import { COMMUNITY_TOPICS, COSPLAY_CATEGORY_ID, COSPLAY_POST_TAGS, FONTE_SERIE, fetchEventiVicini } from '../../../data/cosplay';
import { locationHasCoords } from '../../../data/citta';
import { isUnlimitedDistance } from '../../../data/geo';
import PostCard from '../../social/PostCard';
import PostComposer from '../../social/PostComposer';
import EmptyState from '../../EmptyState';
import Skeleton from '../../Skeleton';
import Lightbox from '../../shared/chat/Lightbox';
import { GalleriaFields, WipFields } from './CosplayComposers';
import { emptyFields, fieldsToPost } from './cosplayPost';

// Galleria / WIP / Community della categoria Cosplay: posts con mondo
// nerd, categoria cosplay e tag galleria / wip / discussione, come le
// schede Clip / Build / Community di Gaming PC: stesso compositore (testo,
// foto, menzioni) con i campi strutturati sotto il testo e le stesse
// PostCard. Galleria: griglia a mosaico delle foto con filtri per fonte
// della serie (Anime/Manga, Videogiochi, Fumetti…) e ricerca serie /
// personaggio, tap = schermo intero. WIP: come Build, con la barra di
// avanzamento. Community: i chip degli argomenti filtrano il feed.
const PLACEHOLDERS = {
  galleria: 'Due righe sulla foto (facoltativo)…',
  wip: 'A che punto sei, cosa ti manca, dubbi…',
  discussione: 'Di cosa vuoi parlare?',
};

function GalleriaGrid({ posts, onOpen }) {
  const photos = posts.filter((p) => p.mediaUrl && p.mediaType === 'foto');
  if (!photos.length) return <EmptyState icon="📸" title="Nessuna foto ancora" subtitle="Carica la tua foto con personaggio e serie." />;
  return (
    <ul className="rb-clip-grid rb-cgal-grid">
      {photos.map((p) => (
        <li key={p.id}>
          <button type="button" className="rb-clip-tile" onClick={() => onOpen(p)} aria-label={`Apri la foto di ${p.author?.name ?? 'utente'}`}>
            <img src={p.mediaUrl} alt="" loading="lazy" />
            <span className="rb-clip-caption">
              <strong>{[p.extra?.personaggio, p.extra?.serie].filter(Boolean).join(' · ') || 'Cosplay'}</strong>
              <span>{p.author?.name ?? 'Utente'}{p.extra?.fotografo ? ` · 📷 ${p.extra.fotografo}` : ''}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function CosplayFeed({ tag, user, onOpenAuth, locationFilters }) {
  const [posts, setPosts] = useState(null);
  const [comments, setComments] = useState([]);
  const [error, setError] = useState('');
  const [fields, setFields] = useState(() => emptyFields(tag));
  const [fieldsError, setFieldsError] = useState('');
  const [viewer, setViewer] = useState(null);
  const [fonte, setFonte] = useState(null);
  const [topic, setTopic] = useState(null);
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState([]);

  const reload = useCallback(async () => {
    const res = await fetchFeed({ mondo: 'nerd', categoria: COSPLAY_CATEGORY_ID, tag });
    if (res.error) {
      setError(res.error);
      setPosts([]);
      return;
    }
    const list = res.posts ?? [];
    setPosts(list);
    const { comments: c } = await fetchComments(list.map((p) => p.id));
    setComments(c ?? []);
  }, [tag]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Eventi prossimi da collegare a una foto della galleria.
  useEffect(() => {
    if (tag !== 'galleria') return undefined;
    let cancelled = false;
    const near = locationHasCoords(locationFilters) && !isUnlimitedDistance(locationFilters.distance);
    fetchEventiVicini({ lat: near ? locationFilters.lat : null, lng: near ? locationFilters.lng : null, km: near ? locationFilters.distance : null, periodo: 'prossimi', limit: 50 }).then((res) => {
      if (!cancelled) setEvents(res.events ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [tag, locationFilters]);

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
    if (tag === 'galleria' && !(data.mediaUrl && data.mediaType === 'foto')) {
      setFieldsError('La galleria vuole una foto.');
      return;
    }
    setFieldsError('');
    const { error: err } = await createPostApi({ ...data, gruppoId: undefined, mondo: 'nerd', categoria: COSPLAY_CATEGORY_ID, tag, titleId: null, extra: parsed.extra });
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
  const handleToggleLike = withReload((postId) => togglePostLikeApi(postId, posts.find((p) => p.id === postId)?.mi_piace.includes(user.id)));
  const handleToggleContentLike = withReload((post) => toggleContentLikeApi(post.contentId, post.contentLiked));
  const handleToggleSave = withReload((postId) => toggleSavedPostApi(postId, posts.find((p) => p.id === postId)?.savedByMe));
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
    if (tag === 'galleria') return <GalleriaFields value={fields} onChange={setFields} events={events} />;
    if (tag === 'wip') return <WipFields value={fields} onChange={setFields} />;
    return null;
  }, [tag, fields, events]);

  const info = COSPLAY_POST_TAGS[tag];
  const q = search.trim().toLowerCase();
  const visible = (posts ?? []).filter((p) => {
    if (tag === 'galleria') {
      if (fonte && p.extra?.fonte_serie !== fonte) return false;
      if (q && !`${p.extra?.personaggio ?? ''} ${p.extra?.serie ?? ''} ${p.extra?.fotografo ?? ''}`.toLowerCase().includes(q)) return false;
    }
    if (tag === 'discussione' && topic && !(p.testo ?? '').toLowerCase().includes(topic.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <PostComposer
        user={user}
        onOpenAuth={onOpenAuth}
        onSubmit={createPost}
        placeholder={topic && tag === 'discussione' ? `${topic}: ${PLACEHOLDERS.discussione}` : PLACEHOLDERS[tag]}
        submitLabel={tag === 'galleria' ? 'Pubblica foto' : tag === 'wip' ? 'Pubblica WIP' : 'Pubblica'}
        mondo="nerd"
        placementCategory={COSPLAY_CATEGORY_ID}
        allowEmptyText={tag === 'galleria' || tag === 'wip'}
      >
        {fieldsNode}
        {fieldsError && <p className="rb-gaming-error" role="alert">{fieldsError}</p>}
      </PostComposer>

      {tag === 'galleria' && (
        <div className="rb-gaming-head">
          <div className="rb-gaming-filters" role="group" aria-label="Fonte della serie">
            <button type="button" className={fonte === null ? 'is-active' : ''} onClick={() => setFonte(null)}>Tutte</button>
            {Object.entries(FONTE_SERIE).map(([k, f]) => (
              <button key={k} type="button" className={fonte === k ? 'is-active' : ''} onClick={() => setFonte((v) => (v === k ? null : k))}>{f.icon} {f.label}</button>
            ))}
          </div>
          <input
            type="search"
            className="rb-lfg-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Serie o personaggio…"
            aria-label="Cerca nella galleria"
            style={{ flex: 1, minWidth: 140, padding: '8px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#f5f5f7' }}
          />
        </div>
      )}
      {tag === 'discussione' && (
        <div className="rb-gaming-filters rb-ccom-topics" role="group" aria-label="Argomenti">
          {COMMUNITY_TOPICS.map((t) => (
            <button key={t} type="button" className={topic === t ? 'is-active' : ''} onClick={() => setTopic((v) => (v === t ? null : t))}>{t}</button>
          ))}
        </div>
      )}

      {error && <p className="rb-gaming-error" role="alert">{error}</p>}

      {posts === null ? (
        <Skeleton lines={4} />
      ) : tag === 'galleria' ? (
        <GalleriaGrid posts={visible} onOpen={setViewer} />
      ) : visible.length === 0 ? (
        <EmptyState icon={info?.icon ?? '💬'} title={posts.length === 0 ? `Nessun post in ${info?.label ?? 'questa scheda'}` : 'Niente con questo filtro'} subtitle={posts.length === 0 ? 'Sii il primo a scrivere.' : 'Prova un altro argomento.'} />
      ) : (
        <ul className="rb-gaming-posts">
          {visible.map((post) => (
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

      {viewer && (
        <Lightbox
          src={viewer.mediaUrl}
          kind="image"
          nome={[viewer.extra?.personaggio, viewer.extra?.serie].filter(Boolean).join(' · ') || 'Cosplay'}
          caption={`${[viewer.extra?.personaggio, viewer.extra?.serie].filter(Boolean).join(' · ')}${viewer.extra?.fotografo ? ` · 📷 ${viewer.extra.fotografo}` : ''} — ${viewer.author?.name ?? 'Utente'}${viewer.testo ? ` — ${viewer.testo}` : ''}`}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}
