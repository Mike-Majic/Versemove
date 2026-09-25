import { useCallback, useEffect, useRef, useState } from 'react';
import { ANNUNCI_CATEGORIES_META } from '../../data/annunciSchema';
import { fieldsForCategory } from '../../data/annunciSchema';
import { createListing, uploadAnnuncioPhoto, saveDraft, loadDraft, clearDraft, reverseGeocode } from '../../data/annunci';
import { suggestMakes, suggestModels } from '../../data/annunciBrands';
import ModalOverlay from '../ModalOverlay';
import CustomSelect from '../shared/CustomSelect';
import { MonthYearSelect, NumberInput, SuggestInput, YearSelect } from './AnnunciFieldInputs';
import './annunci.css';
import '../faq/faq.css';

const STEP_LABELS = ['Categoria', 'Dettagli', 'Foto', 'Prezzo', 'Posizione'];
const MAX_FOTO = 10;
const ITALY_CENTER = [42.3, 12.6];
const ITALY_ZOOM = 5;

const CATEGORIA_OPTIONS = Object.entries(ANNUNCI_CATEGORIES_META).map(([id, meta]) => ({
  value: id,
  label: `${meta.icon} ${meta.label}`,
}));

const RENT_PERIOD_OPTIONS = [
  { value: 'giorno', label: 'Al giorno' },
  { value: 'settimana', label: 'Alla settimana' },
  { value: 'mese', label: 'Al mese' },
  { value: 'anno', label: "All'anno" },
];

// Passo 5: scelta della posizione (città + punto sulla mappa) — stesso
// mini-picker Leaflet già usato per lo studio in TattooSubmitModal.jsx.
// Il segnaposto è la copertina dell'annuncio (stesso .rb-annuncio-pin
// della vista Mappa), non l'icona predefinita di Leaflet: quella cerca
// le sue immagini png in un percorso relativo al css che Vite non
// serve, e appariva come immagine rotta con la scritta "Mark".
function pinIcon(L, coverUrl) {
  return L.divIcon({
    html: `<span class="rb-annuncio-pin">${coverUrl ? `<img src="${coverUrl}" alt="" />` : '📍'}</span>`,
    className: 'rb-annuncio-pin-wrap',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function LocationPicker({ lat, lng, coverUrl, onPick }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const leafletRef = useRef(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leafletMod = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled) return;
      const L = leafletMod.default ?? leafletMod;
      const map = L.map(mapElRef.current, {
        center: lat != null ? [lat, lng] : ITALY_CENTER,
        zoom: lat != null ? 13 : ITALY_ZOOM,
        zoomControl: false,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      mapRef.current = map;
      leafletRef.current = L;
      const ensureMarker = (latlng) => {
        if (markerRef.current) {
          markerRef.current.setLatLng(latlng);
          return;
        }
        markerRef.current = L.marker(latlng, { draggable: true, icon: pinIcon(L, coverUrl) }).addTo(map);
        markerRef.current.on('dragend', () => {
          const p = markerRef.current.getLatLng();
          onPickRef.current(p.lat, p.lng);
        });
      };
      if (lat != null) ensureMarker([lat, lng]);
      map.on('click', (e) => {
        ensureMarker(e.latlng);
        onPickRef.current(e.latlng.lat, e.latlng.lng);
      });
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Copertina cambiata (o caricata dopo): aggiorna il segnaposto già posato.
  useEffect(() => {
    if (markerRef.current && leafletRef.current) markerRef.current.setIcon(pinIcon(leafletRef.current, coverUrl));
  }, [coverUrl]);

  return <div className="rb-annunci-location-map" ref={mapElRef} />;
}

function DetailField({ field, value, onChange, categoria, dettagli }) {
  const make = dettagli.make ?? dettagli.brand ?? '';
  const getSuggestions = useCallback(
    (text, signal) => (field.suggest === 'model' ? suggestModels(categoria, make, text, signal) : suggestMakes(categoria, text)),
    [field.suggest, categoria, make],
  );

  if (field.type === 'boolean') {
    return (
      <label className="rb-field rb-annunci-filter-chip">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  const label = (
    <span>
      {field.label} {field.unit ? `(${field.unit})` : ''}
    </span>
  );
  if (field.type === 'select') {
    return (
      <label className="rb-field">
        {label}
        <CustomSelect
          value={value ?? ''}
          options={[{ value: '', label: '—' }, ...field.options]}
          onChange={onChange}
          ariaLabel={field.label}
        />
      </label>
    );
  }
  // Tendine e suggerimenti hanno pulsanti propri: un <label> che li
  // avvolge farebbe scattare il primo pulsante a ogni clic sul testo,
  // quindi qui il contenitore è un <div> con la stessa classe.
  if (field.type === 'year') {
    return (
      <div className="rb-field">
        {label}
        <YearSelect value={value} onChange={onChange} ariaLabel={field.label} />
      </div>
    );
  }
  if (field.type === 'date') {
    return (
      <div className="rb-field">
        {label}
        <MonthYearSelect value={value} onChange={onChange} ariaLabel={field.label} />
      </div>
    );
  }
  if (field.type === 'number') {
    return (
      <label className="rb-field">
        {label}
        <NumberInput value={value} onChange={(v) => onChange(v === '' ? '' : Number(v))} ariaLabel={field.label} />
      </label>
    );
  }
  if (field.suggest) {
    return (
      <div className="rb-field">
        {label}
        <SuggestInput
          value={value ?? ''}
          onChange={onChange}
          getSuggestions={getSuggestions}
          ariaLabel={field.label}
          placeholder={field.suggest === 'model' && !make ? 'Prima scegli la marca' : ''}
        />
      </div>
    );
  }
  return (
    <label className="rb-field">
      {label}
      <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// Procedura a passi per pubblicare un annuncio: categoria/vendita-affitto
// -> dettagli (dallo stesso schema dei filtri) -> foto (max 10,
// trascinabili per l'ordine, la prima è la copertina) -> prezzo -> posizione
// -> anteprima -> pubblica. Bozza salvata in locale ad ogni passo, così
// uscendo a metà la si ritrova (findLoadDraft al montaggio).
export default function PublishAnnuncioWizard({ initialCategoria, user, onClose, onPublished }) {
  const draft = loadDraft();
  const [step, setStep] = useState(1);
  const [categoria, setCategoria] = useState(draft?.categoria ?? initialCategoria ?? 'auto');
  const [tipo, setTipo] = useState(draft?.tipo ?? 'vendita');
  const [titolo, setTitolo] = useState(draft?.titolo ?? '');
  const [descrizione, setDescrizione] = useState(draft?.descrizione ?? '');
  const [dettagli, setDettagli] = useState(draft?.dettagli ?? {});
  const [foto, setFoto] = useState(draft?.foto ?? []);
  const [uploading, setUploading] = useState(false);
  const [prezzo, setPrezzo] = useState(draft?.prezzo ?? '');
  const [trattabile, setTrattabile] = useState(draft?.trattabile ?? false);
  const [periodoAffitto, setPeriodoAffitto] = useState(draft?.periodoAffitto ?? 'mese');
  const [citta, setCitta] = useState(draft?.citta ?? '');
  const [provincia, setProvincia] = useState(draft?.provincia ?? '');
  const [nazione, setNazione] = useState(draft?.nazione ?? '');
  const [lat, setLat] = useState(draft?.lat ?? null);
  const [lng, setLng] = useState(draft?.lng ?? null);
  const cittaTypedRef = useRef(!!draft?.citta);
  const geocodeAbortRef = useRef(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const dragIndexRef = useRef(null);

  useEffect(() => {
    saveDraft({ categoria, tipo, titolo, descrizione, dettagli, foto, prezzo, trattabile, periodoAffitto, citta, provincia, nazione, lat, lng });
  }, [categoria, tipo, titolo, descrizione, dettagli, foto, prezzo, trattabile, periodoAffitto, citta, provincia, nazione, lat, lng]);

  // Punto toccato sulla mappa: coordinate subito, poi città/provincia/
  // nazione da Nominatim; la città si compila da sola solo se l'utente
  // non l'ha già scritta a mano.
  const onPickLocation = useCallback((la, ln) => {
    setLat(la);
    setLng(ln);
    geocodeAbortRef.current?.abort();
    const controller = new AbortController();
    geocodeAbortRef.current = controller;
    reverseGeocode(la, ln, controller.signal).then((geo) => {
      if (controller.signal.aborted) return;
      if (geo.nazione) setNazione(geo.nazione);
      if (geo.provincia) setProvincia(geo.provincia);
      if (geo.citta && !cittaTypedRef.current) setCitta(geo.citta);
    });
  }, []);
  useEffect(() => () => geocodeAbortRef.current?.abort(), []);

  const fields = fieldsForCategory(categoria, tipo);
  const updateDettaglio = (key, value) => setDettagli((prev) => ({ ...prev, [key]: value }));

  const onFilesChosen = async (e) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_FOTO - foto.length);
    e.target.value = '';
    setUploading(true);
    for (const file of files) {
      const { url, error: err } = await uploadAnnuncioPhoto(file);
      if (url) setFoto((prev) => [...prev, url]);
      if (err) setError(err);
    }
    setUploading(false);
  };

  const removeFoto = (i) => setFoto((prev) => prev.filter((_, idx) => idx !== i));

  const onDragStart = (i) => {
    dragIndexRef.current = i;
  };
  const onDragOver = (e) => e.preventDefault();
  const onDrop = (i) => {
    const from = dragIndexRef.current;
    if (from == null || from === i) return;
    setFoto((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(i, 0, moved);
      return next;
    });
    dragIndexRef.current = null;
  };

  const canGoNext = () => {
    if (step === 1) return !!categoria && !!tipo;
    if (step === 2) return titolo.trim().length > 0;
    return true;
  };

  const submit = async () => {
    setSending(true);
    setError('');
    const { error: err } = await createListing({
      categoria,
      tipo,
      titolo,
      descrizione,
      prezzo: prezzo === '' ? null : Number(prezzo),
      periodoAffitto,
      trattabile,
      dettagli,
      foto,
      lat,
      lng,
      citta,
      provincia,
      nazione,
      dataNascita: user?.dataNascita,
    });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    clearDraft();
    onPublished?.();
  };

  return (
    <ModalOverlay onClose={onClose}>
      <div className="rb-annunci-wizard-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="rb-close-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        <div className="rb-annunci-wizard-steps">
          {STEP_LABELS.map((label, i) => (
            <span key={label} className={`rb-annunci-wizard-step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>
              {i + 1}. {label}
            </span>
          ))}
        </div>

        {step === 1 && (
          <div className="rb-faq-form">
            <label className="rb-field">
              <span>Categoria</span>
              <CustomSelect value={categoria} options={CATEGORIA_OPTIONS} onChange={setCategoria} ariaLabel="Categoria" />
            </label>
            <div className="rb-annunci-online-toggle">
              <label>
                <input type="radio" checked={tipo === 'vendita'} onChange={() => setTipo('vendita')} /> Vendita
              </label>
              <label>
                <input type="radio" checked={tipo === 'affitto'} onChange={() => setTipo('affitto')} /> Affitto
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rb-faq-form">
            <label className="rb-field">
              <span>Titolo</span>
              <input type="text" value={titolo} onChange={(e) => setTitolo(e.target.value)} />
            </label>
            <label className="rb-field">
              <span>Descrizione</span>
              <textarea rows={4} value={descrizione} onChange={(e) => setDescrizione(e.target.value)} />
            </label>
            {fields.map((field) => (
              <DetailField
                key={field.key}
                field={field}
                value={dettagli[field.key]}
                onChange={(v) => updateDettaglio(field.key, v)}
                categoria={categoria}
                dettagli={dettagli}
              />
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="rb-faq-form">
            <p className="rb-faq-hint">
              Fino a {MAX_FOTO} foto ({foto.length}/{MAX_FOTO}). Trascinale per cambiarne l'ordine: la prima è la copertina.
            </p>
            <input type="file" accept="image/*" multiple onChange={onFilesChosen} disabled={foto.length >= MAX_FOTO || uploading} />
            {uploading && <p className="rb-faq-hint">Caricamento…</p>}
            <div className="rb-annunci-photo-grid">
              {foto.map((url, i) => (
                <div
                  key={url}
                  className="rb-annunci-photo-thumb"
                  draggable
                  onDragStart={() => onDragStart(i)}
                  onDragOver={onDragOver}
                  onDrop={() => onDrop(i)}
                >
                  <img src={url} alt="" />
                  {i === 0 && <span className="rb-annunci-photo-cover">Copertina</span>}
                  <button type="button" onClick={() => removeFoto(i)} aria-label="Rimuovi foto">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="rb-faq-form">
            <label className="rb-field">
              <span>Prezzo (€)</span>
              <NumberInput value={prezzo} onChange={setPrezzo} decimal ariaLabel="Prezzo" placeholder="0" />
            </label>
            <label className="rb-field rb-annunci-filter-chip">
              <input type="checkbox" checked={trattabile} onChange={(e) => setTrattabile(e.target.checked)} />
              Prezzo trattabile
            </label>
            {tipo === 'affitto' && (
              <label className="rb-field">
                <span>Periodo</span>
                <CustomSelect value={periodoAffitto} options={RENT_PERIOD_OPTIONS} onChange={setPeriodoAffitto} ariaLabel="Periodo affitto" />
              </label>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="rb-faq-form">
            <label className="rb-field">
              <span>Città</span>
              <input
                type="text"
                value={citta}
                onChange={(e) => {
                  cittaTypedRef.current = e.target.value.trim().length > 0;
                  setCitta(e.target.value);
                }}
              />
            </label>
            <p className="rb-faq-hint">Tocca la mappa per indicare la posizione (approssimata, mai l'indirizzo esatto agli altri).</p>
            <LocationPicker lat={lat} lng={lng} coverUrl={foto[0] ?? null} onPick={onPickLocation} />

            <div className="rb-annunci-preview">
              <strong>{titolo || 'Titolo annuncio'}</strong>
              <span>{prezzo ? `€ ${prezzo}` : 'Prezzo su richiesta'} {tipo === 'affitto' ? `/ ${periodoAffitto}` : ''}</span>
              <span>{citta || 'Città non indicata'}</span>
            </div>
          </div>
        )}

        {error && <p className="rb-privacy-error">{error}</p>}

        <div className="rb-annunci-wizard-actions">
          {step > 1 && (
            <button type="button" className="rb-reset-filters-btn" onClick={() => setStep((s) => s - 1)}>
              Indietro
            </button>
          )}
          {step < 5 ? (
            <button type="button" className="rb-btn-primary" onClick={() => setStep((s) => s + 1)} disabled={!canGoNext()}>
              Avanti
            </button>
          ) : (
            <button type="button" className="rb-btn-primary" onClick={submit} disabled={sending}>
              {sending ? 'Pubblico…' : 'Pubblica annuncio'}
            </button>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
