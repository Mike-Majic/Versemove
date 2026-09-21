// Catalogo mondiale delle opere libere da diritti, in tempo reale: cerca
// direttamente su Archive.org (advancedsearch.php) invece che su Open
// Library. Cambio deciso dopo una prova reale: un libro passato dal filtro
// di Open Library (public_scan_b/ebook_access) chiedeva comunque la
// registrazione per essere letto — quei campi non garantiscono davvero
// "nessun accesso ristretto". Il campo "access-restricted-item" invece è
// quello che Archive.org stesso usa per decidere se un libro si può
// leggere subito o va preso in prestito: qui si filtra direttamente lì,
// alla fonte, non su un dato derivato che può essere impreciso.
const SEARCH_BASE = 'https://archive.org/advancedsearch.php';
const COVER_BASE = 'https://archive.org/services/img';
const RESULTS_LIMIT = 24;

const SEARCH_TIMEOUT_MS = 15000;

async function fetchJson(url, signal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  // Se chi cerca lancia una nuova ricerca prima che questa finisca, il
  // chiamante annulla anche noi: evita che una risposta vecchia e lenta
  // sovrascriva risultati più recenti (vedi FreeBooksCatalog).
  signal?.addEventListener('abort', () => controller.abort());
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`richiesta fallita (${res.status})`);
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(signal?.aborted ? 'cancelled' : 'timeout');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// Ordinamenti esposti in UI -> parametro sort di Archive.org ("" = rilevanza,
// l'ordinamento di default, quindi nessun parametro sort da aggiungere).
const SORT_PARAMS = {
  relevance: null,
  newest: 'year desc',
  popular: 'downloads desc',
};

export async function searchFreeBooks(query, { signal, sort = 'relevance', yearFrom, yearTo } = {}) {
  // mediatype:texts = libri (non audio/video/software); -access-restricted-item:true
  // esclude tutto ciò che richiederebbe un account per essere aperto.
  let q = `${query.trim()} AND mediatype:texts AND -access-restricted-item:true`;
  if (yearFrom || yearTo) {
    q += ` AND year:[${yearFrom || '0'} TO ${yearTo || '9999'}]`;
  }
  const params = [
    `q=${encodeURIComponent(q)}`,
    'fl[]=identifier',
    'fl[]=title',
    'fl[]=creator',
    'fl[]=year',
    `rows=${RESULTS_LIMIT}`,
    'output=json',
  ];
  const sortParam = SORT_PARAMS[sort];
  if (sortParam) params.push(`sort[]=${encodeURIComponent(sortParam)}`);
  const url = `${SEARCH_BASE}?${params.join('&')}`;

  let data;
  try {
    data = await fetchJson(url, signal);
  } catch (err) {
    if (err.message !== 'timeout') throw err;
    data = await fetchJson(url, signal);
  }

  const docs = data.response?.docs ?? [];
  return {
    count: docs.length,
    books: docs
      .filter((d) => d.identifier)
      .map((d) => ({
        id: d.identifier,
        title: d.title || 'Senza titolo',
        authors: (Array.isArray(d.creator) ? d.creator.join(', ') : d.creator) || 'Autore sconosciuto',
        year: d.year || null,
        cover: `${COVER_BASE}/${d.identifier}`,
        readUrl: `https://archive.org/details/${d.identifier}`,
        // Il lettore incorporato (stesso principio già usato per
        // musica/video con YouTube): si legge dentro Versemove, senza
        // aprire il sito esterno né dover registrarsi lì.
        embedUrl: `https://archive.org/embed/${d.identifier}`,
      })),
  };
}
