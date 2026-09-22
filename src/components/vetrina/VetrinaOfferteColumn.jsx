import { useEffect, useMemo, useState } from 'react';
import { listDeals } from '../../data/vetrinaDeals';
import DealCard from './DealCard';
import SubmitDealModal from './SubmitDealModal';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';
import CustomSelect from '../shared/CustomSelect';
import './vetrinaOfferte.css';

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

// Un'offerta scaduta non deve restare nel feed anche se il backend non ha
// ancora avuto modo di aggiornarne lo stato: doppio controllo lato client,
// oltre al filtro stato='attiva' già fatto lato query in listDeals.
function isExpired(deal) {
  return deal.scadeIl && new Date(deal.scadeIl).getTime() <= Date.now();
}

// Categoria "Offerte" del mondo Vetrina: una sola colonna (feed), non le
// due dell'esploratore standard (CategoryColumn) — un'offerta non ha
// bisogno di una colonna di ricerca a fianco, il filtro in alto basta.
// Stesso componente per tutte e 12 le sotto-categorie (vedi
// VETRINA_OFFERTE_CATEGORY_IDS in data/vetrinaCategories.js), parametrizzato
// da `category`.
export default function VetrinaOfferteColumn({ category, user, onOpenAuth, locationFilters }) {
  const [deals, setDeals] = useState(null);
  const [error, setError] = useState('');
  const [negozio, setNegozio] = useState('');
  const [scontoMin, setScontoMin] = useState('');
  const [onlineFiltro, setOnlineFiltro] = useState('');
  const [vicinoAMe, setVicinoAMe] = useState(false);
  const [ordinamento, setOrdinamento] = useState('caldo');
  const [submitOpen, setSubmitOpen] = useState(false);

  const citta = vicinoAMe ? locationFilters?.city || '' : '';
  const online = onlineFiltro === 'online' ? true : onlineFiltro === 'negozio' ? false : undefined;

  useEffect(() => {
    let cancelled = false;
    setDeals(null);
    setError('');
    listDeals({ categoria: category.id, negozio: negozio || undefined, scontoMin: scontoMin ? Number(scontoMin) : undefined, online, citta: citta || undefined, ordinamento })
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
  }, [category.id, negozio, scontoMin, online, citta, ordinamento]);

  const visibleDeals = useMemo(() => (deals ?? []).filter((d) => !isExpired(d)), [deals]);

  return (
    <div className="rb-deal-column" style={{ '--accent': '#ec4899' }}>
      <div className="rb-deal-header">
        <div>
          <h3>
            {category.icon} {category.label}
          </h3>
          <p>Offerte segnalate dalla community e raccolte automaticamente — vota le più calde, segui quelle che scadono presto.</p>
        </div>
        <button type="button" className="rb-btn-primary rb-deal-submit-btn" onClick={() => (user ? setSubmitOpen(true) : onOpenAuth?.())}>
          + Segnala un'offerta
        </button>
      </div>

      <div className="rb-deal-filters">
        <input
          type="text"
          className="rb-deal-filter-input"
          placeholder="Negozio"
          value={negozio}
          onChange={(e) => setNegozio(e.target.value)}
        />
        <CustomSelect value={scontoMin} options={SCONTO_OPTIONS} onChange={setScontoMin} ariaLabel="Sconto minimo" />
        <CustomSelect value={onlineFiltro} options={ONLINE_OPTIONS} onChange={setOnlineFiltro} ariaLabel="Online o in negozio" />
        <label className="rb-deal-filter-chip">
          <input type="checkbox" checked={vicinoAMe} onChange={(e) => setVicinoAMe(e.target.checked)} disabled={onlineFiltro === 'online'} />
          Vicino a me
        </label>
        <CustomSelect value={ordinamento} options={ORDER_OPTIONS} onChange={setOrdinamento} ariaLabel="Ordina per" />
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
          {visibleDeals.map((deal) => (
            <DealCard key={deal.id} deal={deal} user={user} onOpenAuth={onOpenAuth} />
          ))}
        </ul>
      )}

      {submitOpen && (
        <SubmitDealModal
          categoria={category.id}
          onClose={() => setSubmitOpen(false)}
          onPublished={() => {
            setSubmitOpen(false);
            listDeals({ categoria: category.id, ordinamento }).then(setDeals);
          }}
        />
      )}
    </div>
  );
}
