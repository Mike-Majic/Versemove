// "Tutti i libri gratuiti che esistono nel mondo" non si può incorporare
// nell'app (solo Project Gutenberg ne ha oltre 75.000, e non è nemmeno
// tutto): niente lista finta, si interroga in tempo reale la loro API
// pubblica (Gutendex), gratuita, senza chiave, pensata apposta per essere
// chiamata dal browser. Così la Libreria ha accesso davvero a tutto il loro
// catalogo di opere libere da diritti, non solo a un campione incorporato.
const GUTENDEX_BASE = 'https://gutendex.com/books/';

// Un fetch senza timeout può restare appeso per minuti se la connessione è
// lenta o si blocca a metà (capitato su rete mobile): qui si arrende da solo
// dopo SEARCH_TIMEOUT_MS, con un messaggio diverso da un errore generico.
const SEARCH_TIMEOUT_MS = 15000;

export async function searchFreeBooks(query, page = 1) {
  const url = `${GUTENDEX_BASE}?search=${encodeURIComponent(query.trim())}&page=${page}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`richiesta fallita (${res.status})`);
  const data = await res.json();
  return {
    count: data.count,
    hasMore: Boolean(data.next),
    books: (data.results ?? []).map((b) => ({
      id: b.id,
      title: b.title,
      authors: (b.authors ?? []).map((a) => a.name).join(', ') || 'Autore sconosciuto',
      cover: b.formats?.['image/jpeg'] ?? null,
      // Il link diretto a un formato specifico (es. b.formats['text/html'])
      // può essere una vecchia URL non più valida sul sito di Gutenberg: la
      // pagina del libro sotto /ebooks/{id} invece è il permalink stabile
      // che loro stessi garantiscono non cambiare mai, da cui si arriva a
      // qualunque formato disponibile con un click in più ma senza 404.
      readUrl: `https://www.gutenberg.org/ebooks/${b.id}`,
    })),
  };
}
