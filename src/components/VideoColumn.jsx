import { useEffect, useRef, useState } from 'react';
import MediaEditor from './social/MediaEditor';
import { publishContent } from '../data/contents';
import { createPost } from '../data/posts';
import { analyzeImageElement, extractVideoFrame } from '../data/localVision';
import { searchYoutubeVideos, youtubeEmbedUrl } from '../data/youtubeSearch';
import { listMyPlaylists, createPlaylist, addTrackToPlaylist } from '../data/musicPlaylists';
import useYoutubeBridge, { formatPlaybackTime } from './shared/useYoutubeBridge';
import AddToPlaylistMenu from './shared/AddToPlaylistMenu';
import Icon from './shared/Icon';
import SocialGallery from './arte/SocialGallery';
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
// Controlli classici (play/pausa, stop, avanti/indietro nei risultati,
// aggiungi a preferiti/playlist, barra di scorrimento) tramite lo stesso
// ponte postMessage usato dal mini-player di Musica (useYoutubeBridge): le
// playlist sono le stesse di Musica, un video è solo un "brano" con id
// YouTube, titolo, artista/canale e copertina.
function YoutubeVideoTab({ user, onOpenAuth }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState(null);
  const [playlists, setPlaylists] = useState(null);
  const [dragValue, setDragValue] = useState(null);

  useEffect(() => {
    if (!user) {
      setPlaylists(null);
      return;
    }
    listMyPlaylists().then(setPlaylists);
  }, [user]);

  const selectedIndex = selected ? results.findIndex((v) => v.id === selected.id) : -1;
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex >= 0 && selectedIndex < results.length - 1;

  const { iframeRef, isPlaying, duration, currentTime, togglePlay, stop, seekTo } = useYoutubeBridge(selected?.id, {
    onEnded: () => {
      if (hasNext) setSelected(results[selectedIndex + 1]);
    },
  });

  const requireAuth = () => {
    if (!user) {
      onOpenAuth?.();
      return true;
    }
    return false;
  };

  const handleAddTrack = async (playlistId, track) => {
    if (requireAuth()) return;
    const { track: saved, error: err } = await addTrackToPlaylist(playlistId, track);
    if (err) return;
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? { ...p, tracks: [saved, ...p.tracks] } : p)));
  };

  const handleCreatePlaylistAndAdd = async (nome, track) => {
    if (requireAuth()) return;
    const { playlist, error: err } = await createPlaylist({ nome });
    if (err) return;
    const { track: saved, error: trackError } = await addTrackToPlaylist(playlist.id, track);
    const finalPlaylist = trackError ? playlist : { ...playlist, tracks: [saved] };
    setPlaylists((prev) => [finalPlaylist, ...(prev ?? [])]);
  };

  const progress = duration > 0 ? currentTime / duration : 0;
  const sliderValue = dragValue ?? progress;
  const shownTime = dragValue !== null ? dragValue * duration : currentTime;

  const commitSeek = () => {
    if (dragValue !== null && duration > 0) seekTo(dragValue * duration);
    setDragValue(null);
  };

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
      <p className="rb-video-yt-note"><Icon name="globe" size={16} className="rb-icon--inline" /> Cerca e guarda video da YouTube, senza uscire da Versemove.</p>
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
            ref={iframeRef}
            src={youtubeEmbedUrl(selected.id)}
            title={selected.title}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            frameBorder="0"
          />
          <div className="rb-video-yt-player-seek">
            <span className="rb-video-yt-player-time">{formatPlaybackTime(shownTime)}</span>
            <input
              type="range"
              className="rb-video-yt-player-range"
              min={0}
              max={1000}
              value={Math.round(sliderValue * 1000)}
              onChange={(e) => setDragValue(Number(e.target.value) / 1000)}
              onMouseUp={commitSeek}
              onTouchEnd={commitSeek}
              disabled={duration === 0}
            />
            <span className="rb-video-yt-player-time">{formatPlaybackTime(duration)}</span>
          </div>
          <div className="rb-video-yt-player-bottom">
            <div className="rb-video-yt-player-info">
              <strong>{selected.title}</strong>
              <p>{selected.artist}</p>
            </div>
            <div className="rb-video-yt-player-controls">
              <button type="button" onClick={() => hasPrev && setSelected(results[selectedIndex - 1])} disabled={!hasPrev} aria-label="Precedente" title="Precedente"><Icon name="skipBack" size={16} /></button>
              <button type="button" className="rb-video-yt-player-ctrl-main" onClick={togglePlay} aria-label={isPlaying ? 'Pausa' : 'Riproduci'} title={isPlaying ? 'Pausa' : 'Riproduci'}>
                <Icon name={isPlaying ? 'pause' : 'play'} size={18} />
              </button>
              <button type="button" onClick={stop} aria-label="Stop" title="Stop"><Icon name="stop" size={16} /></button>
              <button type="button" onClick={() => hasNext && setSelected(results[selectedIndex + 1])} disabled={!hasNext} aria-label="Successivo" title="Successivo"><Icon name="skipForward" size={16} /></button>
              {playlists && (
                <AddToPlaylistMenu
                  compact
                  playlists={playlists}
                  onAdd={(playlistId) => handleAddTrack(playlistId, selected)}
                  onCreateAndAdd={(nome) => handleCreatePlaylistAndAdd(nome, selected)}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <ul className="rb-video-yt-results">
        {results.map((v) => (
          <li key={v.id} className={`rb-video-yt-result ${selected?.id === v.id ? 'active' : ''}`}>
            <button type="button" onClick={() => setSelected(v)}>
              {v.artworkUrl ? <img src={v.artworkUrl} alt="" /> : <div className="rb-video-yt-result-empty"><Icon name="film" size={24} /></div>}
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
  const [galleryKey, setGalleryKey] = useState(0);
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
    const { content, url, error } = await publishContent({
      file: draftFile,
      type: 'video',
      caption: title.trim(),
      tags: allTags,
      placements,
    });
    if (error) {
      setPublishing(false);
      setPublishError(error);
      return;
    }
    // Post pubblico nel mondo Social col video: la galleria (RPC
    // galleria_social) mostra i video dei post Social.
    const post = await createPost({ testo: title.trim(), contentId: content.id, mediaUrl: url, mediaType: 'video', tags: allTags, mondo: 'social' });
    setPublishing(false);
    if (post.error) {
      setPublishError(post.error);
      return;
    }
    resetForm();
    setGalleryKey((k) => k + 1);
  };

  return (
    <div className="rb-video-column">
      <div className="rb-video-header">
        <div>
          <h3>Galleria Video</h3>
          <p>Clip brevi della community, oppure video interi cercati su YouTube.</p>
        </div>
        {tab === 'community' && (
          <div className="rb-video-upload-btns">
            <button type="button" className="rb-video-upload-btn" onClick={() => openPicker(cameraInputRef)}>
              <Icon name="video" size={17} className="rb-icon--inline" /> Registra
            </button>
            <button type="button" className="rb-video-upload-btn" onClick={() => openPicker(fileInputRef)}>
              <Icon name="image" size={17} className="rb-icon--inline" /> Galleria
            </button>
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
        <YoutubeVideoTab user={user} onOpenAuth={onOpenAuth} />
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
          <button type="button" className="rb-video-edit-btn" onClick={() => setEditing(true)}>
            <Icon name="scissors" size={16} className="rb-icon--inline" /> Taglia
          </button>
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
          {publishError && <p className="rb-video-form-error">
              <Icon name="info" size={16} className="rb-icon--inline" /> {publishError}
            </p>}
          <div className="rb-video-form-actions">
            <button type="button" className="rb-video-form-cancel" onClick={resetForm}>Annulla</button>
            <button type="button" className="rb-video-form-publish" onClick={publish} disabled={publishing}>
              {publishing ? 'Pubblicazione...' : 'Pubblica'}
            </button>
          </div>
        </div>
      )}

      <SocialGallery key={galleryKey} tipo="video" user={user} onOpenAuth={onOpenAuth} />

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
