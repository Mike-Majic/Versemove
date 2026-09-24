import { useCallback, useEffect, useRef, useState } from 'react';
import {
  closeLfg,
  createLfg,
  defaultLfgWhen,
  fetchLfgList,
  formatLfgWhen,
  joinLfg,
  kickLfg,
  leaveLfg,
  openLfgRoom,
  platformGamertag,
  subscribeLfg,
} from '../../../data/gaming';
import { displayName } from '../../../data/posts';
import { supabase } from '../../../data/supabaseClient';
import { fetchVideoRoom, joinVideoRoom } from '../../../data/videoRooms';
import { SUPPORTED_LANGUAGES } from '../../../i18n';
import EmptyState from '../../EmptyState';
import Skeleton from '../../Skeleton';
import GameCover from './GameCover';
import GameSearch from './GameSearch';

// Scheda "Cerco compagni": annunci aperti della categoria, ordinati per
// quando, aggiornati via Realtime (gaming_lfg e gaming_lfg_members) con un
// ricaricamento periodico di riserva; filtri "Solo oggi", "Con posti
// liberi" e ricerca per gioco; nuovo annuncio; azioni dell'autore
// (espelli, stanza party, chiudi) e degli altri (unisciti, esci, entra
// nella stanza, scrivi al gruppo). Le regole (posti, fascia d'età, massimo
// 5 annunci, date) le applica il server: gli errori arrivano in italiano.
const LIST_REFRESH_MS = 30000;
const POSTI_MIN = 1;
const POSTI_MAX = 15;

function Avatar({ profile, size = 24 }) {
  const name = displayName(profile, 'Utente');
  return profile?.avatar ? (
    <img className="rb-vroom-avatar" src={profile.avatar} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="rb-vroom-avatar rb-vroom-avatar--letter" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Person({ profile, platform, user, size = 22, trailing = null }) {
  const tags = user && profile?.id === user.id ? user.gamertags : profile?.gamertags;
  const tag = platformGamertag(tags, platform);
  return (
    <span className="rb-lfg-person">
      <Avatar profile={profile} size={size} />
      <span>{displayName(profile, 'Utente')}</span>
      {tag && <span className="rb-game-player-tag" title={tag.label}>{tag.icon} {tag.value}</span>}
      {trailing}
    </span>
  );
}

const isToday = (iso) => {
  const d = new Date(iso);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
};

function LfgForm({ category, platform, user, onOpenAuth, prefill, onDone, onCancel }) {
  const [title, setTitle] = useState(prefill ?? null);
  const [freeName, setFreeName] = useState('');
  const [modalita, setModalita] = useState('');
  const [quando, setQuando] = useState(defaultLfgWhen);
  const [posti, setPosti] = useState(2);
  const [mic, setMic] = useState(true);
  const [lingua, setLingua] = useState(user?.lingua || 'it');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const giocoNome = title?.nome ?? freeName.trim();
  const canSubmit = Boolean(giocoNome) && posti >= POSTI_MIN && posti <= POSTI_MAX && quando;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError('');
    const { id, error: err } = await createLfg({
      categoria: category.id,
      giocoNome,
      quando: new Date(quando).toISOString(),
      posti: Number(posti),
      titleId: title?.id ?? null,
      modalita,
      mic,
      lingua,
      note,
    });
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onDone(id);
  };

  return (
    <form className="rb-lfg-form" onSubmit={submit}>
      <h4>Nuovo annuncio</h4>
      {title ? (
        <div className="rb-lfg-chosen">
          <GameCover title={title} size="sm" />
          <strong>{title.nome}</strong>
          <button type="button" className="rb-vroom-btn" onClick={() => setTitle(null)}>Cambia</button>
        </div>
      ) : (
        <>
          <GameSearch platform={platform} user={user} onOpenAuth={onOpenAuth} onPick={setTitle} placeholder="Cerca il gioco nel catalogo…" />
          <label>
            Oppure scrivi il nome del gioco
            <input type="text" value={freeName} maxLength={120} onChange={(e) => setFreeName(e.target.value)} placeholder="es. Warzone" />
          </label>
        </>
      )}
      <div className="rb-lfg-form-grid">
        <label>
          Modalità
          <input type="text" value={modalita} maxLength={60} onChange={(e) => setModalita(e.target.value)} placeholder="es. Ranked, co-op, raid…" />
        </label>
        <label>
          Quando
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} required />
        </label>
        <label>
          Quanti cerchi
          <input type="number" min={POSTI_MIN} max={POSTI_MAX} value={posti} onChange={(e) => setPosti(Number(e.target.value))} />
        </label>
        <label>
          Lingua
          <select value={lingua} onChange={(e) => setLingua(e.target.value)}>
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.flag} {l.nativeLabel}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="rb-lfg-form-check">
        <input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} />
        🎤 Serve il microfono
      </label>
      <label>
        Note
        <textarea value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Livello, orari, regole del gruppo…" />
      </label>
      {error && <p className="rb-gaming-error" role="alert">{error}</p>}
      <div className="rb-lfg-actions">
        <button type="submit" className="rb-vroom-btn rb-vroom-btn--primary" disabled={!canSubmit || busy}>
          {busy ? 'Pubblico…' : 'Pubblica annuncio'}
        </button>
        <button type="button" className="rb-vroom-btn" onClick={onCancel}>Annulla</button>
      </div>
    </form>
  );
}

export default function LfgTab({ category, platform, user, onOpenAuth, prefill, onPrefillConsumed, focusId, onEnterRoom, notice, onDismissNotice }) {
  const [list, setList] = useState(null);
  const [rooms, setRooms] = useState(new Map()); // videoRoomId -> aperta?
  const [showForm, setShowForm] = useState(Boolean(prefill));
  const [onlyToday, setOnlyToday] = useState(false);
  const [onlyFree, setOnlyFree] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const focusRef = useRef(null);

  // Più ricaricamenti possono essere in volo insieme (Realtime + azione +
  // timer): conta solo l'ultimo partito, altrimenti uno vecchio e lento
  // sovrascriverebbe la lista o le stanze con dati già superati.
  const refreshSeqRef = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    const items = await fetchLfgList(category.id);
    if (seq !== refreshSeqRef.current) return;
    setList(items);
    const ids = Array.from(new Set(items.map((l) => l.videoRoomId).filter(Boolean)));
    const entries = await Promise.all(ids.map(async (id) => [id, await fetchVideoRoom(id)]));
    if (seq !== refreshSeqRef.current) return;
    setRooms(new Map(entries.map(([id, r]) => [id, Boolean(r && !r.endedAt)])));
  }, [category.id]);

  useEffect(() => {
    refresh();
    const channel = subscribeLfg(category.id, refresh);
    const timer = setInterval(refresh, LIST_REFRESH_MS);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [category.id, refresh]);

  // Annuncio da evidenziare (da una notifica): scorre fino a lui.
  useEffect(() => {
    if (focusId && list && focusRef.current) focusRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusId, list]);

  const requireAuth = () => {
    if (user) return false;
    onOpenAuth?.();
    return true;
  };

  const act = async (id, fn) => {
    if (requireAuth() || busyId) return;
    setBusyId(id);
    setError('');
    const { error: err } = await fn();
    setBusyId(null);
    if (err) setError(err);
    refresh();
  };

  const openParty = async (lfg) => {
    if (requireAuth() || busyId) return;
    setBusyId(lfg.id);
    setError('');
    const { roomId, error: err } = await openLfgRoom(lfg.id);
    if (err) {
      setBusyId(null);
      setError(err);
      return;
    }
    const { error: joinErr } = await joinVideoRoom(roomId);
    setBusyId(null);
    if (joinErr) {
      setError(joinErr);
      refresh();
      return;
    }
    onEnterRoom(roomId);
  };

  const enterRoom = async (lfg) => {
    if (requireAuth() || busyId) return;
    setBusyId(lfg.id);
    setError('');
    const { error: err } = await joinVideoRoom(lfg.videoRoomId);
    setBusyId(null);
    if (err) {
      setError(err);
      refresh();
      return;
    }
    onEnterRoom(lfg.videoRoomId);
  };

  const writeToGroup = (lfg) => {
    window.dispatchEvent(new CustomEvent('vm:open-chat', { detail: { userId: lfg.authorId } }));
  };

  const q = search.trim().toLowerCase();
  const visible = (list ?? []).filter((l) => {
    if (onlyToday && !isToday(l.quando)) return false;
    if (onlyFree && l.members.length >= l.posti) return false;
    if (q && !l.gioco.toLowerCase().includes(q) && !(l.title?.nome ?? '').toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <>
      <div className="rb-vroom-toolbar">
        {user ? (
          <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => setShowForm((v) => !v)}>
            ＋ Nuovo annuncio
          </button>
        ) : (
          <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => onOpenAuth?.()}>
            Accedi per cercare compagni
          </button>
        )}
        <button type="button" className="rb-vroom-btn" onClick={refresh}>↻ Aggiorna</button>
      </div>

      {showForm && user && (
        <LfgForm
          category={category}
          platform={platform}
          user={user}
          onOpenAuth={onOpenAuth}
          prefill={prefill}
          onDone={() => {
            setShowForm(false);
            onPrefillConsumed?.();
            refresh();
          }}
          onCancel={() => {
            setShowForm(false);
            onPrefillConsumed?.();
          }}
        />
      )}

      {notice && (
        <p className="rb-vroom-notice" role="status">
          {notice}
          <button type="button" onClick={onDismissNotice} aria-label="Chiudi avviso">✕</button>
        </p>
      )}
      {error && <p className="rb-gaming-error" role="alert">{error}</p>}

      <div className="rb-gaming-head">
        <div className="rb-gaming-filters">
          <button type="button" className={onlyToday ? 'is-active' : ''} onClick={() => setOnlyToday((v) => !v)}>Solo oggi</button>
          <button type="button" className={onlyFree ? 'is-active' : ''} onClick={() => setOnlyFree((v) => !v)}>Con posti liberi</button>
        </div>
        <input
          type="search"
          className="rb-lfg-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per gioco…"
          aria-label="Cerca annunci per gioco"
          style={{ flex: 1, minWidth: 140, padding: '8px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#f5f5f7' }}
        />
      </div>

      {list === null ? (
        <Skeleton lines={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="🎮"
          title={list.length === 0 ? 'Nessun annuncio aperto' : 'Nessun annuncio con questi filtri'}
          subtitle={list.length === 0 ? 'Pubblica il primo: gioco, quando e quanti cerchi.' : 'Prova a togliere un filtro.'}
        />
      ) : (
        <ul className="rb-lfg-list">
          {visible.map((l) => {
            const mine = Boolean(user) && l.authorId === user.id;
            const member = Boolean(user) && l.members.some((m) => m.userId === user.id);
            const full = l.members.length >= l.posti;
            const roomOpen = l.videoRoomId ? rooms.get(l.videoRoomId) === true : false;
            const busy = busyId === l.id;
            const lang = SUPPORTED_LANGUAGES.find((x) => x.code === l.lingua);
            return (
              <li
                key={l.id}
                ref={l.id === focusId ? focusRef : null}
                className={`rb-lfg-item ${mine ? 'is-mine' : ''} ${l.id === focusId ? 'is-focus' : ''}`}
                data-lfg-id={l.id}
              >
                <div className="rb-lfg-head">
                  {l.title && <GameCover title={l.title} size="sm" />}
                  <div className="rb-lfg-title">
                    <strong>{l.title?.nome ?? l.gioco}</strong>
                    {l.modalita && <span>{l.modalita}</span>}
                  </div>
                  <div className="rb-lfg-when">
                    {formatLfgWhen(l.quando)}
                    <small className={full ? 'is-full' : ''}>
                      {l.members.length}/{l.posti} {full ? '· al completo' : ''}
                    </small>
                  </div>
                </div>
                <div className="rb-lfg-meta">
                  {l.mic && <span title="Serve il microfono">🎤 Microfono</span>}
                  {lang && <span>{lang.flag} {lang.nativeLabel}</span>}
                  {l.stato === 'chiuso' && <span>🔒 Chiuso</span>}
                </div>
                {l.note && <p className="rb-lfg-note">{l.note}</p>}
                <div className="rb-lfg-people">
                  <span>Di</span>
                  <Person profile={l.author} platform={platform} user={user} />
                  {l.members.length > 0 && <span>· con</span>}
                  {l.members.map((m) => (
                    <Person
                      key={m.userId}
                      profile={m.profile}
                      platform={platform}
                      user={user}
                      trailing={
                        mine ? (
                          <button
                            type="button"
                            className="rb-vroom-btn"
                            onClick={() => act(l.id, () => kickLfg(l.id, m.userId))}
                            disabled={busy}
                            aria-label={`Espelli ${displayName(m.profile, 'Utente')}`}
                            title="Espelli"
                          >
                            ✕
                          </button>
                        ) : null
                      }
                    />
                  ))}
                </div>
                <div className="rb-lfg-actions">
                  {mine ? (
                    <>
                      <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => openParty(l)} disabled={busy}>
                        🎥 {l.videoRoomId && roomOpen ? 'Entra nella stanza party' : 'Apri stanza party'}
                      </button>
                      <button type="button" className="rb-vroom-btn rb-vroom-btn--danger" onClick={() => act(l.id, () => closeLfg(l.id))} disabled={busy}>
                        Chiudi annuncio
                      </button>
                    </>
                  ) : member ? (
                    <>
                      {l.videoRoomId && roomOpen && (
                        <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => enterRoom(l)} disabled={busy}>
                          🎥 Entra nella stanza
                        </button>
                      )}
                      <button type="button" className="rb-vroom-btn" onClick={() => writeToGroup(l)}>💬 Scrivi al gruppo</button>
                      <button type="button" className="rb-vroom-btn" onClick={() => act(l.id, () => leaveLfg(l.id))} disabled={busy}>
                        Esci
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="rb-vroom-btn rb-vroom-btn--primary"
                      onClick={() => act(l.id, () => joinLfg(l.id))}
                      disabled={busy || (Boolean(user) && full)}
                    >
                      {!user ? 'Accedi per unirti' : full ? 'Al completo' : 'Unisciti'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
