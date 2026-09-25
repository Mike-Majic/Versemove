import { useEffect, useRef, useState } from 'react';
import { CITY_DEBOUNCE_MS, CITY_MIN_CHARS, countryFlag, countryName, searchCities } from '../../data/citta';
import './CityAutocomplete.css';

// Campo città con autocompletamento (RPC cerca_citta, vedi data/citta.js):
// dopo 2 caratteri, debounce 250 ms, richiesta precedente annullata;
// tendina "Nome mostrato, Regione · 🇮🇹 Italia". value è il testo del
// campo (controllato dal genitore); onChange(text) a ogni tasto,
// onPick(city) alla scelta (il genitore mette nel campo city.nomeMostrato).
export default function CityAutocomplete({ value, onChange, onPick, placeholder = 'Es. Roma', paese = null, id, autoFocus = false, disabled = false }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const pickedRef = useRef('');
  const wrapRef = useRef(null);

  useEffect(() => {
    const clean = String(value ?? '').trim();
    if (clean.length < CITY_MIN_CHARS || clean === pickedRef.current) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const list = await searchCities(clean, { paese, limit: 8, signal: controller.signal });
      if (controller.signal.aborted) return;
      setResults(list);
      setActive(-1);
      setOpen(true);
      setLoading(false);
    }, CITY_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, paese]);

  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const pick = (city) => {
    pickedRef.current = city.nomeMostrato;
    setResults([]);
    setOpen(false);
    onPick?.(city);
  };

  const onKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? results.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const showList = open && String(value ?? '').trim().length >= CITY_MIN_CHARS && String(value ?? '').trim() !== pickedRef.current;

  return (
    <div className="rb-cityac" ref={wrapRef}>
      <input
        id={id}
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(e) => {
          pickedRef.current = '';
          onChange?.(e.target.value);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
      />
      {showList && (
        <ul className="rb-cityac-list" role="listbox">
          {loading && results.length === 0 && <li className="rb-cityac-note">Cerco…</li>}
          {!loading && results.length === 0 && <li className="rb-cityac-note">Nessuna città trovata</li>}
          {results.map((c, i) => (
            <li key={c.geonameId} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'is-active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
                <span className="rb-cityac-name">{c.nomeMostrato}{c.regione ? `, ${c.regione}` : ''}</span>
                <span className="rb-cityac-country">{countryFlag(c.paese)} {countryName(c.paese)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
