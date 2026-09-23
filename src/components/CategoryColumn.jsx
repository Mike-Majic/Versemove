import { useEffect, useMemo, useState } from 'react';
import { MOCK_USERS } from '../data/mockUsers';
import { CONTENT_INTERACTIONS } from '../data/contentInteractions';
import { findCityMatch, getCityInfo, distanceKm, isUnlimitedDistance } from '../data/geo';
import { listContentsForPlacement, toggleContentLike } from '../data/contents';
import { useIsDesktopLayout } from '../hooks/useIsDesktopLayout';
import TwoColumnSwitcher from './layout/TwoColumnSwitcher';
import EmptyState from './EmptyState';
import LabelMorphTitle from './LabelMorphTitle';
import ParticleBurst from './ParticleBurst';
import SponsorCard from './ads/SponsorCard';
import './CategoryColumn.css';

// Componente unico e parametrizzato per esplorare una categoria: riceve
// l'oggetto categoria (nome, sottofamiglie...) più i suoi contenuti/ricerche
// in evidenza come prop, senza importare i dati di un mondo specifico. Usato
// da qualunque mondo con un proprio set di categorie (Arte & Musica, Nerd, e
// futuri) — nessuna copia per categoria né per mondo. Montare con
// key={category.id} così lo stato di ricerca/filtro riparte pulito ogni volta
// che cambia la categoria attiva.
//
// Colonna principale (sinistra su desktop, prima su mobile): contenuti della
// categoria a livello globale, ricerca + suggerimenti + lista risultati.
// Colonna secondaria (destra su desktop, raggiungibile con lo switch su
// mobile): persone vicine (secondo il filtro Distanza di Impostazioni) che
// hanno messo mi piace o parteciperò a un contenuto della categoria — solo
// chi ha attivato "Visibile agli altri utenti vicino a te".
//
// Desktop (orizzontale + largo): due colonne affiancate, come prima.
// Mobile (verticale, o stretto anche in orizzontale): una sola colonna a
// piena larghezza (di default la principale), con una maniglia fissa sul
// bordo destro che scorre per mostrare la colonna secondaria.
export default function CategoryColumn({
  world,
  category,
  initialSubfamily = '',
  locationFilters = {},
  featured = [],
  allResults = [],
  user,
  onOpenAuth,
  morphTitleFromCenter = false,
  isClosing = false,
}) {
  const [resultsQuery, setResultsQuery] = useState('');
  const [subfamilyFilter, setSubfamilyFilter] = useState(initialSubfamily);
  const [mobileView, setMobileView] = useState('primary'); // 'primary' | 'secondary'
  const isDesktop = useIsDesktopLayout();

  // Foto/video veri caricati dagli utenti in questa categoria (autotag o
  // ripubblicati manualmente, vedi data/contents.js) — mai finti, distinti
  // dai risultati "editoriali" (allResults) sopra, ancora placeholder.
  const [uploadedContents, setUploadedContents] = useState([]);
  useEffect(() => {
    if (!world) return;
    listContentsForPlacement({ world, category: category.id }).then(setUploadedContents);
  }, [world, category.id]);

  const handleContentLike = async (content) => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const { liked, error } = await toggleContentLike(content.id, content.likedByMe);
    if (error) return;
    setUploadedContents((prev) =>
      prev.map((c) => (c.id === content.id ? { ...c, likedByMe: liked, likeCount: c.likeCount + (liked ? 1 : -1) } : c))
    );
  };

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

  // La "tua posizione" per il calcolo delle vicinanze è la città impostata nel
  // filtro "Dove" di Impostazioni (lo stesso usato altrove per gli altri
  // mondi). Senza una città impostata non c'è un punto di riferimento, quindi
  // la colonna mostra un suggerimento invece di una lista finta di "vicini".
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

  const resultsContent = (
    <>
      <ParticleBurst active={isClosing} />
      <div className="rb-arte-panel-header">
        <LabelMorphTitle text={category.label} morphFromCenter={morphTitleFromCenter} as="h3" />
      </div>

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

      {uploadedContents.length > 0 && (
        <>
          <div className="rb-arte-panel-header">
            <h3>Caricati dalla community</h3>
          </div>
          <ul className="rb-arte-uploaded-list">
            {uploadedContents.map((c) => (
              <li key={c.id} className="rb-arte-uploaded-card">
                {c.type === 'video' ? <video src={c.url} controls /> : <img src={c.url} alt={c.caption || 'Contenuto'} />}
                <div className="rb-arte-uploaded-info">
                  {c.caption && <p>{c.caption}</p>}
                  {c.tags?.length > 0 && <span className="rb-arte-uploaded-tags">{c.tags.map((t) => `#${t}`).join(' ')}</span>}
                  <button type="button" className="rb-arte-uploaded-like-btn" onClick={() => handleContentLike(c)}>
                    {c.likedByMe ? '❤️' : '🤍'} {c.likeCount}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <ul className="rb-arte-results-list">
        {results.length === 0 && (
          <li className="rb-arte-no-results-wrap">
            <EmptyState icon="🔍" title="Nessun risultato" subtitle="Prova un'altra ricerca o un altro filtro." />
          </li>
        )}
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

      {/* Uno spazio sponsorizzato in fondo alla colonna, non sopra ai
          contenuti: richiesta esplicita. */}
      <SponsorCard mondo={world} categoria={category.id} formato="banner_pannello" />
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
        <EmptyState icon="📍" title="Imposta la tua città" subtitle={`Nel filtro "Dove" di Impostazioni, per vedere chi è nelle vicinanze.`} />
      )}

      {myCity && nearbyPeople.length === 0 && (
        <EmptyState icon="🧭" title="Nessuno nelle vicinanze" subtitle="Per ora, in questa categoria." />
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
      closing={isClosing}
    />
  );
}
