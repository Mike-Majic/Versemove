// Elenco di stazioni radio in tempo reale via Radio Browser
// (radio-browser.info): API pubblica, gratuita, senza chiave. Gli stream
// stessi (url_resolved) si ascoltano con un normale tag <audio>, incorporato
// dentro Versemove — nessun redirect esterno, mai.
const MIRRORS = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info'];
const SEARCH_TIMEOUT_MS = 15000;

async function fetchJson(path) {
  let lastErr;
  for (const base of MIRRORS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}${path}`, { signal: controller.signal, headers: { 'User-Agent': 'Versemove/1.0' } });
      if (!res.ok) throw new Error(`richiesta fallita (${res.status})`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr instanceof Error && lastErr.name === 'AbortError' ? new Error('timeout') : (lastErr ?? new Error('rete'));
}

function mapStation(s) {
  return {
    id: s.stationuuid,
    name: s.name,
    streamUrl: s.url_resolved || s.url,
    favicon: s.favicon || null,
    country: s.country || '',
    tags: (s.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3),
  };
}

export async function searchRadioStations(query, limit = 24) {
  const q = query.trim();
  const path = q
    ? `/json/stations/search?name=${encodeURIComponent(q)}&limit=${limit}&hidebroken=true&order=clickcount&reverse=true`
    : `/json/stations/topclick/${limit}`;
  const data = await fetchJson(path);
  return (Array.isArray(data) ? data : []).filter((s) => s.url_resolved || s.url).map(mapStation);
}

export async function listTopRadioStations(limit = 24) {
  const data = await fetchJson(`/json/stations/topclick/${limit}`);
  return (Array.isArray(data) ? data : []).filter((s) => s.url_resolved || s.url).map(mapStation);
}
