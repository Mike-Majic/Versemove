import { useEffect, useState } from 'react';
import { getNowPlayingMovies, getUpcomingMovies } from '../../data/tmdb';
import { getTmdbReactionsSummary, toggleTmdbReaction } from '../../data/culturalReactions';
import ReactionButtons from './ReactionButtons';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import './cultural.css';

function MovieCard({ movie, summary, onToggle, onShowReactors }) {
  return (
    <li className="rb-cultural-card rb-cinema-card">
      {movie.posterUrl ? <img src={movie.posterUrl} alt="" /> : <div className="rb-cinema-poster-empty">🎬</div>}
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
      const me = { id: user.id, name: user.nickname || user.username || 'Tu', avatar: user.avatar || '' };
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

  return (
    <div className="rb-cultural-column">
      <div className="rb-cultural-header">
        <div>
          <h3>Cinema</h3>
          <p>Film al cinema ora e in uscita prossimamente — reagisci per organizzarti con chi ci vuole andare.</p>
        </div>
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
          {nowPlaying.map((m) => (
            <MovieCard key={m.id} movie={m} summary={reactions.get(m.id)} onToggle={handleToggle} onShowReactors={onShowReactors} />
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
          {upcoming.map((m) => (
            <MovieCard key={m.id} movie={m} summary={reactions.get(m.id)} onToggle={handleToggle} onShowReactors={onShowReactors} />
          ))}
        </ul>
      )}
    </div>
  );
}
