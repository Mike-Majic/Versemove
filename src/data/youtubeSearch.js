import { apiProxy } from './apiProxy';

// Ricerca video su YouTube in tempo reale: YouTube non offre una ricerca
// pubblica senza chiave — serve la loro API ufficiale (Data API v3). La
// chiave non sta più nel sito: la usa l'edge function api-proxy (Vault),
// con cache e limite per utente. Il piano gratuito di Google concede circa
// 100 ricerche al giorno in totale (quota condivisa da tutto il sito, si
// azzera il giorno dopo): la cache del proxy la fa durare di più.
export async function searchYoutubeVideos(query, limit = 15, { order } = {}) {
  const params = { q: query.trim(), limit, order };
  let data;
  try {
    data = await apiProxy('youtube_search', params);
  } catch (err) {
    if (err.message !== 'timeout') throw err;
    data = await apiProxy('youtube_search', params);
  }
  return (data?.items ?? [])
    .filter((it) => it.id?.videoId)
    .map((it) => ({
      id: it.id.videoId,
      title: it.snippet.title,
      artist: it.snippet.channelTitle,
      artworkUrl: it.snippet.thumbnails?.medium?.url ?? it.snippet.thumbnails?.default?.url ?? null,
    }));
}

// Le viste reali non arrivano dalla ricerca (search.list non le include):
// serve una seconda chiamata mirata sugli id già trovati. Usata con
// parsimonia (solo per "Tendenze" in Esplora, una volta per apertura scheda)
// perché la quota gratuita è condivisa da tutto il sito.
export async function getVideoViewCounts(videoIds) {
  if (!videoIds.length) return {};
  let data;
  try {
    data = await apiProxy('youtube_views', { ids: videoIds });
  } catch (err) {
    if (err.message !== 'timeout') throw err;
    data = await apiProxy('youtube_views', { ids: videoIds });
  }
  const map = {};
  for (const it of data?.items ?? []) map[it.id] = Number(it.statistics?.viewCount ?? 0);
  return map;
}

// URL di incorporazione ufficiale, costruito solo dall'id video validato
// dalla risposta dell'API (mai da un link incollato a mano): dominio
// -nocookie, meno tracciamento finché non si preme play.
export function youtubeEmbedUrl(videoId) {
  // enablejsapi=1: senza caricare lo script ufficiale iframe_api, basta
  // questo parametro perché il player mandi da solo eventi postMessage
  // (onStateChange, infoDelivery con currentTime/duration) alla pagina che
  // lo ospita — usato per la barra di avanzamento e il "successivo" del
  // mini-player condiviso (vedi components/musica/MusicaApp.jsx).
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1`;
}
