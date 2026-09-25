import { useCallback, useEffect, useState } from 'react';
import { LIBRARY_STATES, fetchMyLibrary, fetchTitleStats, formatVote, searchTitles } from '../../../data/gaming';
import EmptyState from '../../EmptyState';
import Skeleton from '../../Skeleton';
import GameCard, { StatsLine } from './GameCard';
import GameSearch, { GameRow } from './GameSearch';

// Scheda "Giochi": ricerca in alto, poi (a ricerca vuota) "I più giocati
// qui" e "La mia libreria" con filtro per stato. Un gioco scelto apre la
// sua scheda (GameCard) al posto della lista.
const MOST_PLAYED_LIMIT = 12;
const LIB_FILTERS = [{ id: 'tutti', label: 'Tutti' }, ...LIBRARY_STATES.map((s) => ({ id: s.id, label: `${s.icon} ${s.label}` }))];

export default function GiochiTab({ platform, user, onOpenAuth, onLfgFor, initialTitle = null }) {
  // initialTitle: gioco da aprire subito (es. dal gioco di un annuncio).
  const [selected, setSelected] = useState(initialTitle);
  const [searching, setSearching] = useState(false);
  const [mostPlayed, setMostPlayed] = useState(null);
  const [stats, setStats] = useState(new Map());
  const [library, setLibrary] = useState(null);
  const [libFilter, setLibFilter] = useState('tutti');

  const reload = useCallback(async () => {
    const [titles, lib] = await Promise.all([searchTitles('', platform, MOST_PLAYED_LIMIT), user ? fetchMyLibrary() : Promise.resolve([])]);
    const statsMap = await fetchTitleStats([...titles.map((t) => t.id), ...lib.map((r) => r.titleId)]);
    const withPlayers = titles
      .map((t) => ({ t, n: statsMap.get(t.id)?.giocatori ?? 0 }))
      .sort((a, b) => b.n - a.n)
      .map((x) => x.t);
    setStats(statsMap);
    setMostPlayed(withPlayers);
    setLibrary(lib);
  }, [platform, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (selected) {
    return (
      <GameCard
        title={selected}
        platform={platform}
        user={user}
        onOpenAuth={onOpenAuth}
        onBack={() => setSelected(null)}
        onLfgFor={onLfgFor}
        onChanged={reload}
      />
    );
  }

  const visibleLibrary = (library ?? []).filter((r) => libFilter === 'tutti' || r.stato === libFilter);

  return (
    <>
      <GameSearch platform={platform} user={user} onOpenAuth={onOpenAuth} onPick={setSelected} onQueryChange={(q) => setSearching(Boolean(q.trim()))} />

      {!searching && (
        <>
          <section>
            <div className="rb-gaming-section-title">I più giocati qui</div>
            {mostPlayed === null ? (
              <Skeleton lines={3} />
            ) : mostPlayed.length === 0 ? (
              <EmptyState icon="🎮" title="Nessun gioco ancora" subtitle="Cerca un gioco qui sopra e mettilo in libreria: sarà il primo della lista." />
            ) : (
              <ul className="rb-game-results">
                {mostPlayed.map((t) => (
                  <li key={t.id}>
                    <GameRow
                      title={t}
                      onClick={() => setSelected(t)}
                      trailing={<span className="rb-game-row-state"><StatsLine stats={stats.get(t.id)} /></span>}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="rb-gaming-section-title">
              <span>La mia libreria</span>
            </div>
            {!user ? (
              <p className="rb-gaming-note">
                <button type="button" className="rb-vroom-btn" onClick={onOpenAuth}>Accedi</button> per segnare i giochi a cui giochi, che hai finito o che vuoi.
              </p>
            ) : library === null ? (
              <Skeleton lines={2} />
            ) : (
              <>
                <div className="rb-gaming-filters" style={{ marginBottom: 8 }}>
                  {LIB_FILTERS.map((f) => (
                    <button key={f.id} type="button" className={libFilter === f.id ? 'is-active' : ''} onClick={() => setLibFilter(f.id)}>
                      {f.label}
                    </button>
                  ))}
                </div>
                {visibleLibrary.length === 0 ? (
                  <p className="rb-gaming-note">{library.length === 0 ? 'La tua libreria è vuota.' : 'Niente con questo filtro.'}</p>
                ) : (
                  <ul className="rb-game-results">
                    {visibleLibrary.map((r) => {
                      const state = LIBRARY_STATES.find((s) => s.id === r.stato);
                      return (
                        <li key={r.titleId}>
                          <GameRow
                            title={r.title}
                            onClick={() => setSelected(r.title)}
                            trailing={
                              <span className="rb-game-row-state">
                                {state ? `${state.icon} ${state.label}` : ''}
                                {r.voto ? ` · ★ ${r.voto}` : ''}
                                {stats.get(r.titleId)?.voti ? ` · media ${formatVote(stats.get(r.titleId).mediaVoto)}` : ''}
                              </span>
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>
        </>
      )}

    </>
  );
}
