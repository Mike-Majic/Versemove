// Dati finti per le categorie del mondo Arte & Musica. Nessun backend: servono
// solo a mostrare come funzionerà la ricerca a due colonne con filtro per
// sottofamiglia/genere. Tassonomia a due livelli: categoria -> sottofamiglia.
export const ARTE_CATEGORIES = [
  {
    id: 'libreria',
    label: 'Libreria',
    icon: '📚',
    anchor: { lat: 35, lng: -20 },
    aliases: ['libreria', 'libri', 'libro', 'biblioteca', 'lettura'],
    subfamilies: ['Romanzo', "Romanzo d'esordio", 'Poesia', 'Saggistica', 'Fumetti/Graphic novel', 'Antologia'],
  },
  {
    id: 'musica',
    label: 'Musica',
    icon: '🎵',
    anchor: { lat: -15, lng: 130 },
    aliases: ['musica', 'music', 'canzoni', 'canzone', 'brani'],
    subfamilies: ['Rock', 'Pop', 'Jazz', 'Hip-hop', 'Classica', 'Elettronica'],
  },
  {
    id: 'cinema',
    label: 'Cinema',
    icon: '🎬',
    anchor: { lat: 10, lng: 40 },
    aliases: ['cinema', 'film', 'filmato', 'movie', 'cortometraggio'],
    subfamilies: ['Commedia', 'Drammatico', 'Horror', 'Documentario', 'Animazione'],
  },
  {
    id: 'teatro',
    label: 'Teatro',
    icon: '🎭',
    anchor: { lat: 45, lng: -70 },
    aliases: ['teatro', 'theatre', 'spettacolo', 'commedia teatrale'],
    subfamilies: ['Prosa', 'Musical', 'Improvvisazione', 'Sperimentale'],
  },
  {
    id: 'arti-visive',
    label: 'Arte',
    icon: '🎨',
    anchor: { lat: -30, lng: -55 },
    aliases: ['arte', 'art', 'pittura', 'mostra', 'galleria', 'museo'],
    subfamilies: ['Mostre', 'Musei', 'Pittura', 'Scultura', 'Street Art'],
  },
  {
    id: 'podcast',
    label: 'Podcast',
    icon: '🎙️',
    anchor: { lat: -45, lng: 145 },
    aliases: ['podcast', 'audio', 'puntata', 'episodio'],
    subfamilies: ['Narrativo', 'Intervista', 'True crime', 'Attualità', 'Comico'],
  },
  {
    id: 'fotografia',
    label: 'Fotografia',
    icon: '📷',
    anchor: { lat: 5, lng: -100 },
    aliases: ['fotografia', 'foto', 'fotografico', 'scatto', 'photography'],
    subfamilies: ['Ritratto', 'Reportage', 'Analogica', 'Still life', 'Paesaggio', 'Tramonti'],
  },
  {
    id: 'live',
    label: 'Live',
    icon: '🎤',
    anchor: { lat: -60, lng: 0 },
    aliases: ['live', 'concerto', 'concerti', 'dal vivo', 'dj set'],
    subfamilies: ['Concerti', 'DJ set', 'Reading dal vivo', 'Session acustiche', 'Festival'],
  },
  {
    id: 'video',
    label: 'Video',
    icon: '🎥',
    anchor: { lat: 25, lng: 105 },
    aliases: ['video', 'video breve', 'cortometraggio video', 'clip'],
    subfamilies: [],
  },
];

// Trova la categoria il cui alias combacia (anche parzialmente) con la query digitata.
export function resolveCategoryQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = ARTE_CATEGORIES.find((c) => c.aliases.includes(q));
  if (exact) return exact;
  return ARTE_CATEGORIES.find((c) => c.aliases.some((a) => a.startsWith(q))) ?? null;
}

export const FEATURED_SEARCHES = {
  libreria: ['Fantascienza italiana', 'Poesia contemporanea', 'Saggistica storica', "Romanzi d'esordio", 'Fumetti indipendenti', 'Autori emergenti'],
  musica: ['Indie italiano', 'Musica elettronica', 'Jazz emergente', 'Cantautorato', 'Producer da scoprire', 'Band esordienti'],
  cinema: ['Cortometraggi', "Cinema d'autore", 'Documentari', 'Registi esordienti', 'Sceneggiature originali', 'Cinema indipendente'],
  teatro: ['Teatro civile', 'Compagnie indipendenti', 'Teatro-danza', 'Testi contemporanei', 'Improvvisazione teatrale'],
  'arti-visive': ['Arte urbana', 'Fotografia analogica', 'Giovani artisti', 'Installazioni', 'Arte digitale'],
  podcast: ['True crime italiano', 'Interviste indipendenti', 'Podcast narrativi', 'Attualità e società', 'Podcast comici'],
  fotografia: ['Fotografia di strada', 'Reportage sociale', 'Analogica e pellicola', 'Ritratti in bianco e nero', 'Paesaggi urbani'],
  live: ['Concerti indipendenti', 'DJ set emergenti', 'Reading dal vivo', 'Session acustiche', 'Festival di quartiere'],
};

// Ogni contenuto ha: categoria, sottofamiglia, titolo, autore/artista, anno,
// descrizione breve, media (placeholder), tag liberi. Catalogo finto tolto
// su richiesta esplicita: ogni categoria parte vuota, finché non ci sono
// contenuti veri caricati dagli utenti.
export const CATEGORY_RESULTS = {};
