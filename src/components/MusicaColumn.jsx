import { useMemo, useState, useEffect } from 'react';
import {
  listMyPlaylists,
  createPlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
} from '../data/musicPlaylists';
import { searchYoutubeVideos, youtubeEmbedUrl } from '../data/youtubeSearch';
import { listFollowingProfiles } from '../data/follows';
import { useIsDesktopLayout } from '../hooks/useIsDesktopLayout';
import TwoColumnSwitcher from './layout/TwoColumnSwitcher';
import './MusicaColumn.css';

// Copertina/titolo/artista + bottone play-pausa, riusato per i risultati di
// ricerca, i brani di una playlist e i "brani che ti piacciono": non
// riproduce nulla da solo, segnala solo quale brano è quello "in
// riproduzione" (playingId) a chi lo usa — la riproduzione vera è un'unica
// barra condivisa in fondo alla colonna (vedi NowPlayingBar).
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

// Player unico e fisso in fondo alla colonna: un solo video YouTube alla
// volta, piccolo apposta (qui si ascolta, non si guarda — per guardare
// video interi c'è la categoria Video nel mondo Arte). L'id viene sempre
// dalla risposta dell'API di ricerca o da un brano già salvato, mai da un
// link incollato a mano.
function NowPlayingBar({ track, onClose }) {
  if (!track) return null;
  return (
    <div className="rb-musica-now-playing">
      <iframe
        key={track.id}
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
      <button type="button" className="rb-musica-now-playing-close" onClick={onClose} aria-label="Ferma">✕</button>
    </div>
  );
}

// Popover minuscolo per scegliere in quale playlist mettere un brano
// trovato con la ricerca, con la possibilità di crearne una al volo.
function AddToPlaylistMenu({ playlists, onAdd, onCreateAndAdd }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  return (
    <div className="rb-musica-add-menu">
      <button type="button" className="rb-musica-add-btn" onClick={() => setOpen((v) => !v)}>
        + Playlist
      </button>
      {open && (
        <div className="rb-musica-add-popover">
          {playlists.length > 0 && (
            <ul>
              {playlists.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(p.id);
                      setOpen(false);
                    }}
                  >
                    {p.nome}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!creating ? (
            <button type="button" className="rb-musica-add-new-btn" onClick={() => setCreating(true)}>
              + Nuova playlist
            </button>
          ) : (
            <div className="rb-musica-add-new-form">
              <input
                type="text"
                placeholder="Nome playlist"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={60}
                autoFocus
              />
              <button
                type="button"
                disabled={!newName.trim()}
                onClick={() => {
                  onCreateAndAdd(newName);
                  setNewName('');
                  setCreating(false);
                  setOpen(false);
                }}
              >
                Crea e aggiungi
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Scheda "Cerca musica": ricerca in tempo reale su YouTube (data/youtubeSearch.js,
// serve una chiave API — quota gratuita limitata, vedi commento lì), ascolto
// diretto dentro l'app tramite la barra in fondo (NowPlayingBar), senza mai
// uscire su youtube.com.
function MusicSearchTab({ playlists, onAddTrack, onCreatePlaylistAndAdd, playingId, onTogglePlay }) {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const result = await searchYoutubeVideos(query);
      setTracks(result);
    } catch (err) {
      setError(
        err.message === 'timeout'
          ? 'La ricerca ci sta mettendo troppo a rispondere. Controlla la connessione e riprova.'
          : err.message === 'quota'
            ? 'Limite giornaliero di ricerche raggiunto. Riprova domani.'
            : 'Impossibile cercare su YouTube ora. Riprova più tardi.'
      );
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rb-musica-search">
      <p className="rb-musica-note">🌍 Cerca ed ascolta da YouTube, senza uscire da Versemove.</p>
      <div className="rb-musica-search-row">
        <input
          type="text"
          placeholder="Cerca titolo o artista..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="rb-musica-search-btn" onClick={search}>
          Cerca
        </button>
      </div>

      {loading && <p className="rb-musica-status">Cerco su YouTube...</p>}
      {error && <p className="rb-musica-status rb-musica-error">{error}</p>}
      {!loading && !error && searched && tracks.length === 0 && (
        <p className="rb-musica-status">Nessun brano trovato.</p>
      )}

      <ul className="rb-musica-track-list">
        {tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            playingId={playingId}
            onTogglePlay={onTogglePlay}
            action={
              <AddToPlaylistMenu
                playlists={playlists}
                onAdd={(playlistId) => onAddTrack(playlistId, t)}
                onCreateAndAdd={(nome) => onCreatePlaylistAndAdd(nome, t)}
              />
            }
          />
        ))}
      </ul>
    </div>
  );
}

// Dentro una playlist aperta: i brani salvati (id video YouTube +
// titolo/canale/copertina, vedi data/musicPlaylists.js), ognuno riascoltabile
// dalla stessa barra condivisa e rimovibile.
function PlaylistDetail({ playlist, onBack, onDelete, onRemoveTrack, playingId, onTogglePlay }) {
  return (
    <div className="rb-musica-playlist-detail">
      <div className="rb-musica-playlist-detail-header">
        <button type="button" className="rb-musica-back-btn" onClick={onBack}>← Playlist</button>
        <div>
          <strong>{playlist.nome}</strong>
          {playlist.descrizione && <p className="rb-musica-playlist-detail-desc">{playlist.descrizione}</p>}
        </div>
        <button type="button" className="rb-musica-delete-btn" onClick={() => onDelete(playlist.id)}>Elimina playlist</button>
      </div>

      <ul className="rb-musica-track-list">
        {playlist.tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={{ id: t.track_id, title: t.title, artist: t.artist, artworkUrl: t.artwork_url }}
            playingId={playingId}
            onTogglePlay={onTogglePlay}
            action={
              <button type="button" className="rb-musica-remove-btn" onClick={() => onRemoveTrack(t.id)} title="Rimuovi dalla playlist">
                ✕
              </button>
            }
          />
        ))}
        {playlist.tracks.length === 0 && <li className="rb-musica-empty">Nessun brano in questa playlist ancora — cercalo nella scheda "Cerca musica".</li>}
      </ul>
    </div>
  );
}

// Scheda "Le mie playlist": stile Facebook/Spotify "preferiti" — crea
// playlist, aggiunge brani trovati con la ricerca, le riascolta.
function PlaylistsTab({ playlists, onCreate, onDelete, onRemoveTrack, openPlaylistId, onOpenPlaylist, playingId, onTogglePlay }) {
  const [showNewForm, setShowNewForm] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const createNew = async () => {
    if (!newNome.trim() || creating) return;
    setCreating(true);
    setError('');
    const err = await onCreate(newNome, newDesc);
    setCreating(false);
    if (err) {
      setError(err);
      return;
    }
    setShowNewForm(false);
    setNewNome('');
    setNewDesc('');
  };

  const openPlaylist = playlists.find((p) => p.id === openPlaylistId);
  if (openPlaylist) {
    return (
      <PlaylistDetail
        playlist={openPlaylist}
        onBack={() => onOpenPlaylist(null)}
        onDelete={onDelete}
        onRemoveTrack={(trackId) => onRemoveTrack(openPlaylist.id, trackId)}
        playingId={playingId}
        onTogglePlay={onTogglePlay}
      />
    );
  }

  return (
    <div className="rb-musica-playlists">
      {!showNewForm ? (
        <button type="button" className="rb-musica-new-playlist-btn" onClick={() => setShowNewForm(true)}>+ Nuova playlist</button>
      ) : (
        <div className="rb-musica-new-playlist-form">
          <input
            type="text"
            placeholder="Nome playlist (es. Per correre)"
            value={newNome}
            onChange={(e) => setNewNome(e.target.value)}
            maxLength={60}
          />
          <textarea
            placeholder="Descrizione (facoltativa)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            maxLength={300}
            rows={2}
          />
          <div className="rb-musica-new-playlist-actions">
            <button type="button" onClick={() => setShowNewForm(false)}>Annulla</button>
            <button type="button" className="rb-musica-new-playlist-submit" onClick={createNew} disabled={!newNome.trim() || creating}>
              {creating ? 'Creazione...' : 'Crea'}
            </button>
          </div>
        </div>
      )}

      {error && <p className="rb-musica-status rb-musica-error">{error}</p>}

      <div className="rb-musica-playlists-grid">
        {playlists.map((p) => (
          <button type="button" key={p.id} className="rb-musica-playlist-card" onClick={() => onOpenPlaylist(p.id)}>
            <div className="rb-musica-playlist-cover">
              {p.tracks[0]?.artwork_url ? <img src={p.tracks[0].artwork_url} alt="" /> : <span>🎧</span>}
            </div>
            <strong>{p.nome}</strong>
            <span>{p.tracks.length} {p.tracks.length === 1 ? 'brano' : 'brani'}</span>
          </button>
        ))}
        {playlists.length === 0 && !showNewForm && <p className="rb-musica-empty">Non hai ancora nessuna playlist.</p>}
      </div>
    </div>
  );
}

// Colonna destra "Il mio profilo musicale": scorciatoia alle proprie
// playlist, chi si segue (riusa data/follows.js, stesso sistema del mondo
// Social) e i brani salvati in una qualunque playlist, riascoltabili da
// qui senza dover entrare in ognuna (deduplicati per brano).
function MusicProfileSidebar({ playlists, user, isDesktop, onOpenPlaylist, onBackToPrimary, playingId, onTogglePlay }) {
  const [following, setFollowing] = useState(() => (user ? null : []));

  useEffect(() => {
    if (!user) return;
    listFollowingProfiles().then(setFollowing);
  }, [user]);

  const likedTracks = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const p of playlists) {
      for (const t of p.tracks) {
        if (seen.has(t.track_id)) continue;
        seen.add(t.track_id);
        out.push({ id: t.track_id, title: t.title, artist: t.artist, artworkUrl: t.artwork_url, addedAt: t.added_at });
      }
    }
    return out.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt)).slice(0, 15);
  }, [playlists]);

  return (
    <div className="rb-musica-profile">
      {!isDesktop && (
        <button type="button" className="rb-musica-mobile-back" onClick={onBackToPrimary}>← Torna a Musica</button>
      )}
      <div className="rb-musica-header">
        <h3>Il mio profilo musicale</h3>
      </div>

      {!user ? (
        <p className="rb-musica-status">Accedi per vedere le tue playlist, chi segui e i brani che ti piacciono.</p>
      ) : (
        <>
          <div className="rb-musica-profile-section">
            <h4>Le mie playlist</h4>
            {playlists.length === 0 ? (
              <p className="rb-musica-status">Non hai ancora playlist.</p>
            ) : (
              <ul className="rb-musica-profile-playlist-list">
                {playlists.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => onOpenPlaylist(p.id)}>
                      🎧 {p.nome} <span>({p.tracks.length})</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rb-musica-profile-section">
            <h4>Chi segui</h4>
            {following === null ? (
              <p className="rb-musica-status">Carico...</p>
            ) : following.length === 0 ? (
              <p className="rb-musica-status">Non segui ancora nessuno.</p>
            ) : (
              <ul className="rb-musica-profile-follow-list">
                {following.map((f) => (
                  <li key={f.id}>
                    {f.avatar ? <img src={f.avatar} alt="" /> : <span className="rb-musica-follow-avatar-empty">👤</span>}
                    <span>{f.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rb-musica-profile-section">
            <h4>Brani che ti piacciono</h4>
            {likedTracks.length === 0 ? (
              <p className="rb-musica-status">Nessun brano salvato ancora.</p>
            ) : (
              <ul className="rb-musica-track-list">
                {likedTracks.map((t) => (
                  <TrackRow key={t.id} track={t} playingId={playingId} onTogglePlay={onTogglePlay} action={null} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Sostituisce la vecchia categoria Musica generica (dati finti, sempre
// "Nessun risultato"): playlist personali (schema DB proprio) + ricerca e
// ascolto reali su YouTube, con un unico player condiviso da tutte le
// schede/colonne (NowPlayingBar) così passare da "Cerca musica" a una
// playlist non interrompe quello che si sta ascoltando a meno di premere
// play su qualcos'altro.
export default function MusicaColumn({ category, user, onOpenAuth }) {
  const [tab, setTab] = useState('playlist'); // 'playlist' | 'cerca'
  const [playlists, setPlaylists] = useState(() => (user ? null : []));
  const [openPlaylistId, setOpenPlaylistId] = useState(null);
  const [mobileView, setMobileView] = useState('primary');
  const [nowPlaying, setNowPlaying] = useState(null);
  const isDesktop = useIsDesktopLayout();

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
    setNowPlaying((prev) => (prev?.id === track.id ? null : track));
  };

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

  const handleRemoveTrack = async (playlistId, trackRowId) => {
    const { error } = await removeTrackFromPlaylist(trackRowId);
    if (error) return;
    setPlaylists((prev) =>
      prev.map((p) => (p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackRowId) } : p))
    );
  };

  const openFromSidebar = (playlistId) => {
    setTab('playlist');
    setOpenPlaylistId(playlistId);
    if (!isDesktop) setMobileView('primary');
  };

  const primaryContent = (
    <>
      <div className="rb-musica-header">
        <h3>{category.label}</h3>
      </div>

      <div className="rb-musica-tabs">
        <button type="button" className={`rb-musica-tab ${tab === 'playlist' ? 'active' : ''}`} onClick={() => setTab('playlist')}>
          Le mie playlist
        </button>
        <button type="button" className={`rb-musica-tab ${tab === 'cerca' ? 'active' : ''}`} onClick={() => setTab('cerca')}>
          Cerca musica
        </button>
      </div>

      {tab === 'playlist' ? (
        !user ? (
          <p className="rb-musica-status">Accedi per creare le tue playlist.</p>
        ) : (
          <PlaylistsTab
            playlists={playlists ?? []}
            onCreate={handleCreate}
            onDelete={handleDelete}
            onRemoveTrack={handleRemoveTrack}
            openPlaylistId={openPlaylistId}
            onOpenPlaylist={setOpenPlaylistId}
            playingId={nowPlaying?.id ?? null}
            onTogglePlay={togglePlay}
          />
        )
      ) : (
        <MusicSearchTab
          playlists={playlists ?? []}
          onAddTrack={handleAddTrack}
          onCreatePlaylistAndAdd={handleCreatePlaylistAndAdd}
          playingId={nowPlaying?.id ?? null}
          onTogglePlay={togglePlay}
        />
      )}
    </>
  );

  const secondaryContent = (
    <MusicProfileSidebar
      playlists={playlists ?? []}
      user={user}
      isDesktop={isDesktop}
      onOpenPlaylist={openFromSidebar}
      onBackToPrimary={() => setMobileView('primary')}
      playingId={nowPlaying?.id ?? null}
      onTogglePlay={togglePlay}
    />
  );

  return (
    <>
      <TwoColumnSwitcher
        primary={primaryContent}
        secondary={secondaryContent}
        primaryLabel={category.label}
        secondaryLabel="Il mio profilo"
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
      />
      <NowPlayingBar track={nowPlaying} onClose={() => setNowPlaying(null)} />
    </>
  );
}
