import { useEffect, useRef, useState } from 'react';
import { ANNUNCI_CATEGORIES_META } from '../../data/annunciSchema';
import { fieldsForCategory } from '../../data/annunciSchema';
import { createListing, uploadAnnuncioPhoto, saveDraft, loadDraft, clearDraft } from '../../data/annunci';
import ModalOverlay from '../ModalOverlay';
import CustomSelect from '../shared/CustomSelect';
import './annunci.css';
import '../faq/faq.css';

const STEP_LABELS = ['Categoria', 'Dettagli', 'Foto', 'Prezzo', 'Posizione'];
const MAX_FOTO = 20;
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
function LocationPicker({ lat, lng, onPick }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

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
      if (lat != null) markerRef.current = L.marker([lat, lng], { draggable: true }).addTo(map);
      const place = (latlng) => {
        if (markerRef.current) markerRef.current.setLatLng(latlng);
        else markerRef.current = L.marker(latlng, { draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => {
          const p = markerRef.current.getLatLng();
          onPick(p.lat, p.lng);
        });
        onPick(latlng.lat, latlng.lng);
      };
      map.on('click', (e) => place(e.latlng));
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="rb-annunci-location-map" ref={mapElRef} />;
}

function DetailField({ field, value, onChange }) {
  if (field.type === 'boolean') {
    return (
      <label className="rb-field rb-annunci-filter-chip">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  if (field.type === 'select') {
    return (
      <label className="rb-field">
        <span>{field.label}</span>
        <CustomSelect
          value={value ?? ''}
          options={[{ value: '', label: '—' }, ...field.options]}
          onChange={onChange}
          ariaLabel={field.label}
        />
      </label>
    );
  }
  return (
    <label className="rb-field">
      <span>
        {field.label} {field.unit ? `(${field.unit})` : ''}
      </span>
      <input
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={value ?? ''}
        onChange={(e) => onChange(field.type === 'number' ? (e.target.value ? Number(e.target.value) : '') : e.target.value)}
      />
    </label>
  );
}

// Procedura a passi per pubblicare un annuncio: categoria/vendita-affitto
// -> dettagli (dallo stesso schema dei filtri) -> foto (max 20,
// trascinabili per l'ordine, la prima è la copertina) -> prezzo -> posizione
// -> anteprima -> pubblica. Bozza salvata in locale ad ogni passo, così
// uscendo a metà la si ritrova (findLoadDraft al montaggio).
//
// Categoria: parte SEMPRE da quella in cui ci si trova (initialCategoria,
// es. Moto se il form si apre dalla colonna Moto). Una bozza lasciata a
// metà si riprende da sola solo se è della stessa categoria; se è di
// un'altra (es. un'Auto iniziata prima) non la sovrascrive più
// silenziosamente, ma viene proposta con "Riprendi bozza". La categoria
// si può comunque cambiare: l'annuncio finisce in quella scelta qui (es.
// un'Auto pubblicata dalla colonna Moto compare in Auto, non in Moto) e
// l'avviso sotto al menu lo dice prima di pubblicare.
export default function PublishAnnuncioWizard({ initialCategoria, user, onClose, onPublished }) {
  const [savedDraft] = useState(() => loadDraft());
  const draftMatches = !!savedDraft && (!initialCategoria || savedDraft.categoria === initialCategoria);
  const draft = draftMatches ? savedDraft : null;
  const [otherDraft, setOtherDraft] = useState(() => (savedDraft && !draftMatches ? savedDraft : null));
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
  const [lat, setLat] = useState(draft?.lat ?? null);
  const [lng, setLng] = useState(draft?.lng ?? null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const dragIndexRef = useRef(null);

  // Il primo giro (montaggio) non salva: aprire e richiudere il form senza
  // toccare nulla non deve cancellare una bozza di un'altra categoria.
  const skipFirstSaveRef = useRef(true);
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    saveDraft({ categoria, tipo, titolo, descrizione, dettagli, foto, prezzo, trattabile, periodoAffitto, citta, lat, lng });
  }, [categoria, tipo, titolo, descrizione, dettagli, foto, prezzo, trattabile, periodoAffitto, citta, lat, lng]);

  const resumeOtherDraft = () => {
    const d = otherDraft;
    if (!d) return;
    setCategoria(d.categoria ?? categoria);
    setTipo(d.tipo ?? 'vendita');
    setTitolo(d.titolo ?? '');
    setDescrizione(d.descrizione ?? '');
    setDettagli(d.dettagli ?? {});
    setFoto(d.foto ?? []);
    setPrezzo(d.prezzo ?? '');
    setTrattabile(d.trattabile ?? false);
    setPeriodoAffitto(d.periodoAffitto ?? 'mese');
    setCitta(d.citta ?? '');
    setLat(d.lat ?? null);
    setLng(d.lng ?? null);
    setOtherDraft(null);
  };

  // Cambiando categoria i dettagli specifici (marca, cilindrata, mq...)
  // della precedente non valgono più: si svuotano.
  const changeCategoria = (next) => {
    if (next === categoria) return;
    setCategoria(next);
    setDettagli({});
  };

  const categoriaMeta = ANNUNCI_CATEGORIES_META[categoria];
  const initialMeta = initialCategoria ? ANNUNCI_CATEGORIES_META[initialCategoria] : null;
  const otherDraftMeta = otherDraft ? ANNUNCI_CATEGORIES_META[otherDraft.categoria] : null;

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
      dataNascita: user?.dataNascita,
    });
    setSending(false);
    if (err) {
      setError(err);
      return;
    }
    clearDraft();
    onPublished?.({ categoria, tipo });
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
            {otherDraft && otherDraftMeta && (
              <div className="rb-annunci-draft-hint">
                <span>
                  Hai una bozza non finita in {otherDraftMeta.icon} {otherDraftMeta.label}
                  {otherDraft.titolo ? ` ("${otherDraft.titolo}")` : ''}.
                </span>
                <button type="button" onClick={resumeOtherDraft}>
                  Riprendi bozza
                </button>
              </div>
            )}
            <label className="rb-field">
              <span>Categoria</span>
              <CustomSelect value={categoria} options={CATEGORIA_OPTIONS} onChange={changeCategoria} ariaLabel="Categoria" />
            </label>
            {initialMeta && categoriaMeta && categoria !== initialCategoria && (
              <p className="rb-annunci-category-note">
                L'annuncio verrà pubblicato in {categoriaMeta.icon} <strong>{categoriaMeta.label}</strong>, non in{' '}
                {initialMeta.icon} {initialMeta.label}. Lo ritrovi anche in «I miei annunci».
              </p>
            )}
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
              />
            ))}
          </div>
        )}

        {step === 3 && (
          <div className="rb-faq-form">
            <p className="rb-faq-hint">Fino a 20 foto. Trascinale per cambiarne l'ordine: la prima è la copertina.</p>
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
              <input type="number" min="0" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} />
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
              <input type="text" value={citta} onChange={(e) => setCitta(e.target.value)} />
            </label>
            <p className="rb-faq-hint">Tocca la mappa per indicare la posizione (approssimata, mai l'indirizzo esatto agli altri).</p>
            <LocationPicker lat={lat} lng={lng} onPick={(la, ln) => { setLat(la); setLng(ln); }} />

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
