import { useEffect, useRef, useState } from 'react';
import { photosNear, getStudioStats } from '../../data/tattoo';
import TattooPostCard from './TattooPostCard';
import EmptyState from '../EmptyState';
import Skeleton from '../Skeleton';

const PAGE_SIZE = 30;

// Scheda Raccolta (destra, categoria Tattoo): tutte le foto entro 500m dal
// punto cliccato sulla mappa (le posizioni condivise non sono sempre
// precise, vedi specifica), caricate a blocchi di 30 con uno scroll
// infinito (sentinella + IntersectionObserver, non tutto insieme: possono
// essere migliaia). Un tap su una foto apre la card a schermo intero.
export default function TattooRaccolta({ point, user, onOpenAuth, stile, parteCorpo, colore }) {
  const [photos, setPhotos] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [studioStats, setStudioStats] = useState(null);
  const [openPost, setOpenPost] = useState(null);
  const sentinelRef = useRef(null);

  const loadMore = async () => {
    if (loading || !hasMore || !point) return;
    setLoading(true);
    const batch = await photosNear({ lat: point.lat, lng: point.lng, offset, limit: PAGE_SIZE, stile, parteCorpo, colore });
    setPhotos((prev) => [...prev, ...batch]);
    setOffset((o) => o + batch.length);
    setHasMore(batch.length === PAGE_SIZE);
    setLoading(false);
  };

  useEffect(() => {
    setPhotos([]);
    setOffset(0);
    setHasMore(true);
    setStudioStats(null);
    if (!point) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.lat, point?.lng, stile, parteCorpo, colore]);

  useEffect(() => {
    if (point && photos.length === 0 && offset === 0 && hasMore) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.lat, point?.lng, stile, parteCorpo, colore]);

  useEffect(() => {
    if (photos[0]?.studioId) getStudioStats(photos[0].studioId).then(setStudioStats);
  }, [photos]);

  useEffect(() => {
    if (!sentinelRef.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentinelRef.current, offset, hasMore, loading, point?.lat, point?.lng]);

  if (!point) {
    return (
      <EmptyState icon="📍" title="Scegli un punto sulla mappa" subtitle="Tocca un pallino nella scheda Mappa per vedere le foto di quello studio." />
    );
  }

  const portamiQuiUrl = `https://www.openstreetmap.org/?mlat=${point.lat}&mlon=${point.lng}#map=17/${point.lat}/${point.lng}`;

  return (
    <div className="rb-tattoo-raccolta">
      <div className="rb-tattoo-raccolta-header">
        <div>
          <strong>{photos[0]?.studioNome ?? 'Zona selezionata'}</strong>
          {studioStats?.mediaStelle != null && (
            <span className="rb-tattoo-raccolta-stats">
              ★ {studioStats.mediaStelle.toFixed(1)} ({studioStats.nRecensioni} recension{studioStats.nRecensioni === 1 ? 'e' : 'i'})
            </span>
          )}
        </div>
        <a className="rb-btn-primary" href={portamiQuiUrl} target="_blank" rel="noopener noreferrer">
          Portami qui
        </a>
      </div>

      {photos.length === 0 && !loading ? (
        <EmptyState icon="🖋️" title="Nessuna foto entro 500m" subtitle="Le posizioni condivise non sono sempre precise: prova un punto vicino." />
      ) : (
        <div className="rb-tattoo-raccolta-grid">
          {photos.map((post) => (
            <button key={post.id} type="button" className="rb-tattoo-raccolta-thumb" onClick={() => setOpenPost(post)}>
              <img src={post.foto[0]} alt="" />
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="rb-tattoo-raccolta-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height="120px" />
          ))}
        </div>
      )}
      <div ref={sentinelRef} />

      {openPost && (
        <div className="rb-tattoo-fullscreen-overlay" onClick={() => setOpenPost(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <TattooPostCard post={openPost} user={user} onOpenAuth={onOpenAuth} fullscreen onClose={() => setOpenPost(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
