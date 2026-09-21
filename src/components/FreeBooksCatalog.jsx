import { useState } from 'react';
import { searchFreeBooks } from '../data/freeBooksApi';
import ExternalLinkButton from './ExternalLinkButton';
import './FreeBooksCatalog.css';

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
              <div className="rb-freebooks-cover rb-freebooks-cover-placeholder">📖</div>
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
