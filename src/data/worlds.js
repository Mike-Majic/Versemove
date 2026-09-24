// Configurazione dei "mondi" del mappamondo interattivo.
// Ordine dello swipe a due dita (e del selettore a scorrimento, stesso
// array): bambini -> vetrina -> animali -> social -> annunci -> lavoro ->
// arte -> nerd -> incontri -> faq -> (torna a bambini). Il mondo blu
// (Social) è quello principale: è il primo che si vede all'apertura
// dell'app.
export const WORLDS = [
  {
    id: 'bambini',
    label: 'Bambini',
    // Niente profili/posizioni di minori sulla mappa di proposito: questo
    // mondo è fatto di minigiochi (vedi src/games/registry.js), non di persone.
    tagline: 'Minigiochi per i più piccoli',
    color: '#22c55e',
    colorSoft: 'rgba(34, 197, 94, 0.18)',
    globeColor: '#03130a',
    atmosphereColor: '#22c55e',
    textOnGlobe: '#e9fff2',
  },
  {
    id: 'vetrina',
    label: 'Vetrina',
    tagline: 'Novità in mostra',
    color: '#ec4899',
    colorSoft: 'rgba(236, 72, 153, 0.18)',
    globeColor: '#1f0416',
    atmosphereColor: '#ec4899',
    textOnGlobe: '#ffeaf7',
  },
  {
    id: 'animali',
    label: 'Animali',
    tagline: 'Luoghi pet-friendly vicino a te',
    // Richiesta esplicita: color sabbia (non chiaro), linee verde scuro,
    // lineamenti dei continenti bianchi. Stessa "grandezza" (una sola
    // categoria) del mondo Lavoro: qui c'è solo "Cani" (la mappa reale di
    // luoghi pet-friendly + recensioni, DogWorldMap), spostata qui dal
    // mondo Vetrina.
    // Sabbia media #c2a878 (scelta da Mike su foto di confronto, 24/9): sui
    // puntini della rete, che usano blending additivo, un colore così poco
    // saturo esce comunque quasi crema — vedi il commento su Incontri più
    // sotto — quindi il colore del mondo si vede soprattutto sul
    // riempimento dei continenti qui sotto e sull'alone.
    color: '#c2a878',
    colorSoft: 'rgba(194, 168, 120, 0.18)',
    globeColor: '#1a1509',
    atmosphereColor: '#c2a878',
    lineColor: '#1a4d2e',
    // Contorni dei continenti bianchi (vedi landStrokeColor in
    // WorldGlobe.jsx) e riempimento sabbia al 35%: con il velo di default
    // (10%) il colore del mondo non si vedeva quasi, il globo restava
    // scuro con una punta di marrone.
    landStrokeColor: '#ffffff',
    landFillColor: '#c2a878',
    landFillOpacity: 0.35,
    textOnGlobe: '#fdf6ec',
  },
  {
    id: 'social',
    label: 'Social',
    tagline: 'Mondo Social',
    color: '#1d9bf0',
    colorSoft: 'rgba(29, 155, 240, 0.18)',
    globeColor: '#04101f',
    atmosphereColor: '#1d9bf0',
    textOnGlobe: '#eaf6ff',
  },
  {
    id: 'annunci',
    label: 'Annunci',
    tagline: 'Auto, moto, biciclette, barche e case',
    color: '#ff8a1f',
    colorSoft: 'rgba(255, 138, 31, 0.18)',
    globeColor: '#1f1004',
    atmosphereColor: '#ff8a1f',
    textOnGlobe: '#fff2e6',
  },
  {
    id: 'lavoro',
    label: 'Lavoro',
    tagline: 'Curriculum e opportunità',
    color: '#e7eaf2',
    colorSoft: 'rgba(231, 234, 242, 0.16)',
    globeColor: '#0a0b10',
    atmosphereColor: '#e7eaf2',
    // Continenti quasi bianchi (richiesta di Mike): con il riempimento di
    // default al 10% sul globo quasi nero sembravano grigio molto scuro.
    // Contorni (stroke) più chiari del riempimento per restare visibili.
    landFillColor: '#f4f6fb',
    landFillOpacity: 0.78,
    textOnGlobe: '#f5f6fa',
  },
  {
    id: 'arte',
    label: 'Intrattenimento',
    tagline: 'Musica, cinema, teatro, arte',
    color: '#8b5cf6',
    colorSoft: 'rgba(139, 92, 246, 0.18)',
    globeColor: '#120a1f',
    atmosphereColor: '#8b5cf6',
    textOnGlobe: '#f3ecff',
  },
  {
    id: 'nerd',
    label: 'Nerd',
    tagline: 'Giochi da tavolo, gaming, cosplay, streaming',
    color: '#d4f634',
    colorSoft: 'rgba(212, 246, 52, 0.18)',
    globeColor: '#0c0f02',
    atmosphereColor: '#d4f634',
    textOnGlobe: '#fbffe8',
  },
  {
    id: 'incontri',
    label: 'Incontri',
    tagline: 'Conosci persone vicino a te',
    // Rosso puro, zero verde e zero blu. Il precedente #ff0033 aveva un
    // filo di blu che nelle linee (LineBasicMaterial, opacity 0.32, non
    // additivo) restava invisibile, ma nei puntini della rete (PointsMaterial
    // additivo a piena luminosità, vedi buildNetworkShell in
    // globe/networkOverlay.js) si leggeva chiaramente rosa: qualunque
    // sfumatura di blu diventa più evidente quando il colore è sovraesposto
    // dal blending additivo. Pilota l'accento UI di tutto il mondo (--accent,
    // vedi App.jsx), l'atmosfera del globo e i puntini della rete/continenti
    // (vedi applyOverlayColor in WorldGlobe.jsx).
    color: '#ff0000',
    colorSoft: 'rgba(255, 0, 0, 0.18)',
    globeColor: '#1f0409',
    atmosphereColor: '#ff0000',
    // Solo le LINEE del guscio a rete: richiesta esplicita di un rosso
    // diverso (#DE0000) da quello dei puntini, che restano su color/
    // atmosphereColor sopra (vedi lineColor in applyOverlayColor,
    // WorldGlobe.jsx — se un mondo non lo imposta usa lo stesso colore dei
    // puntini, come sempre).
    lineColor: '#de0000',
    textOnGlobe: '#ffeaf0',
  },
  {
    id: 'faq',
    label: 'FAQ',
    tagline: 'Aiuto, segnalazioni e suggerimenti',
    color: '#8a8a92',
    colorSoft: 'rgba(138, 138, 146, 0.18)',
    globeColor: '#0b0b0f',
    atmosphereColor: '#c9c9d4',
    // Rete/linee grigio scuro-argento (non nero puro, altrimenti sparirebbe
    // nel fondo dello sfondo): stesso meccanismo di lineColor già usato da
    // Incontri per differenziare puntini/linee, qui serve il contrario
    // (linee più chiare dei puntini per restare leggibili sul nero).
    lineColor: '#5a5a66',
    textOnGlobe: '#f2f2f5',
    // Solo sul satellite (vedi buildSatelliteMesh in satelliteGlobes.js): i
    // puntini si accendono sul lato colpito da una luce fissa rispetto alla
    // camera (in alto a sinistra) e sfumano verso il nero sul lato in ombra.
    nodeShading: 'luce-laterale',
  },
  {
    id: 'wip',
    label: 'Work in progress',
    tagline: 'Mondo in costruzione',
    // Guscio e reticolo blu elettrico, puntini bianchi e contorni dei
    // continenti bianchi (richiesta di Mike).
    color: '#ffffff',
    satelliteContinentColor: '#ffffff',
    colorSoft: 'rgba(10, 132, 255, 0.18)',
    globeColor: '#02132e',
    atmosphereColor: '#0a84ff',
    lineColor: '#0a84ff',
    textOnGlobe: '#eaf4ff',
  },
];

export const DEFAULT_WORLD_INDEX = WORLDS.findIndex((w) => w.id === 'social');
