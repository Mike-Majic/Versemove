import { useEffect, useMemo, useState } from 'react';
import { getNowPlayingMovies, getUpcomingMovies, getMovieTrailerKey } from '../../data/tmdb';
import { getTmdbReactionsSummary, toggleTmdbReaction } from '../../data/culturalReactions';
import { youtubeEmbedUrl } from '../../data/youtubeSearch';
import { displayName } from '../../data/posts';
import ReactionButtons from './ReactionButtons';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import CustomSelect from '../shared/CustomSelect';
import './cultural.css';

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Rilevanza' },
  { value: 'recent', label: 'Più recenti' },
  { value: 'popular', label: 'Più popolari' },
];

// 'relevance' lascia l'ordine così come arriva da TMDB (già pensato per
// mostrare prima i film più rilevanti in sala/attesi), gli altri due
// riordinano lato client la stessa lista già scaricata.
function sortMovies(list, sort) {
  if (!list?.length) return list;
  if (sort === 'recent') return [...list].sort((a, b) => new Date(b.releaseDate || 0) - new Date(a.releaseDate || 0));
  if (sort === 'popular') return [...list].sort((a, b) => b.popularity - a.popularity);
  return list;
}

// trailer: undefined = non ancora richiesto (mostra il pulsante), null =
// richiesto ma nessun trailer trovato su TMDB, stringa = chiave YouTube
// pronta per l'embed. Caricato solo al click, non per tutti i film insieme.
function MovieCard({ movie, summary, onToggle, onShowReactors, trailer, trailerLoading, onLoadTrailer }) {
  return (
    <li className="rb-cultural-card rb-cinema-card">
      {typeof trailer === 'string' ? (
        <div className="rb-cinema-trailer">
          <iframe
            src={youtubeEmbedUrl(trailer)}
            title={`Trailer di ${movie.title}`}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            frameBorder="0"
          />
        </div>
      ) : movie.posterUrl ? (
        <div className="rb-cinema-poster-wrap">
          <img src={movie.posterUrl} alt="" />
          {trailer === null ? (
            <span className="rb-cinema-trailer-none">Trailer non disponibile</span>
          ) : (
            <button type="button" className="rb-cinema-trailer-btn" onClick={() => onLoadTrailer(movie.id)} disabled={trailerLoading}>
              {trailerLoading ? '…' : '▶ Trailer'}
            </button>
          )}
        </div>
      ) : (
        <div className="rb-cinema-poster-empty">🎬</div>
      )}
      <div className="rb-cultural-card-info">
        <strong>{movie.title}</strong>
        {movie.releaseDate && <p className="rb-cultural-card-meta">{new Date(movie.releaseDate).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
        {movie.overview && <p className="rb-cultural-card-desc">{movie.overview}</p>}
      </div>
      <ReactionButtons
        summary={summary}
        onToggle={(reazione) => onToggle(movie.id, reazione)}
        onShowReactors={(reazione, list) =>
          onShowReactors({
            title: reazione === 'vuole' ? 'Vogliono andarci' : 'A cui è piaciuto',
            subtitle: movie.title,
            reactors: list,
          })
        }
      />
    </li>
  );
}

// Categoria Cinema: film attualmente al cinema + anteprime di quelli in
// uscita prossimamente (TMDB, vedi data/tmdb.js), con le stesse due
// reazioni di Teatro/Arte/Live per organizzarsi e vedere chi altro ci va.
export default function CinemaColumn({ user, onOpenAuth, onShowReactors }) {
  const [nowPlaying, setNowPlaying] = useState(null);
  const [upcoming, setUpcoming] = useState(null);
  const [reactions, setReactions] = useState(new Map());
  const [error, setError] = useState('');
  const [sort, setSort] = useState('relevance');
  const [trailers, setTrailers] = useState(new Map());
  const [loadingTrailerId, setLoadingTrailerId] = useState(null);

  useEffect(() => {
    Promise.all([getNowPlayingMovies(), getUpcomingMovies()])
      .then(async ([now, next]) => {
        setNowPlaying(now);
        setUpcoming(next);
        setReactions(await getTmdbReactionsSummary([...now, ...next].map((m) => m.id)));
      })
      .catch((err) => {
        setError(
          err.message === 'chiave'
            ? 'Il catalogo film non è ancora collegato (manca la chiave TMDB).'
            : err.message === 'timeout'
              ? 'Il catalogo film ci sta mettendo troppo a rispondere. Riprova più tardi.'
              : 'Impossibile raggiungere il catalogo film ora.'
        );
        setNowPlaying([]);
        setUpcoming([]);
      });
  }, []);

  const handleToggle = async (movieId, reazione) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const summary = reactions.get(movieId) ?? { vuole: [], piaciuto: [], myReactions: new Set() };
    const active = summary.myReactions.has(reazione);
    const { error: err } = await toggleTmdbReaction(movieId, reazione, active);
    if (err) return;
    setReactions((prev) => {
      const next = new Map(prev);
      const entry = { vuole: [...summary.vuole], piaciuto: [...summary.piaciuto], myReactions: new Set(summary.myReactions) };
      const me = { id: user.id, name: displayName(user, 'Tu'), avatar: user.avatar || '' };
      if (active) {
        entry[reazione] = entry[reazione].filter((p) => p.id !== user.id);
        entry.myReactions.delete(reazione);
      } else {
        entry[reazione] = [...entry[reazione], me];
        entry.myReactions.add(reazione);
      }
      next.set(movieId, entry);
      return next;
    });
  };

  const loadTrailer = async (movieId) => {
    if (trailers.has(movieId)) return;
    setLoadingTrailerId(movieId);
    const key = await getMovieTrailerKey(movieId).catch(() => null);
    setTrailers((prev) => new Map(prev).set(movieId, key));
    setLoadingTrailerId(null);
  };

  const sortedNowPlaying = useMemo(() => sortMovies(nowPlaying, sort), [nowPlaying, sort]);
  const sortedUpcoming = useMemo(() => sortMovies(upcoming, sort), [upcoming, sort]);

  return (
    <div className="rb-cultural-column">
      <div className="rb-cultural-header">
        <div>
          <h3>Cinema</h3>
          <p>Film al cinema ora e in uscita prossimamente — reagisci per organizzarti con chi ci vuole andare.</p>
        </div>
        <label className="rb-cultural-sort">
          <span>Ordina per</span>
          <CustomSelect value={sort} options={SORT_OPTIONS} onChange={setSort} />
        </label>
      </div>

      {error && <p className="rb-cultural-status rb-cultural-error">{error}</p>}

      <div className="rb-cultural-panel-header"><h4>Al cinema ora</h4></div>
      {nowPlaying === null ? (
        <div className="rb-cultural-skeleton-list" aria-hidden="true">
          <Skeleton lines={2} />
          <Skeleton lines={2} />
          <Skeleton lines={2} />
        </div>
      ) : nowPlaying.length === 0 && !error ? (
        <EmptyState icon="🎬" title="Nessun film disponibile ora" subtitle="Riprova più tardi." />
      ) : (
        <ul className="rb-cultural-list">
          {sortedNowPlaying.map((m) => (
            <MovieCard
              key={m.id}
              movie={m}
              summary={reactions.get(m.id)}
              onToggle={handleToggle}
              onShowReactors={onShowReactors}
              trailer={trailers.get(m.id)}
              trailerLoading={loadingTrailerId === m.id}
              onLoadTrailer={loadTrailer}
            />
          ))}
        </ul>
      )}

      <div className="rb-cultural-panel-header"><h4>Prossimamente</h4></div>
      {upcoming === null ? (
        <div className="rb-cultural-skeleton-list" aria-hidden="true">
          <Skeleton lines={2} />
          <Skeleton lines={2} />
        </div>
      ) : upcoming.length === 0 && !error ? (
        <EmptyState icon="🍿" title="Nessuna anteprima disponibile ora" subtitle="Riprova più tardi." />
      ) : (
        <ul className="rb-cultural-list">
          {sortedUpcoming.map((m) => (
            <MovieCard
              key={m.id}
              movie={m}
              summary={reactions.get(m.id)}
              onToggle={handleToggle}
              onShowReactors={onShowReactors}
              trailer={trailers.get(m.id)}
              trailerLoading={loadingTrailerId === m.id}
              onLoadTrailer={loadTrailer}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
