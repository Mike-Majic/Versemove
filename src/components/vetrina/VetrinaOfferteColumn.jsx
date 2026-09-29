import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listDeals } from '../../data/vetrinaDeals';
import { getDealCountry, recordDealInterest } from '../../data/dealsRegion';
import { translateCategoryLabel } from '../../i18n/categoryLabels';
import DealCard from './DealCard';
import SponsorCard from '../ads/SponsorCard';
import SubmitDealModal from './SubmitDealModal';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import TwoColumnSwitcher from '../layout/TwoColumnSwitcher';
import { useBackLayer } from '../../hooks/useBackLayer';
import CustomSelect from '../shared/CustomSelect';
import './vetrinaOfferte.css';
import { AFFILIATE_ACTIVE, AFFILIATE_DISCLOSURE } from '../../data/affiliate';

const ORDER_OPTIONS = [
  { value: 'caldo', label: 'Più calde' },
  { value: 'recenti', label: 'Più recenti' },
  { value: 'scadenza', label: 'Scadono presto' },
  { value: 'sconto', label: 'Sconto maggiore' },
];

const SCONTO_OPTIONS = [
  { value: '', label: 'Qualsiasi sconto' },
  { value: '20', label: 'Almeno 20%' },
  { value: '30', label: 'Almeno 30%' },
  { value: '50', label: 'Almeno 50%' },
];

const ONLINE_OPTIONS = [
  { value: '', label: 'Online e in negozio' },
  { value: 'online', label: 'Solo online' },
  { value: 'negozio', label: 'Solo in negozio' },
];

// Categoria "Offerte" del mondo Vetrina: un solo pannello largo (feed a
// griglia, tante card quante ne entrano), non le due colonne
// dell'esploratore standard — filtri e ordinamento stanno in un menu a
// tendina sotto il pulsante "Filtri e ordinamento".
// Stesso componente per tutte e 12 le sotto-categorie (vedi
// VETRINA_OFFERTE_CATEGORY_IDS in data/vetrinaCategories.js), parametrizzato
// da `category`.
export default function VetrinaOfferteColumn({ category, user, onOpenAuth, locationFilters, closing = false }) {
  const { t } = useTranslation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef(null);
  const [deals, setDeals] = useState(null);
  const [error, setError] = useState('');
  const [cerca, setCerca] = useState('');
  const [cercaDebounced, setCercaDebounced] = useState('');
  const [scontoMin, setScontoMin] = useState('');
  const [onlineFiltro, setOnlineFiltro] = useState('');
  const [vicinoAMe, setVicinoAMe] = useState(false);
  const [ordinamento, setOrdinamento] = useState('caldo');
  const [submitOpen, setSubmitOpen] = useState(false);

  const citta = vicinoAMe ? locationFilters?.city || '' : '';
  const online = onlineFiltro === 'online' ? true : onlineFiltro === 'negozio' ? false : undefined;
  // Offerte del paese di chi guarda (città del filtro "Dove", altrimenti
  // fuso orario/lingua del dispositivo): a New York niente offerte italiane.
  const paese = getDealCountry(locationFilters);
  // Codici sconto: quelli scaduti da meno di una settimana restano visibili
  // con la barra rossa "Scaduto" (vedi DealCard), gli altri spariscono.
  const mostraScadute = category.id === 'offerte-codici-sconto' ? 7 : 0;

  // Categoria aperta = interesse (per le offerte mostrate come pubblicità
  // nel resto dell'app, vedi getHouseDeal).
  useEffect(() => {
    recordDealInterest({ categoria: category.id });
  }, [category.id]);

  // Ricerca: si parte mezzo secondo dopo l'ultima lettera, e la parola
  // cercata diventa un interesse.
  useEffect(() => {
    const t = setTimeout(() => {
      setCercaDebounced(cerca.trim());
      if (cerca.trim()) recordDealInterest({ termine: cerca, peso: 0 });
    }, 500);
    return () => clearTimeout(t);
  }, [cerca]);

  useEffect(() => {
    let cancelled = false;
    setDeals(null);
    setError('');
    listDeals({ categoria: category.id, cerca: cercaDebounced || undefined, scontoMin: scontoMin ? Number(scontoMin) : undefined, online, citta: citta || undefined, paese, mostraScadute, ordinamento })
      .then((list) => {
        if (!cancelled) setDeals(list);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Impossibile caricare le offerte ora.');
          setDeals([]);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category.id, cercaDebounced, scontoMin, online, citta, paese, mostraScadute, ordinamento]);

  // Menu dei filtri: si chiude cliccando fuori, con Esc o con Indietro del
  // telefono (vedi hooks/useBackLayer.js).
  useBackLayer(filtersOpen && !closing, () => setFiltersOpen(false), 'vetrina:filtri');
  useEffect(() => {
    if (!filtersOpen) return undefined;
    const onDown = (e) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target)) setFiltersOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen]);

  // Quanti filtri sono diversi dal default (numerino sul pulsante).
  const activeFilters = [cerca.trim(), scontoMin, onlineFiltro, vicinoAMe, ordinamento !== 'caldo'].filter(Boolean).length;
  const resetFilters = () => {
    setCerca('');
    setScontoMin('');
    setOnlineFiltro('');
    setVicinoAMe(false);
    setOrdinamento('caldo');
  };

  // listDeals filtra già lato query su stato='attiva' e scadenza (vedi
  // vetrinaDeals.js, condizione esatta indicata da Cowork); "scaduta" dalla
  // vista vetrina_deal_stats resta solo come ultima rete di sicurezza, per
  // un'offerta arrivata giusto mentre scadeva.
  const visibleDeals = useMemo(() => (deals ?? []).filter((d) => mostraScadute || !d.scaduta), [deals, mostraScadute]);

  const dealsPanel = (
    <div className="rb-deal-column">
      <div className="rb-deal-header">
        <div>
          <h3>
            {category.icon} {translateCategoryLabel(t, 'vetrina', category)}
          </h3>
          <p>Offerte segnalate dalla community e raccolte automaticamente — vota le più calde, segui quelle che scadono presto.</p>
        </div>
        <button type="button" className="rb-btn-primary rb-deal-submit-btn" onClick={() => (user ? setSubmitOpen(true) : onOpenAuth?.())}>
          + Segnala un'offerta
        </button>
      </div>

      <div className="rb-deal-filters-anchor" ref={filtersRef}>
        <button
          type="button"
          className={`rb-deal-filters-toggle${filtersOpen ? ' open' : ''}`}
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-haspopup="true"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
            <circle cx="16" cy="6" r="2" />
            <circle cx="10" cy="12" r="2" />
            <circle cx="18" cy="18" r="2" />
          </svg>
          Filtri e ordinamento
          {activeFilters > 0 && <span className="rb-deal-filters-count">{activeFilters}</span>}
          <svg className="rb-deal-filters-chevron" viewBox="0 0 10 6" width="10" height="6" aria-hidden="true">
            <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {filtersOpen && (
          <div className="rb-deal-filters-menu" role="dialog" aria-label="Filtri e ordinamento">
            <input
              type="search"
              className="rb-deal-filter-input"
              placeholder="Cerca prodotto o negozio"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              autoFocus
            />
            <CustomSelect value={ordinamento} options={ORDER_OPTIONS} onChange={setOrdinamento} ariaLabel="Ordina per" />
            <CustomSelect value={scontoMin} options={SCONTO_OPTIONS} onChange={setScontoMin} ariaLabel="Sconto minimo" />
            <CustomSelect value={onlineFiltro} options={ONLINE_OPTIONS} onChange={setOnlineFiltro} ariaLabel="Online o in negozio" />
            <label className="rb-deal-filter-chip">
              <input type="checkbox" checked={vicinoAMe} onChange={(e) => setVicinoAMe(e.target.checked)} disabled={onlineFiltro === 'online'} />
              Vicino a me
            </label>
            <div className="rb-deal-filters-actions">
              <button type="button" className="rb-deal-filters-reset" onClick={resetFilters} disabled={activeFilters === 0}>
                Azzera
              </button>
              <button type="button" className="rb-btn-primary" onClick={() => setFiltersOpen(false)}>
                Mostra offerte
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="rb-deal-status rb-deal-error">{error}</p>}

      {deals === null ? (
        <ul className="rb-deal-list">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="rb-deal-card rb-deal-card-skeleton">
              <Skeleton height="160px" />
              <Skeleton lines={3} />
            </li>
          ))}
        </ul>
      ) : visibleDeals.length === 0 ? (
        <EmptyState
          icon={category.icon}
          title="Nessuna offerta qui, per ora"
          subtitle="Sii il primo a segnalarne una, oppure allarga i filtri."
          actions={user ? [{ label: "Segnala un'offerta", onClick: () => setSubmitOpen(true), primary: true }] : []}
        />
      ) : (
        <ul className="rb-deal-list">
          {visibleDeals.map((deal, i) => (
            <Fragment key={deal.id}>
              <DealCard deal={deal} user={user} onOpenAuth={onOpenAuth} />
              {/* Una riga sponsorizzata ogni 10 risultati, richiesta esplicita. */}
              {(i + 1) % 10 === 0 && (
                <SponsorCard as="li" mondo="vetrina" categoria={category.id} formato="riga_lista" />
              )}
            </Fragment>
          ))}
        </ul>
      )}
      {AFFILIATE_ACTIVE && <p className="rb-deal-affiliate-note">{AFFILIATE_DISCLOSURE}</p>}
    </div>
  );

  return (
    <div style={{ '--accent': '#ec4899', display: 'contents' }}>
      <TwoColumnSwitcher primary={dealsPanel} closing={closing} />
      {submitOpen && (
        <SubmitDealModal
          categoria={category.id}
          onClose={() => setSubmitOpen(false)}
          onPublished={() => {
            setSubmitOpen(false);
            listDeals({ categoria: category.id, paese, mostraScadute, ordinamento }).then(setDeals);
          }}
        />
      )}
    </div>
  );
}
