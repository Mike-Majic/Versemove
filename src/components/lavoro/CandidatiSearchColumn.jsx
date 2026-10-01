import { useEffect, useRef, useState } from 'react';
import CityAutocomplete from '../shared/CityAutocomplete';
import AvatarImg from '../shared/AvatarImg';
import LoadMoreButton from '../shared/LoadMoreButton';
import EmptyState from '../EmptyState';
import CandidatoModal from './CandidatoModal';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { TITOLI_STUDIO, titoloStudioLabel, cercaCandidati } from '../../data/lavoro';
import '../nerd/videoRooms.css';
import './candidati.css';

// Mondo Lavoro, categoria "Cerca candidati" (solo aziende verificate e
// owner, vedi lavoroCategories.js getLavoroCategories): filtri + elenco a
// pagine da cerca_candidati_lavoro. La scheda completa (get_candidato_lavoro,
// registrata dal server a ogni apertura) si chiede solo al clic su un
// candidato, mai per l'elenco.

const RAGGI_KM = [10, 25, 50, 100, 200];

const EMPTY_FILTERS = {
  q: '',
  cityText: '',
  city: null,
  raggioKm: 50,
  titoloMin: '',
  lingue: [],
  esperienzaMin: '',
  soloConCv: false,
};

function languageLabel(code) {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.nativeLabel ?? code;
}

function CandidatoCard({ c, onOpen }) {
  const nome = `${c.nome} ${c.cognome}`.trim() || 'Candidato';
  const luogo = [c.citta, c.distanzaKm != null ? `${c.distanzaKm} km` : ''].filter(Boolean).join(' · ');
  const lavoro = [c.ultimaPosizione, c.ultimaAzienda].filter(Boolean).join(' presso ');
  return (
    <li>
      <button type="button" className="rb-cand-card" onClick={() => onOpen(c)}>
        <AvatarImg className="rb-cand-avatar" src={c.avatar} name={nome} seed={c.id} alt="" />
        <span className="rb-cand-card-body">
          <span className="rb-cand-card-head">
            <strong>{nome}</strong>
            {c.eta != null && <span className="rb-cand-muted">{c.eta} anni</span>}
            {c.haCv && <span className="rb-cand-badge">CV</span>}
          </span>
          {lavoro && <span className="rb-cand-line">💼 {lavoro}</span>}
          {luogo && <span className="rb-cand-line">📍 {luogo}</span>}
          <span className="rb-cand-line rb-cand-muted">
            {[c.titoloStudio ? `🎓 ${titoloStudioLabel(c.titoloStudio)}` : '', c.anniEsperienza != null ? `${c.anniEsperienza} anni di esperienza` : '']
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function CandidatiSearchColumn() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [lingueOpen, setLingueOpen] = useState(false);
  const [rows, setRows] = useState(null); // null = prima ricerca in corso
  const [totale, setTotale] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  // Filtri dell'ultima ricerca lanciata: "Carica altri" continua quella,
  // anche se nel frattempo i campi sono stati modificati.
  const activeRef = useRef(EMPTY_FILTERS);
  const seqRef = useRef(0);

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const run = async (f, offset) => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError('');
    const res = await cercaCandidati(
      {
        q: f.q,
        geonameId: f.city?.geonameId ?? null,
        raggioKm: f.raggioKm,
        titoloMin: f.titoloMin,
        lingue: f.lingue,
        esperienzaMin: f.esperienzaMin,
        soloConCv: f.soloConCv,
      },
      offset
    );
    if (seq !== seqRef.current) return;
    setLoading(false);
    if (res.error) {
      setError(res.error);
      if (offset === 0) setRows([]);
      return;
    }
    setRows((prev) => (offset === 0 ? res.rows : [...(prev ?? []), ...res.rows]));
    setTotale(res.totale);
  };

  // Prima ricerca, senza filtri, appena si apre la categoria.
  useEffect(() => {
    run(EMPTY_FILTERS, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e) => {
    e.preventDefault();
    activeRef.current = filters;
    run(filters, 0);
  };

  const reset = () => {
    setFilters(EMPTY_FILTERS);
    activeRef.current = EMPTY_FILTERS;
    run(EMPTY_FILTERS, 0);
  };

  const toggleLingua = (code) =>
    setFilters((f) => ({ ...f, lingue: f.lingue.includes(code) ? f.lingue.filter((c) => c !== code) : [...f.lingue, code] }));

  const cityPending = filters.cityText.trim() !== '' && !filters.city;
  const hasMore = rows != null && rows.length < totale;

  return (
    <div className="rb-vroom-panel rb-cand-panel">
      <h3 className="rb-cand-title">🔎 Cerca candidati</h3>
      <form className="rb-cand-filters" onSubmit={submit}>
        <label className="rb-cand-field rb-cand-field--wide">
          <span>Parola chiave</span>
          <input type="search" value={filters.q} placeholder="Es. magazziniere, React, contabilità…" onChange={(e) => set('q', e.target.value)} />
        </label>

        <label className="rb-cand-field">
          <span>Città</span>
          <CityAutocomplete
            value={filters.cityText}
            placeholder="Cerca la città…"
            onChange={(text) => setFilters((f) => ({ ...f, cityText: text, city: null }))}
            onPick={(c) => setFilters((f) => ({ ...f, city: c, cityText: c.nomeMostrato }))}
          />
          {cityPending && <small className="rb-cand-warn">Scegli la città dall'elenco.</small>}
        </label>

        <label className="rb-cand-field">
          <span>Raggio</span>
          <select value={filters.raggioKm} onChange={(e) => set('raggioKm', Number(e.target.value))} disabled={!filters.city}>
            {RAGGI_KM.map((km) => (
              <option key={km} value={km}>
                {km} km
              </option>
            ))}
          </select>
        </label>

        <label className="rb-cand-field">
          <span>Titolo di studio minimo</span>
          <select value={filters.titoloMin} onChange={(e) => set('titoloMin', e.target.value)}>
            <option value="">Qualsiasi</option>
            {TITOLI_STUDIO.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label className="rb-cand-field">
          <span>Anni di esperienza minimi</span>
          <input type="number" min="0" max="60" inputMode="numeric" value={filters.esperienzaMin} placeholder="0" onChange={(e) => set('esperienzaMin', e.target.value)} />
        </label>

        <div className="rb-cand-field rb-cand-field--wide">
          <span>Lingue</span>
          <button type="button" className="rb-cand-lingue-toggle" aria-expanded={lingueOpen} onClick={() => setLingueOpen((o) => !o)}>
            <span>{filters.lingue.length ? filters.lingue.map(languageLabel).join(', ') : 'Qualsiasi'}</span>
            <span aria-hidden="true">{lingueOpen ? '▲' : '▼'}</span>
          </button>
          {lingueOpen && (
            <div className="rb-cand-lingue-list">
              {SUPPORTED_LANGUAGES.map((l) => (
                <button
                  type="button"
                  key={l.code}
                  className={`rb-cand-chip ${filters.lingue.includes(l.code) ? 'active' : ''}`}
                  onClick={() => toggleLingua(l.code)}
                >
                  {l.flag} {l.nativeLabel}
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="rb-cand-check rb-cand-field--wide">
          <input type="checkbox" checked={filters.soloConCv} onChange={(e) => set('soloConCv', e.target.checked)} />
          <span>Solo con curriculum</span>
        </label>

        <div className="rb-cand-actions rb-cand-field--wide">
          <button type="button" className="rb-vroom-btn" onClick={reset} disabled={loading}>
            Azzera
          </button>
          <button type="submit" className="rb-vroom-btn rb-vroom-btn--primary" disabled={loading || cityPending}>
            Cerca
          </button>
        </div>
      </form>

      {error && <p className="rb-cand-error" role="alert">{error}</p>}

      {rows != null && !error && (
        <p className="rb-cand-total">
          {totale === 1 ? '1 candidato' : `${totale} candidati`}
        </p>
      )}

      {rows == null ? (
        <p className="rb-cand-muted">Cerco…</p>
      ) : rows.length === 0 && !error ? (
        <EmptyState icon="🔎" title="Nessun candidato" subtitle="Prova ad allargare il raggio o a togliere qualche filtro." />
      ) : (
        <ul className="rb-cand-list">
          {rows.map((c) => (
            <CandidatoCard key={c.id} c={c} onOpen={setOpen} />
          ))}
        </ul>
      )}

      {hasMore && <LoadMoreButton loading={loading} onLoad={() => !loading && run(activeRef.current, rows.length)} />}

      {open && <CandidatoModal candidato={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
