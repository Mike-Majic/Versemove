import { useEffect, useRef, useState } from 'react';
import { fetchTitle, importRawgTitle, platformLabel, searchRawg, searchTitles, upsertTitle } from '../../../data/gaming';
import GameCover from './GameCover';

// Ricerca di un gioco (scheda Giochi, form "Cerco compagni", compositori):
// catalogo condiviso via search_gaming_titles (debounce 250 ms) più, se c'è
// VITE_RAWG_KEY, i risultati RAWG con copertina. Scegliere un risultato
// esterno lo salva nel catalogo (deduplicato dal server) e restituisce il
// titolo salvato; se non c'è nulla, "Aggiungi «nome»" lo crea con la
// piattaforma della categoria. onPick(title) riceve sempre un titolo del
// catalogo ({ id, nome, ... }). onQueryChange(q) dice al genitore se il
// campo è vuoto (per mostrare altro sotto).
const DEBOUNCE_MS = 250;

export function GameRow({ title, badge, trailing, onClick }) {
  const meta = [title.anno, title.piattaforme?.map(platformLabel).join(' · ')].filter(Boolean).join(' · ');
  return (
    <button type="button" className="rb-game-row" onClick={onClick}>
      <GameCover title={title} />
      <span className="rb-game-row-main">
        <span className="rb-game-row-title">{title.nome}</span>
        {(meta || title.generi?.length > 0) && (
          <span className="rb-game-row-meta">{[meta, title.generi?.slice(0, 3).join(', ')].filter(Boolean).join(' — ')}</span>
        )}
      </span>
      {badge && <span className="rb-game-row-badge">{badge}</span>}
      {trailing}
    </button>
  );
}

export default function GameSearch({
  platform,
  user,
  onOpenAuth,
  onPick,
  onQueryChange,
  placeholder = 'Cerca un gioco…',
  autoFocus = false,
  allowCreate = true,
}) {
  const [q, setQ] = useState('');
  const [local, setLocal] = useState([]);
  const [rawg, setRawg] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seqRef = useRef(0);

  useEffect(() => {
    onQueryChange?.(q);
    const clean = q.trim();
    if (!clean) {
      setLocal([]);
      setRawg([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const seq = ++seqRef.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const [l, r] = await Promise.all([searchTitles(clean, platform, 12), searchRawg(clean, controller.signal)]);
      if (seq !== seqRef.current) return;
      // Un risultato RAWG già nel catalogo non si mostra due volte.
      const known = new Set(l.map((t) => t.rawgId).filter(Boolean));
      setLocal(l);
      setRawg(r.filter((x) => !known.has(x.rawgId)));
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, platform]);

  const requireAuth = () => {
    if (user) return false;
    onOpenAuth?.();
    return true;
  };

  const pickSaved = async (promise) => {
    if (requireAuth() || busy) return;
    setBusy(true);
    setError('');
    const { id, error: err } = await promise();
    if (err) {
      setBusy(false);
      setError(err);
      return;
    }
    const saved = await fetchTitle(id);
    setBusy(false);
    if (!saved) {
      setError('Gioco salvato, ma non riesco a rileggerlo. Riprova.');
      return;
    }
    setQ('');
    onPick(saved);
  };

  const clean = q.trim();
  const nothing = clean && !loading && local.length === 0 && rawg.length === 0;

  return (
    <div className="rb-game-search">
      <div className="rb-game-search-row">
        <input
          type="search"
          value={q}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Cerca un gioco"
        />
      </div>
      {error && <p className="rb-gaming-error" role="alert">{error}</p>}
      {clean && (
        <ul className="rb-game-results">
          {loading && local.length === 0 && rawg.length === 0 && <li className="rb-gaming-note">Cerco…</li>}
          {local.map((t) => (
            <li key={t.id}>
              <GameRow title={t} onClick={() => onPick(t)} />
            </li>
          ))}
          {rawg.map((r) => (
            <li key={`rawg-${r.rawgId}`}>
              <GameRow
                title={r}
                badge="RAWG"
                onClick={() => pickSaved(() => importRawgTitle(r))}
              />
            </li>
          ))}
          {nothing && allowCreate && (
            <li>
              <button
                type="button"
                className="rb-vroom-btn rb-vroom-btn--primary"
                disabled={busy}
                onClick={() => pickSaved(() => upsertTitle({ nome: clean, piattaforme: platform ? [platform] : [] }))}
              >
                {busy ? 'Aggiungo…' : `＋ Aggiungi «${clean}»`}
              </button>
            </li>
          )}
          {nothing && !allowCreate && <li className="rb-gaming-note">Nessun gioco trovato.</li>}
        </ul>
      )}
    </div>
  );
}
