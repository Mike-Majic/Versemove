import { useEffect, useRef, useState } from 'react';
import { useBackLayer } from '../../hooks/useBackLayer';
import {
  listClips,
  publishClip,
  deleteClip,
  toggleClipLike,
  toggleClipSave,
  listClipComments,
  addClipComment,
} from '../../data/musicClips';
import { compressVideoClip, isCompressionSupported } from '../../data/videoCompress';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import './MusicaClip.css';

const MAX_DURATION_SEC = 60;

function CommentsSheet({ clipId, onClose }) {
  const [comments, setComments] = useState(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    listClipComments(clipId).then(setComments);
  }, [clipId]);

  const post = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    const { comment, error } = await addClipComment(clipId, text);
    setPosting(false);
    if (error || !comment) return;
    setComments((prev) => [...(prev ?? []), comment]);
    setText('');
  };

  return (
    <div className="rb-clip-comments-overlay" onClick={onClose}>
      <div className="rb-clip-comments-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rb-clip-comments-header">
          <strong>Commenti</strong>
          <button type="button" onClick={onClose} aria-label="Chiudi">✕</button>
        </div>
        <ul className="rb-clip-comments-list">
          {comments === null && (
            <li aria-hidden="true">
              <Skeleton lines={2} />
            </li>
          )}
          {comments?.length === 0 && (
            <li>
              <EmptyState icon="💬" title="Nessun commento ancora" subtitle="Il primo sei tu." />
            </li>
          )}
          {comments?.map((c) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
        <div className="rb-clip-comments-form">
          <input
            type="text"
            placeholder="Scrivi un commento..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === 'Enter') post();
            }}
          />
          <button type="button" onClick={post} disabled={!text.trim() || posting}>Invia</button>
        </div>
      </div>
    </div>
  );
}

function ClipCard({ clip, user, onOpenAuth, onLike, onSave, onDelete, isFullscreen, onToggleFullscreen }) {
  const [showComments, setShowComments] = useState(false);
  const videoRef = useRef(null);

  const requireAuth = (fn) => (...args) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    fn(...args);
  };

  const share = async () => {
    const shareUrl = clip.url;
    if (navigator.share) {
      try {
        await navigator.share({ title: clip.caption || 'Clip Versemove', url: shareUrl });
        return;
      } catch {
        // Condivisione annullata dall'utente: nessun errore da mostrare.
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Niente clipboard disponibile: non c'è altro da fare in silenzio.
    }
  };

  return (
    <li className={`rb-clip-card ${isFullscreen ? 'rb-clip-card-fullscreen' : ''}`}>
      <video ref={videoRef} className="rb-clip-video" src={clip.url} loop playsInline controls={false}
        onClick={(e) => {
          if (e.currentTarget.paused) e.currentTarget.play();
          else e.currentTarget.pause();
        }}
      />

      <div className="rb-clip-actions">
        <button type="button" className={`rb-clip-action ${clip.likedByMe ? 'active' : ''}`} onClick={requireAuth(() => onLike(clip))}>
          <span>{clip.likedByMe ? '❤️' : '🤍'}</span>
          <small>{clip.likeCount}</small>
        </button>
        <button type="button" className="rb-clip-action" onClick={() => setShowComments(true)}>
          <span>💬</span>
          <small>{clip.commentCount}</small>
        </button>
        <button type="button" className={`rb-clip-action ${clip.savedByMe ? 'active' : ''}`} onClick={requireAuth(() => onSave(clip))}>
          <span>{clip.savedByMe ? '🔖' : '📑'}</span>
          <small>Salva</small>
        </button>
        <button type="button" className="rb-clip-action" onClick={share}>
          <span>🔗</span>
          <small>Condividi</small>
        </button>
        <button type="button" className="rb-clip-action" onClick={onToggleFullscreen}>
          <span>{isFullscreen ? '⛶' : '⛶'}</span>
          <small>{isFullscreen ? 'Esci' : 'A schermo intero'}</small>
        </button>
        {clip.isMine && (
          <button type="button" className="rb-clip-action" onClick={() => onDelete(clip)}>
            <span>🗑️</span>
            <small>Elimina</small>
          </button>
        )}
      </div>

      <div className="rb-clip-info">
        {clip.caption && <p>{clip.caption}</p>}
      </div>

      {showComments && <CommentsSheet clipId={clip.id} onClose={() => setShowComments(false)} />}
    </li>
  );
}

function UploadForm({ user, onOpenAuth, onPublished, onCancel }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [caption, setCaption] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const openPicker = () => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    fileInputRef.current?.click();
  };

  const onFileChosen = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError('');
  };

  const publish = async () => {
    if (!file || processing) return;
    setProcessing(true);
    setError('');
    try {
      let blob = file;
      try {
        blob = await compressVideoClip(file, { maxDurationSec: MAX_DURATION_SEC, maxHeight: 720 });
      } catch (compressErr) {
        if (compressErr.message !== 'unsupported') throw compressErr;
        // Browser senza captureStream/MediaRecorder: si carica il file
        // originale così com'è, meglio di bloccare del tutto la pubblicazione.
      }
      const { clip, error: publishError } = await publishClip({ blob, caption: caption.trim() });
      if (publishError) {
        setError(publishError);
        return;
      }
      onPublished(clip);
    } catch {
      setError('Impossibile preparare la clip. Riprova con un altro video.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="rb-clip-upload-overlay" onClick={onCancel}>
      <div className="rb-clip-upload-form" onClick={(e) => e.stopPropagation()}>
        <div className="rb-clip-upload-header">
          <strong>Nuova clip</strong>
          <button type="button" onClick={onCancel} aria-label="Chiudi">✕</button>
        </div>
        <p className="rb-clip-upload-note">Massimo {MAX_DURATION_SEC} secondi — viene tagliata e compressa automaticamente prima di essere caricata.</p>
        {!isCompressionSupported() && (
          <p className="rb-clip-upload-note rb-clip-upload-warn">Il tuo browser non supporta la compressione automatica: il video verrà caricato così com'è.</p>
        )}

        <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={onFileChosen} />

        {!previewUrl ? (
          <button type="button" className="rb-clip-upload-pick-btn" onClick={openPicker}>🎬 Scegli un video</button>
        ) : (
          <>
            <video className="rb-clip-upload-preview" src={previewUrl} controls />
            <input
              type="text"
              placeholder="Didascalia (facoltativa)"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={200}
            />
            {error && <p className="rb-clip-upload-error">⚠️ {error}</p>}
            <div className="rb-clip-upload-actions">
              <button type="button" onClick={onCancel}>Annulla</button>
              <button type="button" className="rb-clip-upload-publish" onClick={publish} disabled={processing}>
                {processing ? 'Preparazione...' : 'Pubblica'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Feed verticale in stile "clip brevi", scroll uno alla volta: solo clip
// caricate dalla community (data/musicClips.js), non video di YouTube — qui
// sono sempre l'originale intero (già tagliato a 60s in fase di upload), non
// un'anteprima di qualcos'altro.
export default function MusicaClip({ user, onOpenAuth }) {
  const [clips, setClips] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [fullscreenId, setFullscreenId] = useState(null);
  useBackLayer(fullscreenId !== null, () => setFullscreenId(null), 'viewer:clip');

  const refresh = () => listClips().then(setClips);
  useEffect(refresh, []);

  const handleLike = async (clip) => {
    const { liked, error } = await toggleClipLike(clip.id, clip.likedByMe);
    if (error) return;
    setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, likedByMe: liked, likeCount: c.likeCount + (liked ? 1 : -1) } : c)));
  };

  const handleSave = async (clip) => {
    const { saved, error } = await toggleClipSave(clip.id, clip.savedByMe);
    if (error) return;
    setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, savedByMe: saved } : c)));
  };

  const handleDelete = async (clip) => {
    const { error } = await deleteClip(clip.id, clip.storagePath);
    if (error) return;
    setClips((prev) => prev.filter((c) => c.id !== clip.id));
  };

  return (
    <div className="rb-clip-feed-wrap">
      {clips === null ? (
        <div className="rb-clip-skeleton-list" aria-hidden="true">
          <Skeleton lines={2} />
          <Skeleton lines={2} />
        </div>
      ) : clips.length === 0 ? (
        <div className="rb-clip-empty">
          <EmptyState icon="🎬" title="Nessuna clip ancora" subtitle="Sii il primo a caricarne una." />
        </div>
      ) : (
        <ul className="rb-clip-feed">
          {clips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              user={user}
              onOpenAuth={onOpenAuth}
              onLike={handleLike}
              onSave={handleSave}
              onDelete={handleDelete}
              isFullscreen={fullscreenId === clip.id}
              onToggleFullscreen={() => setFullscreenId((id) => (id === clip.id ? null : clip.id))}
            />
          ))}
        </ul>
      )}

      <button type="button" className="rb-clip-fab" onClick={() => (user ? setShowUpload(true) : onOpenAuth?.())} aria-label="Carica clip" title="Carica clip">+</button>

      {showUpload && (
        <UploadForm
          user={user}
          onOpenAuth={onOpenAuth}
          onCancel={() => setShowUpload(false)}
          onPublished={(clip) => {
            setShowUpload(false);
            setClips((prev) => [clip, ...(prev ?? [])]);
          }}
        />
      )}
    </div>
  );
}
