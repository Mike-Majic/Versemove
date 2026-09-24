import { useState } from 'react';
import { createPlace, uploadDogPhoto } from '../../data/dogWorld';
import { DOG_PLACE_TYPES } from './dogPlaceMeta';
import ModalOverlay from '../ModalOverlay';
import { useDirtySnapshot } from '../../hooks/useUnsavedChanges';
import './AddDogPlaceModal.css';

// Modulo "Aggiungi luogo": la posizione arriva già scelta (click sulla
// mappa, o il centro attuale se si preme il bottone "+ Aggiungi luogo",
// vedi DogWorldMap) — qui si compilano solo tipo, nome e le comodità.
// Sempre source='user' (vedi data/dogWorld.js createPlace): solo Cowork/OSM
// popolano source='osm' via import, mai dal client.
export default function AddDogPlaceModal({ lat, lng, onClose, onCreated }) {
  const [tipo, setTipo] = useState('area_cani');
  const [nome, setNome] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [taglia, setTaglia] = useState('tutte');
  const [recintata, setRecintata] = useState(false);
  const [acqua, setAcqua] = useState(false);
  const [ombra, setOmbra] = useState(false);
  const [illuminata, setIlluminata] = useState(false);
  const [fotoFiles, setFotoFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldsDirty] = useDirtySnapshot({ tipo, nome, descrizione, taglia, recintata, acqua, ombra, illuminata });
  const hasUnsavedChanges = fieldsDirty || fotoFiles.length > 0;

  const onPickFiles = (e) => {
    const files = Array.from(e.target.files ?? []).slice(0, 10 - fotoFiles.length);
    setFotoFiles((prev) => [...prev, ...files]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nome.trim() || nome.trim().length < 2) {
      setError('Il nome deve avere almeno 2 caratteri.');
      return;
    }
    setBusy(true);
    setError('');
    const fotoPaths = [];
    for (const file of fotoFiles) {
      const { path, error: uploadErr } = await uploadDogPhoto(file);
      if (uploadErr) {
        setError(uploadErr);
        setBusy(false);
        return;
      }
      fotoPaths.push(path);
    }
    const { error: createErr } = await createPlace({
      tipo,
      nome,
      descrizione,
      lat,
      lng,
      taglia,
      recintata,
      acqua,
      ombra,
      illuminata,
      foto: fotoPaths,
    });
    setBusy(false);
    if (createErr) {
      setError(createErr);
      return;
    }
    onCreated();
  };

  return (
    <ModalOverlay onClose={onClose} hasUnsavedChanges={hasUnsavedChanges}>
      <form className="rb-dogadd-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <button type="button" className="rb-close-btn rb-dogadd-close" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
        <h3>Aggiungi un luogo</h3>
        <p className="rb-dogadd-coords">📍 {lat.toFixed(5)}, {lng.toFixed(5)}</p>

        <div className="rb-dogadd-type-grid">
          {Object.entries(DOG_PLACE_TYPES).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              className={`rb-dogadd-type-btn ${tipo === key ? 'active' : ''}`}
              style={tipo === key ? { background: meta.color, borderColor: meta.color } : undefined}
              onClick={() => setTipo(key)}
            >
              {meta.emoji}
              <span>{meta.label}</span>
            </button>
          ))}
        </div>

        <label className="rb-field">
          <span>Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required />
        </label>

        <label className="rb-field">
          <span>Descrizione (facoltativa)</span>
          <textarea value={descrizione} onChange={(e) => setDescrizione(e.target.value)} rows={3} maxLength={1000} />
        </label>

        <label className="rb-field">
          <span>Taglia adatta</span>
          <select value={taglia} onChange={(e) => setTaglia(e.target.value)}>
            <option value="tutte">Tutte le taglie</option>
            <option value="piccola">Piccola</option>
            <option value="grande">Grande</option>
          </select>
        </label>

        <div className="rb-dogadd-checks">
          <label className="rb-dogadd-check">
            <input type="checkbox" checked={recintata} onChange={(e) => setRecintata(e.target.checked)} /> 🔒 Recintata
          </label>
          <label className="rb-dogadd-check">
            <input type="checkbox" checked={acqua} onChange={(e) => setAcqua(e.target.checked)} /> 💧 Acqua
          </label>
          <label className="rb-dogadd-check">
            <input type="checkbox" checked={ombra} onChange={(e) => setOmbra(e.target.checked)} /> 🌳 Ombra
          </label>
          <label className="rb-dogadd-check">
            <input type="checkbox" checked={illuminata} onChange={(e) => setIlluminata(e.target.checked)} /> 💡 Illuminata
          </label>
        </div>

        <label className="rb-dogsheet-photo-add">
          📷 Aggiungi foto ({fotoFiles.length}/10)
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onPickFiles} />
        </label>

        {error && <p className="rb-privacy-error">{error}</p>}

        <button type="submit" className="rb-btn-primary" disabled={busy}>
          {busy ? 'Pubblico…' : 'Pubblica luogo'}
        </button>
      </form>
    </ModalOverlay>
  );
}
