import { useEffect, useRef, useState } from 'react';
import { EVENT_TYPES, formatEventDates } from '../../../data/cosplay';
import Skeleton from '../../Skeleton';
import EmptyState from '../../EmptyState';
import '../../tattoo/tattoo.css';

// Mappa degli eventi (scheda Eventi, toggle Lista/Mappa): stessa
// mappa Leaflet caricata pigramente della categoria Tattoo (TattooMap),
// qui con un marker per evento (lat/lng già noti, niente ricerca per
// area) e un popup con titolo, date e città. center: [lat, lng] della
// città del filtro Dove, altrimenti l'Italia.
const ITALY = { center: [42.3, 12.6], zoom: 5 };

function popupHtml(ev) {
  const t = EVENT_TYPES[ev.tipo] ?? EVENT_TYPES.altro;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  return `<strong>${esc(ev.titolo)}</strong><br>${t.icon} ${esc(t.label)} · ${esc(formatEventDates(ev.dataEvento, ev.dataFine))}<br>📍 ${esc(ev.citta)}`;
}

export default function CosplayEventsMap({ events, center = null, onSelect }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const leafletRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [leafletMod] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
        if (cancelled) return;
        const L = leafletMod.default ?? leafletMod;
        window.L = L;
        await Promise.all([import('leaflet.markercluster'), import('leaflet.markercluster/dist/MarkerCluster.css'), import('leaflet.markercluster/dist/MarkerCluster.Default.css')]);
        if (cancelled) return;
        leafletRef.current = L;
        const map = L.map(elRef.current, { center: center ?? ITALY.center, zoom: center ? 7 : ITALY.zoom, zoomControl: false, attributionControl: true });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        const cluster = L.markerClusterGroup({ maxClusterRadius: 40 });
        map.addLayer(cluster);
        mapRef.current = map;
        layerRef.current = cluster;
        setReady(true);
      } catch (err) {
        console.error('Impossibile caricare la mappa', err);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const cluster = layerRef.current;
    if (!ready || !L || !cluster) return;
    cluster.clearLayers();
    const pts = events.filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng));
    for (const ev of pts) {
      const t = EVENT_TYPES[ev.tipo] ?? EVENT_TYPES.altro;
      const marker = L.marker([ev.lat, ev.lng], {
        icon: L.divIcon({ html: `<div class="rb-cevmap-pin ${ev.inCorso ? 'is-live' : ''}">${t.icon}</div>`, className: 'rb-tattoomap-pin-wrap', iconSize: [34, 34] }),
      });
      marker.bindPopup(popupHtml(ev));
      marker.on('click', () => onSelect?.(ev));
      cluster.addLayer(marker);
    }
    if (pts.length > 0 && !center) mapRef.current?.fitBounds(cluster.getBounds().pad(0.2), { maxZoom: 8 });
  }, [events, ready, center, onSelect]);

  return (
    <div className="rb-tattoomap-viewport rb-cevmap">
      {loadError ? (
        <EmptyState icon="🗺️" title="Mappa non disponibile" subtitle="Controlla la connessione e riprova." />
      ) : !ready ? (
        <div className="rb-tattoomap-loading"><Skeleton height="100%" width="100%" /></div>
      ) : null}
      <div className="rb-tattoomap-canvas" ref={elRef} />
      {ready && events.length === 0 && <div className="rb-tattoomap-empty-hint">Nessun evento con questi filtri.</div>}
    </div>
  );
}
