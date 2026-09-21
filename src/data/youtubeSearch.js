// Ricerca video su YouTube in tempo reale: a differenza di Gutendex/iTunes
// (Libreria/prima versione di Musica), YouTube non offre una ricerca
// pubblica senza chiave — serve la loro API ufficiale (Data API v3).
//
// Questa chiave è stata creata da Michael su Google Cloud Console e
// limitata lì (Restrizioni applicazione → Siti web) al dominio
// mike-majic.github.io: comparire nel bundle pubblico del sito non la
// rende sfruttabile da un altro dominio, stesso principio della chiave
// "anon" di Supabase (vedi data/supabaseClient.js). Il piano gratuito di
// Google concede circa 100 ricerche al giorno in totale (quota condivisa
// da tutti gli utenti del sito, si azzera il giorno dopo).
const YOUTUBE_API_KEY = 'AIzaSyA3j42RV7jQGD-pIGTkDWJCjDfN0M8Fl-Y';
const YOUTUBE_SEARCH_BASE = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_BASE = 'https://www.googleapis.com/youtube/v3/videos';

const SEARCH_TIMEOUT_MS = 20000;

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      // 403 è quasi sempre quota esaurita o restrizione della chiave, non
      // un errore di rete: merita un messaggio diverso per chi cerca.
      if (res.status === 403) throw new Error('quota');
      throw new Error(`richiesta fallita (${res.status})`);
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('timeout');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchYoutubeVideos(query, limit = 15, { order } = {}) {
  const orderParam = order ? `&order=${order}` : '';
  const url = `${YOUTUBE_SEARCH_BASE}?part=snippet&type=video&maxResults=${limit}&q=${encodeURIComponent(query.trim())}&key=${YOUTUBE_API_KEY}${orderParam}`;
  let data;
  try {
    data = await fetchJson(url);
  } catch (err) {
    if (err.message !== 'timeout') throw err;
    data = await fetchJson(url);
  }
  return (data.items ?? [])
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
  const url = `${YOUTUBE_VIDEOS_BASE}?part=statistics&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`;
  let data;
  try {
    data = await fetchJson(url);
  } catch (err) {
    if (err.message !== 'timeout') throw err;
    data = await fetchJson(url);
  }
  const map = {};
  for (const it of data.items ?? []) map[it.id] = Number(it.statistics?.viewCount ?? 0);
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
