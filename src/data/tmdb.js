import { apiProxy } from './apiProxy';

// Film al cinema ora e in uscita prossimamente, da TMDB (The Movie Database).
// La chiave v3 non sta più nel sito: la usa l'edge function api-proxy
// (Vault), che accetta solo questi percorsi e tiene i risultati in cache.
const IMAGE_BASE = 'https://image.tmdb.org/t/p/w342';

// path: '/movie/now_playing' | '/movie/upcoming' | '/movie/<id>/videos'
// (lingua it-IT e regione IT le aggiunge il proxy).
function fetchJson(path) {
  return apiProxy('tmdb', { path });
}

function mapMovie(m) {
  return {
    id: m.id,
    title: m.title,
    overview: m.overview,
    posterUrl: m.poster_path ? `${IMAGE_BASE}${m.poster_path}` : null,
    releaseDate: m.release_date || null,
    popularity: m.popularity ?? 0,
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

// Trailer da YouTube per un film, presi dai video collegati su TMDB (non
// c'è da cercarli a mano): non consuma la quota giornaliera della YouTube
// Data API (vedi data/youtubeSearch.js), condivisa con Musica/Video.
// Chiamata solo quando l'utente apre davvero un trailer (vedi CinemaColumn),
// mai per tutti i film di una lista in una volta.
export async function getMovieTrailerKey(movieId) {
  const data = await fetchJson(`/movie/${movieId}/videos`);
  const youtube = (data.results ?? []).filter((v) => v.site === 'YouTube');
  const trailer =
    youtube.find((v) => v.type === 'Trailer' && v.official) ||
    youtube.find((v) => v.type === 'Trailer') ||
    youtube.find((v) => v.type === 'Teaser') ||
    youtube[0];
  return trailer?.key ?? null;
}
