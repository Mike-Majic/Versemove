import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchStreams,
  fetchTopGames,
  searchChannels,
  fetchChannel,
  playerUrl,
  vodPlayerUrl,
  chatUrl,
  channelPageUrl,
  formatViewers,
} from '../../../data/twitch';
import Icon from '../../shared/Icon';
import EmptyState from '../../EmptyState';
import Skeleton from '../../Skeleton';
import { useBackLayer } from '../../../hooks/useBackLayer';
import { MINI_AVOID_EVENT } from '../../../calls/CallSurface';
import './twitch.css';

// "Streaming & Content Creator" (mondo Nerd): Twitch dentro Versemove.
// Home con le dirette (italiano di base), ricerca canali, categorie più
// viste e lingua; pagina canale con player e chat incorporati, o immagine
// offline e ultimi video. Dati dall'edge function `twitch` (data/twitch.js).
// Una chiamata Versemove in corso resta attiva (vive in CallProvider): il
// player è una zona data-mini-avoid, il mini-monitor non ci resta sopra.

const LANGUAGES = [
  { id: 'it', label: 'Italiano' },
  { id: 'all', label: 'Tutte' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'fr', label: 'Français' },
  { id: 'de', label: 'Deutsch' },
];
const PAGE = 24;
const REFRESH_MS = 60000;
const SEARCH_DEBOUNCE_MS = 400;

function Avatar({ src, name, size = 36 }) {
  return src ? (
    <img className="rb-tw-avatar" src={src} alt="" width={size} height={size} loading="lazy" />
  ) : (
    <span className="rb-tw-avatar rb-tw-avatar--letter" style={{ width: size, height: size }}>
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  if (error.code === 'not_configured') {
    return (
      <EmptyState
        icon={<Icon name="broadcast" size={34} />}
        title="Twitch non è ancora collegato"
        subtitle="Presto qui trovi le dirette di Twitch, da guardare con la chat senza uscire da Versemove."
      />
    );
  }
  return (
    <div className="rb-tw-error" role="alert">
      <span>{error.message}</span>
      {onRetry && (
        <button type="button" className="rb-tw-btn" onClick={onRetry}>
          <Icon name="refresh" size={16} /> Riprova
        </button>
      )}
    </div>
  );
}

function StreamCard({ s, onOpen }) {
  return (
    <button type="button" className="rb-tw-card" onClick={() => onOpen(s.login)}>
      <span className="rb-tw-thumb">
        {s.thumbnail ? <img src={s.thumbnail} alt="" loading="lazy" width="440" height="248" /> : <span className="rb-tw-thumb-empty" />}
        <span className="rb-tw-live">LIVE</span>
        <span className="rb-tw-viewers">
          <Icon name="users" size={13} /> {formatViewers(s.viewer_count)}
        </span>
      </span>
      <span className="rb-tw-card-meta">
        <Avatar src={s.avatar} name={s.display_name} size={34} />
        <span className="rb-tw-card-text">
          <span className="rb-tw-card-title" title={s.title}>{s.title || 'Senza titolo'}</span>
          <span className="rb-tw-card-name">{s.display_name}</span>
          {s.game_name && <span className="rb-tw-card-game">{s.game_name}</span>}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Home: dirette, ricerca, categorie, lingua

function TwitchHome({ onOpen }) {
  const [language, setLanguage] = useState('it');
  const [gameId, setGameId] = useState('');
  const [games, setGames] = useState([]);
  const [streams, setStreams] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [liveOnly, setLiveOnly] = useState(false);
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const sentinelRef = useRef(null);
  const reqRef = useRef(0);

  // Prima pagina (anche al cambio di lingua/categoria).
  const loadFirst = useCallback(async () => {
    const req = ++reqRef.current;
    setError(null);
    try {
      const res = await fetchStreams({ language, gameId, first: PAGE });
      if (req !== reqRef.current) return;
      setStreams(res.streams);
      setCursor(res.cursor);
    } catch (err) {
      if (req !== reqRef.current) return;
      setError(err);
      setStreams((prev) => prev ?? []);
    }
  }, [language, gameId]);

  useEffect(() => {
    setStreams(null);
    setCursor(null);
    loadFirst();
  }, [loadFirst]);

  // Aggiornamento ogni 60 s: si rilegge la prima pagina e si tengono le
  // dirette già caricate più in basso (quelle non ancora ricomparse).
  useEffect(() => {
    const timer = setInterval(async () => {
      if (document.hidden) return;
      const req = reqRef.current;
      try {
        const res = await fetchStreams({ language, gameId, first: PAGE });
        if (req !== reqRef.current) return;
        setStreams((prev) => {
          const seen = new Set(res.streams.map((s) => s.login));
          return [...res.streams, ...(prev ?? []).slice(PAGE).filter((s) => !seen.has(s.login))];
        });
      } catch {
        // resta la lista di prima: al prossimo giro si riprova
      }
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [language, gameId]);

  useEffect(() => {
    let cancelled = false;
    fetchTopGames(30)
      .then((list) => {
        if (!cancelled) setGames(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const req = reqRef.current;
    setLoadingMore(true);
    try {
      const res = await fetchStreams({ language, gameId, first: PAGE, after: cursor });
      if (req !== reqRef.current) return;
      setStreams((prev) => {
        const seen = new Set((prev ?? []).map((s) => s.login));
        return [...(prev ?? []), ...res.streams.filter((s) => !seen.has(s.login))];
      });
      setCursor(res.cursor);
    } catch (err) {
      if (req === reqRef.current) setError(err);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, language, gameId]);

  // Scroll infinito: il segnaposto in fondo alla griglia entra in vista.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return undefined;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '400px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [cursor, loadMore]);

  // Ricerca canali con 400 ms di pausa dopo l'ultima lettera.
  const q = query.trim();
  useEffect(() => {
    if (q.length < 2) {
      setResults(null);
      setSearchError(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const list = await searchChannels(q, liveOnly);
        if (!cancelled) {
          setResults(list);
          setSearchError(null);
        }
      } catch (err) {
        if (!cancelled) setSearchError(err);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, liveOnly]);

  const notConfigured = error?.code === 'not_configured';

  return (
    <div className="rb-tw-home">
      <div className="rb-tw-toolbar">
        <label className="rb-tw-search">
          <Icon name="search" size={17} />
          <input
            type="search"
            value={query}
            placeholder="Cerca un canale Twitch"
            onChange={(e) => setQuery(e.target.value)}
            disabled={notConfigured}
            aria-label="Cerca un canale Twitch"
          />
        </label>
        <label className="rb-tw-lang">
          <Icon name="globe" size={16} />
          <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Lingua delle dirette" disabled={notConfigured}>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </label>
      </div>

      {games.length > 0 && !notConfigured && (
        <div className="rb-tw-chips" role="tablist" aria-label="Categorie più viste">
          <button type="button" role="tab" aria-selected={!gameId} className={!gameId ? 'is-active' : ''} onClick={() => setGameId('')}>
            Tutte
          </button>
          {games.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={gameId === g.id} className={gameId === g.id ? 'is-active' : ''} onClick={() => setGameId(g.id)}>
              {g.name}
            </button>
          ))}
        </div>
      )}

      {q.length >= 2 ? (
        <section className="rb-tw-section">
          <div className="rb-tw-section-head">
            <h4>Canali per “{q}”</h4>
            <label className="rb-tw-toggle">
              <input type="checkbox" checked={liveOnly} onChange={(e) => setLiveOnly(e.target.checked)} /> Solo in diretta
            </label>
          </div>
          <ErrorBox error={searchError} />
          {!results && searching ? (
            <Skeleton lines={3} />
          ) : results && results.length === 0 ? (
            <p className="rb-tw-muted">Nessun canale trovato.</p>
          ) : (
            <ul className="rb-tw-results">
              {(results ?? []).map((c) => (
                <li key={c.login}>
                  <button type="button" onClick={() => onOpen(c.login)}>
                    <Avatar src={c.avatar} name={c.display_name} size={40} />
                    <span className="rb-tw-card-text">
                      <span className="rb-tw-card-name">
                        {c.display_name} {c.is_live && <span className="rb-tw-live rb-tw-live--inline">LIVE</span>}
                      </span>
                      {c.title && <span className="rb-tw-card-title">{c.title}</span>}
                      {c.game_name && <span className="rb-tw-card-game">{c.game_name}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="rb-tw-section">
          <div className="rb-tw-section-head">
            <h4>
              <span className="rb-tw-dot" aria-hidden="true" /> In diretta ora
            </h4>
          </div>
          <ErrorBox error={error} onRetry={notConfigured ? null : loadFirst} />
          {streams === null ? (
            <div className="rb-tw-grid">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="rb-tw-card rb-tw-card--skeleton" />
              ))}
            </div>
          ) : streams.length === 0 && !error ? (
            <p className="rb-tw-muted">Nessuna diretta in questa lingua e categoria in questo momento.</p>
          ) : (
            <div className="rb-tw-grid">
              {streams.map((s) => (
                <StreamCard key={s.login} s={s} onOpen={onOpen} />
              ))}
            </div>
          )}
          {cursor && <div ref={sentinelRef} className="rb-tw-sentinel">{loadingMore && <Skeleton lines={1} />}</div>}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina canale

function TwitchChannel({ login, onBack }) {
  const [channel, setChannel] = useState(null);
  const [error, setError] = useState(null);
  const [vod, setVod] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const ch = await fetchChannel(login);
      setChannel(ch ?? false);
    } catch (err) {
      setError(err);
    }
  }, [login]);

  useEffect(() => {
    setChannel(null);
    setVod(null);
    load();
  }, [load]);

  // Mini-monitor di una chiamata in corso lontano dal player (anche quando
  // il player cambia dimensione: finestra, chat aperta/chiusa).
  const playerRef = useRef(null);
  const hasPlayer = Boolean(channel && !channel.mature_blocked && (channel.live || vod));
  useEffect(() => {
    const el = playerRef.current;
    if (!el) return undefined;
    const notify = () => window.dispatchEvent(new Event(MINI_AVOID_EVENT));
    notify();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(notify) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [hasPlayer, chatOpen]);

  const back = (
    <button type="button" className="rb-tw-btn rb-tw-back" onClick={onBack}>
      <Icon name="back" size={17} /> Dirette
    </button>
  );

  if (error) {
    return (
      <div className="rb-tw-channel">
        {back}
        <ErrorBox error={error} onRetry={error.code === 'not_configured' ? null : load} />
      </div>
    );
  }
  if (channel === null) {
    return (
      <div className="rb-tw-channel">
        {back}
        <div className="rb-tw-player-skeleton" />
        <Skeleton lines={3} />
      </div>
    );
  }
  if (channel === false) {
    return (
      <div className="rb-tw-channel">
        {back}
        <p className="rb-tw-muted">Canale non trovato.</p>
      </div>
    );
  }

  const live = channel.live;
  const blocked = Boolean(channel.mature_blocked);
  const title = live?.title || channel.title;
  const game = live?.game_name || channel.game_name;
  const tags = live?.tags?.length ? live.tags : channel.tags ?? [];
  const showLivePlayer = live && !blocked;
  const playerSrc = vod ? vodPlayerUrl(vod.id) : showLivePlayer ? playerUrl(channel.login) : null;

  return (
    <div className="rb-tw-channel">
      <div className="rb-tw-channel-top">
        {back}
        <a className="rb-tw-btn rb-tw-btn--primary" href={channelPageUrl(channel.login)} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={16} /> Apri su Twitch
        </a>
      </div>

      {blocked ? (
        <div className="rb-tw-blocked" role="status">
          <Icon name="lock" size={22} />
          <p>Questo canale non è disponibile per il tuo account</p>
        </div>
      ) : playerSrc ? (
        <div className={`rb-tw-watch ${showLivePlayer && !vod ? 'has-chat' : ''} ${chatOpen ? '' : 'chat-closed'}`}>
          <div className="rb-tw-player" ref={playerRef} data-mini-avoid="">
            <iframe
              key={playerSrc}
              src={playerSrc}
              title={vod ? `Video di ${channel.display_name}` : `Diretta di ${channel.display_name}`}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
          {showLivePlayer && !vod && (
            <div className="rb-tw-chat">
              <button type="button" className="rb-tw-chat-toggle" onClick={() => setChatOpen((v) => !v)} aria-expanded={chatOpen}>
                <Icon name="chat" size={16} /> {chatOpen ? 'Nascondi chat' : 'Mostra chat'}
                <Icon name={chatOpen ? 'chevronUp' : 'chevronDown'} size={16} />
              </button>
              {chatOpen && <iframe src={chatUrl(channel.login)} title={`Chat di ${channel.display_name}`} />}
            </div>
          )}
        </div>
      ) : (
        <div className="rb-tw-offline">
          {channel.offline_image ? <img src={channel.offline_image} alt="" /> : <div className="rb-tw-offline-empty"><Icon name="broadcast" size={40} /></div>}
          <span className="rb-tw-offline-badge">Offline</span>
        </div>
      )}

      {vod && (
        <button type="button" className="rb-tw-btn" onClick={() => setVod(null)}>
          {live ? 'Torna alla diretta' : 'Chiudi il video'}
        </button>
      )}

      <div className="rb-tw-info">
        <Avatar src={channel.avatar} name={channel.display_name} size={56} />
        <div className="rb-tw-info-text">
          <h3>
            {channel.display_name} {showLivePlayer && <span className="rb-tw-live rb-tw-live--inline">LIVE</span>}
            {showLivePlayer && (
              <span className="rb-tw-info-viewers">
                <Icon name="users" size={14} /> {formatViewers(live.viewer_count)}
              </span>
            )}
          </h3>
          {vod ? <p className="rb-tw-info-title">{vod.title}</p> : title && <p className="rb-tw-info-title">{title}</p>}
          {game && <p className="rb-tw-card-game">{game}</p>}
          {tags.length > 0 && (
            <div className="rb-tw-tags">
              {tags.slice(0, 8).map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}
          {channel.description && <p className="rb-tw-desc">{channel.description}</p>}
        </div>
      </div>

      {!blocked && channel.videos?.length > 0 && (
        <section className="rb-tw-section">
          <div className="rb-tw-section-head">
            <h4>Ultimi video</h4>
          </div>
          <div className="rb-tw-grid rb-tw-grid--vod">
            {channel.videos.map((v) => (
              <button key={v.id} type="button" className={`rb-tw-card ${vod?.id === v.id ? 'is-active' : ''}`} onClick={() => setVod(v)}>
                <span className="rb-tw-thumb">
                  {v.thumbnail ? <img src={v.thumbnail} alt="" loading="lazy" width="320" height="180" /> : <span className="rb-tw-thumb-empty" />}
                  <span className="rb-tw-play" aria-hidden="true"><Icon name="play" size={22} /></span>
                  {v.duration && <span className="rb-tw-viewers">{v.duration}</span>}
                </span>
                <span className="rb-tw-card-text">
                  <span className="rb-tw-card-title" title={v.title}>{v.title}</span>
                  <span className="rb-tw-card-game">{new Date(v.created_at).toLocaleDateString('it-IT')}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function TwitchColumn({ user, onOpenAuth }) {
  const [login, setLogin] = useState(null);
  useBackLayer(Boolean(login), () => setLogin(null), 'subpage:twitch-channel');
  const panelRef = useRef(null);

  const open = (l) => {
    setLogin(l);
    panelRef.current?.scrollTo?.({ top: 0 });
  };

  return (
    <div ref={panelRef} className={`rb-tw-panel ${login ? 'rb-tw-panel--channel' : ''}`}>
      <header className="rb-tw-head">
        <Icon name="broadcast" size={20} />
        <h3>Streaming & Content Creator</h3>
      </header>
      {!user ? (
        <EmptyState
          icon={<Icon name="broadcast" size={34} />}
          title="Accedi per vedere Twitch"
          subtitle="Le dirette di Twitch con la chat, dentro Versemove."
          actions={[{ label: 'Accedi', primary: true, onClick: () => onOpenAuth?.() }]}
        />
      ) : login ? (
        <TwitchChannel key={login} login={login} onBack={() => setLogin(null)} />
      ) : (
        <TwitchHome onOpen={open} />
      )}
    </div>
  );
}
