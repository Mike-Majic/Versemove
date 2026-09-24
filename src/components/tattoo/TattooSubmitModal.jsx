import { useEffect, useRef, useState } from 'react';
import { createStudio, createPost, uploadTattooPhoto, findNearbyStudio } from '../../data/tattoo';
import { STILI_TATUAGGIO, PARTI_CORPO, DIMENSIONI_TATUAGGIO } from '../../data/tattooMeta';
import ModalOverlay from '../ModalOverlay';
import { useDirtySnapshot } from '../../hooks/useUnsavedChanges';
import CustomSelect from '../shared/CustomSelect';
import './tattoo.css';
// Riusa le classi del modulo di pubblicazione di Vetrina (rb-deal-field,
// rb-deal-duplicate-*...): stesso linguaggio visivo di form/conferma, non
// duplicato qui.
import '../vetrina/vetrinaOfferte.css';

const STILE_OPTIONS = STILI_TATUAGGIO.map((s) => ({ value: s, label: s }));
const PARTE_OPTIONS = PARTI_CORPO.map((p) => ({ value: p, label: p }));

const MAX_FOTO = 6;
const DEDUP_RAGGIO_M = 150;
const ITALY_CENTER = [42.3, 12.6];
const ITALY_ZOOM = 5;

// Mini-mappa per scegliere la posizione dello STUDIO (mai la posizione
// dell'utente, vedi specifica): stesso caricamento lazy di leaflet usato
// da DogWorldMap/TattooMap, ma senza clustering — qui serve solo un
// click per posizionare un unico marker trascinabile.
function StudioLocationPicker({ lat, lng, onPick }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leafletMod = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled) return;
      const L = leafletMod.default ?? leafletMod;
      const map = L.map(mapElRef.current, {
        center: lat != null ? [lat, lng] : ITALY_CENTER,
        zoom: lat != null ? 15 : ITALY_ZOOM,
        zoomControl: false,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      mapRef.current = map;
      if (lat != null) {
        markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => {
          const p = markerRef.current.getLatLng();
          onPick(p.lat, p.lng);
        });
      }
      map.on('click', (e) => {
        if (markerRef.current) {
          markerRef.current.setLatLng(e.latlng);
        } else {
          markerRef.current = L.marker(e.latlng, { draggable: true }).addTo(map);
          markerRef.current.on('dragend', () => {
            const p = markerRef.current.getLatLng();
            onPick(p.lat, p.lng);
          });
        }
        onPick(e.latlng.lat, e.latlng.lng);
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      mapRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 15);
      onPick(pos.coords.latitude, pos.coords.longitude);
    });
  };

  return (
    <div className="rb-tattoo-picker">
      <div className="rb-tattoo-picker-canvas" ref={mapElRef} />
      {ready && (
        <button type="button" className="rb-tattoo-picker-locate" onClick={useMyLocation}>
          📍 Usa lo studio dove sono ora
        </button>
      )}
      <p className="rb-deal-submit-hint">Tocca la mappa per segnare dove si trova lo studio (si può trascinare per aggiustare).</p>
    </div>
  );
}

// Form "+ Pubblica" della categoria Tattoo: posizione dello studio su
// mini-mappa → controllo doppioni entro 150m ("È questo studio?", come
// richiesto) → campi del post → foto (fino a 6, caricate una alla volta
// nello stesso bucket content-media del resto dell'app).
export default function TattooSubmitModal({ onClose, onPublished }) {
  const [step, setStep] = useState('luogo'); // luogo | conferma-studio | form
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [nearbyStudio, setNearbyStudio] = useState(null);
  const [studioIdScelto, setStudioIdScelto] = useState(null);
  const [nomeStudio, setNomeStudio] = useState('');
  const [cittaStudio, setCittaStudio] = useState('');

  const [fotoFiles, setFotoFiles] = useState([]);
  const [stile, setStile] = useState(STILE_OPTIONS[0].value);
  const [parteCorpo, setParteCorpo] = useState(PARTE_OPTIONS[0].value);
  const [colore, setColore] = useState(true);
  const [dimensione, setDimensione] = useState('medio');
  const [artistaNome, setArtistaNome] = useState('');
  const [voto, setVoto] = useState(5);
  const [testo, setTesto] = useState('');
  const [prezzoIndicativo, setPrezzoIndicativo] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldsDirty] = useDirtySnapshot({
    lat, lng, studioIdScelto, nomeStudio, cittaStudio, stile, parteCorpo, colore, dimensione, artistaNome, voto, testo, prezzoIndicativo,
  });
  const hasUnsavedChanges = fieldsDirty || fotoFiles.length > 0;

  const handlePick = (newLat, newLng) => {
    setLat(newLat);
    setLng(newLng);
  };

  const checkDuplicateAndContinue = async () => {
    if (lat == null) {
      setError('Segna prima la posizione dello studio sulla mappa.');
      return;
    }
    setError('');
    const found = await findNearbyStudio(lat, lng, DEDUP_RAGGIO_M);
    if (found) {
      setNearbyStudio(found);
      setStep('conferma-studio');
    } else {
      setStep('form');
    }
  };

  const useExistingStudio = () => {
    setStudioIdScelto(nearbyStudio.id);
    setStep('form');
  };
  const createNewStudio = () => {
    setStudioIdScelto(null);
    setStep('form');
  };

  const onPickFiles = (e) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_FOTO - fotoFiles.length);
    setFotoFiles((prev) => [...prev, ...files]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fotoFiles.length) {
      setError('Aggiungi almeno una foto.');
      return;
    }
    if (!studioIdScelto && !nomeStudio.trim()) {
      setError('Manca il nome dello studio.');
      return;
    }
    setBusy(true);
    setError('');

    let studioId = studioIdScelto;
    if (!studioId) {
      const { id, error: studioErr } = await createStudio({ nome: nomeStudio, lat, lng, citta: cittaStudio });
      if (studioErr) {
        setError(studioErr);
        setBusy(false);
        return;
      }
      studioId = id;
    }

    const fotoPaths = [];
    for (const file of fotoFiles) {
      const { path, error: uploadErr } = await uploadTattooPhoto(file);
      if (uploadErr) {
        setError(uploadErr);
        setBusy(false);
        return;
      }
      fotoPaths.push(path);
    }

    const { error: postErr } = await createPost({
      studioId,
      foto: fotoPaths,
      stile,
      parteCorpo,
      colore,
      dimensione,
      artistaNome,
      voto,
      testo,
      prezzoIndicativo: prezzoIndicativo ? Number(prezzoIndicativo) : null,
    });
    setBusy(false);
    if (postErr) {
      setError(postErr);
      return;
    }
    onPublished?.();
  };

  return (
    <ModalOverlay onClose={onClose} hasUnsavedChanges={hasUnsavedChanges}>
      <div className="rb-deal-submit-card rb-tattoo-submit-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <h3>Pubblica un tatuaggio</h3>

        {step === 'luogo' && (
          <>
            <StudioLocationPicker lat={lat} lng={lng} onPick={handlePick} />
            {error && <p className="rb-privacy-error">{error}</p>}
            <button type="button" className="rb-btn-primary" onClick={checkDuplicateAndContinue} disabled={lat == null}>
              Continua
            </button>
          </>
        )}

        {step === 'conferma-studio' && (
          <>
            <p className="rb-deal-submit-hint">C'è già uno studio registrato qui vicino.</p>
            <div className="rb-deal-duplicate-preview">
              <div>
                <strong>{nearbyStudio.nome}</strong>
                {nearbyStudio.citta && <span>{nearbyStudio.citta}</span>}
              </div>
            </div>
            <p className="rb-deal-submit-hint">È questo studio?</p>
            <div className="rb-deal-duplicate-actions">
              <button type="button" className="rb-reset-filters-btn" onClick={createNewStudio}>
                No, è un altro
              </button>
              <button type="button" className="rb-btn-primary" onClick={useExistingStudio}>
                Sì, è questo
              </button>
            </div>
          </>
        )}

        {step === 'form' && (
          <form onSubmit={handleSubmit}>
            {!studioIdScelto && (
              <>
                <label className="rb-deal-field">
                  <span>Nome dello studio</span>
                  <input type="text" required value={nomeStudio} onChange={(e) => setNomeStudio(e.target.value)} />
                </label>
                <label className="rb-deal-field">
                  <span>Città</span>
                  <input type="text" value={cittaStudio} onChange={(e) => setCittaStudio(e.target.value)} />
                </label>
              </>
            )}

            <label className="rb-deal-field">
              <span>Foto (fino a {MAX_FOTO})</span>
              <input type="file" accept="image/*" multiple onChange={onPickFiles} disabled={fotoFiles.length >= MAX_FOTO} />
              {fotoFiles.length > 0 && <p className="rb-deal-submit-hint">{fotoFiles.length} foto selezionate</p>}
            </label>

            <div className="rb-deal-field-row">
              <label className="rb-deal-field">
                <span>Stile</span>
                <CustomSelect value={stile} options={STILE_OPTIONS} onChange={setStile} ariaLabel="Stile" />
              </label>
              <label className="rb-deal-field">
                <span>Parte del corpo</span>
                <CustomSelect value={parteCorpo} options={PARTE_OPTIONS} onChange={setParteCorpo} ariaLabel="Parte del corpo" />
              </label>
            </div>

            <div className="rb-tattoo-online-toggle">
              <label>
                <input type="radio" checked={colore} onChange={() => setColore(true)} /> Colore
              </label>
              <label>
                <input type="radio" checked={!colore} onChange={() => setColore(false)} /> Bianco e nero
              </label>
            </div>

            <label className="rb-deal-field">
              <span>Dimensione</span>
              <CustomSelect value={dimensione} options={DIMENSIONI_TATUAGGIO} onChange={setDimensione} ariaLabel="Dimensione" />
            </label>

            <label className="rb-deal-field">
              <span>Tatuatore</span>
              <input type="text" value={artistaNome} onChange={(e) => setArtistaNome(e.target.value)} />
            </label>

            <label className="rb-deal-field">
              <span>Il tuo voto a questo lavoro</span>
              <CustomSelect
                value={String(voto)}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} ★` }))}
                onChange={(v) => setVoto(Number(v))}
                ariaLabel="Voto"
              />
            </label>

            <label className="rb-deal-field">
              <span>Racconto (esperienza, tempo di guarigione…)</span>
              <textarea rows={3} value={testo} onChange={(e) => setTesto(e.target.value)} />
            </label>

            <label className="rb-deal-field">
              <span>Prezzo indicativo (facoltativo)</span>
              <input type="number" min="0" step="1" value={prezzoIndicativo} onChange={(e) => setPrezzoIndicativo(e.target.value)} />
            </label>

            <p className="rb-deal-submit-hint">Non pubblicare foto con volti di altre persone senza il loro consenso.</p>

            {error && <p className="rb-privacy-error">{error}</p>}

            <button type="submit" className="rb-btn-primary" disabled={busy}>
              {busy ? 'Pubblico…' : 'Pubblica'}
            </button>
          </form>
        )}
      </div>
    </ModalOverlay>
  );
}
