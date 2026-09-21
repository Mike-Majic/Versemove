import { useEffect, useState } from 'react';
import { listContentsForPlacement, toggleContentLike } from '../data/contents';
import { searchRadioStations } from '../data/radioBrowser';
import '../components/cultural/cultural.css';
import './PodcastColumn.css';

// Scheda "Radio" della categoria Podcast: stazioni radio reali (Radio
// Browser, API pubblica senza chiave) ascoltabili in diretta con un
// normale tag <audio>, incorporate dentro Versemove — nessun redirect
// esterno, mai. Un solo player alla volta, fisso sopra i risultati.
function RadioTab() {
  const [query, setQuery] = useState('');
  const [stations, setStations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(null);

  const search = async (q) => {
    setLoading(true);
    setError('');
    try {
      const result = await searchRadioStations(q, 24);
      setStations(result);
    } catch {
      setError('Impossibile raggiungere l’elenco delle radio ora. Riprova più tardi.');
      setStations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    search('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rb-radio-tab">
      <p className="rb-radio-note">🌍 Stazioni radio in diretta da tutto il mondo — si ascoltano qui dentro, senza uscire da Versemove.</p>

      <div className="rb-radio-search-row">
        <input
          type="text"
          placeholder="Cerca una radio (es. Deejay, BBC, Jazz FM)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              search(query);
            }
          }}
        />
        <button type="button" className="rb-radio-search-btn" onClick={() => search(query)}>Cerca</button>
      </div>

      {playing && (
        <div className="rb-radio-player">
          <div className="rb-radio-player-info">
            {playing.favicon ? <img src={playing.favicon} alt="" /> : <span className="rb-radio-player-icon">📻</span>}
            <strong>{playing.name}</strong>
          </div>
          <audio key={playing.id} src={playing.streamUrl} controls autoPlay />
          <button type="button" className="rb-radio-player-close" onClick={() => setPlaying(null)} aria-label="Ferma">✕</button>
        </div>
      )}

      {loading && <p className="rb-radio-status">Cerco stazioni radio...</p>}
      {error && <p className="rb-radio-status rb-radio-error">{error}</p>}
      {!loading && !error && stations?.length === 0 && <p className="rb-radio-status">Nessuna stazione trovata.</p>}

      <ul className="rb-radio-list">
        {stations?.map((s) => (
          <li key={s.id} className={`rb-radio-card ${playing?.id === s.id ? 'active' : ''}`}>
            <button type="button" onClick={() => setPlaying(s)}>
              {s.favicon ? <img src={s.favicon} alt="" /> : <span className="rb-radio-card-icon">📻</span>}
              <div>
                <strong>{s.name}</strong>
                <span>{[s.country, ...s.tags].filter(Boolean).join(' · ')}</span>
              </div>
              <span className="rb-radio-play">{playing?.id === s.id ? '⏸' : '▶️'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Scheda "Podcast": puntate caricate dalla community (stesso sistema di
// contents.js usato da Fotografia/Video, filtrato su questa categoria) —
// niente ricerca in un catalogo esterno di podcast, che non esiste ancora.
function PodcastTab({ user, onOpenAuth }) {
  const [contents, setContents] = useState(null);

  useEffect(() => {
    listContentsForPlacement({ world: 'arte', category: 'podcast' }).then(setContents);
  }, []);

  const handleLike = async (c) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const { liked, error } = await toggleContentLike(c.id, c.likedByMe);
    if (error) return;
    setContents((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, likedByMe: liked, likeCount: x.likeCount + (liked ? 1 : -1) } : x))
    );
  };

  if (contents === null) return <p className="rb-cultural-status">Carico...</p>;
  if (contents.length === 0) return <p className="rb-cultural-status">Nessuna puntata caricata dalla community ancora.</p>;

  return (
    <ul className="rb-cultural-list">
      {contents.map((c) => (
        <li key={c.id} className="rb-cultural-card">
          {c.type === 'video' ? <video src={c.url} controls /> : <img src={c.url} alt={c.caption || 'Puntata'} />}
          <div className="rb-cultural-card-info">
            {c.caption && <strong>{c.caption}</strong>}
            {c.tags?.length > 0 && <p className="rb-cultural-card-meta">{c.tags.map((t) => `#${t}`).join(' ')}</p>}
          </div>
          <button type="button" className="rb-cultural-reaction-btn" onClick={() => handleLike(c)}>
            {c.likedByMe ? '❤️' : '🤍'} {c.likeCount}
          </button>
        </li>
      ))}
    </ul>
  );
}

// Categoria Podcast: due schede, Podcast (community) e Radio (stazioni
// live reali) — stesso guscio a pannello unico delle altre categorie
// culturali (cultural.css).
export default function PodcastColumn({ category, user, onOpenAuth }) {
  const [tab, setTab] = useState('podcast');

  return (
    <div className="rb-cultural-column">
      <div className="rb-cultural-header">
        <div>
          <h3>{category?.label ?? 'Podcast'}</h3>
          <p>Puntate dalla community, oppure radio in diretta da tutto il mondo.</p>
        </div>
      </div>

      <div className="rb-cultural-tabs">
        <button type="button" className={`rb-cultural-tab ${tab === 'podcast' ? 'active' : ''}`} onClick={() => setTab('podcast')}>
          Podcast
        </button>
        <button type="button" className={`rb-cultural-tab ${tab === 'radio' ? 'active' : ''}`} onClick={() => setTab('radio')}>
          Radio
        </button>
      </div>

      {tab === 'podcast' ? <PodcastTab user={user} onOpenAuth={onOpenAuth} /> : <RadioTab />}
    </div>
  );
}
