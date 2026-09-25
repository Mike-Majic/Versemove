// api-proxy: ricerche Giphy / YouTube / TMDB senza chiavi nel sito.
// Le chiavi stanno nel Vault del DB (RPC get_api_secret, solo service
// role) o, se impostate, nei secret della funzione (GIPHY_API_KEY,
// YOUTUBE_API_KEY, TMDB_API_KEY). Solo utenti loggati, richieste fisse
// (niente URL liberi), cache in memoria e limite per utente: la quota
// gratuita delle API non si può più consumare copiando la chiave.

const ALLOWED_ORIGINS = ["https://mike-majic.github.io", "http://localhost:5173", "http://127.0.0.1:5173"];
const SITE_REFERER = "https://mike-majic.github.io/";

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

function jwtClaims(authHeader: string): { role?: string; sub?: string } {
  try {
    const part = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4)));
  } catch {
    return {};
  }
}

// --- chiavi -------------------------------------------------------------
const secretCache = new Map<string, { value: string; at: number }>();
async function secret(name: "giphy_api_key" | "youtube_api_key" | "tmdb_api_key"): Promise<string> {
  const envName = name.toUpperCase();
  const fromEnv = Deno.env.get(envName);
  if (fromEnv) return fromEnv;
  const cached = secretCache.get(name);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/get_api_secret`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
    },
    body: JSON.stringify({ p_name: name }),
  });
  const value = res.ok ? await res.json() : null;
  if (!value || typeof value !== "string") throw new Error("chiave non configurata");
  secretCache.set(name, { value, at: Date.now() });
  return value;
}

// --- cache risposte e limite per utente -----------------------------------
const cache = new Map<string, { body: unknown; exp: number }>();
function cacheGet(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.exp < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.body;
}
function cacheSet(key: string, body: unknown, ttlMs: number) {
  if (cache.size > 800) cache.delete(cache.keys().next().value!);
  cache.set(key, { body, exp: Date.now() + ttlMs });
}

const WINDOW_MS = 5 * 60_000;
const MAX_PER_WINDOW = 60;
const hits = new Map<string, number[]>();
function allowed(user: string) {
  const now = Date.now();
  const list = (hits.get(user) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    hits.set(user, list);
    return false;
  }
  list.push(now);
  hits.set(user, list);
  return true;
}

class Upstream extends Error {
  constructor(public status: number) {
    super(`upstream ${status}`);
  }
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Upstream(res.status);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// --- servizi ammessi ------------------------------------------------------
const YT_ORDERS = new Set(["date", "rating", "relevance", "title", "viewCount"]);
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const TMDB_PATH = /^\/movie\/(now_playing|upcoming|\d{1,9}\/videos)$/;

async function handle(service: string, p: Record<string, unknown>) {
  if (service === "giphy") {
    const q = String(p.q ?? "").trim().slice(0, 80);
    if (!q) throw new Error("ricerca vuota");
    const key = `giphy:${q.toLowerCase()}`;
    const hit = cacheGet(key);
    if (hit) return hit;
    const k = await secret("giphy_api_key");
    // rating=g fisso: filtro contenuti più severo, non disattivabile.
    const data = await getJson(`https://api.giphy.com/v1/gifs/search?api_key=${k}&q=${encodeURIComponent(q)}&limit=12&rating=g&lang=it`);
    const body = {
      data: (data.data ?? []).map((g: any) => ({
        id: g.id,
        title: g.title,
        images: {
          fixed_height_small: g.images?.fixed_height_small ? { url: g.images.fixed_height_small.url } : undefined,
          original: g.images?.original ? { url: g.images.original.url } : undefined,
        },
      })),
    };
    cacheSet(key, body, 30 * 60_000);
    return body;
  }
  if (service === "youtube_search") {
    const q = String(p.q ?? "").trim().slice(0, 100);
    if (!q) throw new Error("ricerca vuota");
    const limit = Math.min(Math.max(Number(p.limit) || 15, 1), 25);
    const order = YT_ORDERS.has(String(p.order)) ? String(p.order) : "";
    const key = `yts:${q.toLowerCase()}:${limit}:${order}`;
    const hit = cacheGet(key);
    if (hit) return hit;
    const k = await secret("youtube_api_key");
    const data = await getJson(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${limit}&q=${encodeURIComponent(q)}&key=${k}${order ? `&order=${order}` : ""}`,
      { Referer: SITE_REFERER },
    );
    const body = { items: (data.items ?? []).map((it: any) => ({ id: it.id, snippet: { title: it.snippet?.title, channelTitle: it.snippet?.channelTitle, thumbnails: it.snippet?.thumbnails } })) };
    cacheSet(key, body, 6 * 3600_000);
    return body;
  }
  if (service === "youtube_views") {
    const ids = (Array.isArray(p.ids) ? p.ids : []).map(String).filter((id) => YT_ID.test(id)).slice(0, 50);
    if (!ids.length) return { items: [] };
    const key = `ytv:${ids.join(",")}`;
    const hit = cacheGet(key);
    if (hit) return hit;
    const k = await secret("youtube_api_key");
    const data = await getJson(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.join(",")}&key=${k}`, { Referer: SITE_REFERER });
    const body = { items: (data.items ?? []).map((it: any) => ({ id: it.id, statistics: { viewCount: it.statistics?.viewCount } })) };
    cacheSet(key, body, 3600_000);
    return body;
  }
  if (service === "tmdb") {
    const path = String(p.path ?? "");
    if (!TMDB_PATH.test(path)) throw new Error("richiesta non ammessa");
    const key = `tmdb:${path}`;
    const hit = cacheGet(key);
    if (hit) return hit;
    const k = await secret("tmdb_api_key");
    const body = await getJson(`https://api.themoviedb.org/3${path}?api_key=${k}&language=it-IT&region=IT`);
    cacheSet(key, body, 6 * 3600_000);
    return body;
  }
  throw new Error("servizio sconosciuto");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405, origin);
  const claims = jwtClaims(req.headers.get("authorization") || "");
  if (claims.role !== "authenticated" || !claims.sub) return json({ error: "Accedi per cercare" }, 401, origin);
  if (!allowed(claims.sub)) return json({ error: "Troppe ricerche in poco tempo, riprova tra qualche minuto.", code: "rate" }, 429, origin);
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body JSON non valido" }, 400, origin);
  }
  try {
    const body = await handle(String(payload?.service ?? ""), (payload?.params as Record<string, unknown>) ?? {});
    return json(body, 200, origin);
  } catch (e) {
    if (e instanceof Upstream) {
      // 403/429 dalle API = quota o chiave: il sito mostra il suo messaggio.
      const code = e.status === 403 || e.status === 429 ? "quota" : e.status === 401 ? "chiave" : "upstream";
      return json({ error: `Servizio esterno non disponibile (${e.status})`, code }, 502, origin);
    }
    if ((e as Error).name === "AbortError") return json({ error: "Tempo scaduto", code: "timeout" }, 504, origin);
    return json({ error: (e as Error).message || "Errore", code: "bad" }, 400, origin);
  }
});
