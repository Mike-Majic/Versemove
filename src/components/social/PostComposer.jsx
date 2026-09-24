import { useEffect, useState } from 'react';
import Icon from '../shared/Icon';
import EmojiPicker from './EmojiPicker';
import GifPicker from './GifPicker';
import MentionInput from '../shared/MentionInput';
import { mentionIdsInText } from '../../data/mentions';
import { publishContent } from '../../data/contents';
import { analyzeImageElement, extractVideoFrame } from '../../data/localVision';
import './PostComposer.css';

// Composer riusato sia per scrivere un nuovo post sia per scrivere un
// commento (compact=true): testo obbligatorio (o almeno una GIF/foto/video),
// emoji e GIF tramite i due picker della Fase A. Niente pulsante/campo link
// separato: se il testo contiene un URL, come su Discord, viene rilevato da
// solo e mostrato con un'anteprima sotto al messaggio (vedi LinkPreview),
// restando comunque visibile per intero nel testo del post.

const URL_REGEX = /(https?:\/\/[^\s]+)/i;
function extractFirstUrl(text) {
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function loadVideoElement(src) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.onloadeddata = () => resolve(video);
    video.onerror = reject;
    video.src = src;
    video.load();
  });
}

// Chiave che identifica un posizionamento (mondo + categoria + sottofamiglia)
// per confrontare/selezionare i suggerimenti, senza confonderne due diversi.
function placementKey(p) {
  return `${p.world}:${p.category ?? ''}:${p.subfamily ?? ''}`;
}
export default function PostComposer({
  user,
  onOpenAuth,
  onSubmit,
  placeholder = 'A cosa stai pensando?',
  submitLabel = 'Pubblica',
  compact = false,
  // Passato solo dal composer principale del feed (non da quello dei
  // commenti): permette di scegliere se pubblicare in bacheca generale o
  // in uno dei gruppi, come iscriversi/postare in un subreddit.
  groups = null,
  defaultGroupId = null,
}) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState([]);
  const [gif, setGif] = useState(null);
  const [gifLoadFailed, setGifLoadFailed] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [groupId, setGroupId] = useState(defaultGroupId);

  // Foto/video da caricare nel mondo Blu (solo composer principale, non
  // quello dei commenti): con analisi gratuita nel browser che suggerisce
  // tag e in quali altri mondi/categoria ripubblicare lo stesso contenuto
  // (like condivisi, mai duplicati — vedi data/contents.js).
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaType, setMediaType] = useState(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [suggestedPlacements, setSuggestedPlacements] = useState([]);
  const [confirmedPlacements, setConfirmedPlacements] = useState(new Set());
  const [manualTagsText, setManualTagsText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Se si apre il feed di un gruppo diverso, il composer riparte
  // preselezionando quel gruppo (non lo stato interno di prima).
  useEffect(() => setGroupId(defaultGroupId), [defaultGroupId]);

  // Ogni volta che cambia la GIF selezionata (nuova scelta, o rimossa) si
  // riparte senza l'avviso di errore della GIF precedente.
  useEffect(() => setGifLoadFailed(false), [gif]);

  const requireAuth = () => {
    if (!user) {
      onOpenAuth();
      return true;
    }
    return false;
  };

  const canSubmit = text.trim().length > 0 || !!gif || !!mediaFile;

  const removeMedia = () => {
    setMediaFile(null);
    setMediaType(null);
    setMediaPreviewUrl(null);
    setSuggestedTags([]);
    setSuggestedPlacements([]);
    setConfirmedPlacements(new Set());
    setManualTagsText('');
    setUploadError(null);
  };

  const togglePlacement = (key) => {
    setConfirmedPlacements((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Analisi gratuita nel browser (TensorFlow.js + euristica tramonto, vedi
  // data/localVision.js): produce solo suggerimenti, mai un tag piazzato a
  // insaputa di chi pubblica — che li vede qui e può togliere/aggiungere.
  const handleMediaChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (requireAuth()) {
      e.target.value = '';
      return;
    }
    const type = file.type.startsWith('video/') ? 'video' : 'foto';
    const previewUrl = URL.createObjectURL(file);
    setMediaFile(file);
    setMediaType(type);
    setMediaPreviewUrl(previewUrl);
    setSuggestedTags([]);
    setSuggestedPlacements([]);
    setConfirmedPlacements(new Set());
    setUploadError(null);
    setAnalyzing(true);
    try {
      const source =
        type === 'foto' ? await loadImageElement(previewUrl) : await extractVideoFrame(await loadVideoElement(previewUrl));
      const result = await analyzeImageElement(source);
      setSuggestedTags(result.tags);
      setSuggestedPlacements(result.placements);
      setConfirmedPlacements(new Set(result.placements.map(placementKey)));
    } catch {
      // Analisi non riuscita (es. modello non caricato): resta possibile
      // pubblicare comunque, solo senza suggerimenti automatici.
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (requireAuth() || !canSubmit || uploading) return;

    let mediaResult = null;
    if (mediaFile) {
      setUploading(true);
      setUploadError(null);
      const manualTags = manualTagsText.split(',').map((t) => t.trim()).filter(Boolean);
      const allTags = Array.from(new Set([...suggestedTags, ...manualTags]));
      const extraPlacements = suggestedPlacements.filter((p) => confirmedPlacements.has(placementKey(p)));
      // Una foto (non un video) pubblicata dal mondo Social compare sempre
      // anche in Fotografia nel mondo Arte, e viceversa (vedi FotografiaColumn):
      // stesso contenuto, stessi like, condiviso tra i due mondi senza doverlo
      // ripubblicare a mano.
      const crossPost = mediaType === 'foto' ? [{ world: 'arte', category: 'fotografia' }] : [];
      const placements = [{ world: 'social' }, ...extraPlacements];
      for (const p of crossPost) {
        if (!placements.some((e) => placementKey(e) === placementKey(p))) placements.push(p);
      }
      const { content, url, error } = await publishContent({
        file: mediaFile,
        type: mediaType,
        caption: text.trim(),
        tags: allTags,
        placements,
      });
      setUploading(false);
      if (error) {
        setUploadError(error);
        return;
      }
      mediaResult = { contentId: content.id, mediaUrl: url, mediaType, tags: allTags };
    }

    const foundUrl = extractFirstUrl(text.trim());

    onSubmit({
      testo: text.trim(),
      menzioni: mentionIdsInText(text, mentions),
      gif,
      link_esterno: foundUrl ? { url: foundUrl } : null,
      gruppo_id: groups ? groupId : undefined,
      ...(mediaResult ?? {}),
    });
    setText('');
    setMentions([]);
    setGif(null);
    setShowGifPicker(false);
    removeMedia();
    if (groups) setGroupId(defaultGroupId);
  };

  return (
    <form className={`rb-post-composer ${compact ? 'compact' : ''}`} onSubmit={submit}>
      {groups && (
        <select
          className="rb-composer-group-select"
          value={groupId ?? ''}
          onChange={(e) => setGroupId(e.target.value || null)}
          onFocus={() => requireAuth()}
          aria-label="Pubblica in"
        >
          <option value="">🌐 Bacheca generale</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.icon} {g.name}
            </option>
          ))}
        </select>
      )}
      <MentionInput
        multiline
        className="rb-composer-mention"
        value={text}
        onChange={setText}
        mentions={mentions}
        onMentionsChange={setMentions}
        contesto="generale"
        onFocus={() => requireAuth()}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
      />

      {gif && (
        <div className="rb-composer-gif-preview">
          {gifLoadFailed ? (
            <p className="rb-composer-gif-error">⚠️ Questa GIF non si carica, provane un'altra</p>
          ) : (
            <img src={gif} alt="GIF selezionata" onError={() => setGifLoadFailed(true)} />
          )}
          <button type="button" onClick={() => setGif(null)} aria-label="Rimuovi GIF"><Icon name="close" size={16} /></button>
        </div>
      )}

      {mediaPreviewUrl && (
        <div className="rb-composer-media-preview">
          <div className="rb-composer-media-frame">
            {mediaType === 'video' ? (
              <video src={mediaPreviewUrl} controls className="rb-composer-media-video" />
            ) : (
              <img src={mediaPreviewUrl} alt="Anteprima" className="rb-composer-media-image" />
            )}
            <button type="button" onClick={removeMedia} aria-label="Rimuovi foto o video">✕</button>
          </div>

          {analyzing && <p className="rb-composer-media-hint">Sto analizzando il contenuto (gratis, nel browser)...</p>}

          {!analyzing && suggestedTags.length > 0 && (
            <p className="rb-composer-media-hint">Tag suggeriti: {suggestedTags.map((t) => `#${t}`).join(' ')}</p>
          )}

          {mediaType === 'foto' && (
            <p className="rb-composer-media-hint">Questa foto comparirà anche in Fotografia nel mondo Arte.</p>
          )}

          {!analyzing &&
            suggestedPlacements.map((p) => {
              const key = placementKey(p);
              return (
                <label key={key} className="rb-composer-placement-row">
                  <input type="checkbox" checked={confirmedPlacements.has(key)} onChange={() => togglePlacement(key)} />
                  Pubblica anche in {p.label}
                </label>
              );
            })}

          <input
            type="text"
            className="rb-composer-manual-tags-input"
            placeholder="Aggiungi i tuoi tag, separati da virgola (facoltativo)"
            value={manualTagsText}
            onChange={(e) => setManualTagsText(e.target.value)}
          />

          {uploadError && <p className="rb-composer-media-error">⚠️ {uploadError}</p>}
        </div>
      )}

      <div className="rb-composer-toolbar">
        <div className="rb-composer-toolbar-left">
          <EmojiPicker onSelect={(emoji) => setText((t) => t + emoji)} />
          <button
            type="button"
            className="rb-iconbtn rb-composer-gif-btn"
            onClick={() => (requireAuth() ? null : setShowGifPicker((v) => !v))}
            aria-label="Aggiungi una GIF"
            title="GIF"
          >
            GIF
          </button>
          {!compact && !mediaPreviewUrl && (
            <>
              <label
                className="rb-iconbtn rb-composer-media-btn"
                title="Scatta una foto"
                onClick={(e) => {
                  if (requireAuth()) e.preventDefault();
                }}
              >
                <Icon name="camera" />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="rb-composer-media-input"
                  onChange={handleMediaChange}
                />
              </label>
              <label
                className="rb-iconbtn rb-composer-media-btn"
                title="Foto o video dalla galleria"
                onClick={(e) => {
                  if (requireAuth()) e.preventDefault();
                }}
              >
                <Icon name="image" />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                  className="rb-composer-media-input"
                  onChange={handleMediaChange}
                />
              </label>
            </>
          )}
        </div>
        <button type="submit" className="rb-composer-submit" disabled={!canSubmit || uploading || analyzing}>
          {uploading ? 'Pubblicazione...' : submitLabel}
        </button>
      </div>

      {showGifPicker && (
        <GifPicker
          onSelect={(url) => {
            setGif(url);
            setShowGifPicker(false);
          }}
          onClose={() => setShowGifPicker(false)}
        />
      )}
    </form>
  );
}
