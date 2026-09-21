import { useEffect, useRef, useState } from 'react';
import MediaEditor from './social/MediaEditor';
import { publishContent, listContentsForPlacement, toggleContentLike } from '../data/contents';
import { analyzeImageElement, extractVideoFrame } from '../data/localVision';
import { searchYoutubeVideos, youtubeEmbedUrl } from '../data/youtubeSearch';
import './VideoColumn.css';

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

// Chiave che identifica un posizionamento (mondo + categoria + sottofamiglia).
function placementKey(p) {
  return `${p.world}:${p.category ?? ''}:${p.subfamily ?? ''}`;
}

// Scheda "Cerca su YouTube": qui si guardano video interi (a differenza di
// Musica, dove lo stesso motore di ricerca serve solo per ascoltare, vedi
// data/youtubeSearch.js) incorporati dentro l'app, senza uscire su
// youtube.com. Un video selezionato resta grande sopra i risultati, che
// restano sotto per poterne scegliere un altro senza dover tornare indietro.
function YoutubeVideoTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const result = await searchYoutubeVideos(query);
      setResults(result);
    } catch (err) {
      setError(
        err.message === 'timeout'
          ? 'La ricerca ci sta mettendo troppo a rispondere. Controlla la connessione e riprova.'
          : err.message === 'quota'
            ? 'Limite giornaliero di ricerche raggiunto. Riprova domani.'
            : 'Impossibile cercare su YouTube ora. Riprova più tardi.'
      );
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rb-video-yt">
      <p className="rb-video-yt-note">🌍 Cerca e guarda video da YouTube, senza uscire da Versemove.</p>
      <div className="rb-video-yt-search-row">
        <input
          type="text"
          placeholder="Cerca un video..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="rb-video-upload-btn" onClick={search}>Cerca</button>
      </div>

      {loading && <p className="rb-video-yt-status">Cerco su YouTube...</p>}
      {error && <p className="rb-video-yt-status rb-video-yt-error">{error}</p>}
      {!loading && !error && searched && results.length === 0 && (
        <p className="rb-video-yt-status">Nessun video trovato.</p>
      )}

      {selected && (
        <div className="rb-video-yt-player">
          <iframe
            key={selected.id}
            src={youtubeEmbedUrl(selected.id)}
            title={selected.title}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            frameBorder="0"
          />
          <div className="rb-video-yt-player-info">
            <strong>{selected.title}</strong>
            <p>{selected.artist}</p>
          </div>
        </div>
      )}

      <ul className="rb-video-yt-results">
        {results.map((v) => (
          <li key={v.id} className={`rb-video-yt-result ${selected?.id === v.id ? 'active' : ''}`}>
            <button type="button" onClick={() => setSelected(v)}>
              {v.artworkUrl ? <img src={v.artworkUrl} alt="" /> : <div className="rb-video-yt-result-empty">🎬</div>}
              <div>
                <strong>{v.title}</strong>
                <p>{v.artist}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Video del mondo Arte & Musica: caricati su Supabase (data/contents.js),
// non più come object URL locali (che si perdevano ricaricando la pagina) —
// ora restano davvero. Al caricamento si estrae un fotogramma e si analizza
// gratis nel browser (data/localVision.js) per suggerire tag e altri mondi
// dove ripubblicare lo stesso video (like sempre condivisi, mai duplicati).
export default function VideoColumn({ user, onOpenAuth }) {
  const [tab, setTab] = useState('community'); // 'community' | 'youtube'
  const [videos, setVideos] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [draftFile, setDraftFile] = useState(null);
  const [draftUrl, setDraftUrl] = useState(null);
  const [trim, setTrim] = useState(null);
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [extraPlacements, setExtraPlacements] = useState([]);
  const [confirmedPlacements, setConfirmedPlacements] = useState(new Set());
  const [manualTagsText, setManualTagsText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const refresh = () => {
    listContentsForPlacement({ world: 'arte', category: 'video' }).then(setVideos);
  };
  useEffect(refresh, []);

  const openPicker = (ref) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    ref.current?.click();
  };

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setDraftFile(file);
    setDraftUrl(previewUrl);
    setTrim(null);
    setShowForm(true);
    setSuggestedTags([]);
    setExtraPlacements([]);
    setConfirmedPlacements(new Set());
    setAnalyzing(true);
    try {
      const videoEl = await loadVideoElement(previewUrl);
      const frame = await extractVideoFrame(videoEl);
      const result = await analyzeImageElement(frame);
      setSuggestedTags(result.tags);
      setExtraPlacements(result.placements);
      setConfirmedPlacements(new Set(result.placements.map(placementKey)));
    } catch {
      // Analisi non riuscita: si può comunque pubblicare, solo senza suggerimenti.
    } finally {
      setAnalyzing(false);
    }
  };

  const togglePlacement = (key) => {
    setConfirmedPlacements((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const resetForm = () => {
    setShowForm(false);
    setDraftFile(null);
    setDraftUrl(null);
    setTrim(null);
    setTitle('');
    setSuggestedTags([]);
    setExtraPlacements([]);
    setConfirmedPlacements(new Set());
    setManualTagsText('');
    setPublishError(null);
  };

  const publish = async () => {
    if (!draftFile || publishing) return;
    setPublishing(true);
    setPublishError(null);
    const manualTags = manualTagsText.split(',').map((t) => t.trim()).filter(Boolean);
    const allTags = Array.from(new Set([...suggestedTags, ...manualTags]));
    const chosenExtra = extraPlacements.filter((p) => confirmedPlacements.has(placementKey(p)));
    const placements = [{ world: 'arte', category: 'video' }, ...chosenExtra];
    const { error } = await publishContent({
      file: draftFile,
      type: 'video',
      caption: title.trim(),
      tags: allTags,
      placements,
    });
    setPublishing(false);
    if (error) {
      setPublishError(error);
      return;
    }
    resetForm();
    refresh();
  };

  const handleLike = async (video) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    const { liked, error } = await toggleContentLike(video.id, video.likedByMe);
    if (error) return;
    setVideos((prev) =>
      prev.map((v) => (v.id === video.id ? { ...v, likedByMe: liked, likeCount: v.likeCount + (liked ? 1 : -1) } : v))
    );
  };

  return (
    <div className="rb-video-column">
      <div className="rb-video-header">
        <div>
          <h3>Video</h3>
          <p>Clip brevi della community, oppure video interi cercati su YouTube.</p>
        </div>
        {tab === 'community' && (
          <div className="rb-video-upload-btns">
            <button type="button" className="rb-video-upload-btn" onClick={() => openPicker(cameraInputRef)}>📹 Registra</button>
            <button type="button" className="rb-video-upload-btn" onClick={() => openPicker(fileInputRef)}>🎬 Galleria</button>
          </div>
        )}
      </div>

      <div className="rb-video-tabs">
        <button type="button" className={`rb-video-tab ${tab === 'community' ? 'active' : ''}`} onClick={() => setTab('community')}>
          Caricati dalla community
        </button>
        <button type="button" className={`rb-video-tab ${tab === 'youtube' ? 'active' : ''}`} onClick={() => setTab('youtube')}>
          Cerca su YouTube
        </button>
      </div>

      {tab === 'youtube' ? (
        <YoutubeVideoTab />
      ) : (
        <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        capture="environment"
        hidden
        onChange={onFileChosen}
      />
      <input ref={fileInputRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={onFileChosen} />

      {showForm && draftUrl && (
        <div className="rb-video-form">
          <video
            className="rb-video-form-preview"
            src={draftUrl}
            controls
            onLoadedMetadata={(e) => {
              if (trim?.trimStart) e.target.currentTime = trim.trimStart;
            }}
          />
          <button type="button" className="rb-video-edit-btn" onClick={() => setEditing(true)}>✂️ Taglia</button>
          {trim && (
            <p className="rb-video-trim-hint">
              Taglio impostato: {trim.trimStart.toFixed(1)}s → {trim.trimEnd.toFixed(1)}s
            </p>
          )}

          {analyzing && <p className="rb-video-trim-hint">Sto analizzando il contenuto (gratis, nel browser)...</p>}
          {!analyzing && suggestedTags.length > 0 && (
            <p className="rb-video-trim-hint">Tag suggeriti: {suggestedTags.map((t) => `#${t}`).join(' ')}</p>
          )}
          {!analyzing &&
            extraPlacements.map((p) => {
              const key = placementKey(p);
              return (
                <label key={key} className="rb-video-placement-row">
                  <input type="checkbox" checked={confirmedPlacements.has(key)} onChange={() => togglePlacement(key)} />
                  Pubblica anche in {p.label}
                </label>
              );
            })}
          <input
            type="text"
            className="rb-video-manual-tags-input"
            placeholder="Aggiungi i tuoi tag, separati da virgola (facoltativo)"
            value={manualTagsText}
            onChange={(e) => setManualTagsText(e.target.value)}
          />

          <input
            type="text"
            placeholder="Titolo (facoltativo)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
          />
          {publishError && <p className="rb-video-form-error">⚠️ {publishError}</p>}
          <div className="rb-video-form-actions">
            <button type="button" className="rb-video-form-cancel" onClick={resetForm}>Annulla</button>
            <button type="button" className="rb-video-form-publish" onClick={publish} disabled={publishing}>
              {publishing ? 'Pubblicazione...' : 'Pubblica'}
            </button>
          </div>
        </div>
      )}

      <ul className="rb-video-grid">
        {videos.map((v) => (
          <li key={v.id} className="rb-video-card">
            <video src={v.url} controls />
            <div className="rb-video-card-info">
              <strong>{v.caption || 'Senza titolo'}</strong>
              <button type="button" className="rb-video-like-btn" onClick={() => handleLike(v)}>
                {v.likedByMe ? '❤️' : '🤍'} {v.likeCount}
              </button>
            </div>
          </li>
        ))}
        {videos.length === 0 && <p className="rb-video-empty">Nessun video ancora in questa categoria.</p>}
      </ul>

      {editing && (
        <MediaEditor
          type="video"
          src={draftUrl}
          onCancel={() => setEditing(false)}
          onSave={({ trimStart, trimEnd }) => {
            setTrim({ trimStart, trimEnd });
            setEditing(false);
          }}
        />
      )}
        </>
      )}
    </div>
  );
}
