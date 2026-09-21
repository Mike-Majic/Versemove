import { useEffect, useRef, useState } from 'react';
import {
  listMyPlaylists,
  createPlaylist,
  deletePlaylist,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
} from '../data/musicPlaylists';
import { searchTracks } from '../data/musicSearch';
import './MusicaColumn.css';

// Bottone play/pausa + copertina + titolo/artista, riusato sia per i
// risultati di ricerca sia per i brani dentro una playlist: un solo
// <audio> per colonna (passato via props), così partendo un brano si
// ferma da solo quello prima, senza doverlo gestire ad ogni chiamante.
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

// Scheda "Cerca musica": ricerca in tempo reale su iTunes Search API
// (data/musicSearch.js), gratuita e senza chiave, stesso principio già
// usato per il catalogo libri della Libreria. Solo anteprime da 30
// secondi (nessun servizio gratuito senza account fa ascoltare canzoni
// intere legalmente), ma su brani e copertine veri, milioni di titoli.
function MusicSearchTab({ playlists, onAddTrack, onCreatePlaylistAndAdd }) {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  const togglePlay = (track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = track.previewUrl;
    audio.play();
    setPlayingId(track.id);
  };

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const result = await searchTracks(query);
      setTracks(result);
    } catch (err) {
      setError(
        err.message === 'timeout'
          ? 'La ricerca ci sta mettendo troppo a rispondere. Controlla la connessione e riprova.'
          : 'Impossibile raggiungere il catalogo musicale ora. Riprova più tardi.'
      );
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rb-musica-search">
      <p className="rb-musica-note">
        🌍 Cerca tra milioni di brani reali — anteprima di 30 secondi per ognuno, come una vetrina.
      </p>
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

      {loading && <p className="rb-musica-status">Cerco nel catalogo...</p>}
      {error && <p className="rb-musica-status rb-musica-error">{error}</p>}
      {!loading && !error && searched && tracks.length === 0 && (
        <p className="rb-musica-status">Nessun brano trovato.</p>
      )}

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />

      <ul className="rb-musica-track-list">
        {tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={t}
            playingId={playingId}
            onTogglePlay={togglePlay}
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

// Dentro una playlist aperta: i brani salvati, ognuno riascoltabile
// (stessa anteprima di 30s) e rimovibile; il file audio resta quello di
// iTunes, qui si salva solo il riferimento (vedi data/musicPlaylists.js).
function PlaylistDetail({ playlist, onBack, onDelete, onRemoveTrack }) {
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  const togglePlay = (track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === track.id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = track.preview_url;
    audio.play();
    setPlayingId(track.id);
  };

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

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />

      <ul className="rb-musica-track-list">
        {playlist.tracks.map((t) => (
          <TrackRow
            key={t.id}
            track={{ id: t.id, title: t.title, artist: t.artist, artworkUrl: t.artwork_url, previewUrl: t.preview_url }}
            playingId={playingId}
            onTogglePlay={togglePlay}
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
function PlaylistsTab({ playlists, onCreate, onDelete, onRemoveTrack, openPlaylistId, onOpenPlaylist }) {
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

// Sostituisce la vecchia categoria Musica generica (dati finti, sempre
// "Nessun risultato"): ora è playlist personali + ricerca reale, stesso
// impianto della Libreria (community/catalogo mondiale) ma per la musica.
export default function MusicaColumn({ category, user, onOpenAuth }) {
  const [tab, setTab] = useState('playlist'); // 'playlist' | 'cerca'
  const [playlists, setPlaylists] = useState(() => (user ? null : []));
  const [openPlaylistId, setOpenPlaylistId] = useState(null);

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

  return (
    <div className="rb-musica-column">
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
          />
        )
      ) : (
        <MusicSearchTab
          playlists={playlists ?? []}
          onAddTrack={handleAddTrack}
          onCreatePlaylistAndAdd={handleCreatePlaylistAndAdd}
        />
      )}
    </div>
  );
}
