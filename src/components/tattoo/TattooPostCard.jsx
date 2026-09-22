import { useState } from 'react';
import { toggleLike, listComments, addComment, rateStudio } from '../../data/tattoo';
import ReportModal from '../shared/ReportModal';

const REPORT_MOTIVI = ['Nudità', 'Contenuto offensivo', 'Non è una mia foto', 'Spam o pubblicità', 'Altro'];

function Stars({ value, onRate, size = 16 }) {
  return (
    <span className="rb-tattoo-stars" style={{ fontSize: size }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`rb-tattoo-star ${value >= n ? 'filled' : ''} ${onRate ? 'interactive' : ''}`}
          onClick={onRate ? () => onRate(n) : undefined}
          disabled={!onRate}
          aria-label={`${n} stelle`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// Card di un tatuaggio: carosello foto (fino a 6), dati del tattoo/studio,
// like/commenti (stesso pattern ottimista di DealCard nel mondo Vetrina),
// voto a stelle allo STUDIO (separato dal voto che l'autore ha già dato al
// proprio lavoro in fase di pubblicazione), Segnala con motivi dedicati.
export default function TattooPostCard({ post, user, onOpenAuth, fullscreen = false, onClose }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [liked, setLiked] = useState(post.piaceAMe);
  const [nLike, setNLike] = useState(post.nLike);
  const [commentsOpen, setCommentsOpen] = useState(fullscreen);
  const [comments, setComments] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [myStudioVote, setMyStudioVote] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);

  const handleLike = async () => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const prevLiked = liked;
    setLiked(!prevLiked);
    setNLike((n) => n + (prevLiked ? -1 : 1));
    const { error } = await toggleLike(post.id, prevLiked);
    if (error) {
      setLiked(prevLiked);
      setNLike(post.nLike);
    }
  };

  const toggleComments = async () => {
    const opening = !commentsOpen;
    setCommentsOpen(opening);
    if (opening && comments === null) setComments(await listComments(post.id));
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth?.();
      return;
    }
    if (!commentDraft.trim()) return;
    const { error } = await addComment(post.id, commentDraft);
    if (error) return;
    setCommentDraft('');
    setComments(await listComments(post.id));
  };

  const handleRateStudio = async (voto) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    setMyStudioVote(voto);
    await rateStudio(post.studioId, voto);
  };

  return (
    <li className={`rb-tattoo-card ${fullscreen ? 'fullscreen' : ''}`}>
      {fullscreen && (
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
      )}
      <div className="rb-tattoo-carousel">
        {post.foto[photoIndex] ? <img src={post.foto[photoIndex]} alt="" /> : <div className="rb-tattoo-photo-empty">🖋️</div>}
        {post.foto.length > 1 && (
          <>
            <button
              type="button"
              className="rb-tattoo-carousel-nav prev"
              onClick={() => setPhotoIndex((i) => (i - 1 + post.foto.length) % post.foto.length)}
            >
              ‹
            </button>
            <button
              type="button"
              className="rb-tattoo-carousel-nav next"
              onClick={() => setPhotoIndex((i) => (i + 1) % post.foto.length)}
            >
              ›
            </button>
            <span className="rb-tattoo-carousel-dots">
              {post.foto.map((_, i) => (
                <span key={i} className={i === photoIndex ? 'active' : ''} />
              ))}
            </span>
          </>
        )}
      </div>

      <div className="rb-tattoo-info">
        <div className="rb-tattoo-tags">
          {post.stile && <span className="rb-tattoo-tag">{post.stile}</span>}
          {post.parteCorpo && <span className="rb-tattoo-tag">{post.parteCorpo}</span>}
          <span className="rb-tattoo-tag">{post.colore ? 'Colore' : 'Bianco e nero'}</span>
          {post.dimensione && <span className="rb-tattoo-tag">{post.dimensione}</span>}
        </div>

        <div className="rb-tattoo-studio-line">
          {post.artistaNome && <strong>{post.artistaNome}</strong>}
          {post.studioNome && <span> · {post.studioNome}</span>}
          {post.studioCitta && <span className="rb-tattoo-citta"> · {post.studioCitta}</span>}
        </div>

        {post.voto != null && (
          <div className="rb-tattoo-author-vote">
            L'autore ha dato <Stars value={post.voto} /> a questo lavoro
          </div>
        )}

        {post.testo && <p className="rb-tattoo-testo">{post.testo}</p>}
        {post.prezzoIndicativo != null && (
          <p className="rb-tattoo-prezzo">Prezzo indicativo: {post.prezzoIndicativo}€</p>
        )}

        <div className="rb-tattoo-studio-rate">
          <span>Voto allo studio:</span>
          <Stars value={myStudioVote} onRate={handleRateStudio} />
        </div>

        <div className="rb-tattoo-actions">
          <button type="button" className={`rb-tattoo-like-btn ${liked ? 'active' : ''}`} onClick={handleLike}>
            {liked ? '❤️' : '🤍'} {nLike}
          </button>
          <button type="button" className="rb-tattoo-comments-btn" onClick={toggleComments}>
            💬 {comments?.length ?? post.nCommenti}
          </button>
          <button type="button" className="rb-tattoo-report-btn" onClick={() => setReportOpen(true)}>
            Segnala
          </button>
        </div>

        {commentsOpen && (
          <div className="rb-tattoo-comments">
            {comments === null ? (
              <p className="rb-tattoo-comments-loading">Caricamento commenti…</p>
            ) : comments.length === 0 ? (
              <p className="rb-tattoo-comments-empty">Ancora nessun commento.</p>
            ) : (
              <ul>
                {comments.map((c) => (
                  <li key={c.id}>
                    <strong>{c.authorName}</strong> {c.testo}
                  </li>
                ))}
              </ul>
            )}
            <form className="rb-tattoo-comment-form" onSubmit={submitComment}>
              <input
                type="text"
                placeholder={user ? 'Scrivi un commento…' : 'Accedi per commentare'}
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                disabled={!user}
              />
              <button type="submit" disabled={!user || !commentDraft.trim()}>
                Invia
              </button>
            </form>
          </div>
        )}
      </div>

      {reportOpen && (
        <ReportModal
          targetType="tattoo_post"
          targetId={post.id}
          targetLabel="questa foto"
          motivi={REPORT_MOTIVI}
          onClose={() => setReportOpen(false)}
        />
      )}
    </li>
  );
}
