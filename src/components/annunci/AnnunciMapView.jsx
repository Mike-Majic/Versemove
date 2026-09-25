import { useEffect, useRef, useState } from 'react';
import { annunciInBbox, getListing } from '../../data/annunci';
import Skeleton from '../Skeleton';
import EmptyState from '../EmptyState';

const ITALY_CENTER = [42.3, 12.6];
const ITALY_ZOOM = 6;
const MOVE_DEBOUNCE_MS = 350;

// Vista Mappa: stesso motore di DogWorldMap.jsx (Leaflet + clustering,
// caricati in lazy solo quando questa scheda si apre davvero) — qui i
// marker sono annunci invece di luoghi pet-friendly, via la RPC
// annunci_nearby (data/annunci.js).
export default function AnnunciMapView({ categoria, tipo, onOpen }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const clusterRef = useRef(null);
  const leafletRef = useRef(null);
  const moveTimerRef = useRef(null);
  const reloadRef = useRef(() => {});
  const listingsRef = useRef(new Map());

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [count, setCount] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function reload() {
      const map = mapRef.current;
      const L = leafletRef.current;
      const cluster = clusterRef.current;
      if (!map || !L || !cluster) return;
      const b = map.getBounds();
      const listings = await annunciInBbox({
        categoria,
        tipo,
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast(),
      });
      if (cancelled) return;
      cluster.clearLayers();
      listingsRef.current = new Map(listings.map((l) => [l.id, l]));
      for (const listing of listings) {
        if (listing.lat == null || listing.lng == null) continue;
        const marker = L.marker([listing.lat, listing.lng], {
          icon: L.divIcon({
            html: `<span class="rb-annuncio-pin">${listing.foto[0] ? `<img src="${listing.foto[0]}" alt="" />` : '📷'}</span>`,
            className: 'rb-annuncio-pin-wrap',
            iconSize: [38, 38],
          }),
        });
        // La RPC restituisce solo i campi essenziali: la scheda completa
        // (descrizione, dettagli, venditore) si scarica al tocco del marker.
        marker.on('click', () => {
          const partial = listingsRef.current.get(listing.id);
          getListing(listing.id).then((full) => onOpen(full ?? partial));
        });
        cluster.addLayer(marker);
      }
      setCount(listings.length);
    }
    reloadRef.current = reload;
    if (mapRef.current) reload();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoria, tipo, ready]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [leafletMod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
        if (cancelled) return;
        const L = leafletMod.default ?? leafletMod;
        window.L = L;
        await Promise.all([
          import('leaflet.markercluster'),
          import('leaflet.markercluster/dist/MarkerCluster.css'),
          import('leaflet.markercluster/dist/MarkerCluster.Default.css'),
        ]);
        if (cancelled) return;
        leafletRef.current = L;

        const map = L.map(mapElRef.current, { center: ITALY_CENTER, zoom: ITALY_ZOOM, zoomControl: false });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        const cluster = L.markerClusterGroup({ maxClusterRadius: 50 });
        map.addLayer(cluster);
        mapRef.current = map;
        clusterRef.current = cluster;

        map.on('moveend', () => {
          clearTimeout(moveTimerRef.current);
          moveTimerRef.current = setTimeout(() => reloadRef.current(), MOVE_DEBOUNCE_MS);
        });

        setReady(true);
      } catch (err) {
        console.error('Impossibile caricare la mappa annunci', err);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(moveTimerRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="rb-annunci-map-viewport">
      {loadError ? (
        <EmptyState icon="🗺️" title="Mappa non disponibile" subtitle="Controlla la connessione e riprova." />
      ) : !ready ? (
        <Skeleton height="100%" width="100%" />
      ) : null}
      <div className="rb-annunci-map-canvas" ref={mapElRef} />
      {ready && count === 0 && <div className="rb-annunci-map-empty-hint">Nessun annuncio in questa zona: muovi la mappa.</div>}
    </div>
  );
}
