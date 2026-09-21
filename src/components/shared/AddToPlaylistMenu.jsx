import { useState } from 'react';
import './AddToPlaylistMenu.css';

// Popover per aggiungere un brano/video a una playlist esistente o crearne
// una al volo — stesso "atomo" usato dalla Home di Musica, dal mini-player
// e dal player Video (le playlist non distinguono audio/video, sono solo
// id+titolo+artista+copertina, vedi data/musicPlaylists.js).
// compact=true mostra solo "+" (per stare dentro barre di controllo strette).
export default function AddToPlaylistMenu({ playlists, onAdd, onCreateAndAdd, compact = false }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  return (
    <div className="rb-musica-add-menu">
      <button
        type="button"
        className={compact ? 'rb-musica-add-btn rb-musica-add-btn-compact' : 'rb-musica-add-btn'}
        onClick={() => setOpen((v) => !v)}
        aria-label="Aggiungi a preferiti o playlist"
        title="Aggiungi a preferiti o playlist"
      >
        {compact ? '+' : '+ Playlist'}
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
