import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EVENT_TYPES,
  LFG_POSTI_MAX,
  LFG_POSTI_MIN,
  LFG_TYPES,
  closeCosplayLfg,
  createCosplayLfg,
  fetchCosplayLfgList,
  fetchEventiVicini,
  formatEventDates,
  joinCosplayLfg,
  kickCosplayLfg,
  leaveCosplayLfg,
  subscribeCosplayLfg,
} from '../../../data/cosplay';
import { defaultLfgWhen, formatLfgWhen } from '../../../data/gaming';
import { locationHasCoords } from '../../../data/citta';
import { distanceKm, isUnlimitedDistance } from '../../../data/geo';
import { displayName } from '../../../data/posts';
import { supabase } from '../../../data/supabaseClient';
import CityAutocomplete from '../../shared/CityAutocomplete';
import EmptyState from '../../EmptyState';
import Skeleton from '../../Skeleton';

// Scheda "Cerco gruppo": stesso schema di "Cerco compagni" di Gaming PC
// (annunci aperti per data, Realtime + ricaricamento di riserva, nuovo
// annuncio, azioni dell'autore e degli altri) con le RPC cosplay: tipo
// (gruppo · fotografo · cosplayer · viaggio), serie, personaggi, evento
// prossimo facoltativo (se scelto, città e coordinate le mette il server
// dall'evento), quando, posti, città (autocompletamento GeoNames), note.
// Filtri "Solo per un evento" e "Vicino a me" (distanza dal filtro Dove).
// La separazione adulti/minori la fa il server.
const LIST_REFRESH_MS = 30000;
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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

function Person({ profile, size = 22, trailing = null }) {
  return (
    <span className="rb-lfg-person">
      <Avatar profile={profile} size={size} />
      <span>{displayName(profile, 'Utente')}</span>
      {trailing}
    </span>
  );
}

function EventChip({ evento }) {
  if (!evento) return null;
  const t = EVENT_TYPES[evento.tipo] ?? EVENT_TYPES.altro;
  return (
    <span className="rb-clfg-event" title={evento.citta}>
      {t.icon} {evento.titolo} · {formatEventDates(evento.dataEvento, evento.dataFine)}
    </span>
  );
}

function LfgForm({ user, locationFilters, prefillEvent, onDone, onCancel }) {
  const [tipo, setTipo] = useState('gruppo');
  const [serie, setSerie] = useState('');
  const [personaggi, setPersonaggi] = useState('');
  const [events, setEvents] = useState(null);
  const [eventoId, setEventoId] = useState(prefillEvent?.id ?? '');
  const [quando, setQuando] = useState(() => (prefillEvent ? toLocalInput(prefillEvent.dataEvento) : defaultLfgWhen()));
  const [posti, setPosti] = useState(3);
  const [cityText, setCityText] = useState('');
  const [city, setCity] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Eventi prossimi da collegare: vicini se c'è la città, altrimenti tutti.
  useEffect(() => {
    let cancelled = false;
    const near = locationHasCoords(locationFilters) && !isUnlimitedDistance(locationFilters.distance);
    fetchEventiVicini({
      lat: near ? locationFilters.lat : null,
      lng: near ? locationFilters.lng : null,
      km: near ? locationFilters.distance : null,
      periodo: 'prossimi',
      limit: 50,
    }).then((res) => {
      if (cancelled) return;
      const list = res.events ?? [];
      if (prefillEvent && !list.some((e) => e.id === prefillEvent.id)) list.unshift(prefillEvent);
      setEvents(list);
    });
    return () => {
      cancelled = true;
    };
  }, [locationFilters, prefillEvent]);

  const chosenEvent = eventoId ? (events ?? []).find((e) => e.id === eventoId) ?? prefillEvent : null;
  const canSubmit = serie.trim().length >= 1 && posti >= LFG_POSTI_MIN && posti <= LFG_POSTI_MAX && Boolean(quando) && (Boolean(chosenEvent) || !cityText || Boolean(city));

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError('');
    const { id, error: err } = await createCosplayLfg({
      tipo,
      serie,
      personaggi,
      quando: new Date(quando).toISOString(),
      posti: Number(posti),
      eventoId: chosenEvent?.id ?? null,
      citta: chosenEvent ? null : city?.nomeMostrato ?? null,
      lat: chosenEvent ? null : city?.lat ?? null,
      lng: chosenEvent ? null : city?.lng ?? null,
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
      <div className="rb-clfg-types" role="radiogroup" aria-label="Cosa cerchi">
        {Object.entries(LFG_TYPES).map(([k, t]) => (
          <label key={k} className={`rb-clfg-type ${tipo === k ? 'is-active' : ''}`} title={t.hint}>
            <input type="radio" name="tipo" value={k} checked={tipo === k} onChange={() => setTipo(k)} />
            <span>{t.icon} {t.label}</span>
          </label>
        ))}
      </div>
      <div className="rb-lfg-form-grid">
        <label>
          Serie / opera
          <input type="text" value={serie} maxLength={120} onChange={(e) => setSerie(e.target.value)} placeholder="es. One Piece, Genshin Impact…" required />
        </label>
        <label>
          Personaggi
          <input type="text" value={personaggi} maxLength={300} onChange={(e) => setPersonaggi(e.target.value)} placeholder="es. Luffy, Zoro, Nami (liberi: Sanji)" />
        </label>
        <label>
          Evento (facoltativo)
          <select
            value={eventoId}
            onChange={(e) => {
              setEventoId(e.target.value);
              const ev = (events ?? []).find((x) => x.id === e.target.value);
              if (ev) setQuando(toLocalInput(ev.dataEvento));
            }}
          >
            <option value="">Nessun evento</option>
            {(events ?? []).map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.titolo} · {formatEventDates(ev.dataEvento, ev.dataFine)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quando
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} required />
        </label>
        <label>
          Quante persone cerchi
          <input type="number" min={LFG_POSTI_MIN} max={LFG_POSTI_MAX} value={posti} onChange={(e) => setPosti(Number(e.target.value))} />
        </label>
        {chosenEvent ? (
          <label>
            Città
            <input type="text" value={chosenEvent.citta || 'Dall\'evento'} disabled />
          </label>
        ) : (
          <label>
            Città
            <CityAutocomplete
              value={cityText}
              placeholder="Cerca la città…"
              onChange={(text) => {
                setCityText(text);
                setCity(null);
              }}
              onPick={(c) => {
                setCity(c);
                setCityText(c.nomeMostrato);
              }}
            />
            {cityText && !city && <small className="rb-field-note rb-field-note--warn">Scegli la città dall'elenco.</small>}
          </label>
        )}
      </div>
      <label>
        Note
        <textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Livello, orari, chi porta cosa…" />
      </label>
      {error && <p className="rb-gaming-error" role="alert">{error}</p>}
      <div className="rb-lfg-actions">
        <button type="submit" className="rb-vroom-btn rb-vroom-btn--primary" disabled={!canSubmit || busy}>
          {busy ? 'Pubblico…' : 'Pubblica annuncio'}
        </button>
        <button type="button" className="rb-vroom-btn" onClick={onCancel}>Annulla</button>
      </div>
      {!user && <p className="rb-gaming-note">Devi essere loggato per pubblicare.</p>}
    </form>
  );
}

export default function CosplayLfgTab({ user, onOpenAuth, locationFilters, prefillEvent, onPrefillConsumed, focusId }) {
  const [list, setList] = useState(null);
  const [showForm, setShowForm] = useState(Boolean(prefillEvent));
  const [onlyEvent, setOnlyEvent] = useState(false);
  const [onlyNear, setOnlyNear] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const focusRef = useRef(null);
  const refreshSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    const items = await fetchCosplayLfgList();
    if (seq !== refreshSeqRef.current) return;
    setList(items);
  }, []);

  useEffect(() => {
    refresh();
    const channel = subscribeCosplayLfg(refresh);
    const timer = setInterval(refresh, LIST_REFRESH_MS);
    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  useEffect(() => {
    if (prefillEvent) setShowForm(true);
  }, [prefillEvent]);

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

  const writeToGroup = (lfg) => window.dispatchEvent(new CustomEvent('vm:open-chat', { detail: { userId: lfg.authorId } }));

  const canNear = locationHasCoords(locationFilters) && !isUnlimitedDistance(locationFilters.distance);
  const q = search.trim().toLowerCase();
  const visible = (list ?? []).filter((l) => {
    if (onlyEvent && !l.eventoId) return false;
    if (onlyNear && canNear) {
      const lat = l.lat ?? l.evento?.lat;
      const lng = l.lng ?? l.evento?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      if (distanceKm(locationFilters.lat, locationFilters.lng, lat, lng) > locationFilters.distance) return false;
    }
    if (q && !`${l.serie} ${l.personaggi} ${l.evento?.titolo ?? ''} ${l.citta}`.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <>
      <div className="rb-vroom-toolbar">
        {user ? (
          <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => setShowForm((v) => !v)}>＋ Nuovo annuncio</button>
        ) : (
          <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => onOpenAuth?.()}>Accedi per cercare un gruppo</button>
        )}
        <button type="button" className="rb-vroom-btn" onClick={refresh}>↻ Aggiorna</button>
      </div>

      {showForm && user && (
        <LfgForm
          user={user}
          locationFilters={locationFilters}
          prefillEvent={prefillEvent}
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
      {error && <p className="rb-gaming-error" role="alert">{error}</p>}

      <div className="rb-gaming-head">
        <div className="rb-gaming-filters">
          <button type="button" className={onlyEvent ? 'is-active' : ''} onClick={() => setOnlyEvent((v) => !v)}>Solo per un evento</button>
          <button type="button" className={onlyNear && canNear ? 'is-active' : ''} disabled={!canNear} title={!canNear ? 'Imposta città e distanza in Impostazioni → Luogo' : undefined} onClick={() => setOnlyNear((v) => !v)}>
            Vicino a me
          </button>
        </div>
        <input
          type="search"
          className="rb-lfg-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca serie, personaggio, evento…"
          aria-label="Cerca annunci"
          style={{ flex: 1, minWidth: 140, padding: '8px 11px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#f5f5f7' }}
        />
      </div>

      {list === null ? (
        <Skeleton lines={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="👥"
          title={list.length === 0 ? 'Nessun annuncio aperto' : 'Nessun annuncio con questi filtri'}
          subtitle={list.length === 0 ? 'Pubblica il primo: serie, personaggi, quando e quanti cerchi.' : 'Prova a togliere un filtro.'}
        />
      ) : (
        <ul className="rb-lfg-list">
          {visible.map((l) => {
            const mine = Boolean(user) && l.authorId === user.id;
            const member = Boolean(user) && l.members.some((m) => m.userId === user.id);
            const full = l.members.length >= l.posti;
            const busy = busyId === l.id;
            const t = LFG_TYPES[l.tipo] ?? LFG_TYPES.gruppo;
            return (
              <li key={l.id} ref={l.id === focusId ? focusRef : null} className={`rb-lfg-item ${mine ? 'is-mine' : ''} ${l.id === focusId ? 'is-focus' : ''}`} data-lfg-id={l.id}>
                <div className="rb-lfg-head">
                  <span className="rb-clfg-icon" aria-hidden="true">{t.icon}</span>
                  <div className="rb-lfg-title">
                    <strong>{l.serie}</strong>
                    <span>{t.label}{l.personaggi ? ` · ${l.personaggi}` : ''}</span>
                  </div>
                  <div className="rb-lfg-when">
                    {formatLfgWhen(l.quando)}
                    <small className={full ? 'is-full' : ''}>{l.members.length}/{l.posti} {full ? '· al completo' : ''}</small>
                  </div>
                </div>
                <div className="rb-lfg-meta">
                  {l.evento ? <EventChip evento={l.evento} /> : l.citta ? <span>📍 {l.citta}</span> : null}
                  {l.stato === 'chiuso' && <span>🔒 Chiuso</span>}
                </div>
                {l.note && <p className="rb-lfg-note">{l.note}</p>}
                <div className="rb-lfg-people">
                  <span>Di</span>
                  <Person profile={l.author} />
                  {l.members.length > 0 && <span>· con</span>}
                  {l.members.map((m) => (
                    <Person
                      key={m.userId}
                      profile={m.profile}
                      trailing={
                        mine ? (
                          <button type="button" className="rb-vroom-btn" onClick={() => act(l.id, () => kickCosplayLfg(l.id, m.userId))} disabled={busy} aria-label={`Espelli ${displayName(m.profile, 'Utente')}`} title="Espelli">✕</button>
                        ) : null
                      }
                    />
                  ))}
                </div>
                <div className="rb-lfg-actions">
                  {mine ? (
                    <button type="button" className="rb-vroom-btn rb-vroom-btn--danger" onClick={() => act(l.id, () => closeCosplayLfg(l.id))} disabled={busy}>Chiudi annuncio</button>
                  ) : member ? (
                    <>
                      <button type="button" className="rb-vroom-btn" onClick={() => writeToGroup(l)}>💬 Scrivi al gruppo</button>
                      <button type="button" className="rb-vroom-btn" onClick={() => act(l.id, () => leaveCosplayLfg(l.id))} disabled={busy}>Esci</button>
                    </>
                  ) : (
                    <button type="button" className="rb-vroom-btn rb-vroom-btn--primary" onClick={() => act(l.id, () => joinCosplayLfg(l.id))} disabled={busy || (Boolean(user) && full)}>
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
