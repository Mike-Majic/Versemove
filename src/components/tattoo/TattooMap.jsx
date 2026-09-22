import { useEffect, useRef, useState } from 'react';
import { pointsInBbox } from '../../data/tattoo';
import Skeleton from '../Skeleton';
import EmptyState from '../EmptyState';

const ITALY_CENTER = [42.3, 12.6];
const ITALY_ZOOM = 6;
const MOVE_DEBOUNCE_MS = 350;

function pointIconHtml(point) {
  const thumb = point.miniaturaUrl
    ? `<img src="${point.miniaturaUrl}" alt="" />`
    : '<span class="rb-tattoomap-pin-empty">🖋️</span>';
  return `<div class="rb-tattoomap-pin">${thumb}<span class="rb-tattoomap-pin-count">${point.nFoto}</span></div>`;
}

// Scheda Mappa (destra, categoria Tattoo): stesso schema di caricamento
// lazy di leaflet/leaflet.markercluster usato da DogWorldMap.jsx — qui i
// punti sono raggruppati per zona (RPC tattoo_points_in_bbox, non un
// marker per foto: potrebbero essere migliaia), il marker mostra la
// miniatura della foto più votata e il conteggio. Un click chiama
// onSelectPoint(lat,lng): il pannello che ospita questa mappa (vedi
// TattooRightPanel) passa alla scheda Raccolta per quel punto.
export default function TattooMap({ onSelectPoint, stile, parteCorpo, colore }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const clusterRef = useRef(null);
  const leafletRef = useRef(null);
  const moveTimerRef = useRef(null);
  const reloadRef = useRef(() => {});

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [pointCount, setPointCount] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function reload() {
      const map = mapRef.current;
      const L = leafletRef.current;
      const cluster = clusterRef.current;
      if (!map || !L || !cluster) return;
      setLoadingPoints(true);
      const b = map.getBounds();
      const points = await pointsInBbox({
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
        stile,
        parteCorpo,
        colore,
      });
      if (cancelled) return;
      cluster.clearLayers();
      for (const point of points) {
        const marker = L.marker([point.lat, point.lng], {
          icon: L.divIcon({ html: pointIconHtml(point), className: 'rb-tattoomap-pin-wrap', iconSize: [42, 42] }),
        });
        marker.on('click', () => onSelectPoint?.({ lat: point.lat, lng: point.lng }));
        cluster.addLayer(marker);
      }
      setPointCount(points.length);
      setLoadingPoints(false);
    }
    reloadRef.current = reload;
    if (!mapRef.current) return undefined;
    reload();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stile, parteCorpo, colore, ready]);

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

        const map = L.map(mapElRef.current, { center: ITALY_CENTER, zoom: ITALY_ZOOM, zoomControl: false, attributionControl: true });
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
        console.error('Impossibile caricare la mappa', err);
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
    <div className="rb-tattoomap-viewport">
      {loadError ? (
        <EmptyState icon="🖋️" title="Mappa non disponibile" subtitle="Controlla la connessione e riprova." />
      ) : !ready ? (
        <div className="rb-tattoomap-loading">
          <Skeleton height="100%" width="100%" />
        </div>
      ) : null}
      <div className="rb-tattoomap-canvas" ref={mapElRef} />
      {ready && loadingPoints && <span className="rb-tattoomap-loading-badge">Cerco tatuaggi…</span>}
      {ready && !loadingPoints && pointCount === 0 && (
        <div className="rb-tattoomap-empty-hint">Nessun tatuaggio in questa zona: muovi la mappa o pubblicane uno tu.</div>
      )}
    </div>
  );
}
