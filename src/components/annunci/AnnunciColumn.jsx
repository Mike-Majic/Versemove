import { Fragment, useEffect, useState } from 'react';
import { listListings, listMyListings, renewListing, setListingStatus, deleteListing } from '../../data/annunci';
import { isAdult } from '../../data/age';
import { ANNUNCI_CATEGORIES_META } from '../../data/annunciSchema';
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
// vista Lista/Griglia/Mappa. La seconda colonna ha due schede, come "I
// miei post" del mondo Social: "Filtri" (generati dallo stesso schema del
// form di pubblicazione) e "I miei annunci", dove chi pubblica ritrova
// TUTTI i propri annunci di qualsiasi categoria (un'Auto pubblicata dalla
// colonna Moto compare qui e in Auto, non in Moto) e li gestisce
// (rinnova/riservato/venduto/elimina, "Vai" alla categoria).
export default function AnnunciColumn({ category, user, onOpenAuth, onOpenChat, onGoToCategory, closing = false }) {
  const [tipo, setTipo] = useState('vendita');
  const [view, setView] = useState('list'); // list | grid | map
  const [sideTab, setSideTab] = useState('filtri'); // filtri | mie
  // Avviso dopo una pubblicazione finita in un'altra categoria.
  const [publishedElsewhere, setPublishedElsewhere] = useState(null); // { categoria }
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  // Vista mobile del TwoColumnSwitcher: 'primary' = annunci, 'secondary' = filtri.
  const [mobileView, setMobileView] = useState('primary');
  const isDesktop = useIsDesktopLayout();
  const [listings, setListings] = useState(null);
  const [myListings, setMyListings] = useState(null);
  const [selected, setSelected] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);

  const refresh = () => {
    setListings(null);
    listListings({ categoria: category.id, tipo, ...filters }).then(setListings);
  };

  useEffect(refresh, [category.id, tipo, filters]);

  const refreshMine = () => listMyListings().then(setMyListings);

  useEffect(() => {
    if (sideTab === 'mie' && user) refreshMine();
  }, [sideTab, user]);

  const openMine = () => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    setSideTab('mie');
    if (!isDesktop) setMobileView('secondary');
  };

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

      {publishedElsewhere && ANNUNCI_CATEGORIES_META[publishedElsewhere.categoria] && (
        <div className="rb-annunci-draft-hint">
          <span>
            Pubblicato in {ANNUNCI_CATEGORIES_META[publishedElsewhere.categoria].icon}{' '}
            {ANNUNCI_CATEGORIES_META[publishedElsewhere.categoria].label}: qui in {category.label} non compare.
          </span>
          {onGoToCategory && (
            <button type="button" onClick={() => onGoToCategory(publishedElsewhere.categoria)}>
              Vai a {ANNUNCI_CATEGORIES_META[publishedElsewhere.categoria].label}
            </button>
          )}
          <button type="button" className="ghost" onClick={() => setPublishedElsewhere(null)} aria-label="Chiudi avviso">
            ✕
          </button>
        </div>
      )}

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
    </div>
  );

  // Seconda colonna, scheda "I miei annunci": tutti gli annunci
  // dell'utente, di qualsiasi categoria.
  const myListingsSection =
    !user ? (
      <EmptyState
        icon="🔒"
        title="Accedi per vedere i tuoi annunci"
        subtitle="Serve un account per pubblicare e gestire i tuoi annunci."
        actions={[{ label: 'Accedi', primary: true, onClick: onOpenAuth }]}
      />
    ) : myListings === null ? (
      <Skeleton lines={4} />
    ) : myListings.length === 0 ? (
      <EmptyState icon="📝" title="Non hai ancora pubblicato annunci" subtitle="Usa «+ Pubblica annuncio» per il primo." />
    ) : (
      <>
        <p className="rb-annunci-mie-count">{myListings.length} pubblicati, in tutte le categorie</p>
        <ul className="rb-annunci-mie-list">
          {myListings.map((l) => {
            const meta = ANNUNCI_CATEGORIES_META[l.categoria];
            const elsewhere = l.categoria !== category.id;
            return (
              <li key={l.id} className="rb-annunci-mie-item">
                {l.foto[0] ? (
                  <img src={l.foto[0]} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} />
                ) : (
                  <span className="rb-annunci-mie-nophoto" aria-hidden="true">
                    {meta?.icon ?? '📦'}
                  </span>
                )}
                <div className="rb-annunci-mie-info">
                  <strong>{l.titolo}</strong>
                  <span className="rb-annunci-mie-meta">
                    {meta ? `${meta.icon} ${meta.label}` : l.categoria} · {l.tipo === 'affitto' ? 'Affitto' : 'Vendita'}
                  </span>
                  <span className={`rb-faq-stato-badge rb-annunci-stato-${l.stato}`}>{l.stato}</span>
                </div>
                <div className="rb-annunci-mie-actions">
                  {elsewhere && onGoToCategory && (
                    <button type="button" onClick={() => onGoToCategory(l.categoria)}>
                      Vai a {meta?.label ?? l.categoria}
                    </button>
                  )}
                  {!elsewhere && (
                    <button type="button" onClick={() => setSelected(l)}>
                      Apri
                    </button>
                  )}
                  {l.stato === 'attivo' && (
                    <>
                      <button type="button" onClick={() => setListingStatus(l.id, 'riservato').then(refreshMine)}>
                        Riservato
                      </button>
                      <button type="button" onClick={() => setListingStatus(l.id, 'venduto').then(refreshMine)}>
                        Venduto/Affittato
                      </button>
                    </>
                  )}
                  <button type="button" onClick={() => renewListing(l.id).then(refreshMine)}>
                    Rinnova
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      deleteListing(l.id).then(() => {
                        refreshMine();
                        refresh();
                      })
                    }
                  >
                    Elimina
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </>
    );

  // Pannello destro (su mobile la seconda schermata): schede Filtri e I
  // miei annunci, come nei portali di annunci.
  const filtersPanel = (
    <div className="rb-annunci-column">
      <div className="rb-annunci-tabs rb-annunci-side-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={sideTab === 'filtri'}
          className={sideTab === 'filtri' ? 'active' : ''}
          onClick={() => setSideTab('filtri')}
        >
          Filtri
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={sideTab === 'mie'}
          className={sideTab === 'mie' ? 'active' : ''}
          onClick={openMine}
        >
          I miei annunci
        </button>
      </div>
      {sideTab === 'filtri' ? (
        <AnnunciFilters categoria={category.id} tipo={tipo} filters={filters} setFilters={setFilters} />
      ) : (
        myListingsSection
      )}
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
        secondaryLabel={sideTab === 'mie' ? 'I miei annunci' : 'Filtri'}
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
          onPublished={(published) => {
            setPublishOpen(false);
            refresh();
            // Appena pubblicato: si apre "I miei annunci", dove lo si vede
            // subito qualunque sia la categoria scelta nel form.
            setSideTab('mie');
            if (user) refreshMine();
            setPublishedElsewhere(published?.categoria && published.categoria !== category.id ? published : null);
          }}
        />
      )}
    </>
  );
}
