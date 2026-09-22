import { useEffect, useRef, useState } from 'react';
import { placesInBbox } from '../../data/dogWorld';
import { DOG_PLACE_TYPES, placeTypeMeta } from './dogPlaceMeta';
import DogPlaceSheet from './DogPlaceSheet';
import AddDogPlaceModal from './AddDogPlaceModal';
import Skeleton from '../Skeleton';
import EmptyState from '../EmptyState';
import './DogWorldMap.css';

// Vista di partenza: Italia intera (zero costi, niente geolocalizzazione
// automatica — vedi useMyLocation sotto, si chiede solo su richiesta
// esplicita, stesso principio di ownPosition in App.jsx: mai la posizione
// reale senza un gesto attivo della persona).
const ITALY_CENTER = [42.3, 12.6];
const ITALY_ZOOM = 6;

// Quanto aspettare dopo l'ultimo movimento/zoom della mappa prima di
// richiedere i luoghi del nuovo riquadro: evita una chiamata di rete ad
// ogni singolo frame del trascinamento.
const MOVE_DEBOUNCE_MS = 350;

function typeIconHtml(tipo) {
  const meta = placeTypeMeta(tipo);
  return `<span class="rb-dogmap-pin" style="background:${meta.color}">${meta.emoji}</span>`;
}

// Mappa reale (Leaflet + tile OpenStreetMap, zero costi) dei luoghi
// pet-friendly: area cani, autogrill, hotel, spiagge, sentieri, rifugi.
// Leaflet/leaflet.markercluster sono caricati in lazy qui dentro (import()
// dinamico, mai in cima al file) — pesano solo quando questa categoria si
// apre davvero, non sul caricamento iniziale dell'app.
export default function DogWorldMap({ user, onOpenAuth }) {
  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const clusterRef = useRef(null);
  const leafletRef = useRef(null);
  const moveTimerRef = useRef(null);
  // Funzione di ricarica dei luoghi nel riquadro attuale: assegnata una
  // sola volta al montaggio (vedi effetto sotto), richiamata sia dal
  // movimento della mappa sia dal cambio filtri, sempre la STESSA
  // implementazione — evita di tenere due copie quasi identiche allineate
  // a mano.
  const reloadPlacesRef = useRef(() => {});

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [placeCount, setPlaceCount] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [addAtLatLng, setAddAtLatLng] = useState(null);
  const [activeTipi, setActiveTipi] = useState([]);
  const [soloRecintate, setSoloRecintate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function reloadPlaces() {
      const map = mapRef.current;
      const L = leafletRef.current;
      const cluster = clusterRef.current;
      if (!map || !L || !cluster) return;
      setLoadingPlaces(true);
      const b = map.getBounds();
      const places = await placesInBbox({
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
        tipi: activeTipi,
        soloRecintate,
      });
      if (cancelled) return;
      cluster.clearLayers();
      for (const place of places) {
        const marker = L.marker([place.lat, place.lng], {
          icon: L.divIcon({ html: typeIconHtml(place.tipo), className: 'rb-dogmap-pin-wrap', iconSize: [34, 34] }),
        });
        marker.on('click', () => setSelectedPlace(place));
        cluster.addLayer(marker);
      }
      setPlaceCount(places.length);
      setLoadingPlaces(false);
    }
    // activeTipi/soloRecintate sono letti dalla chiusura di questo effetto:
    // ricreata ad ogni loro cambio (deps sotto), così reloadPlaces vede
    // sempre i filtri attuali sia chiamata dal movimento mappa sia dal
    // cambio filtri stesso.
    reloadPlacesRef.current = reloadPlaces;

    if (!mapRef.current) return undefined;
    reloadPlaces();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTipi, soloRecintate, ready]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // leaflet.markercluster si aggancia a un L GLOBALE (window.L), non
        // all'import ESM di leaflet — un pattern UMD più vecchio del resto:
        // va importato DOPO aver messo L su window, mai in parallelo con
        // leaflet stesso, altrimenti il suo codice a livello di modulo
        // parte prima che window.L esista ("L is not defined").
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

        const map = L.map(mapElRef.current, {
          center: ITALY_CENTER,
          zoom: ITALY_ZOOM,
          zoomControl: false,
          attributionControl: true,
        });
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        const cluster = L.markerClusterGroup({ maxClusterRadius: 50 });
        map.addLayer(cluster);
        mapRef.current = map;
        clusterRef.current = cluster;

        map.on('click', (e) => setAddAtLatLng({ lat: e.latlng.lat, lng: e.latlng.lng }));
        map.on('moveend', () => {
          clearTimeout(moveTimerRef.current);
          moveTimerRef.current = setTimeout(() => reloadPlacesRef.current(), MOVE_DEBOUNCE_MS);
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

  const toggleTipo = (tipo) => {
    setActiveTipi((prev) => (prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo]));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 13),
      () => {},
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const openAddHere = () => {
    if (!user) {
      onOpenAuth?.();
      return;
    }
    const center = mapRef.current?.getCenter();
    setAddAtLatLng(center ? { lat: center.lat, lng: center.lng } : null);
  };

  return (
    <div className="rb-dogmap">
      <div className="rb-dogmap-filters">
        {Object.entries(DOG_PLACE_TYPES).map(([tipo, meta]) => (
          <button
            key={tipo}
            type="button"
            className={`rb-dogmap-filter-chip ${activeTipi.includes(tipo) ? 'active' : ''}`}
            style={activeTipi.includes(tipo) ? { background: meta.color, borderColor: meta.color } : undefined}
            onClick={() => toggleTipo(tipo)}
          >
            {meta.emoji} {meta.label}
          </button>
        ))}
        <button
          type="button"
          className={`rb-dogmap-filter-chip ${soloRecintate ? 'active' : ''}`}
          onClick={() => setSoloRecintate((v) => !v)}
        >
          🔒 Solo recintate
        </button>
      </div>

      <div className="rb-dogmap-viewport">
        {loadError ? (
          <EmptyState icon="🐾" title="Mappa non disponibile" subtitle="Controlla la connessione e riprova." />
        ) : !ready ? (
          <div className="rb-dogmap-loading">
            <Skeleton height="100%" width="100%" />
          </div>
        ) : null}
        <div className="rb-dogmap-canvas" ref={mapElRef} />

        {ready && (
          <>
            <button type="button" className="rb-dogmap-locate-btn" onClick={useMyLocation} title="Usa la mia posizione">
              📍
            </button>
            <button type="button" className="rb-dogmap-add-btn" onClick={openAddHere}>
              + Aggiungi luogo
            </button>
            {loadingPlaces && <span className="rb-dogmap-loading-badge">Cerco luoghi…</span>}
            {!loadingPlaces && placeCount === 0 && (
              <div className="rb-dogmap-empty-hint">Nessun luogo in questa zona: muovi la mappa o aggiungine uno tu.</div>
            )}
          </>
        )}
      </div>

      {selectedPlace && (
        <DogPlaceSheet
          place={selectedPlace}
          user={user}
          onOpenAuth={onOpenAuth}
          onClose={() => setSelectedPlace(null)}
        />
      )}

      {addAtLatLng && (
        <AddDogPlaceModal
          lat={addAtLatLng.lat}
          lng={addAtLatLng.lng}
          onClose={() => setAddAtLatLng(null)}
          onCreated={() => {
            setAddAtLatLng(null);
            clearTimeout(moveTimerRef.current);
            moveTimerRef.current = setTimeout(() => reloadPlacesRef.current(), 200);
          }}
        />
      )}
    </div>
  );
}
