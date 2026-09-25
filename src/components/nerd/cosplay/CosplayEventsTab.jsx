import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EVENTS_PAGE_SIZE, EVENT_TYPES, EVENT_TYPE_CHIPS, fetchCosplayEvent, fetchEventiVicini, setEventAttendance } from '../../../data/cosplay';
import { CITY_DATA_CREDIT, locationHasCoords } from '../../../data/citta';
import { isUnlimitedDistance } from '../../../data/geo';
import EmptyState from '../../EmptyState';
import Skeleton from '../../Skeleton';
import CosplayEventCard from './CosplayEventCard';
import CosplayEventsMap from './CosplayEventsMap';
import ProposeEventForm from './ProposeEventForm';

// Scheda Eventi: RPC eventi_vicini con la città del filtro "Dove"
// (Impostazioni → Luogo) e la sua distanza, oppure tutto il mondo. In alto
// "📍 Roma · entro 200 km" (tocco → apre il filtro Dove) e l'interruttore
// Vicino a me / Tutto il mondo; chip per tipo; Prossimi | Passati; in
// Prossimi le sezioni "In corso ora" (LIVE) e "In arrivo"; scorrimento
// infinito a pagine di 30; Lista / Mappa; "+ Proponi evento".
// focusEvent: { eventId, seq } da un link condiviso: l'evento compare in
// cima ("Evento condiviso") qualunque siano i filtri.
export default function CosplayEventsTab({ user, onOpenAuth, locationFilters, onLfgFor, focusEvent = null }) {
  const hasCoords = locationHasCoords(locationFilters);
  const unlimited = isUnlimitedDistance(locationFilters?.distance ?? 150);
  const canNearby = hasCoords && !unlimited;
  const [nearby, setNearby] = useState(canNearby);
  const [tipo, setTipo] = useState(null);
  const [periodo, setPeriodo] = useState('prossimi');
  const [view, setView] = useState('lista');
  const [events, setEvents] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');
  const seqRef = useRef(0);
  // Evento aperto da un link: undefined = nessuno, null = non trovato.
  const [shared, setShared] = useState(undefined);

  useEffect(() => {
    if (!focusEvent?.eventId) return undefined;
    let cancelled = false;
    fetchCosplayEvent(focusEvent.eventId).then((ev) => {
      if (!cancelled) setShared(ev);
    });
    return () => {
      cancelled = true;
    };
  }, [focusEvent?.eventId, focusEvent?.seq]);
  const sentinelRef = useRef(null);

  // Se il filtro Dove cambia (Impostazioni), l'interruttore segue.
  useEffect(() => {
    setNearby(canNearby);
  }, [canNearby]);

  const params = useMemo(
    () => ({
      lat: nearby && canNearby ? locationFilters.lat : null,
      lng: nearby && canNearby ? locationFilters.lng : null,
      km: nearby && canNearby ? locationFilters.distance : null,
      periodo,
      tipo,
    }),
    [nearby, canNearby, locationFilters?.lat, locationFilters?.lng, locationFilters?.distance, periodo, tipo]
  );

  const load = useCallback(
    async (offset = 0) => {
      const seq = ++seqRef.current;
      if (offset === 0) setEvents(null);
      else setLoadingMore(true);
      const res = await fetchEventiVicini({ ...params, limit: EVENTS_PAGE_SIZE, offset });
      if (seq !== seqRef.current) return;
      setLoadingMore(false);
      if (res.error) {
        setError(res.error);
        if (offset === 0) setEvents([]);
        return;
      }
      setError('');
      setHasMore(res.events.length === EVENTS_PAGE_SIZE);
      setEvents((prev) => (offset === 0 ? res.events : [...(prev ?? []), ...res.events]));
    },
    [params]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  // Scorrimento infinito: quando la sentinella entra in vista, pagina dopo.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || view !== 'lista') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loadingMore) load(events?.length ?? 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, events?.length, load, view]);

  const requireAuth = () => {
    if (user) return false;
    onOpenAuth?.();
    return true;
  };

  const attend = async (ev, stato) => {
    if (requireAuth() || busyId) return;
    setBusyId(ev.id);
    setError('');
    const { error: err } = await setEventAttendance(ev.id, stato);
    setBusyId(null);
    if (err) {
      setError(err);
      return;
    }
    // Aggiornamento locale: stato mio e conteggi.
    const update = (e) => {
      if (e.id !== ev.id) return e;
      const dec = (k) => Math.max(0, e[k] - 1);
      let { nPartecipa, nInteressati } = e;
      if (e.mioStato === 'partecipa') nPartecipa = dec('nPartecipa');
      if (e.mioStato === 'interessato') nInteressati = dec('nInteressati');
      if (stato === 'partecipa') nPartecipa += 1;
      if (stato === 'interessato') nInteressati += 1;
      return { ...e, mioStato: stato, nPartecipa, nInteressati };
    };
    setEvents((prev) => (prev ?? []).map(update));
    setShared((prev) => (prev ? update(prev) : prev));
  };

  const openDove = () => window.dispatchEvent(new CustomEvent('vm:open-settings', { detail: { section: 'luogo' } }));

  const list = events ?? [];
  const inCorso = periodo === 'prossimi' ? list.filter((e) => e.inCorso) : [];
  const inArrivo = periodo === 'prossimi' ? list.filter((e) => !e.inCorso) : list;
  const center = canNearby ? [locationFilters.lat, locationFilters.lng] : null;

  const renderCards = (arr) =>
    arr.map((e) => <CosplayEventCard key={e.id} event={e} user={user} busy={busyId === e.id} onAttend={attend} onLfgFor={onLfgFor} />);

  return (
    <>
      <div className="rb-cev-where-bar">
        <button type="button" className="rb-cev-where-btn" onClick={openDove} title="Cambia città e distanza">
          {canNearby && nearby ? (
            <>📍 {locationFilters.city} · entro {locationFilters.distance} km</>
          ) : hasCoords ? (
            <>🌍 Tutto il mondo · <u>{locationFilters.city}</u></>
          ) : (
            <>🌍 Tutto il mondo · <u>Imposta la tua città</u></>
          )}
        </button>
        <div className="rb-cev-toggle" role="group" aria-label="Zona">
          <button type="button" className={nearby && canNearby ? 'is-active' : ''} disabled={!canNearby} onClick={() => setNearby(true)} title={!canNearby ? 'Imposta città e distanza in Impostazioni' : undefined}>
            Vicino a me
          </button>
          <button type="button" className={!nearby || !canNearby ? 'is-active' : ''} onClick={() => setNearby(false)}>Tutto il mondo</button>
        </div>
      </div>
      {!hasCoords && (
        <p className="rb-gaming-note">
          Per vedere gli eventi vicini scegli la tua città in <button type="button" className="rb-cev-inline-link" onClick={openDove}>Impostazioni → Luogo</button>.
          {locationFilters?.city ? ' La città salvata non ha le coordinate: reimpostala dall\'elenco.' : ''}
        </p>
      )}
      {hasCoords && unlimited && <p className="rb-gaming-note">La distanza è su "tutto il mondo": abbassala in Impostazioni → Luogo per vedere solo gli eventi vicini.</p>}

      <div className="rb-gaming-head">
        <div className="rb-gaming-filters rb-cev-chips" role="group" aria-label="Tipo di evento">
          <button type="button" className={tipo === null ? 'is-active' : ''} onClick={() => setTipo(null)}>Tutti</button>
          {EVENT_TYPE_CHIPS.map((k) => (
            <button key={k} type="button" className={tipo === k ? 'is-active' : ''} onClick={() => setTipo(k)}>{EVENT_TYPES[k].plural}</button>
          ))}
        </div>
      </div>
      <div className="rb-cev-bar">
        <div className="rb-cev-toggle" role="group" aria-label="Periodo">
          <button type="button" className={periodo === 'prossimi' ? 'is-active' : ''} onClick={() => setPeriodo('prossimi')}>Prossimi</button>
          <button type="button" className={periodo === 'passati' ? 'is-active' : ''} onClick={() => setPeriodo('passati')}>Passati</button>
        </div>
        <div className="rb-cev-toggle" role="group" aria-label="Vista">
          <button type="button" className={view === 'lista' ? 'is-active' : ''} onClick={() => setView('lista')}>Lista</button>
          <button type="button" className={view === 'mappa' ? 'is-active' : ''} onClick={() => setView('mappa')}>Mappa</button>
        </div>
        <button type="button" className="rb-vroom-btn rb-vroom-btn--primary rb-cev-propose" onClick={() => (requireAuth() ? null : setShowForm((v) => !v))}>
          ＋ Proponi evento
        </button>
      </div>

      {showForm && user && (
        <ProposeEventForm
          onDone={(res, pubblico) => {
            setShowForm(false);
            setNotice(pubblico || res.stato === 'in_attesa' ? 'Inviato ai moderatori, sarà visibile dopo l\'approvazione.' : 'Evento pubblicato: lo vedono gli utenti della tua fascia d\'età.');
            load(0);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {notice && (
        <p className="rb-vroom-notice" role="status">
          {notice}
          <button type="button" onClick={() => setNotice('')} aria-label="Chiudi avviso">✕</button>
        </p>
      )}
      {error && <p className="rb-gaming-error" role="alert">{error}</p>}

      {shared !== undefined && (
        <section className="rb-cev-section rb-cev-shared">
          <div className="rb-gaming-section-title">
            🔗 Evento condiviso
            <button type="button" className="rb-cev-shared-close" onClick={() => setShared(undefined)} aria-label="Nascondi evento condiviso">✕</button>
          </div>
          {shared ? (
            <ul className="rb-cev-list">{renderCards([shared])}</ul>
          ) : (
            <p className="rb-gaming-note">Questo evento non esiste più o non è visibile per il tuo account.</p>
          )}
        </section>
      )}

      {events === null ? (
        <Skeleton lines={4} />
      ) : view === 'mappa' ? (
        <CosplayEventsMap events={list} center={center} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="🎪"
          title={periodo === 'passati' ? 'Nessun evento passato' : nearby && canNearby ? `Nessun evento entro ${locationFilters.distance} km` : 'Nessun evento in programma'}
          subtitle={nearby && canNearby ? 'Prova "Tutto il mondo" o allarga la distanza in Impostazioni.' : 'Proponi tu il primo.'}
        />
      ) : (
        <>
          {inCorso.length > 0 && (
            <section className="rb-cev-section">
              <div className="rb-gaming-section-title">🔴 In corso ora</div>
              <ul className="rb-cev-list">{renderCards(inCorso)}</ul>
            </section>
          )}
          <section className="rb-cev-section">
            {periodo === 'prossimi' && <div className="rb-gaming-section-title">📅 In arrivo</div>}
            {inArrivo.length === 0 ? <p className="rb-gaming-note">Niente altro in arrivo.</p> : <ul className="rb-cev-list">{renderCards(inArrivo)}</ul>}
          </section>
          {hasMore && <div ref={sentinelRef} className="rb-cev-sentinel">{loadingMore ? 'Carico altri eventi…' : ''}</div>}
        </>
      )}
      <p className="rb-gaming-footer-note">{CITY_DATA_CREDIT}</p>
    </>
  );
}
