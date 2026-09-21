// Configurazione dei "mondi" del mappamondo interattivo.
// Ordine dello swipe a due dita: bambini -> social -> lavoro -> arte -> nerd -> incontri -> vetrina -> (torna a bambini).
// Il mondo blu (Social) è quello principale: è il primo che si vede all'apertura dell'app.
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
    id: 'lavoro',
    label: 'Lavoro',
    tagline: 'Curriculum e opportunità',
    color: '#e7eaf2',
    colorSoft: 'rgba(231, 234, 242, 0.16)',
    globeColor: '#0a0b10',
    atmosphereColor: '#e7eaf2',
    textOnGlobe: '#f5f6fa',
  },
  {
    id: 'arte',
    label: 'Arte & Musica',
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
    color: '#ff3860',
    colorSoft: 'rgba(255, 56, 96, 0.18)',
    globeColor: '#1f0409',
    atmosphereColor: '#ff3860',
    textOnGlobe: '#ffeaf0',
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
];

export const DEFAULT_WORLD_INDEX = WORLDS.findIndex((w) => w.id === 'social');
