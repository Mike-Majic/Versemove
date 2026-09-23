import { useState } from 'react';
import { formatRelativeDate } from './resolveAuthor';
import LinkPreview from './LinkPreview';
import PostComposer from './PostComposer';
import ReportModal from '../shared/ReportModal';
import TranslateHint from '../shared/TranslateHint';
import { isStaff } from '../../data/roles';
import './PostCard.css';

const REACTION_EMOJIS = ['❤️', '😂', '👍'];

// GIF salvate come URL (niente vero upload su server per le GIF): se quel
// link smette di funzionare (CDN, scadenza, rete) l'utente deve vedere un
// avviso chiaro, non un'area vuota senza spiegazione.
function MediaImage({ src, alt, errorText, className }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <p className="rb-gif-load-error">⚠️ {errorText}</p>;
  }
  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />;
}

function Comment({ comment, user, onReact, onReport, onDelete }) {
  const author = comment.author ?? { name: 'Utente', avatar: '' };
  const isOwn = user && comment.autoreId === user.id;
  const canModerate = !isOwn && isStaff(user?.ruolo);
  return (
    <li className="rb-comment">
      <img className="rb-comment-avatar" src={author.avatar} alt={author.name} />
      <div className="rb-comment-body">
        <div className="rb-comment-bubble">
          <strong>{author.name}</strong>
          <p>{comment.testo}</p>
          {comment.gif && (
            <MediaImage className="rb-comment-gif" src={comment.gif} alt="GIF" errorText="GIF non disponibile (il link non si è caricato)" />
          )}
        </div>
        <div className="rb-comment-footer">
          <span className="rb-comment-date">{formatRelativeDate(comment.data)}</span>
          {REACTION_EMOJIS.map((emoji) => {
            const count = comment.reazioni?.[emoji] ?? 0;
            return (
              <button key={emoji} type="button" className="rb-comment-react-btn" onClick={() => onReact(comment.id, emoji)}>
                {emoji} {count > 0 ? count : ''}
              </button>
            );
          })}
          {isOwn && onDelete && (
            <button type="button" className="rb-comment-react-btn" title="Elimina commento" onClick={() => onDelete(comment.id)}>
              🗑️
            </button>
          )}
          {canModerate && onDelete && (
            <button type="button" className="rb-comment-react-btn" title="Rimuovi commento (moderazione)" onClick={() => onDelete(comment.id)}>
              🛡️
            </button>
          )}
          {onReport && (
            <button
              type="button"
              className="rb-comment-react-btn"
              title="Segnala commento"
              onClick={() => onReport(comment.id)}
            >
              🚩
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

// Una card del feed: autore, testo, GIF/link eventuali, like e commenti.
// "commentabile da chiunque" = chiunque usi l'app può leggere/commentare
// (feed pubblico), ma mettere like o commentare richiede di essere
// loggati — coerente con come l'app già gestisce le altre interazioni.
export default function PostCard({
  post,
  comments,
  user,
  onOpenAuth,
  onToggleLike,
  onToggleContentLike,
  onAddComment,
  onReactToComment,
  onDeleteComment,
  trendingRank = null,
  following = [],
  onToggleFollow,
  saved = false,
  onToggleSave,
  onOpenGroup,
  onEditPost,
  onDeletePost,
}) {
  const [expanded, setExpanded] = useState(false);
  const [report, setReport] = useState(null); // { targetType, targetId, targetLabel } | null
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(post.testo);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const author = post.author ?? { name: 'Utente', avatar: '' };
  const isOwn = Boolean(user) && post.autoreId === user.id;
  const canModeratePost = !isOwn && isStaff(user?.ruolo);
  // I post con foto/video autotaggato hanno un contentId condiviso con le
  // altre posizioni dello stesso contenuto (Arte, Nerd, ecc): il like passa
  // dal conteggio comune (content_likes), non dall'array locale mi_piace.
  const hasSharedContent = Boolean(post.contentId);
  const liked = hasSharedContent ? post.contentLiked : Boolean(user) && post.mi_piace.includes(user.id);
  const likeCount = hasSharedContent ? post.contentLikeCount : post.mi_piace.length;
  const postComments = comments.filter((c) => c.post_id === post.id);
  const group = post.group ?? null;
  // Il pulsante Segui ha senso solo sui post di altri utenti reali, mai sui
  // propri.
  const canFollow = Boolean(onToggleFollow) && !isOwn;
  const isFollowing = canFollow && following.includes(post.autoreId);

  const handleLike = () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (hasSharedContent) onToggleContentLike(post);
    else onToggleLike(post.id);
  };

  const handleFollow = () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    onToggleFollow(post.autoreId);
  };

  const handleSave = () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    onToggleSave(post.id);
  };

  const startEdit = () => {
    setEditText(post.testo);
    setEditing(true);
  };

  const saveEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed && !post.gif && !post.mediaUrl) return;
    onEditPost(post.id, trimmed);
    setEditing(false);
  };

  const confirmDeletePost = () => {
    onDeletePost(post.id);
    setConfirmDelete(false);
  };

  const openReportPost = () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setReport({ targetType: 'post', targetId: post.id, targetLabel: 'post' });
  };

  const openReportComment = (commentId) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setReport({ targetType: 'commento', targetId: commentId, targetLabel: 'commento' });
  };

  return (
    <li className="rb-post-card">
      {trendingRank !== null && (
        <span className="rb-post-trending-badge">🔥 #{trendingRank} di tendenza nel mondo Social</span>
      )}
      <div className="rb-post-header">
        <img className="rb-post-avatar" src={author.avatar} alt={author.name} />
        <div className="rb-post-header-info">
          <strong>{author.name}</strong>
          <span className="rb-post-date">{formatRelativeDate(post.data)}</span>
        </div>
        {canFollow && (
          <button type="button" className={`rb-post-follow-btn ${isFollowing ? 'active' : ''}`} onClick={handleFollow}>
            {isFollowing ? 'Segui già' : '+ Segui'}
          </button>
        )}
      </div>

      {group && (
        <button
          type="button"
          className="rb-post-group-badge"
          style={{ '--group-color': group.color }}
          onClick={() => onOpenGroup?.(group.id)}
        >
          {group.icon} {group.name}
        </button>
      )}

      {editing ? (
        <div className="rb-post-edit-box">
          <textarea
            className="rb-post-edit-textarea"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
          />
          <div className="rb-post-edit-actions">
            <button type="button" className="rb-post-edit-cancel" onClick={() => setEditing(false)}>Annulla</button>
            <button type="button" className="rb-post-edit-save" onClick={saveEdit}>Salva</button>
          </div>
        </div>
      ) : (
        <>
          <p className="rb-post-text">{post.testo}</p>
          {post.autoreId !== user?.id && <TranslateHint text={post.testo} sourceLang={post.lingua} />}
        </>
      )}
      {post.gif && (
        <MediaImage className="rb-post-gif" src={post.gif} alt="GIF" errorText="GIF non disponibile (il link non si è caricato)" />
      )}
      {post.mediaUrl && post.mediaType === 'video' && (
        <video className="rb-post-video" src={post.mediaUrl} controls />
      )}
      {post.mediaUrl && post.mediaType === 'foto' && (
        <MediaImage className="rb-post-photo" src={post.mediaUrl} alt="Foto" errorText="Foto non disponibile" />
      )}
      {post.contentTags?.length > 0 && (
        <p className="rb-post-photo-tags">{post.contentTags.map((t) => `#${t}`).join(' ')}</p>
      )}
      {post.link_esterno && <LinkPreview url={post.link_esterno.url} />}

      <div className="rb-post-actions">
        <button type="button" className={`rb-post-action-btn ${liked ? 'active' : ''}`} onClick={handleLike}>
          {liked ? '❤️' : '🤍'} {likeCount}
        </button>
        <button type="button" className="rb-post-action-btn" onClick={() => setExpanded((v) => !v)}>
          💬 {postComments.length}
        </button>
        {onToggleSave && (
          <button type="button" className={`rb-post-action-btn rb-post-save-btn ${saved ? 'active' : ''}`} onClick={handleSave}>
            {saved ? '🔖 Salvato' : '🔖 Salva'}
          </button>
        )}
        {isOwn && onEditPost && (
          <button type="button" className="rb-post-action-btn" title="Modifica post" onClick={startEdit}>
            ✏️
          </button>
        )}
        {(isOwn || canModeratePost) && onDeletePost && !confirmDelete && (
          <button
            type="button"
            className="rb-post-action-btn"
            title={isOwn ? 'Elimina post' : 'Rimuovi post (moderazione)'}
            onClick={() => setConfirmDelete(true)}
          >
            {isOwn ? '🗑️' : '🛡️'}
          </button>
        )}
        {(isOwn || canModeratePost) && onDeletePost && confirmDelete && (
          <span className="rb-post-delete-confirm">
            {isOwn ? 'Eliminare?' : 'Rimuovere questo post?'}
            <button type="button" className="rb-post-delete-confirm-yes" onClick={confirmDeletePost}>Sì</button>
            <button type="button" className="rb-post-delete-confirm-no" onClick={() => setConfirmDelete(false)}>No</button>
          </span>
        )}
        <button type="button" className="rb-post-action-btn" title="Segnala post" onClick={openReportPost}>
          🚩
        </button>
      </div>

      {expanded && (
        <div className="rb-post-comments">
          {postComments.length > 0 && (
            <ul className="rb-comment-list">
              {postComments.map((c) => (
                <Comment
                  key={c.id}
                  comment={c}
                  user={user}
                  onReact={onReactToComment}
                  onReport={openReportComment}
                  onDelete={onDeleteComment}
                />
              ))}
            </ul>
          )}
          <PostComposer
            user={user}
            onOpenAuth={onOpenAuth}
            onSubmit={(data) => onAddComment(post.id, data)}
            placeholder="Scrivi un commento..."
            submitLabel="Commenta"
            compact
          />
        </div>
      )}

      {report && (
        <ReportModal
          targetType={report.targetType}
          targetId={report.targetId}
          targetLabel={report.targetLabel}
          onClose={() => setReport(null)}
        />
      )}
    </li>
  );
}
