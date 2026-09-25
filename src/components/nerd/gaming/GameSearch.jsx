import { useEffect, useRef, useState } from 'react';
import { externalSourceLabel, fetchTitle, importExternalTitle, platformLabel, searchExternal, searchTitles, upsertTitle } from '../../../data/gaming';
import GameCover from './GameCover';

// Ricerca di un gioco (scheda Giochi, form "Cerco compagni", compositori):
// dalle prime lettere (debounce 180 ms) il catalogo condiviso via
// search_gaming_titles più una fonte esterna con copertina e nome intero
// (RAWG con VITE_RAWG_KEY, altrimenti Wikipedia, vedi data/gaming.js);
// i risultati precedenti restano a schermo mentre arrivano i nuovi, e le
// query già fatte tornano dalla cache. Scegliere un risultato esterno lo
// salva nel catalogo (deduplicato dal server) e restituisce il titolo
// salvato con il nome corretto; solo se non esce nulla, "Aggiungi «nome»"
// lo crea a mano con la piattaforma della categoria. onPick(title) riceve
// sempre un titolo del catalogo ({ id, nome, ... }). onQueryChange(q) dice
// al genitore se il campo è vuoto (per mostrare altro sotto).
const DEBOUNCE_MS = 180;

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
  const [external, setExternal] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seqRef = useRef(0);

  useEffect(() => {
    onQueryChange?.(q);
    const clean = q.trim();
    if (!clean) {
      setLocal([]);
      setExternal([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const seq = ++seqRef.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      // Il catalogo risponde per primo (è nostro): si mostra appena arriva,
      // la fonte esterna si aggiunge sotto quando è pronta.
      const localPromise = searchTitles(clean, platform, 12);
      const externalPromise = searchExternal(clean, controller.signal);
      const l = await localPromise;
      if (seq !== seqRef.current) return;
      setLocal(l);
      const r = await externalPromise;
      if (seq !== seqRef.current) return;
      // Un risultato esterno già nel catalogo non si mostra due volte.
      const knownIds = new Set(l.map((t) => t.rawgId).filter(Boolean));
      const knownNames = new Set(l.map((t) => `${t.nome.toLowerCase()}|${t.anno ?? ''}`));
      setExternal(r.filter((x) => !(x.rawgId && knownIds.has(x.rawgId)) && !knownNames.has(`${x.nome.toLowerCase()}|${x.anno ?? ''}`)));
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
  const nothing = clean && !loading && local.length === 0 && external.length === 0;
  const sourceLabel = externalSourceLabel();

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
          {loading && local.length === 0 && external.length === 0 && <li className="rb-gaming-note">Cerco…</li>}
          {local.map((t) => (
            <li key={t.id}>
              <GameRow title={t} onClick={() => onPick(t)} />
            </li>
          ))}
          {external.map((r) => (
            <li key={`ext-${r.rawgId ?? r.wikiId}`}>
              <GameRow
                title={r}
                badge={sourceLabel}
                onClick={() => pickSaved(() => importExternalTitle(r))}
              />
            </li>
          ))}
          {loading && (local.length > 0 || external.length > 0) && <li className="rb-gaming-note rb-gaming-note--soft">Aggiorno…</li>}
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
