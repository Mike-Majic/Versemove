import { useEffect, useRef, useState } from 'react';
import { searchFreeBooks } from '../data/freeBooksApi';
import EmptyState from './EmptyState';
import Skeleton from './Skeleton';
import './FreeBooksCatalog.css';

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Rilevanza' },
  { value: 'newest', label: 'Più recenti' },
  { value: 'popular', label: 'Più popolari' },
];

// Menu a tendina disegnato su misura invece del <select> nativo del browser:
// quello di sistema apre un popup bianco squadrato che stona con lo stile
// dell'app (vetro scuro, accento viola). Stesso comportamento, aspetto
// coerente.
function CustomSelect({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div className="rb-freebooks-select" ref={ref}>
      <button
        type="button"
        className="rb-freebooks-select-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{current?.label}</span>
        <svg
          className={`rb-freebooks-select-arrow${open ? ' open' : ''}`}
          width="10"
          height="6"
          viewBox="0 0 10 6"
          aria-hidden="true"
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="rb-freebooks-select-menu">
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className={o.value === value ? 'active' : ''}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Copertina di scorta per i libri che nel catalogo non ne hanno una (capita
// spesso con edizioni/traduzioni più rare): un libro chiuso disegnato al
// volo, negli stessi colori del mondo Arte, invece di un'icona spoglia.
function BookCoverPlaceholder() {
  return (
    <svg className="rb-freebooks-cover rb-freebooks-cover-placeholder" viewBox="0 0 52 76" width="52" height="76" aria-hidden="true">
      <defs>
        <linearGradient id="rb-book-cover-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent, #8b5cf6)" />
          <stop offset="1" stopColor="#2c1c4d" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="50" height="74" rx="3" fill="url(#rb-book-cover-grad)" stroke="rgba(255,255,255,0.25)" />
      <rect x="1" y="1" width="9" height="74" rx="2" fill="rgba(0,0,0,0.25)" />
      <line x1="19" y1="21" x2="43" y2="21" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
      <line x1="19" y1="29" x2="39" y2="29" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
      <line x1="19" y1="37" x2="35" y2="37" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="35" cy="58" r="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
    </svg>
  );
}

// Catalogo mondiale dei libri liberi da diritti d'autore, in tempo reale
// (Internet Archive): niente lista incorporata nell'app, perché "tutti i
// libri gratuiti che esistono nel mondo" sono troppi per starci dentro
// (vedi commento in data/freeBooksApi.js). La lettura avviene con un
// lettore incorporato (embedUrl), mai su archive.org direttamente.
export default function FreeBooksCatalog() {
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState([]);
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const [reading, setReading] = useState(null);
  const [sort, setSort] = useState('relevance');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const abortRef = useRef(null);

  const search = async () => {
    if (!query.trim()) return;
    // Una ricerca precedente ancora in corso (es. lenta) non deve più
    // contare: si annulla, così la sua risposta in ritardo non sovrascrive
    // questi risultati nuovi né fa lampeggiare quelli vecchi sullo schermo.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError('');
    setSearched(true);
    setBooks([]);
    setCount(null);
    try {
      const result = await searchFreeBooks(query, {
        signal: controller.signal,
        sort,
        yearFrom: yearFrom.trim(),
        yearTo: yearTo.trim(),
      });
      setBooks(result.books);
      setCount(result.count);
    } catch (err) {
      if (err.message === 'cancelled') return;
      setError(
        err.message === 'timeout'
          ? 'Il catalogo ci sta mettendo troppo a rispondere. Controlla la connessione e riprova.'
          : 'Impossibile raggiungere il catalogo ora. Riprova più tardi.'
      );
      setBooks([]);
      setCount(null);
    } finally {
      if (abortRef.current === controller) setLoading(false);
    }
  };

  if (reading) {
    return (
      <div className="rb-freebooks-reader">
        <div className="rb-freebooks-reader-bar">
          <strong>{reading.title}</strong>
          <button type="button" className="rb-freebooks-reader-close" onClick={() => setReading(null)}>
            ✕ Chiudi
          </button>
        </div>
        <iframe
          className="rb-freebooks-reader-frame"
          src={reading.embedUrl}
          title={reading.title}
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="rb-freebooks">
      <p className="rb-freebooks-note">
        🌍 Catalogo mondiale delle opere libere da diritti (Internet Archive), milioni di titoli scansionati — cerca per titolo o autore. Si legge qui dentro, senza uscire da Versemove.
      </p>

      <div className="rb-freebooks-search-row">
        <input
          type="text"
          placeholder="Cerca titolo o autore (es. Dante)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="rb-freebooks-search-btn" onClick={search}>
          Cerca
        </button>
      </div>

      <div className="rb-freebooks-filters-row">
        <div className="rb-freebooks-filter">
          <span>Ordina per</span>
          <CustomSelect value={sort} options={SORT_OPTIONS} onChange={setSort} />
        </div>
        <label className="rb-freebooks-filter">
          <span>Anno da</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="1990"
            value={yearFrom}
            onChange={(e) => setYearFrom(e.target.value)}
          />
        </label>
        <label className="rb-freebooks-filter">
          <span>Anno a</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder="2020"
            value={yearTo}
            onChange={(e) => setYearTo(e.target.value)}
          />
        </label>
      </div>

      {loading && (
        <div className="rb-freebooks-skeleton-list" aria-hidden="true">
          <Skeleton lines={2} />
          <Skeleton lines={2} />
          <Skeleton lines={2} />
        </div>
      )}
      {error && <EmptyState icon="⚠️" title="Catalogo non raggiungibile" subtitle={error} />}
      {!loading && !error && searched && books.length === 0 && (
        <EmptyState icon="📖" title="Nessun libro trovato" subtitle="Prova un altro titolo o autore." />
      )}
      {!loading && !error && count !== null && books.length > 0 && (
        <p className="rb-freebooks-count">{count} {count === 1 ? 'risultato leggibile subito' : 'risultati leggibili subito'}</p>
      )}

      <ul className="rb-freebooks-list">
        {books.map((b) => (
          <li key={b.id} className="rb-freebooks-card">
            {b.cover ? (
              <img className="rb-freebooks-cover" src={b.cover} alt="" loading="lazy" />
            ) : (
              <BookCoverPlaceholder />
            )}
            <div className="rb-freebooks-info">
              <strong>{b.title}</strong>
              <p>{b.authors}{b.year ? ` · ${b.year}` : ''}</p>
              <button type="button" className="rb-freebooks-read-btn" onClick={() => setReading(b)}>
                Leggi qui
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
