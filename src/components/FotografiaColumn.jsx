import { useEffect, useRef, useState } from 'react';
import MediaEditor from './social/MediaEditor';
import { MOCK_USERS } from '../data/mockUsers';
import { GROUPS } from '../data/groupsCategories';
import { publishContent } from '../data/contents';
import { createPost } from '../data/posts';
import { analyzeImageElement } from '../data/localVision';
import Icon from './shared/Icon';
import SocialGallery from './arte/SocialGallery';
import './FotografiaColumn.css';

const SOCIAL_USERS = MOCK_USERS.filter((u) => u.worlds.includes('social'));

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Rifà un File da una dataURL (serve dopo un'eventuale modifica con
// MediaEditor, che lavora su canvas/dataURL): publishContent carica un
// File vero sullo storage, non una stringa.
function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/data:(.*?);base64/)?.[1] ?? 'image/png';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

// Chiave che identifica un posizionamento (mondo + categoria + sottofamiglia).
function placementKey(p) {
  return `${p.world}:${p.category ?? ''}:${p.subfamily ?? ''}`;
}

// Selettore dei tag: persone e gruppi del mondo Blu, filtrabili per nome,
// mostrati come chip da attivare/disattivare con un click. Elenco piccolo
// (10 persone + i gruppi), niente autocomplete server: basta filtrare in
// memoria.
function TagPicker({ selectedUserIds, selectedGroupIds, onToggleUser, onToggleGroup }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const users = q ? SOCIAL_USERS.filter((u) => u.name.toLowerCase().includes(q)) : SOCIAL_USERS;
  const groups = q ? GROUPS.filter((g) => g.name.toLowerCase().includes(q)) : GROUPS;

  return (
    <div className="rb-foto-tagpicker">
      <input
        type="text"
        placeholder="Cerca persone o gruppi del mondo Social da taggare..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="rb-foto-tagpicker-chips">
        {users.map((u) => (
          <button
            key={u.id}
            type="button"
            className={`rb-foto-tag-chip ${selectedUserIds.includes(u.id) ? 'active' : ''}`}
            onClick={() => onToggleUser(u.id)}
          >
            <Icon name="users" size={14} className="rb-icon--inline" /> {u.name}
          </button>
        ))}
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`rb-foto-tag-chip ${selectedGroupIds.includes(g.id) ? 'active' : ''}`}
            onClick={() => onToggleGroup(g.id)}
          >
            <Icon name="grid" size={14} className="rb-icon--inline" /> {g.name}
          </button>
        ))}
        {users.length === 0 && groups.length === 0 && <span className="rb-foto-tag-empty">Nessun risultato</span>}
      </div>
    </div>
  );
}

// Galleria immagini (mondo Intrattenimento): la griglia mostra le foto dei
// post pubblici del mondo Social (arte/SocialGallery.jsx, RPC
// galleria_social). Chi carica una foto da qui pubblica un post nel Social
// (contenuto su Supabase, data/contents.js, più la riga in posts), così
// compare nella galleria come tutte le altre. Al
// caricamento, un'analisi gratuita nel browser (data/localVision.js)
// suggerisce tag e — se riconosce un tramonto — la sottofamiglia "Tramonti";
// se la foto viene taggata a persone/gruppi del mondo Social, compare anche
// nella sua bacheca (un vero posizionamento condiviso, non solo una copia).
export default function FotografiaColumn({ user, onOpenAuth }) {
  const [galleryKey, setGalleryKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [draftSrc, setDraftSrc] = useState(null);
  const [caption, setCaption] = useState('');
  const [tagUserIds, setTagUserIds] = useState([]);
  const [tagGroupIds, setTagGroupIds] = useState([]);
  const [editing, setEditing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [suggestedSubfamily, setSuggestedSubfamily] = useState(null);
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

  const onFileChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setDraftSrc(reader.result);
      setShowForm(true);
      setAnalyzing(true);
      try {
        const img = await loadImageElement(reader.result);
        const result = await analyzeImageElement(img);
        setSuggestedTags(result.tags);
        const ownPlacement = result.placements.find((p) => p.world === 'arte' && p.category === 'fotografia');
        setSuggestedSubfamily(ownPlacement?.subfamily ?? null);
        const others = result.placements.filter((p) => !(p.world === 'arte' && p.category === 'fotografia'));
        setExtraPlacements(others);
        setConfirmedPlacements(new Set(others.map(placementKey)));
      } catch {
        // Analisi non riuscita: si può comunque pubblicare, solo senza suggerimenti.
      } finally {
        setAnalyzing(false);
      }
    };
    reader.readAsDataURL(file);
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
    setDraftSrc(null);
    setCaption('');
    setTagUserIds([]);
    setTagGroupIds([]);
    setSuggestedTags([]);
    setSuggestedSubfamily(null);
    setExtraPlacements([]);
    setConfirmedPlacements(new Set());
    setManualTagsText('');
    setPublishError(null);
  };

  const publish = async () => {
    if (!draftSrc || publishing) return;
    setPublishing(true);
    setPublishError(null);
    const manualTags = manualTagsText.split(',').map((t) => t.trim()).filter(Boolean);
    const allTags = Array.from(new Set([...suggestedTags, ...manualTags]));
    const chosenExtra = extraPlacements.filter((p) => confirmedPlacements.has(placementKey(p)));
    // Una foto pubblicata qui compare sempre anche nel mondo Social (e
    // viceversa, vedi PostComposer): stesso contenuto, stessi like, senza
    // doverla ripubblicare a mano nei due mondi.
    const placements = [{ world: 'arte', category: 'fotografia', subfamily: suggestedSubfamily }, ...chosenExtra];
    if (!placements.some((p) => placementKey(p) === placementKey({ world: 'social' }))) {
      placements.push({ world: 'social' });
    }
    const file = dataUrlToFile(draftSrc, `foto-${Date.now()}.png`);
    const { content, url, error } = await publishContent({ file, type: 'foto', caption: caption.trim(), tags: allTags, placements });
    if (error) {
      setPublishing(false);
      setPublishError(error);
      return;
    }
    // Post pubblico nel mondo Social con la foto: è da lì che la galleria
    // (e il feed Social, che non la duplica: stesso contentId) la prende.
    const post = await createPost({ testo: caption.trim(), contentId: content.id, mediaUrl: url, mediaType: 'foto', tags: allTags, mondo: 'social' });
    setPublishing(false);
    if (post.error) {
      setPublishError(post.error);
      return;
    }
    resetForm();
    setGalleryKey((k) => k + 1);
  };

  return (
    <div className="rb-foto-column">
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        hidden
        onChange={onFileChosen}
      />
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onFileChosen} />

      <div className="rb-foto-header">
        <div>
          <h3>Galleria immagini</h3>
          <p>Le foto pubblicate nel mondo Social, votate dalla community.</p>
        </div>
        <div className="rb-foto-upload-btns">
          <button type="button" className="rb-foto-upload-btn" onClick={() => openPicker(cameraInputRef)}>
            <Icon name="camera" size={17} className="rb-icon--inline" /> Scatta
          </button>
          <button type="button" className="rb-foto-upload-btn" onClick={() => openPicker(fileInputRef)}>
            <Icon name="image" size={17} className="rb-icon--inline" /> Galleria
          </button>
        </div>
      </div>

      {showForm && draftSrc && (
        <div className="rb-foto-form">
          <img className="rb-foto-form-preview" src={draftSrc} alt="Anteprima" />
          <button type="button" className="rb-foto-edit-btn" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={16} className="rb-icon--inline" /> Modifica
          </button>

          {analyzing && <p className="rb-foto-form-hint">Sto analizzando il contenuto...</p>}
          {!analyzing && suggestedTags.length > 0 && (
            <p className="rb-foto-form-hint">Tag suggeriti: {suggestedTags.map((t) => `#${t}`).join(' ')}</p>
          )}
          {!analyzing && suggestedSubfamily && (
            <p className="rb-foto-form-hint">Riconosciuto: Galleria immagini · {suggestedSubfamily}</p>
          )}
          {!analyzing &&
            extraPlacements.map((p) => {
              const key = placementKey(p);
              return (
                <label key={key} className="rb-foto-placement-row">
                  <input type="checkbox" checked={confirmedPlacements.has(key)} onChange={() => togglePlacement(key)} />
                  Pubblica anche in {p.label}
                </label>
              );
            })}
          <input
            type="text"
            className="rb-foto-manual-tags-input"
            placeholder="Aggiungi i tuoi tag, separati da virgola (facoltativo)"
            value={manualTagsText}
            onChange={(e) => setManualTagsText(e.target.value)}
          />

          <textarea
            placeholder="Didascalia (facoltativa)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
          />
          <TagPicker
            selectedUserIds={tagUserIds}
            selectedGroupIds={tagGroupIds}
            onToggleUser={(id) => setTagUserIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))}
            onToggleGroup={(id) => setTagGroupIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))}
          />
          <p className="rb-foto-form-hint">Questa foto comparirà anche nella bacheca del mondo Social.</p>
          {publishError && (
            <p className="rb-foto-form-error">
              <Icon name="info" size={16} className="rb-icon--inline" /> {publishError}
            </p>
          )}
          <div className="rb-foto-form-actions">
            <button type="button" className="rb-foto-form-cancel" onClick={resetForm}>Annulla</button>
            <button type="button" className="rb-foto-form-publish" onClick={publish} disabled={publishing}>
              {publishing ? 'Pubblicazione...' : 'Pubblica'}
            </button>
          </div>
        </div>
      )}

      <SocialGallery key={galleryKey} tipo="foto" user={user} onOpenAuth={onOpenAuth} />

      {editing && (
        <MediaEditor
          type="photo"
          src={draftSrc}
          onCancel={() => setEditing(false)}
          onSave={(newSrc) => {
            setDraftSrc(newSrc);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
