// Dati finti per le categorie del mondo Nerd. Stessa forma di arteCategories.js
// (categoria -> sottofamiglia, ricerche in evidenza, risultati), così il
// componente condiviso CategoryColumn funziona identico per entrambi i mondi.
export const NERD_CATEGORIES = [
  {
    // Bacheca del mondo Nerd: tutti i post con mondo = 'nerd', compresi
    // quelli delle categorie gaming (col chip "Gaming PC · Build"), più i
    // post liberi scritti da qui (vedi nerd/NerdBachecaColumn.jsx).
    id: 'bacheca',
    label: 'Bacheca',
    icon: '📰',
    anchor: { lat: -55, lng: -110 },
    aliases: ['bacheca', 'feed', 'post', 'discussioni'],
    subfamilies: ['Discussioni', 'Novità', 'Consigli'],
  },
  {
    id: 'giochi-tavolo',
    label: 'Giochi da tavolo & carte',
    icon: '🎲',
    anchor: { lat: 40, lng: 0 },
    aliases: ['giochi da tavolo', 'giochi di carte', 'boardgame', 'board game', 'carte collezionabili'],
    subfamilies: ['Strategici', 'Party game', 'Carte collezionabili', 'Cooperativi', 'Giochi di ruolo da tavolo'],
  },
  {
    id: 'gaming-pc',
    label: 'Gaming PC',
    icon: '🖥️',
    anchor: { lat: -20, lng: -60 },
    aliases: ['gaming pc', 'pc gaming', 'steam'],
    subfamilies: ['FPS', 'RPG', 'Strategia', 'Simulazione', 'Indie'],
  },
  {
    id: 'gaming-ps',
    label: 'Gaming PS',
    icon: '🎮',
    anchor: { lat: 20, lng: 100 },
    aliases: ['gaming ps', 'playstation', 'ps5', 'ps4'],
    subfamilies: ['Esclusive PlayStation', 'Azione/Avventura', 'Sportivi', 'Multiplayer online', 'Retrocompatibili'],
  },
  {
    id: 'gaming-xbox',
    label: 'Gaming XBOX',
    icon: '🕹️',
    anchor: { lat: -40, lng: 20 },
    aliases: ['gaming xbox', 'xbox', 'game pass'],
    subfamilies: ['Esclusive Xbox', 'Game Pass', 'Sparatutto', 'Sportivi', 'Co-op'],
  },
  {
    id: 'cosplay',
    label: 'Cosplay',
    icon: '🦸',
    anchor: { lat: 60, lng: -100 },
    aliases: ['cosplay', 'costume', 'cosplayer'],
    subfamilies: ['Anime/Manga', 'Videogiochi', 'Fumetti/Comics', 'Armor building', 'Prop making'],
  },
  {
    id: 'streaming',
    label: 'Streaming & Content creation',
    icon: '🎥',
    anchor: { lat: -10, lng: -150 },
    aliases: ['streaming', 'content creation', 'content creator', 'twitch', 'youtube'],
    subfamilies: ['Live streaming', 'YouTube', 'Editing video', 'Grafica/Overlay', 'Community management'],
  },
  {
    id: 'nerd-live',
    label: 'Live',
    icon: '🏆',
    anchor: { lat: 5, lng: 60 },
    aliases: ['live', 'eventi', 'fiera', 'fiere', 'torneo', 'tornei', 'convention'],
    subfamilies: ['Fiere ed eventi', 'Tornei eSports', 'Raduni cosplay', 'Incontri con creator', 'Anteprime e presentazioni'],
  },
];

// Trova la categoria il cui alias combacia (anche parzialmente) con la query digitata.
export function resolveCategoryQuery(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = NERD_CATEGORIES.find((c) => c.aliases.includes(q));
  if (exact) return exact;
  return NERD_CATEGORIES.find((c) => c.aliases.some((a) => a.startsWith(q))) ?? null;
}

export const FEATURED_SEARCHES = {
  bacheca: ['Ultime build', 'Trofei rari', 'Novità Game Pass', 'Clip della settimana'],
  'giochi-tavolo': ['Giochi cooperativi', 'Party game per gruppi grandi', 'Carte collezionabili rare', 'Giochi di ruolo per principianti', 'Strategici tedeschi', 'Giochi per due'],
  'gaming-pc': ['Build economiche', 'RPG open world', 'Indie da scoprire', 'FPS competitivi', 'Simulatori realistici'],
  'gaming-ps': ['Esclusive PS5', 'Platform co-op', 'Giochi retrocompatibili', 'Multiplayer online', 'Nuove uscite PlayStation'],
  'gaming-xbox': ['Game Pass consigliati', 'Sparatutto multiplayer', 'Co-op locale', 'Serie esclusive Xbox'],
  cosplay: ['Cosplay principianti', 'Prop making fai da te', 'Costumi da videogiochi', 'Materiali economici', 'Armor in EVA foam'],
  streaming: ['Setup streaming economico', 'Crescere su Twitch', 'Editing per YouTube', 'Overlay personalizzati', 'Community building'],
  'nerd-live': ['Fiere del fumetto', 'Tornei locali', 'Raduni cosplay', 'Q&A con content creator', 'Anteprime giochi'],
};

// Ogni contenuto ha: categoria, sottofamiglia, titolo, autore/studio, anno,
// descrizione breve, tag liberi. Catalogo finto tolto su richiesta
// esplicita: ogni categoria parte vuota, finché non ci sono contenuti veri
// caricati dagli utenti.
export const CATEGORY_RESULTS = {};
