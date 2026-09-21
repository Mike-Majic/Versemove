// Catalogo mondiale delle opere libere da diritti, in tempo reale: usa la
// ricerca di Open Library (gestita da Internet Archive) invece di
// Gutendex/Project Gutenberg. Cambio deciso dopo aver verificato che
// Gutendex, nella pratica, è inaffidabile — meno del 10% di uptime reale
// negli ultimi mesi, e dietro una protezione anti-bot che respinge proprio
// le richieste dirette dal browser come le nostre, da cui i timeout visti
// in app. Open Library è la stessa infrastruttura che ospita le scansioni
// dei libri su archive.org: gratuita, senza chiave, pensata per essere
// interrogata dal browser, con un CDN di copertine proprio e affidabile.
const SEARCH_BASE = 'https://openlibrary.org/search.json';
const COVER_BASE = 'https://covers.openlibrary.org/b/id';
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

export async function searchFreeBooks(query, { signal } = {}) {
  const fields = 'key,title,author_name,cover_i,ia,public_scan_b,ebook_access';
  const url = `${SEARCH_BASE}?q=${encodeURIComponent(query.trim())}&has_fulltext=true&fields=${fields}&limit=${RESULTS_LIMIT}`;
  let data;
  try {
    data = await fetchJson(url, signal);
  } catch (err) {
    if (err.message !== 'timeout') throw err;
    data = await fetchJson(url, signal);
  }

  // Solo opere davvero leggibili subito, non solo "in prestito" (che
  // sarebbero comunque protette da diritti): serve una scansione su
  // Internet Archive (ia) marcata pubblica.
  const freeDocs = (data.docs ?? []).filter(
    (d) => Array.isArray(d.ia) && d.ia.length > 0 && (d.public_scan_b || d.ebook_access === 'public')
  );

  return {
    count: freeDocs.length,
    books: freeDocs.map((d) => ({
      id: d.ia[0],
      title: d.title,
      authors: (d.author_name ?? []).join(', ') || 'Autore sconosciuto',
      cover: d.cover_i ? `${COVER_BASE}/${d.cover_i}-M.jpg` : null,
      readUrl: `https://archive.org/details/${d.ia[0]}`,
    })),
  };
}
