// Ricerca musicale mondiale, in tempo reale, senza dati finti: iTunes Search
// API (Apple) è gratuita, non richiede chiave ed è pensata apposta per
// essere chiamata dal browser (stesso principio di Gutendex per la
// Libreria, vedi data/freeBooksApi.js). Non fa ascoltare canzoni intere —
// nessun servizio gratuito e senza account lo permette legalmente — ma dà
// un'anteprima di 30 secondi per ognuno dei milioni di brani reali del suo
// catalogo, con copertina e artista veri.
const ITUNES_SEARCH_BASE = 'https://itunes.apple.com/search';

const SEARCH_TIMEOUT_MS = 15000;

export async function searchTracks(query, limit = 25) {
  const url = `${ITUNES_SEARCH_BASE}?term=${encodeURIComponent(query.trim())}&media=music&entity=song&limit=${limit}`;
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
  return (data.results ?? [])
    .filter((t) => t.previewUrl)
    .map((t) => ({
      id: String(t.trackId),
      title: t.trackName,
      artist: t.artistName,
      album: t.collectionName ?? '',
      // La copertina che l'API dà è minuscola (100x100): il nome del file
      // codifica la dimensione, sostituendola si ottiene la stessa immagine
      // più grande, senza un'altra richiesta.
      artworkUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100', '300x300') : null,
      previewUrl: t.previewUrl,
    }));
}
