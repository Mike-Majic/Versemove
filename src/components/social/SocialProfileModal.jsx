import { useEffect, useState } from 'react';
import ShareLinkButton from '../shared/ShareLinkButton';
import { linkToProfile } from '../../data/deepLinks';
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
  applyCommentReaction,
  toggleCommentReaction,
} from '../../data/posts';
import { toggleContentLike as toggleContentLikeApi } from '../../data/contents';
import { getFamily, familyRelationLabel } from '../../data/family';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { fetchGamertagsMap } from '../../data/gaming';
import GamertagChips from '../shared/GamertagChips';
import './SocialProfileModal.css';

const GENDER_LABELS = { uomo: 'Uomo', donna: 'Donna', non_binario: 'Non binario', preferisco_non_dire: 'Preferisco non dire' };
const STATO_LABELS = {
  single: 'Single',
  fidanzato_a: 'Fidanzato/a',
  sposato_a: 'Sposato/a',
  unione_civile: 'Unione civile',
  convivente: 'Convivente',
  complicato: "È complicato",
};

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
  const [family, setFamily] = useState([]);
  // Gamertag: i miei dal mio profilo, quelli degli altri dalla vista
  // pubblica (vedi fetchGamertagsMap).
  const [gamertags, setGamertags] = useState(null);
  const [error, setError] = useState('');

  const reload = async () => {
    const [profilesMap, feedRes, familyList, tagsMap] = await Promise.all([
      fetchProfilesMap([userId]),
      fetchFeed({ mondo: 'social', authorId: userId }),
      getFamily(userId),
      user?.id === userId ? Promise.resolve(new Map([[userId, user.gamertags ?? {}]])) : fetchGamertagsMap([userId]),
    ]);
    setProfile(profilesMap.get(userId) ?? null);
    setFamily(familyList);
    setGamertags(tagsMap.get(userId) ?? null);
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

  const handleAddComment = async (postId, { testo, gif, menzioni }) => {
    if (!user) return onOpenAuth();
    const { error: err } = await addCommentApi({ postId, testo, gif, menzioni });
    if (err) { setError(err); return; }
    reload();
  };

  // Reazioni ai commenti: salvate in comment_reactions.
  const handleReactToComment = async (commentId, emoji) => {
    if (!user) {
      onOpenAuth();
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
                {profile.citta && <span className="rb-social-profile-city">{profile.citta}</span>}
              </div>
              <button
                type="button"
                className={`rb-social-profile-follow-btn ${isFollowing ? 'active' : ''}`}
                onClick={() => (user ? onToggleFollow(userId) : onOpenAuth())}
              >
                {isFollowing ? 'Segui già' : '+ Segui'}
              </button>
              {profile.nickname && (
                <ShareLinkButton
                  className="rb-social-profile-follow-btn"
                  url={() => linkToProfile(profile.nickname)}
                  title={`${profile.name} su Versemove`}
                  label="🔗"
                  copiedLabel="✓"
                  ariaLabel="Condividi il link del profilo"
                />
              )}
            </div>

            {profile.bio && <p className="rb-social-profile-bio">{profile.bio}</p>}
            <GamertagChips gamertags={gamertags} />

            {(profile.cittaOrigine || profile.statoRelazionale || profile.genere || profile.pronomi || profile.zodiaco || profile.lingueParlate?.length > 0) && (
              <ul className="rb-social-profile-info-list">
                {profile.cittaOrigine && <li>🏠 Di {profile.cittaOrigine}</li>}
                {profile.zodiaco && <li>{profile.zodiaco.emoji} {profile.zodiaco.name}</li>}
                {profile.statoRelazionale && <li>💞 {STATO_LABELS[profile.statoRelazionale] ?? profile.statoRelazionale}</li>}
                {(profile.genere || profile.pronomi) && (
                  <li>
                    ⚧ {GENDER_LABELS[profile.genere] ?? profile.genere}{profile.pronomi ? ` · ${profile.pronomi}` : ''}
                  </li>
                )}
                {profile.lingueParlate?.length > 0 && (
                  <li>
                    🗣️ {profile.lingueParlate.map((code) => SUPPORTED_LANGUAGES.find((l) => l.code === code)?.nativeLabel ?? code).join(', ')}
                  </li>
                )}
              </ul>
            )}

            {family.length > 0 && (
              <div className="rb-social-profile-family">
                <span className="rb-social-profile-family-title">Familiari</span>
                <ul className="rb-social-profile-family-list">
                  {family.map((f) => (
                    <li key={f.linkId}>
                      <img src={f.other.avatar || undefined} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                      <span>{f.other.name}</span>
                      <span className="rb-social-profile-family-relation">{familyRelationLabel(f.relazione)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
