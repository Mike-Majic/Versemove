import { useCallback, useEffect, useState } from 'react';
import {
  LIBRARY_STATES,
  fetchMyLibraryEntry,
  fetchTitlePlayers,
  fetchTitleStats,
  formatVote,
  platformGamertag,
  platformLabel,
  setLibraryState,
  setLibraryVote,
} from '../../../data/gaming';
import { displayName } from '../../../data/posts';
import { useBackLayer } from '../../../hooks/useBackLayer';
import Skeleton from '../../Skeleton';
import GameCover from './GameCover';

// Scheda di un gioco: copertina, dati, numeri di chi ci gioca, i miei
// bottoni (Ci gioco / Finito / Lo voglio + voto) e "Chi ci gioca".
const VOTES = Array.from({ length: 10 }, (_, i) => i + 1);

function Avatar({ profile, size = 28 }) {
  const name = displayName(profile, 'Utente');
  return profile?.avatar ? (
    <img className="rb-vroom-avatar" src={profile.avatar} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="rb-vroom-avatar rb-vroom-avatar--letter" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function StatsLine({ stats }) {
  if (!stats) return null;
  const parts = LIBRARY_STATES.map((s) => {
    const n = stats[s.stat] ?? 0;
    return `${n} ${n === 1 ? s.statLabel : s.statLabelPlural}`;
  });
  if (stats.voti > 0) parts.push(`★ ${formatVote(stats.mediaVoto)} (${stats.voti})`);
  return <>{parts.join(' · ')}</>;
}

export default function GameCard({ title, platform, user, onOpenAuth, onBack, onLfgFor, onChanged }) {
  const [stats, setStats] = useState(null);
  const [entry, setEntry] = useState(undefined); // undefined = caricamento, null = non in libreria
  const [players, setPlayers] = useState(null); // null = non aperto
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useBackLayer(true, onBack, 'subpage:gaming-game');

  const reload = useCallback(async () => {
    const [statsMap, mine] = await Promise.all([fetchTitleStats([title.id]), user ? fetchMyLibraryEntry(title.id) : Promise.resolve(null)]);
    setStats(statsMap.get(title.id) ?? { giocatori: 0, finito: 0, wishlist: 0, mediaVoto: null, voti: 0 });
    setEntry(mine);
  }, [title.id, user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const requireAuth = () => {
    if (user) return false;
    onOpenAuth?.();
    return true;
  };

  const afterChange = async () => {
    await reload();
    if (players) setPlayers(await fetchTitlePlayers(title.id));
    onChanged?.();
  };

  const toggleState = async (stato) => {
    if (requireAuth() || busy) return;
    setBusy(true);
    setError('');
    const next = entry?.stato === stato ? null : stato;
    const { error: err } = await setLibraryState(title.id, next, platform);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    afterChange();
  };

  const vote = async (value) => {
    if (requireAuth() || busy) return;
    setBusy(true);
    setError('');
    const { error: err } = await setLibraryVote(title.id, value || null, { stato: entry?.stato ?? 'gioco', piattaforma: platform });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    afterChange();
  };

  const showPlayers = async () => {
    if (players) {
      setPlayers(null);
      return;
    }
    setPlayers(await fetchTitlePlayers(title.id));
  };

  return (
    <div className="rb-game-card">
      <button type="button" className="rb-vroom-btn rb-game-card-back" onClick={onBack}>← Giochi</button>

      <div className="rb-game-card-head">
        <GameCover title={title} size="lg" />
        <div className="rb-game-card-info">
          <h3>{title.nome}</h3>
          {title.anno && <p className="rb-gaming-note">{title.anno}</p>}
          {title.piattaforme?.length > 0 && (
            <ul className="rb-game-chips" aria-label="Piattaforme">
              {title.piattaforme.map((p) => (
                <li key={p} className={p === platform ? 'is-here' : ''}>{platformLabel(p)}</li>
              ))}
            </ul>
          )}
          {title.generi?.length > 0 && (
            <ul className="rb-game-chips" aria-label="Generi">
              {title.generi.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {stats ? (
        <p className="rb-game-stats">
          {LIBRARY_STATES.map((s) => {
            const n = stats[s.stat] ?? 0;
            return (
              <span key={s.id}>
                {s.icon} <strong>{n}</strong> {n === 1 ? s.statLabel : s.statLabelPlural}
              </span>
            );
          })}
          <span>
            ★ <strong>{stats.voti > 0 ? formatVote(stats.mediaVoto) : '—'}</strong> {stats.voti > 0 ? `(${stats.voti} ${stats.voti === 1 ? 'voto' : 'voti'})` : 'nessun voto'}
          </span>
        </p>
      ) : (
        <Skeleton lines={1} />
      )}

      {error && <p className="rb-gaming-error" role="alert">{error}</p>}

      <div className="rb-game-lib">
        {LIBRARY_STATES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`rb-vroom-btn ${entry?.stato === s.id ? 'is-active' : ''}`}
            onClick={() => toggleState(s.id)}
            disabled={busy || entry === undefined}
            aria-pressed={entry?.stato === s.id}
          >
            {s.icon} {s.label}
          </button>
        ))}
        <label className="rb-game-vote">
          Il mio voto
          <select value={entry?.voto ?? ''} onChange={(e) => vote(Number(e.target.value))} disabled={busy || entry === undefined} onFocus={() => requireAuth()}>
            <option value="">—</option>
            {VOTES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="rb-game-actions">
        <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => (requireAuth() ? null : onLfgFor?.(title))}>
          🎮 Cerco compagni per questo gioco
        </button>
        <button type="button" className="rb-vroom-btn" onClick={showPlayers}>
          {players ? 'Nascondi chi ci gioca' : '👥 Chi ci gioca'}
        </button>
      </div>

      {players && (
        <div>
          <div className="rb-gaming-section-title">Chi ci gioca</div>
          {players.length === 0 ? (
            <p className="rb-gaming-note">Ancora nessuno: sii il primo a metterlo in libreria.</p>
          ) : (
            <ul className="rb-game-players">
              {players.map((p) => {
                const tags = user && p.userId === user.id ? user.gamertags : p.gamertags;
                const tag = platformGamertag(tags, platform);
                const state = LIBRARY_STATES.find((s) => s.id === p.stato);
                return (
                  <li key={p.userId} className="rb-game-player">
                    <Avatar profile={p.profile} />
                    <span className="rb-game-player-name">
                      <strong>{displayName(p.profile, 'Utente')}</strong>
                      {tag && (
                        <span className="rb-game-player-tag" title={tag.label}>
                          {tag.icon} {tag.value}
                        </span>
                      )}
                    </span>
                    <span className="rb-game-player-meta">
                      {state ? `${state.icon} ${state.label}` : ''}
                      {p.voto ? ` · ★ ${p.voto}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
