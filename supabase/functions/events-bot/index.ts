// events-bot: aggiorna da solo gli eventi dell'app (tabella public.events,
// fonte = 'bot'): fiere e raduni cosplay, fiere del videogioco, festival
// teatrali, mostre, concerti. Per ogni "feed" (mondo + categoria, vedi
// FEEDS) chiede a Gemini con la ricerca Google gli eventi in programma
// nei prossimi mesi, li valida, li geocodifica se serve (Nominatim) e li
// inserisce/aggiorna senza duplicare quelli già presenti (curati a mano o
// aggiunti dagli utenti). Gli eventi passati non vengono cancellati: la
// RPC eventi_vicini li separa già (in_corso / prossimi / passati); quelli
// del bot finiti da più di 60 giorni vengono archiviati (deleted_at) da
// events_bot_housekeeping(), chiamata a fine giro.
//
// Chi lo lancia:
// - pg_cron ogni notte (vedi migrazione events_bot), con la chiave anon:
//   chiunque potrebbe farlo, per questo un giro "anonimo" parte solo se
//   l'ultimo è più vecchio di MIN_HOURS_BETWEEN_RUNS ore;
// - il pannello Backend (scheda "Bot eventi"), con il JWT dell'utente:
//   solo owner/moderatore, e senza limite di attesa (force).
// Le scritture usano la service role (iniettata da Supabase nelle Edge
// Function): la RLS non vale, quindi qui si scrive SOLO in events e
// events_bot_runs, mai altrove.
//
// Segreti: GEMINI_API_KEY (già usata dalla funzione translate). Senza,
// il giro registra l'errore in events_bot_runs e non fa nulla.

import { createClient } from "npm:@supabase/supabase-js@2";

// Primo tentativo con Flash; se risponde 429/503 (troppa richiesta) o non
// fa in tempo, secondo tentativo con Flash-Lite, più veloce e meno carico.
const GEMINI_ATTEMPTS = [
  { model: "gemini-2.5-flash", timeoutMs: 70_000 },
  { model: "gemini-2.5-flash-lite", timeoutMs: 60_000 },
];
const MIN_HOURS_BETWEEN_RUNS = 20;
const RUN_LOCK_MINUTES = 30;
const MAX_EVENTS_PER_FEED = 20;
// Limite di durata delle Edge Function ~150 s: i due tentativi Gemini
// insieme devono restare sotto (ragionamento disattivato per fare presto).
const HOUSEKEEPING_DAYS = 60;
const ALLOWED_ORIGINS = ["https://mike-majic.github.io", "http://localhost:5173", "http://127.0.0.1:5173"];

type Feed = {
  mondo: string;
  categoria: string;
  cosa: string;
  dove: string;
  mesi: number;
  tipi: string[];
};

// Un feed per ogni categoria dell'app che mostra eventi (EventiColumn).
// tipi: valori ammessi da events_tipo_check; il primo è quello di
// ripiego quando Gemini ne propone uno fuori lista.
const FEEDS: Feed[] = [
  {
    mondo: "nerd",
    categoria: "cosplay",
    cosa: "fiere del fumetto e convention nerd/pop culture, raduni cosplay, gare e contest cosplay, workshop di cosplay/prop making",
    dove: "in Italia (tutte le regioni, non solo le grandi città) più le 5 convention più importanti in Europa",
    mesi: 6,
    tipi: ["fiera", "raduno", "gara", "workshop", "shooting", "altro"],
  },
  {
    mondo: "nerd",
    categoria: "nerd-live",
    cosa: "fiere del videogioco e dell'elettronica di consumo, tornei esports con pubblico, incontri con content creator e anteprime di giochi",
    dove: "in Italia",
    mesi: 4,
    tipi: ["fiera", "torneo", "raduno", "altro"],
  },
  {
    mondo: "arte",
    categoria: "teatro",
    cosa: "festival teatrali, prime e tournée di spettacoli di prosa, musical, opera e danza di rilievo nazionale",
    dove: "in Italia",
    mesi: 3,
    tipi: ["spettacolo", "festival", "altro"],
  },
  {
    mondo: "arte",
    categoria: "arti-visive",
    cosa: "mostre d'arte in corso o in apertura nei musei, nelle fondazioni e nelle gallerie principali",
    dove: "in Italia",
    mesi: 4,
    tipi: ["mostra", "altro"],
  },
  {
    mondo: "arte",
    categoria: "live",
    cosa: "concerti e festival musicali di rilievo (tutti i generi), date italiane di tour internazionali",
    dove: "in Italia",
    mesi: 3,
    tipi: ["concerto", "festival", "altro"],
  },
];

type RawEvent = {
  titolo?: unknown;
  tipo?: unknown;
  citta?: unknown;
  indirizzo?: unknown;
  paese?: unknown;
  data_inizio?: unknown;
  data_fine?: unknown;
  url?: unknown;
  descrizione?: unknown;
  lat?: unknown;
  lng?: unknown;
};

type CleanEvent = {
  titolo: string;
  tipo: string;
  citta: string;
  indirizzo: string | null;
  paese: string;
  dataInizio: string;
  dataFine: string | null;
  url: string | null;
  descrizione: string;
  lat: number | null;
  lng: number | null;
  botKey: string;
};

function cors(origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

function jwtRole(authHeader: string): string | null {
  try {
    const part = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    return JSON.parse(atob(padded)).role ?? null;
  } catch {
    return null;
  }
}

// Chiave di deduplica: mondo|categoria|titolo|anno|città, tutto senza
// accenti, maiuscole e punteggiatura ("Lucca Comics & Games 2026" e
// "Lucca Comics and Games 2026" danno la stessa chiave).
function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(20\d\d)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function cleanEvent(raw: RawEvent, feed: Feed): CleanEvent | null {
  const titolo = str(raw.titolo, 120);
  const citta = str(raw.citta, 80);
  if (!titolo || !citta || !isIsoDate(raw.data_inizio)) return null;
  const dataInizio = raw.data_inizio;
  const dataFine = isIsoDate(raw.data_fine) && raw.data_fine >= dataInizio ? raw.data_fine : null;
  // Solo eventi non ancora finiti (o in corso oggi).
  if ((dataFine ?? dataInizio) < todayIso()) return null;
  // Non oltre l'orizzonte del feed + 2 mesi di tolleranza.
  const limite = new Date();
  limite.setMonth(limite.getMonth() + feed.mesi + 2);
  if (dataInizio > limite.toISOString().slice(0, 10)) return null;

  const tipoRaw = str(raw.tipo, 20).toLowerCase();
  const tipo = feed.tipi.includes(tipoRaw) ? tipoRaw : feed.tipi[feed.tipi.length - 1];
  const urlRaw = str(raw.url, 300);
  const url = /^https?:\/\/\S+$/i.test(urlRaw) ? urlRaw : null;
  const paeseRaw = str(raw.paese, 2).toUpperCase();
  const paese = /^[A-Z]{2}$/.test(paeseRaw) ? paeseRaw : "IT";
  let lat = num(raw.lat);
  let lng = num(raw.lng);
  if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    lat = null;
    lng = null;
  }
  const anno = dataInizio.slice(0, 4);
  return {
    titolo,
    tipo,
    citta,
    indirizzo: str(raw.indirizzo, 160) || null,
    paese,
    dataInizio,
    dataFine,
    url,
    descrizione: str(raw.descrizione, 400),
    lat,
    lng,
    botKey: `${feed.mondo}|${feed.categoria}|${slug(titolo)}|${anno}|${slug(citta)}`,
  };
}

function buildPrompt(feed: Feed): string {
  return `Oggi è ${todayIso()}. Cerca sul web ${feed.cosa}, ${feed.dove}, che si svolgono da oggi ai prossimi ${feed.mesi} mesi (compresi quelli già iniziati e non ancora finiti).
Riporta al massimo ${MAX_EVENTS_PER_FEED} eventi, i più rilevanti e con date confermate dal sito ufficiale o da fonti affidabili. Niente eventi passati, niente eventi con data incerta, niente duplicati.
Rispondi SOLO con un array JSON valido (senza markdown, senza commenti), un oggetto per evento con esattamente questi campi:
- "titolo": nome ufficiale dell'evento con l'anno o l'edizione (max 120 caratteri)
- "tipo": uno tra ${feed.tipi.map((t) => `"${t}"`).join(", ")}
- "citta": città (solo il nome)
- "indirizzo": sede o indirizzo, oppure null
- "paese": codice ISO a 2 lettere (es. "IT")
- "data_inizio": "YYYY-MM-DD"
- "data_fine": "YYYY-MM-DD" (uguale a data_inizio se dura un giorno)
- "url": sito ufficiale (https://...) oppure null
- "descrizione": 1-2 frasi in italiano, max 300 caratteri, senza opinioni
- "lat", "lng": coordinate della città (numeri) oppure null`;
}

class RetryableError extends Error {}

async function askGeminiOnce(prompt: string, apiKey: string, model: string, timeoutMs: number): Promise<RawEvent[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
  } catch (e) {
    clearTimeout(timeout);
    if ((e as Error).name === "AbortError") throw new RetryableError(`${model} non ha risposto entro ${timeoutMs / 1000} s`);
    throw e;
  }
  try {
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const msg = `${model} ${res.status}: ${detail.replace(/\s+/g, " ").slice(0, 160)}`;
      if (res.status === 429 || res.status === 503 || res.status === 500) throw new RetryableError(msg);
      throw new Error(msg);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: { text?: string }) => p.text ?? "").join("\n");
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) throw new Error(`${model}: risposta senza array JSON`);
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function askGemini(prompt: string, apiKey: string): Promise<RawEvent[]> {
  let lastError: Error | null = null;
  for (const attempt of GEMINI_ATTEMPTS) {
    try {
      return await askGeminiOnce(prompt, apiKey, attempt.model, attempt.timeoutMs);
    } catch (e) {
      lastError = e as Error;
      if (!(e instanceof RetryableError)) throw e;
    }
  }
  throw lastError ?? new Error("Gemini non disponibile");
}

// Nominatim: una richiesta al secondo, solo per le città senza coordinate.
const geoCache = new Map<string, { lat: number; lng: number } | null>();
let lastGeocodeAt = 0;
async function geocode(citta: string, paese: string): Promise<{ lat: number; lng: number } | null> {
  const key = `${citta.toLowerCase()}|${paese}`;
  if (geoCache.has(key)) return geoCache.get(key)!;
  const wait = 1100 - (Date.now() - lastGeocodeAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocodeAt = Date.now();
  try {
    const params = new URLSearchParams({ format: "jsonv2", city: citta, country: paese, limit: "1" });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "VerseMove events-bot (https://mike-majic.github.io)", Accept: "application/json" },
    });
    const rows = res.ok ? await res.json() : [];
    const hit = Array.isArray(rows) && rows[0] ? { lat: Number(rows[0].lat), lng: Number(rows[0].lon) } : null;
    const out = hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng) ? hit : null;
    geoCache.set(key, out);
    return out;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

type FeedResult = { feed: string; trovati: number; inseriti: number; aggiornati: number; scartati: number; errore?: string };

// Le ricerche Gemini dei vari feed partono insieme (ognuna dura decine di
// secondi); le scritture e la geocodifica vengono dopo, in sequenza.
async function fetchFeed(feed: Feed, apiKey: string): Promise<{ raws: RawEvent[]; errore?: string }> {
  try {
    return { raws: await askGemini(buildPrompt(feed), apiKey) };
  } catch (e) {
    return { raws: [], errore: (e as Error).message };
  }
}

// deno-lint-ignore no-explicit-any
async function upsertFeed(admin: any, feed: Feed, raws: RawEvent[], autoreId: string): Promise<FeedResult> {
  const result: FeedResult = { feed: `${feed.mondo}/${feed.categoria}`, trovati: raws.length, inseriti: 0, aggiornati: 0, scartati: 0 };

  // Eventi già presenti nella categoria (qualunque fonte): per non
  // duplicare quelli curati a mano o aggiunti dagli utenti si confronta
  // titolo+anno normalizzati; quelli del bot si riconoscono dalla bot_key.
  const { data: existing } = await admin
    .from("events")
    .select("id, titolo, data_evento, fonte, bot_key, lat, lng, deleted_at")
    .eq("mondo", feed.mondo)
    .eq("categoria", feed.categoria);
  const byBotKey = new Map<string, { id: string; deleted_at: string | null; lat: number | null }>();
  const humanKeys = new Set<string>();
  for (const row of existing ?? []) {
    if (row.bot_key) byBotKey.set(row.bot_key, row);
    else if (!row.deleted_at) humanKeys.add(`${slug(row.titolo)}|${String(row.data_evento).slice(0, 4)}`);
  }

  const seen = new Set<string>();
  for (const raw of raws) {
    const ev = cleanEvent(raw ?? {}, feed);
    if (!ev || seen.has(ev.botKey)) {
      result.scartati += 1;
      continue;
    }
    seen.add(ev.botKey);
    if (humanKeys.has(`${slug(ev.titolo)}|${ev.dataInizio.slice(0, 4)}`)) {
      result.scartati += 1;
      continue;
    }
    const found = byBotKey.get(ev.botKey);
    if ((ev.lat == null || ev.lng == null) && !(found && found.lat != null)) {
      const g = await geocode(ev.citta, ev.paese);
      if (g) {
        ev.lat = g.lat;
        ev.lng = g.lng;
      }
    }
    const patch: Record<string, unknown> = {
      titolo: ev.titolo,
      tipo: ev.tipo,
      citta: ev.citta,
      indirizzo: ev.indirizzo,
      paese: ev.paese,
      data_evento: `${ev.dataInizio}T08:00:00Z`,
      data_fine: `${ev.dataFine ?? ev.dataInizio}T18:00:00Z`,
      url_ufficiale: ev.url,
      descrizione: ev.descrizione,
      bot_checked_at: new Date().toISOString(),
      deleted_at: null,
    };
    if (ev.lat != null && ev.lng != null) {
      patch.lat = ev.lat;
      patch.lng = ev.lng;
    }
    if (found) {
      const { error } = await admin.from("events").update(patch).eq("id", found.id);
      if (error) result.errore = (result.errore ? result.errore + "; " : "") + error.message;
      else result.aggiornati += 1;
    } else {
      const { error } = await admin.from("events").insert({
        ...patch,
        autore_id: autoreId,
        mondo: feed.mondo,
        categoria: feed.categoria,
        fonte: "bot",
        stato: "approvato",
        pubblico: true,
        bot_key: ev.botKey,
      });
      if (error) result.errore = (result.errore ? result.errore + "; " : "") + error.message;
      else result.inseriti += 1;
    }
  }
  return result;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Chi chiama: un utente loggato deve essere owner/moderatore (verificato
  // dal db con il SUO token, così vale la RLS); il cron passa la anon.
  const authHeader = req.headers.get("authorization") || "";
  const role = jwtRole(authHeader);
  let force = false;
  let feedFilter: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.categoria === "string") feedFilter = body.categoria;
  } catch {
    // body vuoto: va bene
  }
  if (role === "authenticated") {
    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: isStaff } = await asUser.rpc("is_owner_or_moderator");
    if (!isStaff) return json({ error: "Solo owner e moderatori possono lanciare il bot" }, 403, origin);
    force = true;
  } else if (role !== "anon" && role !== "service_role") {
    return json({ error: "Non autorizzato" }, 401, origin);
  }

  // Un giro alla volta; per il cron/anon, per la stessa categoria (o per
  // il giro completo) non più di uno ogni MIN_HOURS_BETWEEN_RUNS ore.
  const { data: running } = await admin
    .from("events_bot_runs")
    .select("id, started_at")
    .is("finished_at", null)
    .gte("started_at", new Date(Date.now() - RUN_LOCK_MINUTES * 60_000).toISOString())
    .limit(1);
  if (running?.length) return json({ error: "Un giro è già in corso", skipped: true }, 409, origin);
  if (!force) {
    let q = admin.from("events_bot_runs").select("id, started_at").order("started_at", { ascending: false }).limit(1);
    q = feedFilter ? q.eq("categoria", feedFilter) : q.is("categoria", null);
    const { data: lastRuns } = await q;
    const last = lastRuns?.[0];
    if (last) {
      const ageMin = (Date.now() - Date.parse(last.started_at)) / 60_000;
      if (ageMin < MIN_HOURS_BETWEEN_RUNS * 60) {
        return json({ ok: true, skipped: true, motivo: `Ultimo giro ${Math.round(ageMin / 60)} ore fa` }, 200, origin);
      }
    }
  }

  const { data: run, error: runErr } = await admin
    .from("events_bot_runs")
    .insert({ avviato_da: role === "authenticated" ? "pannello" : "cron", categoria: feedFilter })
    .select("id")
    .single();
  if (runErr || !run) return json({ error: runErr?.message ?? "Impossibile registrare il giro" }, 500, origin);

  const finish = async (patch: Record<string, unknown>, status: number) => {
    await admin.from("events_bot_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", run.id);
    return json({ ok: status < 400, run_id: run.id, ...patch }, status, origin);
  };

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return finish({ errore: "Manca il segreto GEMINI_API_KEY nelle Edge Function" }, 500);

  // Gli eventi del bot hanno come autore il primo owner (come quelli curati).
  const { data: owner } = await admin.from("profiles").select("id").eq("ruolo", "owner").order("created_at").limit(1).maybeSingle();
  if (!owner) return finish({ errore: "Nessun profilo owner a cui intestare gli eventi" }, 500);

  const feeds = FEEDS.filter((f) => !feedFilter || f.categoria === feedFilter);
  if (!feeds.length) return finish({ errore: `Categoria sconosciuta: ${feedFilter}` }, 400);
  const fetched = await Promise.all(feeds.map((feed) => fetchFeed(feed, apiKey)));
  const results: FeedResult[] = [];
  for (let i = 0; i < feeds.length; i += 1) {
    const r = await upsertFeed(admin, feeds[i], fetched[i].raws, owner.id);
    if (fetched[i].errore) r.errore = fetched[i].errore;
    results.push(r);
  }

  let archiviati = 0;
  const { data: hk } = await admin.rpc("events_bot_housekeeping", { p_days: HOUSEKEEPING_DAYS });
  if (typeof hk === "number") archiviati = hk;

  const errori = results.filter((r) => r.errore).map((r) => `${r.feed}: ${r.errore}`);
  return finish(
    {
      inseriti: results.reduce((s, r) => s + r.inseriti, 0),
      aggiornati: results.reduce((s, r) => s + r.aggiornati, 0),
      scartati: results.reduce((s, r) => s + r.scartati, 0),
      archiviati,
      dettaglio: results,
      errore: errori.length ? errori.join(" | ") : null,
    },
    200,
  );
});
