import { useRef, useState } from 'react';
import { EVENT_TYPES, proposeEvent } from '../../../data/cosplay';
import { CITY_DATA_CREDIT } from '../../../data/citta';
import CityAutocomplete from '../../shared/CityAutocomplete';

// "+ Proponi evento": titolo, tipo, città (autocompletamento GeoNames →
// lat/lng/paese), indirizzo, date, sito, descrizione, foto (stesso bucket
// degli eventi del mondo Social) e la scelta fra "Fiera / evento pubblico
// ufficiale" (pubblico: true → in attesa dei moderatori) e "Raduno /
// shooting tra utenti" (pubblico: false → subito visibile nella propria
// fascia d'età). fonte e stato non si mandano: li imposta il server.
const pad = (n) => String(n).padStart(2, '0');
function defaultStart() {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

export default function ProposeEventForm({ onDone, onCancel }) {
  const [titolo, setTitolo] = useState('');
  const [tipo, setTipo] = useState('raduno');
  const [cityText, setCityText] = useState('');
  const [city, setCity] = useState(null);
  const [indirizzo, setIndirizzo] = useState('');
  const [inizio, setInizio] = useState(defaultStart);
  const [fine, setFine] = useState('');
  const [url, setUrl] = useState('');
  const [descrizione, setDescrizione] = useState('');
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [pubblico, setPubblico] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const canSubmit = titolo.trim().length >= 3 && Boolean(city) && Boolean(inizio) && (!fine || fine >= inizio) && (!url.trim() || /^https?:\/\//i.test(url.trim()));

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFotoFile(f);
    setFotoPreview(URL.createObjectURL(f));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError('');
    const res = await proposeEvent({
      titolo,
      tipo,
      citta: city.nomeMostrato,
      lat: city.lat,
      lng: city.lng,
      paese: city.paese,
      indirizzo,
      dataInizio: new Date(inizio).toISOString(),
      dataFine: fine ? new Date(fine).toISOString() : null,
      urlUfficiale: url,
      descrizione,
      fotoFile,
      pubblico,
    });
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onDone(res, pubblico);
  };

  return (
    <form className="rb-lfg-form rb-cev-form" onSubmit={submit}>
      <h4>Proponi un evento</h4>
      <div className="rb-lfg-form-grid">
        <label>
          Titolo
          <input type="text" value={titolo} maxLength={120} onChange={(e) => setTitolo(e.target.value)} placeholder="es. Raduno cosplay a Villa Borghese" required />
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {Object.entries(EVENT_TYPES).map(([k, t]) => (
              <option key={k} value={k}>{t.icon} {t.label}</option>
            ))}
          </select>
        </label>
        <label>
          Città
          <CityAutocomplete
            value={cityText}
            placeholder="Cerca la città…"
            onChange={(text) => {
              setCityText(text);
              setCity(null);
            }}
            onPick={(c) => {
              setCity(c);
              setCityText(c.nomeMostrato);
            }}
          />
          {cityText && !city && <small className="rb-field-note rb-field-note--warn">Scegli la città dall'elenco.</small>}
        </label>
        <label>
          Indirizzo
          <input type="text" value={indirizzo} maxLength={160} onChange={(e) => setIndirizzo(e.target.value)} placeholder="Via, piazza, padiglione…" />
        </label>
        <label>
          Inizio
          <input type="datetime-local" value={inizio} onChange={(e) => setInizio(e.target.value)} required />
        </label>
        <label>
          Fine (facoltativa)
          <input type="datetime-local" value={fine} min={inizio} onChange={(e) => setFine(e.target.value)} />
        </label>
        <label>
          Sito ufficiale
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label>
          Foto
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} />
          {fotoPreview && <img className="rb-cev-form-preview" src={fotoPreview} alt="" />}
        </label>
      </div>
      <label>
        Descrizione
        <textarea value={descrizione} maxLength={1000} onChange={(e) => setDescrizione(e.target.value)} placeholder="Programma, ospiti, regole, come arrivare…" />
      </label>
      <fieldset className="rb-cev-form-kind">
        <legend>Che evento è?</legend>
        <label className="rb-lfg-form-check">
          <input type="radio" name="kind" checked={pubblico} onChange={() => setPubblico(true)} />
          🎪 Fiera / evento pubblico ufficiale
          <small>Lo controllano i moderatori prima di mostrarlo a tutti.</small>
        </label>
        <label className="rb-lfg-form-check">
          <input type="radio" name="kind" checked={!pubblico} onChange={() => setPubblico(false)} />
          🎭 Raduno / shooting tra utenti
          <small>Visibile subito, solo agli utenti della tua fascia d'età.</small>
        </label>
      </fieldset>
      <small className="rb-field-note">{CITY_DATA_CREDIT}</small>
      {error && <p className="rb-gaming-error" role="alert">{error}</p>}
      <div className="rb-lfg-actions">
        <button type="submit" className="rb-vroom-btn rb-vroom-btn--primary" disabled={!canSubmit || busy}>
          {busy ? 'Invio…' : pubblico ? 'Invia ai moderatori' : 'Pubblica evento'}
        </button>
        <button type="button" className="rb-vroom-btn" onClick={onCancel}>Annulla</button>
      </div>
    </form>
  );
}
