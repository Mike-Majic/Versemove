import { useEffect, useId, useRef, useState } from 'react';
import CustomSelect from '../shared/CustomSelect';
import { SUGGEST_MIN_CHARS } from '../../data/annunciBrands';
import { MONTHS } from '../../data/annunciSchema';

// Campi del form di pubblicazione annunci (PublishAnnuncioWizard.jsx)
// che l'<input> nativo non copre bene:
// - NumberInput: campo di testo con tastierino numerico (inputMode), al
//   posto di <input type="number">: si scrive con la tastiera come in un
//   campo qualunque, niente frecce del browser, stesso stile degli altri
//   campi (le regole .rb-field input[type='text'] non prendevano i number).
// - YearSelect / MonthYearSelect: anno, o mese + anno, scelti solo da
//   tendina (CustomSelect), mai digitati.
// - SuggestInput: testo libero con suggerimenti dalle prime due lettere
//   (marche/modelli, vedi data/annunciBrands.js).

const MONTH_OPTIONS = [{ value: '', label: 'Mese' }, ...MONTHS.map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }))];

const EMPTY = { value: '', label: '—' };

function yearOptions(from, to) {
  const out = [];
  for (let y = to; y >= from; y -= 1) out.push({ value: String(y), label: String(y) });
  return out;
}

export function NumberInput({ value, onChange, decimal = false, placeholder = '', ariaLabel }) {
  const clean = (raw) => {
    let s = String(raw ?? '').replace(/\s/g, '');
    if (decimal) {
      s = s.replace(',', '.').replace(/[^\d.]/g, '');
      const dot = s.indexOf('.');
      if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
    } else {
      s = s.replace(/\D/g, '');
    }
    return s;
  };
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={value == null ? '' : String(value)}
      onChange={(e) => onChange(clean(e.target.value))}
    />
  );
}

// Anno singolo (es. immatricolazione): dall'anno prossimo a scendere.
export function YearSelect({ value, onChange, ariaLabel, from = 1950 }) {
  const now = new Date().getFullYear();
  const options = [EMPTY, ...yearOptions(from, now + 1)];
  const current = value == null || value === '' ? '' : String(value);
  return <CustomSelect value={current} options={options} onChange={(v) => onChange(v ? Number(v) : '')} ariaLabel={ariaLabel} />;
}

// Mese + anno, salvati come "YYYY-MM" (ordinabile come testo, leggibile
// da formatMonthYear per la scheda dell'annuncio).
export function MonthYearSelect({ value, onChange, ariaLabel }) {
  const now = new Date().getFullYear();
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? value.split('-') : ['', ''];
  // Mese e anno scelti uno alla volta: finché manca uno dei due il valore
  // salvato resta vuoto, senza perdere quello già scelto.
  const [year, setYear] = useState(parsed[0]);
  const [month, setMonth] = useState(parsed[1]);
  const yearOpts = [{ value: '', label: 'Anno' }, ...yearOptions(now - 1, now + 3).reverse()];
  const update = (y, m) => {
    setYear(y);
    setMonth(m);
    onChange(y && m ? `${y}-${m}` : '');
  };
  return (
    <div className="rb-annunci-monthyear">
      <CustomSelect value={month} options={MONTH_OPTIONS} onChange={(m) => update(year, m)} ariaLabel={`${ariaLabel} (mese)`} />
      <CustomSelect value={year} options={yearOpts} onChange={(y) => update(y, month)} ariaLabel={`${ariaLabel} (anno)`} />
    </div>
  );
}

const SUGGEST_DEBOUNCE_MS = 120;

export function SuggestInput({ value, onChange, getSuggestions, placeholder = '', ariaLabel, disabled = false }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const abortRef = useRef(null);
  const timerRef = useRef(null);
  const listId = useId();

  const text = value ?? '';

  useEffect(() => {
    clearTimeout(timerRef.current);
    abortRef.current?.abort();
    if (!open || String(text).trim().length < SUGGEST_MIN_CHARS) return undefined;
    const controller = new AbortController();
    abortRef.current = controller;
    timerRef.current = setTimeout(async () => {
      try {
        const res = await getSuggestions(text, controller.signal);
        if (controller.signal.aborted) return;
        const list = Array.isArray(res) ? res : [];
        // Se l'unico suggerimento è esattamente ciò che è già scritto, non c'è nulla da proporre.
        setItems(list.length === 1 && list[0].toLowerCase() === String(text).trim().toLowerCase() ? [] : list);
        setActive(-1);
      } catch {
        if (!controller.signal.aborted) setItems([]);
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timerRef.current);
      controller.abort();
    };
  }, [text, open, getSuggestions]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (item) => {
    onChange(item);
    setItems([]);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') {
      setItems([]);
      setOpen(false);
    }
  };

  // Sotto le due lettere la lista resta chiusa anche se contiene ancora i
  // suggerimenti del testo precedente (verranno sostituiti al prossimo giro).
  const showList = open && items.length > 0 && String(text).trim().length >= SUGGEST_MIN_CHARS;

  return (
    <div className="rb-annunci-suggest" ref={wrapRef}>
      <input
        type="text"
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        value={text}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setOpen(true);
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="rb-annunci-suggest-list" id={listId} role="listbox">
          {items.map((item, i) => (
            <li key={item} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={i === active ? 'active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
