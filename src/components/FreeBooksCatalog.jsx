import { useState } from 'react';
import { searchFreeBooks } from '../data/freeBooksApi';
import ExternalLinkButton from './ExternalLinkButton';
import './FreeBooksCatalog.css';

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
// (Project Gutenberg via Gutendex): niente lista incorporata nell'app,
// perché "tutti i libri gratuiti che esistono nel mondo" sono troppi per
// starci dentro (vedi commento in data/freeBooksApi.js).
export default function FreeBooksCatalog() {
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState([]);
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const result = await searchFreeBooks(query);
      setBooks(result.books);
      setCount(result.count);
    } catch (err) {
      setError(
        err.message === 'timeout'
          ? 'Il catalogo ci sta mettendo troppo a rispondere. Controlla la connessione e riprova.'
          : 'Impossibile raggiungere il catalogo ora. Riprova più tardi.'
      );
      setBooks([]);
      setCount(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rb-freebooks">
      <p className="rb-freebooks-note">
        🌍 Catalogo mondiale delle opere libere da diritti (Project Gutenberg), oltre 75.000 titoli — cerca per titolo o autore.
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

      {loading && <p className="rb-freebooks-status">Cerco nel catalogo...</p>}
      {error && <p className="rb-freebooks-status rb-freebooks-error">{error}</p>}
      {!loading && !error && searched && books.length === 0 && (
        <p className="rb-freebooks-status">Nessun libro trovato con questo titolo o autore.</p>
      )}
      {!loading && !error && count !== null && books.length > 0 && (
        <p className="rb-freebooks-count">{count} risultati nel catalogo, i primi {books.length} qui sotto</p>
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
              <p>{b.authors}</p>
              <ExternalLinkButton url={b.readUrl} className="rb-freebooks-read-btn">
                Leggi su Project Gutenberg
              </ExternalLinkButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
