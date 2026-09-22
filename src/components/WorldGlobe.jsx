import { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { WORLDS } from '../data/worlds';
import { loadLandDots } from '../globe/landDots';
import { loadLandGeo } from '../globe/landGeo';
import { buildLandDots, buildNetworkShell, buildShellNodeGeometry } from '../globe/networkOverlay';
import { buildCategoryShell } from '../globe/categoryShell';
import { buildSatelliteGlobes } from '../globe/satelliteGlobes';
import { CATEGORY_FLY_MS } from '../fx/timing';
import { IDLE_GLOBE_SPIN_DEG_S, IDLE_EASE_IN_S, IDLE_EASE_OUT_S } from '../fx/globeRotation';
import { getGlobeQuality, subscribeQualityMode, startAutoQualityMonitor } from '../fx/quality';
import './WorldGlobe.css';

const DEG2RAD = Math.PI / 180;
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

// Trova l'oggetto Three.js che react-globe.gl aggiunge alla scena per il
// globo vero e proprio (superficie + continenti + marker HTML + atmosfera,
// tutti nidificati dentro): quello, e SOLO quello, va ruotato per far
// girare "il globo su se stesso" restando fermi con la camera — ruotare i
// singoli layer sarebbe sbagliato (alcuni, come i nostri overlay
// custom sotto, non sono nidificati lì dentro). three-globe marca il
// layer della superficie con __globeObjType='globe' da qualche parte
// dentro l'albero: risalendo i parent da lì si arriva all'oggetto
// aggiunto direttamente alla scena (vedi globe.gl: .objects([globe])).
function findGlobeRootObject(scene) {
  let tagged = null;
  scene.traverse((obj) => {
    if (!tagged && obj.__globeObjType === 'globe') tagged = obj;
  });
  if (!tagged) return null;
  let node = tagged;
  while (node.parent && node.parent !== scene) node = node.parent;
  return node.parent === scene ? node : null;
}

// Esperimento: continenti con contorni reali (GeoJSON) al posto dei puntini.
// Per tornare al vecchio sistema basta rimettere questa a false, il codice
// dei puntini (src/globe/landDots.js, buildLandDots) è ancora tutto qui,
// intatto, sotto l'else.
const USE_REALISTIC_CONTINENTS = true;

// Il pallino nell'angolo della foto è verde e "vivo" solo per il proprio
// marker quando si condivide la posizione in tempo reale (vedi App.jsx,
// ownPosition/shareLiveLocation): altrimenti resta il colore standard del
// mondo, come sempre.
const LIVE_LOCATION_COLOR = '#22c55e';

function makeMarkerEl(user, world, onOpen) {
  const el = document.createElement('div');
  el.className = 'rb-marker';
  const dotColor = user.isLive ? LIVE_LOCATION_COLOR : world.color;
  el.innerHTML = `
    <div class="rb-marker-photo" style="border-color:${world.color}">
      <img src="${user.avatar}" alt="${user.name}" loading="lazy" />
      <span class="rb-marker-dot ${user.isLive ? 'rb-marker-dot-live' : ''}" style="background:${dotColor}"></span>
    </div>
  `;
  el.title = `${user.name} · ${user.city}`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onOpen(user);
  });
  return el;
}

// Marker quadrato di un evento (diverso apposta dai marker rotondi degli
// utenti, per non confonderli): la foto che l'utente ha caricato, con un
// badge del numero di like sopra se ce n'è almeno uno. Un click apre
// sempre la lista di chi ha messo like (vedi EventLikersModal), anche a
// zero like — è lì che si vede il dettaglio dell'evento.
function makeEventMarkerEl(event, world, onOpen) {
  const el = document.createElement('div');
  el.className = 'rb-event-marker';
  const likeCount = event.mi_piace.length;
  const photoStyle = event.fotoUrl ? `background-image:url('${event.fotoUrl}')` : `background:${world.color}`;
  el.innerHTML = `
    <div class="rb-event-marker-photo" style="${photoStyle}; border-color:${world.color}"></div>
    ${likeCount > 0 ? `<span class="rb-event-marker-badge">${likeCount}</span>` : ''}
  `;
  el.title = `${event.titolo} · ${event.citta}`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onOpen(event.id);
  });
  return el;
}

// Quando un gruppo ha più utenti della soglia, invece di un marker per
// persona (che a migliaia diventerebbe illeggibile, oltre che lento) si
// mostra un solo "grumo" col conteggio. Un click vola dentro e affina il
// raggruppamento (vedi sotto): il livello di dettaglio dipende da quanto
// sei zoomato, non da un click "ricordato" per sempre.
const CLUSTER_THRESHOLD = 8;

// Tre livelli, scelti in base all'altitudine della camera (stessa unità di
// pointOfView: più alta = più lontano). Lontanissimo raggruppa per nazione,
// medio raggruppa per città, vicino mostra le persone una per una.
const ZOOM_TIER_COUNTRY = 1.4;
const ZOOM_TIER_CITY = 0.55;

function makeClusterEl(cluster, world, onExpand) {
  const el = document.createElement('div');
  el.className = 'rb-marker-cluster';
  el.style.borderColor = world.color;
  el.style.background = `color-mix(in srgb, ${world.color} 28%, rgba(0,0,0,0.55))`;
  el.innerHTML = `<span>${cluster.count}</span>`;
  el.title = `${cluster.label} · ${cluster.count} persone`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onExpand(cluster);
  });
  return el;
}

// Quanto vicino (in gradi lat/lng, molto approssimativo ma sufficiente qui)
// deve essere il centro del gruppo al punto che la camera sta guardando,
// perché a zoom ravvicinato quel gruppo si apra nei singoli individui.
// Senza questo, a zoom vicino si mostrerebbero TUTTI gli individui di TUTTE
// le città anche lontanissime dalla vista attuale: con centinaia o migliaia
// di profili sarebbe di nuovo il problema di partenza (e anche lento).
const NEARBY_DEGREES = 1;

// Altitudine di partenza della camera (unità react-globe.gl: distanza dal
// centro = raggio globo * (1 + altitude)). Tenuta più lontana apposta
// (prima 2.4): a questa distanza il globo grande occupa circa il 45-50%
// dell'altezza dello schermo, lasciando spazio ai satelliti in "sistema
// solare" (vedi globe/satelliteGlobes.js) di stare visibilmente più in là,
// invece di accalcarsi appena fuori dal suo bordo.
const DEFAULT_ALTITUDE = 4.2;
// Piano di clipping lontano della camera: di serie (vedi
// three-render-objects) è troppo vicino per le posizioni assolute dei
// satelliti (fino a ~450-500 unità dal centro, più l'orbita lenta), che
// altrimenti verrebbero tagliati via invece di sbiadire in lontananza.
const CAMERA_FAR = 5000;

// Dopo quanto tempo senza interazioni il globo smette di essere ridisegnato
// (serve anche a far finire le transizioni/inerzie della camera).
const IDLE_MS = 3000;

// Durate del warp fra mondi (Fase 2b, vedi runWarp più sotto): volo della
// camera + crescita del satellite, poi il flash che copre lo scambio.
// Insieme restano sotto il tetto di 900ms per transizione del prompt
// "effetto wow" originale.
const WARP_DIVE_MS = 550;
const WARP_FLASH_MS = 150;

// Raggruppa gli utenti secondo il livello adatto all'altitudine attuale:
// per nazione se sei molto lontano, per città a media/vicina distanza. Solo
// il gruppo (città) su cui la camera è effettivamente centrata si apre nei
// singoli individui quando sei abbastanza vicino — gli altri restano
// raggruppati, anche a zoom ravvicinato, perché sono fuori vista. Zoomando
// (rotellina/pizzico) o volando su un grumo il livello si ricalcola da
// solo, non serve "ricordare" cosa hai aperto.
function clusterUsers(users, view) {
  const { altitude, lat: viewLat, lng: viewLng } = view;
  const isCountryTier = altitude >= ZOOM_TIER_COUNTRY;
  const groupKey = (u) => (isCountryTier ? u.country || 'Altro' : u.city || `${u.lat},${u.lng}`);
  const targetAltitude = isCountryTier ? ZOOM_TIER_COUNTRY - 0.15 : ZOOM_TIER_CITY - 0.15;

  const groups = new Map();
  for (const u of users) {
    const key = groupKey(u);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u);
  }

  const items = [];
  for (const [key, group] of groups) {
    const lat = group.reduce((sum, u) => sum + u.lat, 0) / group.length;
    const lng = group.reduce((sum, u) => sum + u.lng, 0) / group.length;
    const isNearbyAndClose =
      !isCountryTier && altitude < ZOOM_TIER_CITY && Math.hypot(lat - viewLat, lng - viewLng) < NEARBY_DEGREES;

    if (group.length > CLUSTER_THRESHOLD && !isNearbyAndClose) {
      items.push({ kind: 'cluster', label: key, lat, lng, count: group.length, targetAltitude });
    } else {
      for (const u of group) items.push({ kind: 'user', ...u });
    }
  }
  return items;
}

export default function WorldGlobe({
  world,
  users,
  onSelectUser,
  containerRef,
  flyTo,
  categories,
  activeCategory,
  onCategorySelect,
  onCategoryPositionsReady,
  events = [],
  onSelectEvent,
  onWarpArrived,
  warpRequest,
}) {
  const globeRef = useRef();
  const overlayRef = useRef(null);
  const categoryShellRef = useRef(null);
  const landPointsRef = useRef(null);
  const satellitesRef = useRef(null);
  const warpFlashRef = useRef(null);
  const warpingRef = useRef(false);
  const hasPositionedSatellitesRef = useRef(false);
  // Stato del movimento "salvaschermo" (vedi globeActivity più sotto):
  // globeRootRef è l'oggetto trovato da findGlobeRootObject (cache, la
  // ricerca si fa una sola volta); globeSpinAngleRef l'angolo accumulato
  // (radianti) applicato ogni fotogramma a lui + overlayRef.current.group +
  // categoryShellRef.current.group, sempre in sincrono, così non si
  // "staccano" mai visivamente l'uno dall'altro. idleTargetRef/
  // idleRampFromRef/idleRampStartRef/idleRampDurationMsRef sono la rampa
  // (0..1) che porta il movimento da fermo a velocità piena in
  // IDLE_EASE_IN_S secondi quando il mouse esce, e viceversa in
  // IDLE_EASE_OUT_S quando rientra — calcolata "al volo" ad ogni
  // fotogramma (vedi computeIdleFactor), mai con un rAF a parte.
  const globeRootRef = useRef(null);
  const globeSpinAngleRef = useRef(0);
  const idleTargetRef = useRef(0);
  const idleRampFromRef = useRef(0);
  const idleRampStartRef = useRef(0);
  const idleRampDurationMsRef = useRef(0);
  const reduceMotionActiveRef = useRef(false);

  const computeIdleFactor = (now) => {
    const dur = idleRampDurationMsRef.current;
    if (dur <= 0) return idleTargetRef.current;
    const t = Math.min(1, (now - idleRampStartRef.current) / dur);
    return idleRampFromRef.current + (idleTargetRef.current - idleRampFromRef.current) * easeInOutCubic(t);
  };

  // Letto dal polling a 250ms sotto (interval con deps [], serve un ref e
  // non solo la prop per restare aggiornato senza far ripartire l'intervallo).
  const activeCategoryRef = useRef(activeCategory);
  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [landPolygons, setLandPolygons] = useState([]);
  // Qualità grafica (Impostazioni -> Effetti, o "Auto" con downgrade da FPS
  // reali, vedi fx/quality.js): pixelRatio e atmosfera restano reattivi a
  // caldo qui sotto; l'antialias del renderer invece si decide una sola
  // volta alla creazione (rendererConfig più giù, useMemo su mount) perché
  // WebGLRenderer non permette di cambiarlo senza ricrearlo da zero.
  const [quality, setQuality] = useState(() => getGlobeQuality());
  const initialAntialias = useMemo(() => getGlobeQuality().antialias, []);
  // Vista attuale della camera (altitudine + centro): guida il livello di
  // raggruppamento dei marker (vedi clusterUsers). Non basta ascoltare
  // l'evento "change" dei controlli: i voli programmati (pointOfView su
  // categoria/città/grumo) non passano da li', quindi si controlla con un
  // piccolo polling, abbastanza leggero da non pesare (legge tre numeri
  // ogni 250ms).
  const [view, setView] = useState({ altitude: DEFAULT_ALTITUDE, lat: 0, lng: 0 });

  useEffect(() => {
    const interval = setInterval(() => {
      const g = globeRef.current;
      if (!g) return;
      const pov = g.pointOfView();
      setView((prev) => {
        const altChanged = Math.abs(prev.altitude - pov.altitude) > 0.03;
        // La posizione (lat/lng) conta solo a zoom ravvicinato, dove serve
        // per capire quale città è "sotto" la camera (vedi clusterUsers).
        // A zoom lontano/medio ignorarla evita di ricalcolare/rimontare i
        // marker ad ogni frame solo perché il globo sta ruotando da solo.
        const closeZoom = pov.altitude < ZOOM_TIER_CITY;
        const posChanged = closeZoom && (Math.abs(prev.lat - pov.lat) > 0.5 || Math.abs(prev.lng - pov.lng) > 0.5);
        return altChanged || posChanged ? { altitude: pov.altitude, lat: pov.lat, lng: pov.lng } : prev;
      });
      // Etichette delle categorie: nascoste (non tolte, solo sprite.visible)
      // quando sono sul retro del globo, troppo vicine al bordo dello
      // schermo o sopra al menu testuale delle categorie in basso a
      // sinistra (.rb-world-tagline-list) — mai tagliate a metà, mai
      // sovrapposte a un altro controllo cliccabile. Stesso giro di
      // polling della vista qui sopra, nessun ciclo nuovo da pagare.
      if (categoryShellRef.current) {
        updateCategoryLabelVisibility(g, categoryShellRef.current, activeCategoryRef.current);
      }
    }, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayItems = useMemo(() => {
    const eventItems = events.map((e) => ({ kind: 'event', ...e }));
    return [...clusterUsers(users, view), ...eventItems];
  }, [users, view, events]);

  const expandCluster = (cluster) => {
    const g = globeRef.current;
    if (g) g.pointOfView({ lat: cluster.lat, lng: cluster.lng, altitude: cluster.targetAltitude }, 1200);
  };
  // Puntatore "grezzo" (touch) = dispositivo mobile: li' il globo deve stare
  // fermo di default e muoversi solo con le dita (trascinamento/pizzico),
  // mai da solo. Su desktop invece ruota da solo finche' il mouse non ci
  // passa sopra.
  const isTouchDevice = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);
  const isHoveringRef = useRef(false);

  // Risparmio CPU: react-globe.gl ridisegna la scena (e riposiziona tutti i
  // marker HTML) ad ogni frame, per sempre, anche col globo fermo. Qui il
  // disegno si mette in pausa quando nessuno interagisce e riparte al primo
  // segno di attività (mouse, rotellina, tocco, voli della camera, dati
  // nuovi) — oppure resta sveglio finché il mouse è fuori dal canvas,
  // perché lì il globo/i satelliti continuano a muoversi da soli (vedi
  // "keep-alive" in startAutoRotate sotto).
  //
  // I nomi startAutoRotate/stopAutoRotate sono rimasti (li chiamano molti
  // punti sotto: mount, hover, warp, fly-to) ma NON toccano più
  // OrbitControls.autoRotate — la CAMERA non orbita più da sola, punto
  // (richiesta esplicita, il vecchio comportamento disorientava). "Start"
  // ora vuol dire "il mouse è fuori, fai partire il movimento idle"
  // (rotazione del globo + orbita dei satelliti, vedi il wrapper di
  // renderer.render più giù), "stop" vuol dire il contrario: la rampa
  // (idleTargetRef 0..1, calcolata al volo da computeIdleFactor) porta la
  // velocità da 0 a piena in IDLE_EASE_IN_S secondi, e viceversa in
  // IDLE_EASE_OUT_S.
  const globeActivity = useMemo(() => {
    let idleTimer = null;
    let keepAliveTimer = null;
    let paused = false;

    const sleep = () => {
      const g = globeRef.current;
      if (!g || paused) return;
      g.pauseAnimation();
      paused = true;
    };

    const wake = (ms = IDLE_MS) => {
      const g = globeRef.current;
      if (!g) return;
      if (paused) {
        g.resumeAnimation();
        paused = false;
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(sleep, ms);
    };

    const setIdleTarget = (target, durationMs) => {
      const now = performance.now();
      idleRampFromRef.current = computeIdleFactor(now);
      idleTargetRef.current = target;
      idleRampStartRef.current = now;
      idleRampDurationMsRef.current = durationMs;
    };

    const stopAutoRotate = () => {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
      setIdleTarget(0, IDLE_EASE_OUT_S * 1000);
      // Resta sveglio solo il tempo di finire la decelerazione, poi il
      // solito timeout di inattività (IDLE_MS) rimette in pausa da solo.
      wake(IDLE_EASE_OUT_S * 1000 + 400);
    };

    const startAutoRotate = () => {
      const g = globeRef.current;
      if (!g || isTouchDevice) return;
      // "Riduci animazioni" del sistema: niente rotazioni, solo il
      // galleggiamento dei satelliti (già indipendente da questo stato).
      reduceMotionActiveRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      setIdleTarget(1, IDLE_EASE_IN_S * 1000);
      wake(2000);
      clearInterval(keepAliveTimer);
      // Il mouse può restare fuori per minuti (è un salvaschermo, non ha
      // una durata massima): senza questo, dopo IDLE_MS di inattività
      // "apparente" (nessun evento pointer, il mouse è semplicemente
      // altrove) il disegno si metterebbe in pausa e il movimento si
      // fermerebbe di scatto invece di continuare finché il mouse non
      // rientra davvero.
      keepAliveTimer = setInterval(() => wake(2000), 1000);
    };

    const dispose = () => {
      clearTimeout(idleTimer);
      clearInterval(keepAliveTimer);
    };

    return { wake, startAutoRotate, stopAutoRotate, dispose };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => globeActivity.dispose, [globeActivity]);

  // Qualsiasi interazione dentro al globo (anche sui marker HTML, che stanno
  // sopra al canvas) lo risveglia per qualche secondo.
  useEffect(() => {
    const g = globeRef.current;
    const target = containerRef?.current ?? g?.renderer().domElement;
    if (!target) return undefined;
    const onActivity = () => globeActivity.wake();
    const opts = { passive: true };
    target.addEventListener('pointermove', onActivity, opts);
    target.addEventListener('pointerdown', onActivity, opts);
    target.addEventListener('wheel', onActivity, opts);
    target.addEventListener('touchstart', onActivity, opts);
    return () => {
      target.removeEventListener('pointermove', onActivity, opts);
      target.removeEventListener('pointerdown', onActivity, opts);
      target.removeEventListener('wheel', onActivity, opts);
      target.removeEventListener('touchstart', onActivity, opts);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globeActivity]);

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Segue i cambi di qualità (scelta esplicita in Impostazioni, o downgrade
  // automatico da FPS bassi in modalità "Auto") e li applica al renderer già
  // creato: pixelRatio a caldo, atmosfera tramite la prop dichiarativa più
  // giù (vedi <Globe showAtmosphere>).
  useEffect(() => {
    const unsubscribe = subscribeQualityMode(() => setQuality(getGlobeQuality()));
    const stopMonitor = startAutoQualityMonitor();
    return () => {
      unsubscribe();
      stopMonitor();
    };
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixelRatioCap));
  }, [quality.pixelRatioCap]);

  // Materiale opaco (non trasparente): evitiamo che il globo finisca nel canale di
  // rendering "trasparente" insieme ai puntini, che causava sfarfallio/z-fighting
  // durante la rotazione o lo zoom.
  const globeMaterial = useMemo(
    () =>
      new THREE.MeshPhongMaterial({
        color: '#050508',
        shininess: 6,
      }),
    []
  );

  // Guscio "a rete" (wireframe + nodi luminosi), come nelle immagini di riferimento.
  // Non dipende da nessuna immagine: appare subito, a prescindere dai puntini dei continenti.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return undefined;

    const scene = g.scene();
    const shell = buildNetworkShell();
    const group = new THREE.Group();
    group.add(shell.lines, shell.nodes);
    scene.add(group);
    overlayRef.current = { group, shell, landDots: null };
    applyOverlayColor(overlayRef.current, world.atmosphereColor, world.lineColor);
    // Cache dell'oggetto "globo vero e proprio" di react-globe.gl (vedi
    // findGlobeRootObject sopra): serve al giro di rendering più giù per
    // farlo ruotare in sincrono con questo stesso overlay.
    globeRootRef.current = findGlobeRootObject(scene);

    return () => {
      scene.remove(group);
      shell.icoGeometry.dispose();
      shell.edgesGeometry.dispose();
      shell.nodes.geometry.dispose();
      shell.lineMaterial.dispose();
      shell.nodeMaterial.dispose();
      overlayRef.current = null;
      globeRootRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Continenti: due sistemi alternativi, scelti da USE_REALISTIC_CONTINENTS.
  // Puntini (vecchio): caricati dall'immagine terra/acqua, se falliscono il
  // resto della scena resta comunque visibile.
  useEffect(() => {
    if (USE_REALISTIC_CONTINENTS) return undefined;
    let cancelled = false;

    loadLandDots()
      .then((landPoints) => {
        if (cancelled || !overlayRef.current) return;
        landPointsRef.current = landPoints;
        rebuildLandDots(overlayRef.current, landPoints, categoryShellRef.current?.triangles ?? [], world.atmosphereColor);
      })
      .catch((err) => {
        console.error('Impossibile caricare la mappa dei continenti', err);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contorni reali (nuovo): GeoJSON precalcolato (vedi scripts/build-land-geojson.mjs),
  // nessuna richiesta di rete oltre al file statico.
  useEffect(() => {
    if (!USE_REALISTIC_CONTINENTS) return undefined;
    let cancelled = false;

    loadLandGeo()
      .then((features) => {
        if (cancelled) return;
        setLandPolygons(features);
      })
      .catch((err) => {
        console.error('Impossibile caricare i contorni dei continenti', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (overlayRef.current) applyOverlayColor(overlayRef.current, world.atmosphereColor, world.lineColor);
  }, [world.atmosphereColor, world.lineColor]);

  // Categorie "incastonate" nel guscio (solo dove servono, es. mondo Arte & Musica):
  // ogni categoria riempie il triangolo più vicino alla sua posizione lat/lng, con
  // un'etichetta sempre rivolta verso la camera (quindi sempre dritta e leggibile).
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !categories || categories.length === 0) {
      categoryShellRef.current = null;
      return undefined;
    }

    const scene = g.scene();
    const shell = buildCategoryShell(categories, { radius: 122, color: world.color });
    scene.add(shell.group);
    categoryShellRef.current = shell;
    shell.setActive(activeCategory);
    onCategoryPositionsReady?.(shell.positions);

    // Toglie i puntini dei continenti e i nodi luminosi della rete da dentro ai
    // triangoli, per lasciare le etichette leggibili; tornano completi appena si
    // esce da questo mondo.
    if (overlayRef.current && landPointsRef.current) {
      rebuildLandDots(overlayRef.current, landPointsRef.current, shell.triangles, world.atmosphereColor);
    }
    if (overlayRef.current) {
      rebuildShellNodes(overlayRef.current, shell.triangles);
    }

    return () => {
      scene.remove(shell.group);
      shell.dispose();
      categoryShellRef.current = null;
      if (overlayRef.current && landPointsRef.current) {
        rebuildLandDots(overlayRef.current, landPointsRef.current, [], world.atmosphereColor);
      }
      if (overlayRef.current) {
        rebuildShellNodes(overlayRef.current, []);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, world.color]);

  useEffect(() => {
    categoryShellRef.current?.setActive(activeCategory);
  }, [activeCategory]);

  // Rileva i click sui triangoli delle categorie, distinguendoli da un trascinamento
  // (che serve invece a ruotare il globo con OrbitControls).
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !categories || !onCategorySelect) return undefined;

    const canvas = g.renderer().domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos = null;

    const onPointerDown = (e) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e) => {
      if (!downPos) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 6) return;

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, g.camera());
      const hits = raycaster.intersectObjects(categoryShellRef.current?.faceMeshes ?? []);
      if (hits.length > 0) onCategorySelect(hits[0].object.userData.categoryId);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }, [categories, onCategorySelect]);

  // I 5 globi satellite (i mondi non attivi) vivono nella STESSA scena/
  // renderer del globo grande — mai un secondo <Globe>, che vorrebbe dire un
  // secondo WebGLRenderer per ognuno e su mobile non reggerebbe (vedi
  // globe/satelliteGlobes.js). Un satellite per mondo si costruisce UNA SOLA
  // VOLTA IN ASSOLUTO qui (deps [], mai più): ricrearli ad ogni warp
  // costringeva il driver a ricompilare gli shader dei loro materiali ad
  // ogni cambio di mondo, il vero costo del blocco misurato durante il volo
  // (~250ms). La loro geometria non dipende dal livello di qualità grafica
  // (vedi SATELLITE_DETAIL in satelliteGlobes.js): farla dipendere causava
  // un cambio di forma a scatto se "Auto" declassava la qualità a metà
  // sessione, proprio mentre l'utente li guardava. Il cambio di mondo
  // attivo (sotto) si limita a mostrare/nascondere/riposizionare questi
  // stessi oggetti già pronti.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return undefined;
    const scene = g.scene();
    const sats = buildSatelliteGlobes({ worlds: WORLDS });
    scene.add(sats.group);
    satellitesRef.current = sats;
    globeActivity.wake();
    return () => {
      scene.remove(sats.group);
      sats.dispose();
      satellitesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quale mondo è attivo adesso (quindi quali sono satelliti, e dove):
  // nessuna geometria/materiale nuovo, solo setActiveWorld() sul pool già
  // costruito sopra — l'unica cosa che un warp deve davvero fare a runtime.
  // Le posizioni sono assolute (vedi satelliteGlobes.js SLOTS), non legate
  // alla camera: non serve più ricalcolarle al resize/rotazione schermo, ci
  // pensa già la correzione anti-sparizione dentro update() ad ogni frame.
  useEffect(() => {
    const g = globeRef.current;
    const sats = satellitesRef.current;
    if (!g || !sats) return undefined;
    sats.setActiveWorld(world.id, { animateSpawn: hasPositionedSatellitesRef.current });
    hasPositionedSatellitesRef.current = true;
    globeActivity.wake();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.id]);

  // Galleggiamento/rotazione dei satelliti + rotazione del globo centrale su
  // se stesso: tutti agganciati allo stesso giro di disegno del globo grande
  // (un wrapper attorno a renderer.render, non un requestAnimationFrame a
  // parte) così si fermano da soli quando globeActivity mette in pausa il
  // disegno per inattività — niente CPU sprecata a far muovere globi che
  // nessuno sta guardando. idleFactor (0..1, calcolato al volo da
  // computeIdleFactor — la rampa morbida di IDLE_EASE_IN_S/IDLE_EASE_OUT_S
  // secondi impostata da globeActivity.startAutoRotate/stopAutoRotate) è la
  // "velocità" di entrambi i movimenti: a 0 tutto è fermo (mouse dentro), a
  // 1 velocità piena (mouse fuori da IDLE_EASE_IN_S secondi). Il globo
  // centrale, il guscio a rete (overlayRef) e i triangoli delle categorie
  // (categoryShellRef) condividono lo STESSO angolo accumulato
  // (globeSpinAngleRef): mai calcolato tre volte separatamente, altrimenti
  // andrebbero fuori sincrono fra loro nel tempo.
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return undefined;
    const renderer = g.renderer();
    const originalRender = renderer.render.bind(renderer);
    const startedAt = performance.now();
    let lastElapsed = 0;
    renderer.render = (scene, camera) => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const deltaSec = elapsed - lastElapsed;
      lastElapsed = elapsed;

      const idleFactor = computeIdleFactor(performance.now());
      const reduceMotion = reduceMotionActiveRef.current;
      if (!reduceMotion) {
        globeSpinAngleRef.current += IDLE_GLOBE_SPIN_DEG_S * DEG2RAD * deltaSec * idleFactor;
        const angle = globeSpinAngleRef.current;
        if (globeRootRef.current) globeRootRef.current.rotation.y = angle;
        if (overlayRef.current) overlayRef.current.group.rotation.y = angle;
        if (categoryShellRef.current) categoryShellRef.current.group.rotation.y = angle;
      }
      satellitesRef.current?.update(elapsed, deltaSec, camera, reduceMotion ? 0 : idleFactor, reduceMotion);
      originalRender(scene, camera);
    };
    return () => {
      renderer.render = originalRender;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Il warp vero e proprio (Fase 2b): la camera vola verso la direzione del
  // satellite scelto mentre lui cresce, un flash copre lo scambio (il globo
  // grande è un sistema visivo diverso dal satellite — contorni reali contro
  // icosaedro leggero, vedi satelliteGlobes.js — un morph continuo fra i due
  // richiederebbe unificarli, fuori scopo qui), poi la camera torna alla
  // vista di sempre sul nuovo mondo e onWarpArrived lo rende quello attivo
  // (App.jsx cambia `world`, i satelliti si ricostruiscono da soli, vedi
  // sopra). Rispetta prefers-reduced-motion: in quel caso passa dritto al
  // nuovo mondo, senza volo né flash.
  const runWarp = (worldId) => {
    if (warpingRef.current || !onWarpArrived) return;
    const g = globeRef.current;
    const sats = satellitesRef.current;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const latLng = sats?.getWorldLatLng(worldId);
    if (!g || !sats || !latLng || reduceMotion) {
      onWarpArrived(worldId);
      return;
    }

    warpingRef.current = true;
    globeActivity.stopAutoRotate();
    globeActivity.wake(WARP_DIVE_MS + WARP_FLASH_MS + 600);
    sats.setWarpTarget(worldId, WARP_DIVE_MS);
    g.pointOfView({ lat: latLng.lat, lng: latLng.lng, altitude: 1.1 }, WARP_DIVE_MS);

    window.setTimeout(() => {
      warpFlashRef.current?.classList.add('active');
      window.setTimeout(() => {
        sats.setWarpTarget(null);
        // lat/lng espliciti (non solo altitude): altrimenti la camera resta
        // orientata verso la direzione del satellite appena raggiunto, e i
        // nuovi satelliti (compreso il mondo appena lasciato) apparirebbero
        // in posizioni diverse dalla disposizione consueta a seconda di quale
        // satellite si è cliccato — la vista di arrivo deve essere sempre la
        // stessa, comoda e prevedibile.
        g.pointOfView({ lat: 0, lng: 0, altitude: DEFAULT_ALTITUDE }, 0);
        onWarpArrived(worldId);
        window.setTimeout(() => {
          warpFlashRef.current?.classList.remove('active');
          warpingRef.current = false;
        }, 80);
      }, WARP_FLASH_MS);
    }, WARP_DIVE_MS);
  };

  // Scorciatoia da App.jsx: il selettore a icone a destra fa partire lo
  // stesso identico warp di un click sul satellite, non un cambio istantaneo.
  useEffect(() => {
    if (warpRequest) runWarp(warpRequest.worldId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warpRequest]);

  // Click su un satellite: fa partire il warp verso quel mondo.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !onWarpArrived) return undefined;
    const canvas = g.renderer().domElement;
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos = null;

    const onPointerDown = (e) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e) => {
      if (!downPos || !satellitesRef.current) return;
      const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      downPos = null;
      if (moved > 6) return;

      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, g.camera());
      const hits = raycaster.intersectObjects(satellitesRef.current.getHitMeshes());
      if (hits.length > 0) runWarp(hits[0].object.userData.worldId);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onWarpArrived]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    // OrbitControls.autoRotate resta sempre false: la camera non orbita
    // mai da sola (vedi globeActivity sopra e il wrapper di
    // renderer.render più giù per il movimento vero, sul globo/satelliti).
    g.controls().enableZoom = true;
    g.camera().far = CAMERA_FAR;
    g.camera().updateProjectionMatrix();
    g.pointOfView({ altitude: DEFAULT_ALTITUDE }, 0);
    if (isTouchDevice) globeActivity.wake();
    else globeActivity.startAutoRotate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando cambia ciò che si vede (marker, continenti, mondo, categorie,
  // dimensioni) il globo va ridisegnato anche se era in pausa.
  useEffect(() => {
    globeActivity.wake();
  }, [globeActivity, displayItems, landPolygons, world, categories, activeCategory, size]);

  // Solo su desktop: passando il mouse sopra il globo, il movimento idle si
  // ferma (rampa di IDLE_EASE_OUT_S secondi); togliendolo, riparte (rampa di
  // IDLE_EASE_IN_S secondi) e resta attivo finché il mouse non rientra, senza
  // un tetto massimo (è un salvaschermo). Su mobile non c'e' mai
  // auto-rotazione, quindi non serve gestire l'hover (il touch non "passa
  // sopra", tocca e basta).
  useEffect(() => {
    if (isTouchDevice) return undefined;
    const g = globeRef.current;
    if (!g) return undefined;
    const canvas = g.renderer().domElement;
    const onEnter = () => {
      isHoveringRef.current = true;
      globeActivity.stopAutoRotate();
    };
    const onLeave = () => {
      isHoveringRef.current = false;
      globeActivity.startAutoRotate();
    };
    canvas.addEventListener('pointerenter', onEnter);
    canvas.addEventListener('pointerleave', onLeave);
    return () => {
      canvas.removeEventListener('pointerenter', onEnter);
      canvas.removeEventListener('pointerleave', onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando si cerca una città nota nei filtri, il globo smette di ruotare da solo
  // e vola sopra quella città con una transizione morbida.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !flyTo) return undefined;

    globeActivity.stopAutoRotate();
    // Il volo è animato dal ciclo di disegno: deve restare attivo finché dura.
    globeActivity.wake(CATEGORY_FLY_MS + IDLE_MS);
    const pov = { altitude: flyTo.altitude ?? 1.3 };
    if (flyTo.lat !== undefined) pov.lat = flyTo.lat;
    if (flyTo.lng !== undefined) pov.lng = flyTo.lng;
    g.pointOfView(pov, CATEGORY_FLY_MS);

    // Su mobile il globo resta sempre fermo (si muove solo con le dita), quindi
    // dopo il volo non riparte mai da solo.
    if (isTouchDevice) return undefined;

    const resumeTimer = setTimeout(() => {
      if (!isHoveringRef.current) globeActivity.startAutoRotate();
    }, 4000);

    return () => clearTimeout(resumeTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo]);

  return (
    <div className="rb-globe-shell" ref={containerRef}>
      <Globe
        ref={globeRef}
        rendererConfig={{ antialias: initialAntialias, alpha: true }}
        globeMaterial={globeMaterial}
        backgroundColor="rgba(0,0,0,0)"
        showAtmosphere={quality.atmosphere}
        atmosphereColor={world.atmosphereColor}
        atmosphereAltitude={0.3}
        polygonsData={USE_REALISTIC_CONTINENTS ? landPolygons : []}
        polygonCapColor={() => polygonFillColor(world.atmosphereColor)}
        polygonSideColor={() => 'rgba(0,0,0,0)'}
        polygonStrokeColor={() => world.atmosphereColor}
        polygonAltitude={0.006}
        htmlElementsData={displayItems}
        htmlLat="lat"
        htmlLng="lng"
        htmlAltitude={0.03}
        htmlElement={(item) =>
          item.kind === 'cluster'
            ? makeClusterEl(item, world, expandCluster)
            : item.kind === 'event'
            ? makeEventMarkerEl(item, world, onSelectEvent)
            : makeMarkerEl(item, world, onSelectUser)
        }
        width={size.width}
        height={size.height}
      />
      <div className="rb-globe-warp-flash" ref={warpFlashRef} aria-hidden="true" />
    </div>
  );
}

// Colore del "riempimento" dei continenti: stesso colore del mondo ma molto
// trasparente, così i contorni (lo stroke) restano il segno principale.
const capColorCache = new Map();
function polygonFillColor(hexColor) {
  let cached = capColorCache.get(hexColor);
  if (!cached) {
    const c = new THREE.Color(hexColor);
    cached = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, 0.1)`;
    capColorCache.set(hexColor, cached);
  }
  return cached;
}

// Di solito un solo colore vale per tutto (linee + puntini), ma un mondo può
// avere un world.lineColor separato per le sole linee del guscio (vedi
// Incontri in data/worlds.js): puntini/continenti restano sul colore
// principale, dotColor.
function applyOverlayColor(overlay, dotColor, lineColor = dotColor) {
  if (overlay.landDots) overlay.landDots.material.color.set(dotColor);
  overlay.shell.lineMaterial.color.set(lineColor);
  overlay.shell.nodeMaterial.color.set(dotColor);
}

// Ricostruisce i puntini dei continenti, escludendo (o meno) quelli dentro ai
// triangoli delle categorie attive.
function rebuildLandDots(overlay, landPoints, excludeTriangles, color) {
  const old = overlay.landDots;
  if (old) {
    overlay.group.remove(old);
    old.geometry.dispose();
    old.material.dispose();
  }
  const landDots = buildLandDots(landPoints, excludeTriangles);
  landDots.material.color.set(color);
  overlay.group.add(landDots);
  overlay.landDots = landDots;
}

// Rifà la geometria dei nodi luminosi del guscio, escludendo quelli dentro ai
// triangoli delle categorie attive (il materiale/colore resta lo stesso).
function rebuildShellNodes(overlay, excludeTriangles) {
  const newGeometry = buildShellNodeGeometry(overlay.shell.icoGeometry, excludeTriangles);
  overlay.shell.nodes.geometry.dispose();
  overlay.shell.nodes.geometry = newGeometry;
}

// Margine (px) dal bordo del canvas sotto il quale un'etichetta si nasconde
// invece di restare a metà tagliata dal bordo della finestra.
const LABEL_EDGE_MARGIN = 16;

// Nasconde (sprite.visible, mai un remove dalla scena) l'etichetta di una
// categoria quando: è sul retro del globo rispetto alla camera (prodotto
// scalare fra la normale del punto e la direzione verso la camera), è
// troppo vicina al bordo dello schermo, o cade sopra al menu testuale delle
// categorie in basso a sinistra (.rb-world-tagline-list, vedi App.jsx) — lì
// il nome è già leggibile e cliccabile, l'etichetta 3D sarebbe solo
// un'etichetta doppia che si accavalla.
function updateCategoryLabelVisibility(g, shell, activeCategoryId) {
  const sprites = shell.labelSprites;
  if (!sprites || sprites.length === 0) return;
  const camera = g.camera();
  const canvas = g.renderer().domElement;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const taglineEl = document.querySelector('.rb-world-tagline-list');
  const taglineRect = taglineEl ? taglineEl.getBoundingClientRect() : null;

  sprites.forEach((sprite) => {
    // Posizione VERA in scena, non quella locale (sprite.position): il
    // gruppo delle categorie ora ruota assieme al globo (vedi
    // globeSpinAngleRef in WorldGlobe.jsx), quindi la posizione locale da
    // sola non basta più a sapere dove lo sprite si trova davvero.
    const worldPos = sprite.getWorldPosition(new THREE.Vector3());
    const outwardNormal = worldPos.clone().normalize();
    const toCamera = camera.position.clone().sub(worldPos).normalize();
    const facingAway = outwardNormal.dot(toCamera) < 0.08;

    const ndc = worldPos.clone().project(camera);
    const behindCamera = ndc.z > 1;
    const screenX = rect.left + (ndc.x * 0.5 + 0.5) * rect.width;
    const screenY = rect.top + (-ndc.y * 0.5 + 0.5) * rect.height;
    const nearEdge =
      screenX < rect.left + LABEL_EDGE_MARGIN ||
      screenX > rect.right - LABEL_EDGE_MARGIN ||
      screenY < rect.top + LABEL_EDGE_MARGIN ||
      screenY > rect.bottom - LABEL_EDGE_MARGIN;
    const overTagline =
      taglineRect &&
      screenX >= taglineRect.left &&
      screenX <= taglineRect.right &&
      screenY >= taglineRect.top &&
      screenY <= taglineRect.bottom;

    // La categoria attiva non mostra la propria etichetta sul globo mentre
    // il suo pannello è aperto (Fase 2c): l'etichetta "è diventata" il
    // titolo del pannello (vedi LabelMorphTitle), tenerla anche qui sarebbe
    // un doppione proprio al centro dello schermo, dove il volo l'ha appena
    // portata.
    const isActivePanel = sprite.userData.categoryId === activeCategoryId;
    sprite.visible = !isActivePanel && !facingAway && !behindCamera && !nearEdge && !overTagline;
  });
}

export { WORLDS };
