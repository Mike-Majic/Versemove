import { Fragment, useEffect, useState } from 'react';
import { listListings, listMyListings, renewListing, setListingStatus, deleteListing } from '../../data/annunci';
import { isAdult } from '../../data/age';
import AnnuncioCard from './AnnuncioCard';
import SponsorCard from '../ads/SponsorCard';
import AnnunciFilters from './AnnunciFilters';
import AnnunciMapView from './AnnunciMapView';
import AnnuncioDetailModal from './AnnuncioDetailModal';
import PublishAnnuncioWizard from './PublishAnnuncioWizard';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import TwoColumnSwitcher from '../layout/TwoColumnSwitcher';
import { useIsDesktopLayout } from '../../hooks/useIsDesktopLayout';
import './annunci.css';
// Riusa lo stile di rb-faq-hint/rb-faq-stato-badge (stato pubblicazione,
// stesso linguaggio visivo di Segnalazioni/Suggerimenti) invece di
// duplicarlo qui.
import '../faq/faq.css';

const DEFAULT_FILTERS = { prezzoMin: null, prezzoMax: null, citta: '', soloConFoto: false, ordinamento: 'recenti', fieldFilters: {} };

// Colonna principale di una categoria di Annunci: schede Vendita/Affitto,
// vista Lista/Griglia/Mappa, filtri professionali (generati dallo stesso
// schema del form di pubblicazione), + una scheda "I miei annunci" per
// gestire i propri (rinnova/riservato/venduto/elimina).
// focusListing: { listing, seq } da un link condiviso (#/annunci/<id>):
// apre subito la scheda di quell'annuncio.
export default function AnnunciColumn({ category, user, onOpenAuth, onOpenChat, closing = false, focusListing = null }) {
  const [tipo, setTipo] = useState('vendita');
  const [view, setView] = useState('list'); // list | grid | map
  const [tab, setTab] = useState('annunci'); // annunci | mie
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  // Vista mobile del TwoColumnSwitcher: 'primary' = annunci, 'secondary' = filtri.
  const [mobileView, setMobileView] = useState('primary');
  const isDesktop = useIsDesktopLayout();
  const [listings, setListings] = useState(null);
  const [myListings, setMyListings] = useState(null);
  const [selected, setSelected] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);

  useEffect(() => {
    if (!focusListing?.listing) return;
    if (focusListing.listing.tipo) setTipo(focusListing.listing.tipo);
    setSelected(focusListing.listing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusListing?.seq]);

  const refresh = () => {
    setListings(null);
    listListings({ categoria: category.id, tipo, ...filters }).then(setListings);
  };

  useEffect(refresh, [category.id, tipo, filters]);

  useEffect(() => {
    if (tab === 'mie' && user) listMyListings().then(setMyListings);
  }, [tab, user]);

  const openPublish = () => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    if (!isAdult(user.dataNascita)) return;
    setPublishOpen(true);
  };

  const onFavoriteChanged = (id, fav) => {
    setListings((prev) => (prev ?? []).map((l) => (l.id === id ? { ...l, isFavorite: fav } : l)));
    setSelected((prev) => (prev && prev.id === id ? { ...prev, isFavorite: fav } : prev));
  };

  const resultsPanel = (
    <div className="rb-annunci-column">
      <div className="rb-annunci-header">
        <div>
          <h3>
            {category.icon} {category.label}
          </h3>
        </div>
        <button type="button" className="rb-btn-primary" onClick={openPublish}>
          + Pubblica annuncio
        </button>
      </div>

      {user && !isAdult(user.dataNascita) && (
        <p className="rb-faq-hint">Solo i maggiorenni possono pubblicare annunci. Puoi comunque guardarli tutti.</p>
      )}

      <div className="rb-annunci-tabs">
        <button type="button" className={tab === 'annunci' ? 'active' : ''} onClick={() => setTab('annunci')}>
          Annunci
        </button>
        <button
          type="button"
          className={tab === 'mie' ? 'active' : ''}
          onClick={() => (user ? setTab('mie') : onOpenAuth?.())}
        >
          I miei annunci
        </button>
      </div>

      {tab === 'annunci' ? (
        <>
          <div className="rb-annunci-online-toggle">
            <label>
              <input type="radio" checked={tipo === 'vendita'} onChange={() => setTipo('vendita')} /> Vendita
            </label>
            <label>
              <input type="radio" checked={tipo === 'affitto'} onChange={() => setTipo('affitto')} /> Affitto
            </label>
          </div>

          <div className="rb-annunci-toolbar">
            <div className="rb-annunci-view-switch">
              {['list', 'grid', 'map'].map((v) => (
                <button key={v} type="button" className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                  {v === 'list' ? '☰ Lista' : v === 'grid' ? '▦ Griglia' : '🗺️ Mappa'}
                </button>
              ))}
            </div>
            {!isDesktop && (
              <button
                type="button"
                className="rb-reset-filters-btn rb-annunci-filters-toggle"
                onClick={() => setMobileView('secondary')}
              >
                Filtri
              </button>
            )}
          </div>

          <div className="rb-annunci-body">
            {view === 'map' ? (
              <AnnunciMapView categoria={category.id} tipo={tipo} onOpen={setSelected} />
            ) : listings === null ? (
              <div className={`rb-annunci-list ${view}`}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rb-annuncio-card-skeleton">
                    <Skeleton height="140px" />
                    <Skeleton lines={2} />
                  </div>
                ))}
              </div>
            ) : listings.length === 0 ? (
              <EmptyState icon={category.icon} title="Nessun annuncio qui, per ora" subtitle="Allarga i filtri o pubblica il primo tu." />
            ) : (
              <div className={`rb-annunci-list ${view}`}>
                {listings.map((l, i) => (
                  <Fragment key={l.id}>
                    <AnnuncioCard
                      listing={l}
                      user={user}
                      onOpenAuth={onOpenAuth}
                      onOpen={setSelected}
                      onFavoriteChanged={onFavoriteChanged}
                      view={view}
                    />
                    {/* Solo in vista Lista (non Griglia/Mappa): una riga
                        sponsorizzata ogni 10 risultati, richiesta esplicita. */}
                    {view === 'list' && (i + 1) % 10 === 0 && (
                      <SponsorCard mondo="annunci" categoria={category.id} formato="riga_lista" />
                    )}
                  </Fragment>
                ))}
              </div>
            )}
          </div>
        </>
      ) : myListings === null ? (
        <Skeleton lines={4} />
      ) : myListings.length === 0 ? (
        <EmptyState icon={category.icon} title="Non hai ancora pubblicato annunci qui" />
      ) : (
        <ul className="rb-annunci-mie-list">
          {myListings
            .filter((l) => l.categoria === category.id)
            .map((l) => (
              <li key={l.id} className="rb-annunci-mie-item">
                <img src={l.foto[0] || ''} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                <div className="rb-annunci-mie-info">
                  <strong>{l.titolo}</strong>
                  <span className={`rb-faq-stato-badge rb-annunci-stato-${l.stato}`}>{l.stato}</span>
                </div>
                <div className="rb-annunci-mie-actions">
                  {l.stato === 'attivo' && (
                    <>
                      <button type="button" onClick={() => setListingStatus(l.id, 'riservato').then(() => listMyListings().then(setMyListings))}>
                        Riservato
                      </button>
                      <button type="button" onClick={() => setListingStatus(l.id, 'venduto').then(() => listMyListings().then(setMyListings))}>
                        Venduto/Affittato
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => renewListing(l.id).then(() => listMyListings().then(setMyListings))}>
                    Rinnova
                  </button>
                  <button type="button" onClick={() => deleteListing(l.id).then(() => listMyListings().then(setMyListings))}>
                    Elimina
                  </button>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );

  // Pannello destro (su mobile la seconda schermata): Vendita/Affitto e
  // filtri professionali sempre visibili, come nei portali di annunci.
  const filtersPanel = (
    <div className="rb-annunci-column">
      <h3 className="rb-annunci-panel-title">Filtri</h3>
      <AnnunciFilters categoria={category.id} tipo={tipo} filters={filters} setFilters={setFilters} />
      {!isDesktop && (
        <button type="button" className="rb-btn-primary rb-annunci-show-results" onClick={() => setMobileView('primary')}>
          Mostra annunci
        </button>
      )}
    </div>
  );

  return (
    <>
      <TwoColumnSwitcher
        primary={resultsPanel}
        secondary={filtersPanel}
        primaryLabel="Annunci"
        secondaryLabel="Filtri"
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
        closing={closing}
      />

      {selected && (
        <AnnuncioDetailModal
          listing={selected}
          user={user}
          onOpenAuth={onOpenAuth}
          onOpenChat={onOpenChat}
          onClose={() => setSelected(null)}
          onFavoriteChanged={onFavoriteChanged}
        />
      )}

      {publishOpen && (
        <PublishAnnuncioWizard
          initialCategoria={category.id}
          user={user}
          onClose={() => setPublishOpen(false)}
          onPublished={() => {
            setPublishOpen(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
