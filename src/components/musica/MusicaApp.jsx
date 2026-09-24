import { useEffect, useMemo, useRef, useState } from 'react';
import { useBackLayer } from '../../hooks/useBackLayer';
import {
  listMyPlaylists,
  createPlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
} from '../../data/musicPlaylists';
import { searchYoutubeVideos, youtubeEmbedUrl } from '../../data/youtubeSearch';
import { recordRecentPlay, listRecentPlays } from '../../data/musicClips';
import useYoutubeBridge, { formatPlaybackTime } from '../shared/useYoutubeBridge';
import AddToPlaylistMenu from '../shared/AddToPlaylistMenu';
import MusicaClip from './MusicaClip';
import MusicaEsplora from './MusicaEsplora';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import './MusicaApp.css';

const HOME_CHIPS = [
  { id: 'per-te', label: 'Per te' },
  { id: 'podcast', label: 'Podcast', query: 'podcast italiano' },
  { id: 'energia', label: 'Energia', query: 'musica energica allenamento' },
  { id: 'relax', label: 'Relax', query: 'musica rilassante lofi' },
  { id: 'italiana', label: 'Musica italiana', query: 'musica italiana 2026' },
];

// Copertina/titolo/artista + play-pausa: stesso "atomo" ovunque in Musica
// (playlist, ricerca, scelte rapide, brani che piacciono) — non riproduce
// nulla da solo, segnala solo se questo è il brano attivo (playingId): la
// riproduzione vera è sempre l'unica barra in fondo (NowPlayingBar).
function TrackRow({ track, playingId, onTogglePlay, action }) {
  const isPlaying = playingId === track.id;
  return (
    <li className="rb-musica-track-row">
      {track.artworkUrl ? (
        <img className="rb-musica-track-art" src={track.artworkUrl} alt="" />
      ) : (
        <div className="rb-musica-track-art rb-musica-track-art-empty">🎵</div>
      )}
      <div className="rb-musica-track-info">
        <strong>{track.title}</strong>
        <p>{track.artist}</p>
      </div>
      <button type="button" className="rb-musica-play-btn" onClick={() => onTogglePlay(track)}>
        {isPlaying ? '⏸' : '▶️'}
      </button>
      {action}
    </li>
  );
}

// Mini-player fisso sopra la navigazione in basso: un solo video YouTube alla
// volta (l'id viene sempre dalla ricerca o da un brano salvato, mai da un
// link incollato). Controlli classici (play/pausa, stop, avanti, indietro,
// aggiungi a preferiti/playlist, barra di scorrimento trascinabile) tramite
// useYoutubeBridge, che manda i comandi all'iframe incorporato con
// enablejsapi=1 (vedi data/youtubeSearch.js) invece di limitarsi ad
// ascoltarne solo gli eventi.
function NowPlayingBar({ track, onClose, onEnded, hasNext, hasPrev, onPrev, playlists, onAddTrack, onCreatePlaylistAndAdd }) {
  const { iframeRef, isPlaying, duration, currentTime, togglePlay, stop, seekTo } = useYoutubeBridge(track?.id, { onEnded });
  const [dragValue, setDragValue] = useState(null);

  if (!track) return null;

  const progress = duration > 0 ? currentTime / duration : 0;
  const sliderValue = dragValue ?? progress;
  const shownTime = dragValue !== null ? dragValue * duration : currentTime;

  const commitSeek = () => {
    if (dragValue !== null && duration > 0) seekTo(dragValue * duration);
    setDragValue(null);
  };

  return (
    <div className="rb-musica-now-playing">
      <div className="rb-musica-now-playing-row">
        <iframe
          key={track.id}
          ref={iframeRef}
          className="rb-musica-now-playing-frame"
          src={youtubeEmbedUrl(track.id)}
          title={track.title}
          allow="autoplay; encrypted-media"
          frameBorder="0"
        />
        <div className="rb-musica-now-playing-info">
          <strong>{track.title}</strong>
          <p>{track.artist}</p>
        </div>
        <div className="rb-musica-now-playing-controls">
          <button type="button" className="rb-musica-now-playing-ctrl" onClick={onPrev} disabled={!hasPrev} aria-label="Precedente" title="Precedente">⏮</button>
          <button type="button" className="rb-musica-now-playing-ctrl rb-musica-now-playing-ctrl-main" onClick={togglePlay} aria-label={isPlaying ? 'Pausa' : 'Riproduci'} title={isPlaying ? 'Pausa' : 'Riproduci'}>
            {isPlaying ? '⏸' : '▶️'}
          </button>
          <button type="button" className="rb-musica-now-playing-ctrl" onClick={stop} aria-label="Stop" title="Stop">⏹</button>
          <button type="button" className="rb-musica-now-playing-ctrl" onClick={onEnded} disabled={!hasNext} aria-label="Successivo" title="Successivo">⏭</button>
          {playlists && (
            <AddToPlaylistMenu
              compact
              playlists={playlists}
              onAdd={(playlistId) => onAddTrack(playlistId, track)}
              onCreateAndAdd={(nome) => onCreatePlaylistAndAdd(nome, track)}
            />
          )}
        </div>
        <button type="button" className="rb-musica-now-playing-close" onClick={onClose} aria-label="Ferma">✕</button>
      </div>
      <div className="rb-musica-now-playing-seek">
        <span className="rb-musica-now-playing-time">{formatPlaybackTime(shownTime)}</span>
        <input
          type="range"
          className="rb-musica-now-playing-range"
          min={0}
          max={1000}
          value={Math.round(sliderValue * 1000)}
          onChange={(e) => setDragValue(Number(e.target.value) / 1000)}
          onMouseUp={commitSeek}
          onTouchEnd={commitSeek}
          disabled={duration === 0}
        />
        <span className="rb-musica-now-playing-time">{formatPlaybackTime(duration)}</span>
      </div>
    </div>
  );
}

function PlaylistDetail({ playlist, onBack, onDelete, canDelete, onRemoveTrack, playingId, onTogglePlay, onPlayAll }) {
  return (
    <div className="rb-musica-playlist-detail">
      <div className="rb-musica-playlist-detail-header">
        <button type="button" className="rb-musica-back-btn" onClick={onBack}>← Indietro</button>
        <div>
          <strong>{playlist.nome}</strong>
          {playlist.descrizione && <p className="rb-musica-playlist-detail-desc">{playlist.descrizione}</p>}
        </div>
        {canDelete && (
          <button type="button" className="rb-musica-delete-btn" onClick={() => onDelete(playlist.id)}>Elimina</button>
        )}
      </div>

      {playlist.tracks.length > 0 && (
        <button type="button" className="rb-musica-play-all-btn" onClick={() => onPlayAll(playlist.tracks)}>▶️ Riproduci tutti</button>
      )}

      {playlist.tracks.length === 0 && <EmptyState icon="🎧" title="Nessun brano qui ancora" subtitle="Aggiungi brani da Esplora o dalla ricerca." />}
      <ul className="rb-musica-track-list">
        {playlist.tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={{ id: t.track_id, title: t.title, artist: t.artist, artworkUrl: t.artwork_url }}
            playingId={playingId}
            onTogglePlay={onTogglePlay}
            action={
              onRemoveTrack ? (
                <button type="button" className="rb-musica-remove-btn" onClick={() => onRemoveTrack(t.id)} title="Rimuovi">
                  ✕
                </button>
              ) : null
            }
          />
        ))}
      </ul>
    </div>
  );
}

function BottomNav({ tab, onChange }) {
  const items = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'clip', label: 'Clip', icon: '🎬' },
    { id: 'esplora', label: 'Esplora', icon: '🧭' },
    { id: 'raccolta', label: 'Raccolta', icon: '📚' },
  ];
  return (
    <nav className="rb-musica-bottomnav">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`rb-musica-bottomnav-btn ${tab === it.id ? 'active' : ''}`}
          onClick={() => onChange(it.id)}
        >
          <span className="rb-musica-bottomnav-icon">{it.icon}</span>
          <span>{it.label}</span>
        </button>
      ))}
    </nav>
  );
}

function QuickPickTile({ tile, onOpenPlaylist }) {
  if (tile.type === 'playlist') {
    const arts = tile.tracks.slice(0, 4).map((t) => t.artwork_url).filter(Boolean);
    return (
      <button type="button" className="rb-musica-qp-tile rb-musica-qp-playlist" onClick={() => onOpenPlaylist(tile.id)}>
        <div className="rb-musica-qp-mosaic">
          {arts.length > 0 ? (
            Array.from({ length: 4 }).map((_, i) => (
              <span key={i} style={arts[i] ? { backgroundImage: `url(${arts[i]})` } : undefined} />
            ))
          ) : (
            <span className="rb-musica-qp-mosaic-empty">🎧</span>
          )}
        </div>
        <strong>{tile.nome}</strong>
      </button>
    );
  }
  return (
    <div className="rb-musica-qp-tile rb-musica-qp-artist">
      <div className="rb-musica-qp-avatar" style={tile.artworkUrl ? { backgroundImage: `url(${tile.artworkUrl})` } : undefined}>
        {!tile.artworkUrl && '🎤'}
      </div>
      <strong>{tile.name}</strong>
    </div>
  );
}

function QuickPicks({ tiles, onOpenPlaylist }) {
  const scrollRef = useRef(null);
  const [page, setPage] = useState(0);
  const pageSize = 9;
  const pages = Math.ceil(tiles.length / pageSize);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (tiles.length === 0) return null;

  return (
    <div className="rb-musica-quickpicks">
      <div className="rb-musica-quickpicks-scroll" ref={scrollRef} onScroll={onScroll}>
        {Array.from({ length: pages }).map((_, pageIndex) => (
          <div className="rb-musica-quickpicks-page" key={pageIndex}>
            {tiles.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize).map((t) => (
              <QuickPickTile key={t.key} tile={t} onOpenPlaylist={onOpenPlaylist} />
            ))}
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="rb-musica-quickpicks-dots">
          {Array.from({ length: pages }).map((_, i) => (
            <span key={i} className={`rb-musica-dot ${i === page ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function MusicaHome({
  user,
  onOpenAuth,
  playlists,
  likedTracks,
  playingId,
  onTogglePlay,
  onOpenPlaylist,
  onPlayAll,
  nowPlaying,
  onAddTrack,
  onCreatePlaylistAndAdd,
}) {
  const [chip, setChip] = useState('per-te');
  const [tracks, setTracks] = useState(likedTracks.slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (chip === 'per-te') {
      setTracks(likedTracks.slice(0, 10));
      setError('');
      return;
    }
    const chipDef = HOME_CHIPS.find((c) => c.id === chip);
    if (!chipDef?.query) return;
    setLoading(true);
    setError('');
    searchYoutubeVideos(chipDef.query, 10)
      .then(setTracks)
      .catch((err) => {
        setError(
          err.message === 'quota'
            ? 'Limite giornaliero di ricerche raggiunto. Riprova domani.'
            : 'Impossibile caricare questi brani ora.'
        );
        setTracks([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chip]);

  const quickPickTiles = useMemo(() => {
    const tiles = playlists.slice(0, 6).map((p) => ({ key: `pl-${p.id}`, type: 'playlist', id: p.id, nome: p.nome, tracks: p.tracks }));
    const seenArtists = new Set();
    for (const t of likedTracks) {
      if (tiles.length >= 9) break;
      if (seenArtists.has(t.artist)) continue;
      seenArtists.add(t.artist);
      tiles.push({ key: `artist-${t.artist}`, type: 'artist', name: t.artist, artworkUrl: t.artworkUrl });
    }
    return tiles;
  }, [playlists, likedTracks]);

  return (
    <div className="rb-musica-home">
      <div
        className="rb-musica-home-bg"
        style={nowPlaying?.artworkUrl ? { backgroundImage: `url(${nowPlaying.artworkUrl})` } : undefined}
      />
      <div className="rb-musica-home-content">
        <div className="rb-musica-chips">
          {HOME_CHIPS.map((c) => (
            <button key={c.id} type="button" className={`rb-musica-chip ${chip === c.id ? 'active' : ''}`} onClick={() => setChip(c.id)}>
              {c.label}
            </button>
          ))}
        </div>

        {!user && (
          <p className="rb-musica-status">
            <button type="button" className="rb-musica-inline-link" onClick={onOpenAuth}>Accedi</button> per vedere qui le tue playlist e i brani che ti piacciono.
          </p>
        )}

        {quickPickTiles.length > 0 && (
          <section className="rb-musica-section">
            <h4>Selezione rapida</h4>
            <QuickPicks tiles={quickPickTiles} onOpenPlaylist={onOpenPlaylist} />
          </section>
        )}

        <section className="rb-musica-section">
          <div className="rb-musica-section-header">
            <h4>Scelte rapide</h4>
            {tracks.length > 0 && (
              <button type="button" className="rb-musica-play-all-btn" onClick={() => onPlayAll(tracks)}>▶️ Riproduci tutti</button>
            )}
          </div>
          {loading && (
            <div className="rb-musica-skeleton-list" aria-hidden="true">
              <Skeleton lines={2} />
              <Skeleton lines={2} />
              <Skeleton lines={2} />
            </div>
          )}
          {error && <EmptyState icon="⚠️" title="Sezione non disponibile" subtitle={error} />}
          {!loading && !error && tracks.length === 0 && (
            <EmptyState icon="🎵" title="Nessun brano qui ancora" subtitle="Prova un altro filtro o cerca in Esplora." />
          )}
          <ul className="rb-musica-track-list">
            {tracks.map((t) => (
              <TrackRow
                key={t.id}
                track={t}
                playingId={playingId}
                onTogglePlay={onTogglePlay}
                action={
                  chip === 'per-te' || !user ? null : (
                    <AddToPlaylistMenu
                      playlists={playlists}
                      onAdd={(playlistId) => onAddTrack(playlistId, t)}
                      onCreateAndAdd={(nome) => onCreatePlaylistAndAdd(nome, t)}
                    />
                  )
                }
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

// Piccolo dropdown disegnato su misura (stesso principio di quello della
// Libreria, vedi FreeBooksCatalog.jsx): il <select> nativo del browser apre
// un popup fuori stile rispetto al resto dell'app.
function CustomSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const current = options.find((o) => o.value === value);
  return (
    <div className="rb-musica-select" ref={ref}>
      <button type="button" className="rb-musica-select-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{current?.label}</span>
        <svg className={`rb-musica-select-arrow${open ? ' open' : ''}`} width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="rb-musica-select-menu">
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" className={o.value === value ? 'active' : ''} onClick={() => { onChange(o.value); setOpen(false); }}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const RACCOLTA_CHIPS = [
  { id: 'playlist', label: 'Playlist' },
  { id: 'podcast', label: 'Podcast' },
  { id: 'brani', label: 'Brani' },
  { id: 'album', label: 'Album' },
];

function MusicaRaccolta({
  user,
  onOpenAuth,
  playlists,
  likedTracks,
  openPlaylistId,
  onOpenPlaylist,
  onCreate,
  onDelete,
  onRemoveTrack,
  playingId,
  onTogglePlay,
  onPlayAll,
}) {
  const [chip, setChip] = useState('playlist');
  const [sort, setSort] = useState('recenti');
  const [view, setView] = useState('grid');
  const [query, setQuery] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    if (!showHistory || recent !== null) return;
    listRecentPlays().then(setRecent);
  }, [showHistory, recent]);

  const likedPlaylist = { id: '__liked__', nome: 'Ti piace', descrizione: '', tracks: likedTracks.map((t) => ({ id: t.id, track_id: t.id, title: t.title, artist: t.artist, artwork_url: t.artworkUrl })) };
  const openPlaylist = openPlaylistId === '__liked__' ? likedPlaylist : playlists.find((p) => p.id === openPlaylistId);

  const filteredPlaylists = useMemo(() => {
    let list = playlists.filter((p) => p.nome.toLowerCase().includes(query.trim().toLowerCase()));
    if (sort === 'nome') list = [...list].sort((a, b) => a.nome.localeCompare(b.nome));
    return list;
  }, [playlists, query, sort]);

  if (openPlaylist) {
    return (
      <div className="rb-musica-raccolta">
        <PlaylistDetail
          playlist={openPlaylist}
          onBack={() => onOpenPlaylist(null)}
          canDelete={openPlaylistId !== '__liked__'}
          onDelete={onDelete}
          onRemoveTrack={openPlaylistId === '__liked__' ? null : (trackId) => onRemoveTrack(openPlaylist.id, trackId)}
          playingId={playingId}
          onTogglePlay={onTogglePlay}
          onPlayAll={onPlayAll}
        />
      </div>
    );
  }

  const createNew = async () => {
    if (!newNome.trim() || creating) return;
    setCreating(true);
    setFormError('');
    const err = await onCreate(newNome, newDesc);
    setCreating(false);
    if (err) {
      setFormError(err);
      return;
    }
    setShowNewForm(false);
    setNewNome('');
    setNewDesc('');
  };

  return (
    <div className="rb-musica-raccolta">
      <div className="rb-musica-raccolta-header">
        <h3>Raccolta</h3>
        <div className="rb-musica-raccolta-header-actions">
          <button type="button" className="rb-musica-icon-btn" onClick={() => setShowHistory((v) => !v)} title="Cronologia recente" aria-label="Cronologia recente">🕘</button>
          <input
            type="text"
            className="rb-musica-raccolta-search"
            placeholder="Cerca nelle tue playlist..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {showHistory && (
        <section className="rb-musica-section">
          <h4>Ascoltati di recente</h4>
          {recent === null ? (
            <div className="rb-musica-skeleton-list" aria-hidden="true">
              <Skeleton lines={2} />
              <Skeleton lines={2} />
            </div>
          ) : recent.length === 0 ? (
            <EmptyState icon="🕘" title="Non hai ancora ascoltato nulla" />
          ) : (
            <ul className="rb-musica-track-list">
              {recent.map((t) => (
                <TrackRow key={t.id} track={t} playingId={playingId} onTogglePlay={onTogglePlay} action={null} />
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="rb-musica-chips">
        {RACCOLTA_CHIPS.map((c) => (
          <button key={c.id} type="button" className={`rb-musica-chip ${chip === c.id ? 'active' : ''}`} onClick={() => setChip(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {!user ? (
        <EmptyState icon="🔒" title="Accedi per continuare" subtitle="Serve un account per creare playlist e vedere i tuoi brani." actions={[{ label: 'Accedi', primary: true, onClick: onOpenAuth }]} />
      ) : chip === 'playlist' ? (
        <>
          <div className="rb-musica-raccolta-toolbar">
            <CustomSelect
              value={sort}
              options={[{ value: 'recenti', label: 'Attività recente' }, { value: 'nome', label: 'Nome A-Z' }]}
              onChange={setSort}
            />
            <button type="button" className="rb-musica-icon-btn" onClick={() => setView((v) => (v === 'grid' ? 'list' : 'grid'))} title="Cambia vista" aria-label="Cambia vista">
              {view === 'grid' ? '☰' : '▦'}
            </button>
          </div>

          <div className={view === 'grid' ? 'rb-musica-playlists-grid' : 'rb-musica-playlists-list'}>
            <button type="button" className={view === 'grid' ? 'rb-musica-playlist-card' : 'rb-musica-playlist-row'} onClick={() => onOpenPlaylist('__liked__')}>
              <div className="rb-musica-playlist-cover rb-musica-playlist-cover-liked"><span>❤️</span></div>
              <strong>Ti piace</strong>
              <span>{likedTracks.length} {likedTracks.length === 1 ? 'brano' : 'brani'}</span>
            </button>
            {filteredPlaylists.map((p) => (
              <button type="button" key={p.id} className={view === 'grid' ? 'rb-musica-playlist-card' : 'rb-musica-playlist-row'} onClick={() => onOpenPlaylist(p.id)}>
                <div className="rb-musica-playlist-cover">
                  {p.tracks[0]?.artwork_url ? <img src={p.tracks[0].artwork_url} alt="" /> : <span>🎧</span>}
                </div>
                <strong>{p.nome}</strong>
                <span>{p.tracks.length} {p.tracks.length === 1 ? 'brano' : 'brani'}</span>
              </button>
            ))}
          </div>
        </>
      ) : chip === 'brani' ? (
        <>
          {likedTracks.length === 0 && <EmptyState icon="🎵" title="Nessun brano salvato ancora" />}
          <ul className="rb-musica-track-list">
            {likedTracks.map((t) => (
              <TrackRow key={t.id} track={t} playingId={playingId} onTogglePlay={onTogglePlay} action={null} />
            ))}
          </ul>
        </>
      ) : (
        <EmptyState icon="📂" title="Non hai ancora contenuti in questa categoria" />
      )}

      {user && !showNewForm && (
        <button type="button" className="rb-musica-fab" onClick={() => setShowNewForm(true)} aria-label="Nuova playlist" title="Nuova playlist">+ Nuova</button>
      )}
      {showNewForm && (
        <div className="rb-musica-new-playlist-form rb-musica-new-playlist-form-modal">
          <input type="text" placeholder="Nome playlist (es. Per correre)" value={newNome} onChange={(e) => setNewNome(e.target.value)} maxLength={60} autoFocus />
          <textarea placeholder="Descrizione (facoltativa)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} maxLength={300} rows={2} />
          {formError && <p className="rb-musica-status rb-musica-error">{formError}</p>}
          <div className="rb-musica-new-playlist-actions">
            <button type="button" onClick={() => { setShowNewForm(false); setFormError(''); }}>Annulla</button>
            <button type="button" className="rb-musica-new-playlist-submit" onClick={createNew} disabled={!newNome.trim() || creating}>
              {creating ? 'Creazione...' : 'Crea'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Sostituisce la vecchia MusicaColumn: app dentro l'app ispirata alla
// struttura di YouTube Music (nessun logo/nome/grafica presi da lì, nessuna
// pubblicità) — 4 schede in basso, mini-player persistente che continua a
// suonare cambiando scheda, coda di riproduzione con avanzamento automatico
// al brano successivo via gli eventi del player incorporato.
export default function MusicaApp({ user, onOpenAuth }) {
  const [tab, setTab] = useState('home');
  const [playlists, setPlaylists] = useState(() => (user ? null : []));
  const [openPlaylistId, setOpenPlaylistId] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  // Playlist aperta nella Raccolta = sottopagina: Indietro torna all'elenco.
  useBackLayer(tab === 'raccolta' && openPlaylistId !== null, () => setOpenPlaylistId(null), 'subpage:playlist');
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);

  useEffect(() => {
    if (!user) return;
    listMyPlaylists().then(setPlaylists);
  }, [user]);

  const requireAuth = () => {
    if (!user) {
      onOpenAuth?.();
      return true;
    }
    return false;
  };

  const togglePlay = (track) => {
    setNowPlaying((prev) => {
      if (prev?.id === track.id) return null;
      recordRecentPlay(track);
      return track;
    });
    setQueue([track]);
    setQueueIndex(0);
  };

  const playAll = (tracks) => {
    if (tracks.length === 0) return;
    setQueue(tracks);
    setQueueIndex(0);
    setNowPlaying(tracks[0]);
    recordRecentPlay(tracks[0]);
  };

  const advanceQueue = () => {
    const next = queueIndex + 1;
    if (next < queue.length) {
      setQueueIndex(next);
      setNowPlaying(queue[next]);
      recordRecentPlay(queue[next]);
    } else {
      setNowPlaying(null);
    }
  };

  const retreatQueue = () => {
    const prev = queueIndex - 1;
    if (prev < 0) return;
    setQueueIndex(prev);
    setNowPlaying(queue[prev]);
    recordRecentPlay(queue[prev]);
  };

  const likedTracks = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const p of playlists ?? []) {
      for (const t of p.tracks) {
        if (seen.has(t.track_id)) continue;
        seen.add(t.track_id);
        out.push({ id: t.track_id, title: t.title, artist: t.artist, artworkUrl: t.artwork_url, addedAt: t.added_at });
      }
    }
    return out.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
  }, [playlists]);

  const handleCreate = async (nome, descrizione) => {
    if (requireAuth()) return 'Devi essere loggato.';
    const { playlist, error } = await createPlaylist({ nome, descrizione });
    if (error) return error;
    setPlaylists((prev) => [playlist, ...(prev ?? [])]);
    return null;
  };

  const handleDelete = async (playlistId) => {
    const { error } = await deletePlaylist(playlistId);
    if (error) return;
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    setOpenPlaylistId(null);
  };

  const handleRemoveTrack = async (playlistId, trackRowId) => {
    const { error } = await removeTrackFromPlaylist(trackRowId);
    if (error) return;
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackRowId) } : p)));
  };

  const handleAddTrack = async (playlistId, track) => {
    if (requireAuth()) return;
    const { track: saved, error } = await addTrackToPlaylist(playlistId, track);
    if (error) return;
    setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? { ...p, tracks: [saved, ...p.tracks] } : p)));
  };

  const handleCreatePlaylistAndAdd = async (nome, track) => {
    if (requireAuth()) return;
    const { playlist, error } = await createPlaylist({ nome });
    if (error) return;
    const { track: saved, error: trackError } = await addTrackToPlaylist(playlist.id, track);
    const finalPlaylist = trackError ? playlist : { ...playlist, tracks: [saved] };
    setPlaylists((prev) => [finalPlaylist, ...(prev ?? [])]);
  };

  const openFromAnywhere = (playlistId) => {
    setTab('raccolta');
    setOpenPlaylistId(playlistId);
  };

  return (
    <div className="rb-musicapp">
      <div className="rb-musicapp-body">
        {tab === 'home' && (
          <MusicaHome
            user={user}
            onOpenAuth={onOpenAuth}
            playlists={playlists ?? []}
            likedTracks={likedTracks}
            playingId={nowPlaying?.id ?? null}
            onTogglePlay={togglePlay}
            onOpenPlaylist={openFromAnywhere}
            onPlayAll={playAll}
            nowPlaying={nowPlaying}
            onAddTrack={handleAddTrack}
            onCreatePlaylistAndAdd={handleCreatePlaylistAndAdd}
          />
        )}
        {tab === 'clip' && <MusicaClip user={user} onOpenAuth={onOpenAuth} />}
        {tab === 'esplora' && <MusicaEsplora playingId={nowPlaying?.id ?? null} onTogglePlay={togglePlay} />}
        {tab === 'raccolta' && (
          <MusicaRaccolta
            user={user}
            onOpenAuth={onOpenAuth}
            playlists={playlists ?? []}
            likedTracks={likedTracks}
            openPlaylistId={openPlaylistId}
            onOpenPlaylist={setOpenPlaylistId}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onRemoveTrack={handleRemoveTrack}
            playingId={nowPlaying?.id ?? null}
            onTogglePlay={togglePlay}
            onPlayAll={playAll}
          />
        )}
      </div>

      <NowPlayingBar
        track={nowPlaying}
        onClose={() => setNowPlaying(null)}
        onEnded={advanceQueue}
        hasNext={queueIndex + 1 < queue.length}
        hasPrev={queueIndex > 0}
        onPrev={retreatQueue}
        playlists={user ? (playlists ?? []) : null}
        onAddTrack={handleAddTrack}
        onCreatePlaylistAndAdd={handleCreatePlaylistAndAdd}
      />
      <BottomNav tab={tab} onChange={setTab} />
    </div>
  );
}
