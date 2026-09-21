import { useEffect, useState } from 'react';
import { searchYoutubeVideos, getVideoViewCounts } from '../../data/youtubeSearch';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import './MusicaEsplora.css';

const TILES = [
  { id: 'nuove-uscite', label: 'Nuove uscite', query: 'nuove uscite musicali 2026', color: '#8b5cf6' },
  { id: 'classifiche', label: 'Classifiche', query: 'classifica musicale 2026', color: '#22c55e' },
  { id: 'mood', label: 'Mood e generi', query: null, color: '#f59e0b' },
];

const MOODS = [
  { id: 'festa', label: 'Festa', query: 'musica da festa', color: '#ef4444' },
  { id: 'allenamento', label: 'Allenamento', query: 'musica per allenarsi', color: '#f59e0b' },
  { id: 'studio', label: 'Studio', query: 'musica per studiare', color: '#3b82f6' },
  { id: 'relax', label: 'Relax', query: 'musica rilassante', color: '#10b981' },
  { id: 'romantico', label: 'Romantico', query: 'musica romantica', color: '#ec4899' },
  { id: 'italiana', label: 'Italiana', query: 'musica italiana', color: '#22c55e' },
  { id: 'rap', label: 'Rap', query: 'rap italiano', color: '#a855f7' },
  { id: 'rock', label: 'Rock', query: 'rock', color: '#64748b' },
  { id: 'pop', label: 'Pop', query: 'pop hits', color: '#06b6d4' },
];

function chunk3(arr) {
  const rows = [[], [], []];
  arr.forEach((item, i) => rows[i % 3].push(item));
  return rows;
}

function formatViews(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} Mln visualizzazioni`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} mila visualizzazioni`;
  return `${n} visualizzazioni`;
}

function SquareCarousel({ items, onSelect }) {
  return (
    <ul className="rb-esplora-carousel">
      {items.map((it) => (
        <li key={it.id}>
          <button type="button" onClick={() => onSelect(it)}>
            {it.artworkUrl ? <img src={it.artworkUrl} alt="" /> : <div className="rb-esplora-carousel-empty">🎵</div>}
            <strong>{it.title}</strong>
            <span>{it.artist}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function WideCarousel({ items, onSelect }) {
  return (
    <ul className="rb-esplora-wide-carousel">
      {items.map((it) => (
        <li key={it.id}>
          <button type="button" onClick={() => onSelect(it)}>
            {it.artworkUrl ? <img src={it.artworkUrl} alt="" /> : <div className="rb-esplora-wide-empty">🎬</div>}
            <strong>{it.title}</strong>
            <span>{it.artist}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Scheda "Esplora": sezioni curate costruite su ricerche mirate a YouTube
// (data/youtubeSearch.js). Ogni sezione carica solo quando la si apre
// davvero (non tutte insieme all'ingresso nella scheda) perché la chiave
// gratuita ha una quota giornaliera condivisa da tutto il sito — vedi il
// commento in data/youtubeSearch.js.
export default function MusicaEsplora({ playingId, onTogglePlay }) {
  const [results, setResults] = useState(null); // { title, items } | null
  const [loadingSection, setLoadingSection] = useState(null);
  const [error, setError] = useState('');
  const [newReleases, setNewReleases] = useState(null);
  const [trending, setTrending] = useState(null);
  const [newVideos, setNewVideos] = useState(null);
  const [loadingAuto, setLoadingAuto] = useState({ album: false, tendenze: false, video: false });

  const runSearch = async (title, query, opts) => {
    setLoadingSection(title);
    setError('');
    try {
      const items = await searchYoutubeVideos(query, opts?.limit ?? 12, opts?.order ? { order: opts.order } : undefined);
      setResults({ title, items });
    } catch (err) {
      setError(
        err.message === 'quota'
          ? 'Limite giornaliero di ricerche raggiunto. Riprova domani.'
          : 'Impossibile caricare questa sezione ora.'
      );
      setResults({ title, items: [] });
    } finally {
      setLoadingSection(null);
    }
  };

  const openTile = (tile) => {
    if (tile.id === 'mood') {
      document.getElementById('rb-esplora-mood-anchor')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    runSearch(tile.label, tile.query);
  };

  // Le tre sezioni con dati veri (album, tendenze, video) si caricano una
  // sola volta all'apertura della scheda, non ad ogni chip cliccato — ognuna
  // con il proprio stato di caricamento, altrimenti caricandole tutte e tre
  // insieme si pesterebbero i piedi sullo stesso indicatore.
  useEffect(() => {
    setLoadingAuto({ album: true, tendenze: true, video: true });

    searchYoutubeVideos('nuovi album e singoli 2026', 12)
      .then(setNewReleases)
      .catch(() => setNewReleases([]))
      .finally(() => setLoadingAuto((prev) => ({ ...prev, album: false })));

    searchYoutubeVideos('musica tendenza', 10, { order: 'viewCount' })
      .then(async (items) => {
        const counts = await getVideoViewCounts(items.map((it) => it.id)).catch(() => ({}));
        const sorted = [...items].sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0));
        setTrending(sorted.map((it) => ({ ...it, views: counts[it.id] ?? null })));
      })
      .catch(() => setTrending([]))
      .finally(() => setLoadingAuto((prev) => ({ ...prev, tendenze: false })));

    searchYoutubeVideos('nuovi video musicali', 10)
      .then(setNewVideos)
      .catch(() => setNewVideos([]))
      .finally(() => setLoadingAuto((prev) => ({ ...prev, video: false })));
  }, []);

  return (
    <div className="rb-esplora">
      <ul className="rb-esplora-tiles">
        {TILES.map((t) => (
          <li key={t.id}>
            <button type="button" className="rb-esplora-tile" style={{ '--tile-color': t.color }} onClick={() => openTile(t)}>
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      {results && (
        <section className="rb-esplora-section">
          <h4>{results.title}</h4>
          {loadingSection === results.title && (
            <div className="rb-esplora-skeleton-row" aria-hidden="true">
              <Skeleton lines={2} />
              <Skeleton lines={2} />
            </div>
          )}
          {error && <EmptyState icon="⚠️" title="Sezione non disponibile" subtitle={error} />}
          <ul className="rb-esplora-results-list">
            {results.items.map((it) => (
              <li key={it.id}>
                <button type="button" onClick={() => onTogglePlay(it)}>
                  {it.artworkUrl ? <img src={it.artworkUrl} alt="" /> : <div className="rb-esplora-results-empty">🎵</div>}
                  <div>
                    <strong>{it.title}</strong>
                    <span>{it.artist}</span>
                  </div>
                  <span className="rb-esplora-play">{playingId === it.id ? '⏸' : '▶️'}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rb-esplora-section">
        <h4>Nuovi album e singoli</h4>
        {loadingAuto.album && (
          <div className="rb-esplora-skeleton-row" aria-hidden="true">
            <Skeleton lines={2} />
            <Skeleton lines={2} />
          </div>
        )}
        {newReleases && newReleases.length > 0 && <SquareCarousel items={newReleases} onSelect={onTogglePlay} />}
        {newReleases?.length === 0 && <EmptyState icon="💿" title="Non disponibile ora" subtitle="Riprova più tardi." />}
      </section>

      <section className="rb-esplora-section" id="rb-esplora-mood-anchor">
        <h4>Mood e generi</h4>
        <div className="rb-esplora-mood-rows">
          {chunk3(MOODS).map((row, i) => (
            <div className="rb-esplora-mood-row" key={i}>
              {row.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="rb-esplora-mood-btn"
                  style={{ '--mood-color': m.color }}
                  onClick={() => runSearch(m.label, m.query)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="rb-esplora-section">
        <h4>Tendenze</h4>
        {loadingAuto.tendenze && (
          <div className="rb-esplora-skeleton-row" aria-hidden="true">
            <Skeleton lines={2} />
            <Skeleton lines={2} />
          </div>
        )}
        {trending && trending.length > 0 && (
          <ol className="rb-esplora-trending-list">
            {trending.map((it, i) => (
              <li key={it.id}>
                <button type="button" onClick={() => onTogglePlay(it)}>
                  <span className="rb-esplora-trending-rank">{i + 1}</span>
                  {it.artworkUrl ? <img src={it.artworkUrl} alt="" /> : <div className="rb-esplora-trending-empty">🎵</div>}
                  <div>
                    <strong>{it.title}</strong>
                    <span>{it.artist}{it.views != null ? ` · ${formatViews(it.views)}` : ''}</span>
                  </div>
                </button>
              </li>
            ))}
          </ol>
        )}
        {trending?.length === 0 && <EmptyState icon="📈" title="Non disponibile ora" subtitle="Riprova più tardi." />}
      </section>

      <section className="rb-esplora-section">
        <h4>Nuovi video</h4>
        {loadingAuto.video && (
          <div className="rb-esplora-skeleton-row" aria-hidden="true">
            <Skeleton lines={2} />
            <Skeleton lines={2} />
          </div>
        )}
        {newVideos && newVideos.length > 0 && <WideCarousel items={newVideos} onSelect={onTogglePlay} />}
        {newVideos?.length === 0 && <EmptyState icon="🎬" title="Non disponibile ora" subtitle="Riprova più tardi." />}
      </section>
    </div>
  );
}
