import { useMemo, useState } from 'react';
import { MOCK_USERS } from '../data/mockUsers';
import { CONTENT_INTERACTIONS } from '../data/contentInteractions';
import { findCityMatch, getCityInfo, distanceKm, isUnlimitedDistance } from '../data/geo';
import { useIsDesktopLayout } from '../hooks/useIsDesktopLayout';
import TwoColumnSwitcher from './layout/TwoColumnSwitcher';
import FreeBooksCatalog from './FreeBooksCatalog';
import EmptyState from './EmptyState';
import './CategoryColumn.css';
import './LibreriaColumn.css';

// Variante di CategoryColumn solo per la Libreria: in più ha una scheda che
// affianca ai libri pubblicati dalla community (dati finti, come tutto il
// resto dell'app) l'accesso in tempo reale al catalogo mondiale dei libri
// liberi da diritti (vedi FreeBooksCatalog). La colonna "Persone vicine"
// resta identica a quella di CategoryColumn, quindi qui è duplicata solo
// per la parte header/tab, non riscritta da zero.
export default function LibreriaColumn({ category, initialSubfamily = '', locationFilters = {}, featured = [], allResults = [] }) {
  const [tab, setTab] = useState('community'); // 'community' | 'catalogo'
  const [resultsQuery, setResultsQuery] = useState('');
  const [subfamilyFilter, setSubfamilyFilter] = useState(initialSubfamily);
  const [mobileView, setMobileView] = useState('primary');
  const isDesktop = useIsDesktopLayout();

  const results = useMemo(() => {
    return allResults.filter((r) => {
      if (subfamilyFilter && r.subfamily !== subfamilyFilter) return false;
      if (!resultsQuery.trim()) return true;
      const q = resultsQuery.trim().toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.creator.toLowerCase().includes(q) ||
        r.subfamily.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [allResults, resultsQuery, subfamilyFilter]);

  const myCity = useMemo(() => findCityMatch(locationFilters?.city ?? ''), [locationFilters?.city]);
  const maxDistanceKm = locationFilters?.distance ?? 150;

  const nearbyPeople = useMemo(() => {
    if (!myCity) return [];
    return CONTENT_INTERACTIONS
      .filter((it) => it.categoryId === category.id)
      .map((it) => {
        const person = MOCK_USERS.find((u) => u.id === it.userId);
        const content = allResults.find((r) => r.id === it.contentId);
        return person && content ? { ...it, person, content } : null;
      })
      .filter(Boolean)
      .filter(({ person }) => person.visibleNearby)
      .filter(({ person }) => {
        if (isUnlimitedDistance(maxDistanceKm)) return true;
        const info = getCityInfo(person.city);
        if (!info) return false;
        return distanceKm(myCity.lat, myCity.lng, info.lat, info.lng) <= maxDistanceKm;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [category.id, allResults, myCity, maxDistanceKm]);

  const communityContent = (
    <>
      {featured.length > 0 && (
        <div className="rb-arte-suggestion-row">
          {featured.map((term) => (
            <button key={term} className="rb-arte-suggestion-chip" onClick={() => setResultsQuery(term)}>
              {term}
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        className="rb-arte-search-input"
        placeholder={`Cerca in ${category.label}...`}
        value={resultsQuery}
        onChange={(e) => setResultsQuery(e.target.value)}
      />

      <div className="rb-arte-subfamily-row">
        <button
          className={`rb-arte-subfamily-chip ${subfamilyFilter === '' ? 'active' : ''}`}
          onClick={() => setSubfamilyFilter('')}
        >
          Tutti
        </button>
        {category.subfamilies.map((sf) => (
          <button
            key={sf}
            className={`rb-arte-subfamily-chip ${subfamilyFilter === sf ? 'active' : ''}`}
            onClick={() => setSubfamilyFilter(subfamilyFilter === sf ? '' : sf)}
          >
            {sf}
          </button>
        ))}
      </div>

      {results.length === 0 && <EmptyState icon="📚" title="Nessun risultato" subtitle="Prova un altro titolo, autore o filtro." />}
      <ul className="rb-arte-results-list">
        {results.map((r) => (
          <li key={r.id} className="rb-arte-result-card">
            <div className="rb-arte-result-thumb" />
            <div>
              <strong>{r.title}</strong>
              <p>{r.creator}</p>
              <span>{r.subfamily} · {r.year}</span>
              <p className="rb-arte-result-desc">{r.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );

  const resultsContent = (
    <>
      <div className="rb-arte-panel-header">
        <h3>{category.label}</h3>
      </div>

      <div className="rb-libreria-tabs">
        <button
          type="button"
          className={`rb-libreria-tab ${tab === 'community' ? 'active' : ''}`}
          onClick={() => setTab('community')}
        >
          Community
        </button>
        <button
          type="button"
          className={`rb-libreria-tab ${tab === 'catalogo' ? 'active' : ''}`}
          onClick={() => setTab('catalogo')}
        >
          Catalogo libero mondiale
        </button>
      </div>

      {tab === 'community' ? communityContent : <FreeBooksCatalog />}
    </>
  );

  const nearbyContent = (
    <>
      {!isDesktop && (
        <button className="rb-arte-mobile-back" onClick={() => setMobileView('primary')}>
          ← Torna a {category.label}
        </button>
      )}
      <div className="rb-arte-panel-header">
        <h3>Persone vicine</h3>
        <p>Chi, vicino a te, segue {category.label}</p>
      </div>

      {!myCity && (
        <EmptyState icon="📍" title="Imposta la tua città" subtitle='Nel filtro "Dove" di Impostazioni, per vedere chi è nelle vicinanze.' />
      )}

      {myCity && nearbyPeople.length === 0 && (
        <EmptyState icon="👥" title="Nessuno nelle vicinanze" subtitle="Per ora, in questa categoria." />
      )}

      {myCity && nearbyPeople.length > 0 && (
        <ul className="rb-arte-nearby-list">
          {nearbyPeople.map(({ id, person, content, type }) => (
            <li key={id} className="rb-arte-nearby-card">
              <img className="rb-arte-nearby-avatar" src={person.avatar} alt={person.name} />
              <div>
                <strong>{person.name}</strong>
                <p>{type === 'parteciperò' ? `Parteciperà a ${content.title}` : `Gli piace ${content.title}`}</p>
                <span>{person.city}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <TwoColumnSwitcher
      primary={resultsContent}
      secondary={nearbyContent}
      primaryLabel={category.label}
      secondaryLabel="Persone vicine"
      mobileView={mobileView}
      onMobileViewChange={setMobileView}
    />
  );
}
