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
    anchor: { lat: -40.8, lng: -90 }, // distribuzione uniforme sull'oceano
    aliases: ['bacheca', 'feed', 'post', 'discussioni'],
    subfamilies: ['Discussioni', 'Novità', 'Consigli'],
  },
  {
    id: 'giochi-tavolo',
    label: 'Giochi da tavolo & carte',
    icon: '🎲',
    anchor: { lat: 35.5, lng: -20.5 }, // distribuzione uniforme sull'oceano
    aliases: ['giochi da tavolo', 'giochi di carte', 'boardgame', 'board game', 'carte collezionabili'],
    subfamilies: ['Strategici', 'Party game', 'Carte collezionabili', 'Cooperativi', 'Giochi di ruolo da tavolo'],
  },
  {
    id: 'gaming-pc',
    label: 'Gaming PC',
    icon: '🖥️',
    anchor: { lat: -35.5, lng: 159.5 }, // distribuzione uniforme sull'oceano
    aliases: ['gaming pc', 'pc gaming', 'steam'],
    subfamilies: ['FPS', 'RPG', 'Strategia', 'Simulazione', 'Indie'],
  },
  {
    id: 'gaming-ps',
    label: 'Gaming PS',
    icon: '🎮',
    anchor: { lat: 16.6, lng: 127.3 }, // distribuzione uniforme sull'oceano
    aliases: ['gaming ps', 'playstation', 'ps5', 'ps4'],
    subfamilies: ['Esclusive PlayStation', 'Azione/Avventura', 'Sportivi', 'Multiplayer online', 'Retrocompatibili'],
  },
  {
    id: 'gaming-xbox',
    label: 'Gaming XBOX',
    icon: '🕹️',
    anchor: { lat: -49.2, lng: 0 }, // distribuzione uniforme sull'oceano
    aliases: ['gaming xbox', 'xbox', 'game pass'],
    subfamilies: ['Esclusive Xbox', 'Game Pass', 'Sparatutto', 'Sportivi', 'Co-op'],
  },
  {
    id: 'gaming-nintendo',
    label: 'Gaming Nintendo',
    icon: '🔴',
    anchor: { lat: -40.8, lng: 90 }, // distribuzione uniforme sull'oceano
    aliases: ['nintendo', 'switch', 'switch 2', 'mario', 'zelda', 'pokemon', 'pokémon', 'eshop'],
    subfamilies: ['Switch', 'Giochi Nintendo', 'Multiplayer locale', 'Amiibo e collezionismo', 'Retro Nintendo'],
  },
  {
    id: 'cosplay',
    label: 'Cosplay',
    icon: '🦸',
    anchor: { lat: 35.5, lng: -159.5 }, // distribuzione uniforme sull'oceano
    aliases: ['cosplay', 'costume', 'cosplayer'],
    subfamilies: ['Anime/Manga', 'Videogiochi', 'Fumetti/Comics', 'Armor building', 'Prop making'],
  },
  {
    id: 'streaming',
    label: 'Streaming & Content Creator',
    icon: '🎥',
    anchor: { lat: 10.2, lng: -107.4 }, // distribuzione uniforme sull'oceano
    aliases: ['streaming', 'content creation', 'content creator', 'twitch', 'youtube'],
    subfamilies: ['Live streaming', 'YouTube', 'Editing video', 'Grafica/Overlay', 'Community management'],
  },
  {
    // L'id resta 'nerd-live' (preferiti già salvati); prima era
    // "Videochiamata" (spostata nel mondo Incontri), ora le dirette come nel
    // Social: Twitch, YouTube, Kick (live/LiveWorldPanel.jsx, mondo 'nerd').
    id: 'nerd-live',
    label: 'Live',
    icon: '🔴',
    anchor: { lat: 10.2, lng: 72.6 }, // distribuzione uniforme sull'oceano
    aliases: ['live', 'diretta', 'dirette', 'in diretta', 'twitch', 'kick', 'streamer'],
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
  'gaming-nintendo': ['Zelda', 'Mario Kart', 'Pokémon', 'Animal Crossing', 'Switch 2'],
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
