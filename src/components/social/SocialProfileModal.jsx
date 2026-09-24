import { useEffect, useState } from 'react';
import ModalOverlay from '../ModalOverlay';
import PostCard from './PostCard';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import {
  fetchFeed,
  fetchComments,
  fetchProfilesMap,
  togglePostLike as togglePostLikeApi,
  toggleSavedPost as toggleSavedPostApi,
  addComment as addCommentApi,
} from '../../data/posts';
import { toggleContentLike as toggleContentLikeApi } from '../../data/contents';
import './SocialProfileModal.css';

// Profilo pubblico di un altro utente: avatar/nickname + i suoi post nel
// mondo Social (stessa PostCard del feed principale, per coerenza visiva e
// per poter mettere like/commentare/salvare anche da qui). A differenza del
// feed, dopo ogni azione si ricarica tutto da capo invece di aggiornare lo
// stato a mano: qui non serve la stessa reattività ottimistica del feed
// principale, ed evita di duplicarne la logica di sincronizzazione.
export default function SocialProfileModal({ userId, user, following, onToggleFollow, onOpenAuth, onClose }) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState(null);
  const [comments, setComments] = useState([]);
  const [error, setError] = useState('');

  const reload = async () => {
    const [profilesMap, feedRes] = await Promise.all([
      fetchProfilesMap([userId]),
      fetchFeed({ mondo: 'social', authorId: userId }),
    ]);
    setProfile(profilesMap.get(userId) ?? null);
    const list = feedRes.posts ?? [];
    setPosts(list);
    const { comments: c } = await fetchComments(list.map((p) => p.id));
    setComments(c ?? []);
  };

  useEffect(() => {
    setPosts(null);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const isFollowing = following.includes(userId);

  const handleToggleLike = async (postId) => {
    if (!user) return onOpenAuth();
    const target = posts.find((p) => p.id === postId);
    const { error: err } = await togglePostLikeApi(postId, target?.mi_piace.includes(user.id));
    if (err) { setError(err); return; }
    reload();
  };

  const handleToggleContentLike = async (post) => {
    if (!user) return onOpenAuth();
    const { error: err } = await toggleContentLikeApi(post.contentId, post.contentLiked);
    if (err) { setError(err); return; }
    reload();
  };

  const handleToggleSave = async (postId) => {
    if (!user) return onOpenAuth();
    const target = posts.find((p) => p.id === postId);
    const { error: err } = await toggleSavedPostApi(postId, target?.savedByMe);
    if (err) { setError(err); return; }
    reload();
  };

  const handleAddComment = async (postId, { testo, gif }) => {
    if (!user) return onOpenAuth();
    const { error: err } = await addCommentApi({ postId, testo, gif });
    if (err) { setError(err); return; }
    reload();
  };

  // Reazioni emoji ai commenti: solo un contatore locale, stessa scelta del
  // feed principale (nessuna tabella per salvarle condivise).
  const handleReactToComment = (commentId, emoji) => {
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const current = c.reazioni?.[emoji] ?? 0;
        return { ...c, reazioni: { ...c.reazioni, [emoji]: current + 1 } };
      })
    );
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-social-profile-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>

        {!profile ? (
          <Skeleton lines={4} />
        ) : (
          <>
            <div className="rb-social-profile-head">
              <img src={profile.avatar} alt={profile.name} />
              <div>
                <strong>{profile.name}</strong>
              </div>
              <button
                type="button"
                className={`rb-social-profile-follow-btn ${isFollowing ? 'active' : ''}`}
                onClick={() => (user ? onToggleFollow(userId) : onOpenAuth())}
              >
                {isFollowing ? 'Segui già' : '+ Segui'}
              </button>
            </div>

            {error && <p className="rb-giochi-error">{error}</p>}

            {posts === null ? (
              <Skeleton lines={3} />
            ) : posts.length === 0 ? (
              <EmptyState icon="📭" title="Nessun post ancora" subtitle={`${profile.name} non ha ancora pubblicato nulla nel mondo Social.`} />
            ) : (
              <ul className="rb-social-profile-posts">
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
                    saved={post.savedByMe}
                    onToggleSave={handleToggleSave}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </ModalOverlay>
  );
}
