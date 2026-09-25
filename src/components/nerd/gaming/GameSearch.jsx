import { useEffect, useRef, useState } from 'react';
import { WIKI_MIN_CHARS, WIKI_SOURCE_LABEL, fetchTitle, importWikiTitle, platformLabel, searchTitles, searchWikipedia, upsertTitle } from '../../../data/gaming';
import GameCover from './GameCover';

// Ricerca di un gioco, la stessa per chi cerca (scheda Giochi) e per chi
// crea (form "Cerco compagni", compositori): dopo 2 caratteri, con
// debounce di 250 ms e la richiesta precedente annullata (AbortController),
// tendina con copertina + nome da Wikipedia (vedi data/gaming.js: solo
// pagine con "Infobox video game", cache per query) preceduta dai titoli
// già nel catalogo condiviso (search_gaming_titles), senza doppioni per
// nome + anno. Al click il nome completo va nel campo, il titolo viene
// salvato nel catalogo (dedup del server) e onPick(title) riceve sempre un
// titolo del catalogo ({ id, nome, ... }). Solo se non esce nulla,
// "Aggiungi «nome»" lo crea a mano con la piattaforma della categoria.
// onQueryChange(q) dice al genitore se il campo è vuoto (per mostrare
// altro sotto). Sotto la tendina: "Dati: Wikipedia".
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
  const [external, setExternal] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Dopo un click il campo mostra il nome scelto e la tendina resta chiusa
  // finché non si scrive di nuovo.
  const [pickedName, setPickedName] = useState('');
  const seqRef = useRef(0);

  useEffect(() => {
    onQueryChange?.(q);
    const clean = q.trim();
    if (clean.length < WIKI_MIN_CHARS || clean === pickedName) {
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
      // Wikipedia si aggiunge sotto quando è pronta.
      const localPromise = searchTitles(clean, platform, 12);
      const externalPromise = searchWikipedia(clean, controller.signal);
      const l = await localPromise;
      if (seq !== seqRef.current) return;
      setLocal(l);
      const r = await externalPromise;
      if (seq !== seqRef.current) return;
      // Un risultato Wikipedia già nel catalogo non si mostra due volte.
      const knownNames = new Set(l.map((t) => `${t.nome.toLowerCase()}|${t.anno ?? ''}`));
      setExternal(r.filter((x) => !knownNames.has(`${x.nome.toLowerCase()}|${x.anno ?? ''}`)));
      setLoading(false);
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, platform, pickedName]);

  const requireAuth = () => {
    if (user) return false;
    onOpenAuth?.();
    return true;
  };

  // Il nome completo va nel campo e la tendina si chiude.
  const choose = (title) => {
    setPickedName(title.nome);
    setQ(title.nome);
    setLocal([]);
    setExternal([]);
    onPick(title);
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
    choose(saved);
  };

  const clean = q.trim();
  const open = clean.length >= WIKI_MIN_CHARS && clean !== pickedName;
  const nothing = open && !loading && local.length === 0 && external.length === 0;

  return (
    <div className="rb-game-search">
      <div className="rb-game-search-row">
        <input
          type="search"
          value={q}
          placeholder={placeholder}
          autoFocus={autoFocus}
          onChange={(e) => {
            setPickedName('');
            setQ(e.target.value);
          }}
          aria-label="Cerca un gioco"
        />
      </div>
      {error && <p className="rb-gaming-error" role="alert">{error}</p>}
      {open && (
        <ul className="rb-game-results">
          {loading && local.length === 0 && external.length === 0 && <li className="rb-gaming-note">Cerco…</li>}
          {local.map((t) => (
            <li key={t.id}>
              <GameRow title={t} onClick={() => choose(t)} />
            </li>
          ))}
          {external.map((r) => (
            <li key={`wiki-${r.wikiId}`}>
              <GameRow title={r} onClick={() => pickSaved(() => importWikiTitle(r, platform))} />
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
          <li className="rb-gaming-note rb-gaming-note--soft rb-game-source">{WIKI_SOURCE_LABEL}</li>
        </ul>
      )}
    </div>
  );
}
