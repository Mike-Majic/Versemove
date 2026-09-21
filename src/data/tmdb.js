// Film al cinema ora e in uscita prossimamente, da TMDB (The Movie Database):
// API gratuita, serve una chiave "v3 auth" creata da un account TMDB
// (nessuna restrizione per referrer/dominio come Google — la chiave TMDB è
// pensata per stare in app pubbliche, ma resta comunque solo di lettura sul
// catalogo film, niente di sensibile).
const TMDB_API_KEY = 'c4ad449f7e7c8daf3b3eb7132a4d9385';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';
const SEARCH_TIMEOUT_MS = 15000;
const REGION = 'IT';

async function fetchJson(path) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${TMDB_BASE}${path}${sep}api_key=${TMDB_API_KEY}&language=it-IT&region=${REGION}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      if (res.status === 401) throw new Error('chiave');
      throw new Error(`richiesta fallita (${res.status})`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function mapMovie(m) {
  return {
    id: m.id,
    title: m.title,
    overview: m.overview,
    posterUrl: m.poster_path ? `${IMAGE_BASE}${m.poster_path}` : null,
    releaseDate: m.release_date || null,
  };
}

export async function getNowPlayingMovies() {
  const data = await fetchJson('/movie/now_playing');
  return (data.results ?? []).map(mapMovie);
}

export async function getUpcomingMovies() {
  const data = await fetchJson('/movie/upcoming');
  return (data.results ?? []).map(mapMovie);
}
