// deals-bot: riempie da solo il mondo Vetrina (tabella public.vetrina_deals,
// fonte = 'feed', badge "Automatica" nell'app). Per ogni categoria di
// offerte (vedi FEEDS, stessi id di src/data/vetrinaCategories.js) chiede a
// Gemini con la ricerca Google le offerte in corso nei negozi italiani,
// controlla che il link si apra davvero (le pagine inesistenti vengono
// scartate), prende l'immagine dai meta tag della pagina e inserisce
// l'offerta senza duplicarla (fonte_ref = link normalizzato).
//
// Guadagno: se nei segreti delle Edge Function c'è AMAZON_ASSOCIATE_TAG
// (il proprio "tag" di Amazon Associates, es. versemove-21), a ogni link
// amazon.it viene aggiunto ?tag=... e ogni acquisto fatto da quel link paga
// una commissione. Senza il segreto le offerte escono lo stesso, ma senza
// commissione (vedi affiliateUrl).
//
// Chi lo lancia: pg_cron ogni giorno, una categoria per volta (job
// deals-bot-*), con la chiave anon, al massimo un giro ogni
// MIN_HOURS_BETWEEN_RUNS ore per categoria; oppure owner/moderatore dal
// pannello (JWT), senza attesa. I giri si registrano in events_bot_runs con
// categoria "vetrina/<id>". Scrive SOLO in vetrina_deals ed events_bot_runs.

import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_ATTEMPTS = [
  { model: "gemini-2.5-flash", timeoutMs: 60_000 },
  { model: "gemini-flash-latest", timeoutMs: 45_000 },
  { model: "gemini-flash-lite-latest", timeoutMs: 30_000 },
];
const MIN_HOURS_BETWEEN_RUNS = 20;
const RUN_LOCK_MINUTES = 15;
const MAX_DEALS_PER_FEED = 12;
// Un'offerta del bot senza scadenza nota resta visibile 5 giorni: le
// offerte vere cambiano spesso, meglio ripresentarle al giro successivo.
const DEFAULT_TTL_DAYS = 5;
const ALLOWED_ORIGINS = ["https://mike-majic.github.io", "http://localhost:5173", "http://127.0.0.1:5173"];

type Feed = { categoria: string; cosa: string };

const FEEDS: Feed[] = [
  { categoria: "novita", cosa: "le migliori offerte del giorno su qualunque tipo di prodotto (le più convenienti e popolari)" },
  { categoria: "offerte-animali", cosa: "cibo, accessori, giochi e prodotti per cani, gatti e altri animali domestici" },
  { categoria: "offerte-casa-arredamento", cosa: "mobili, complementi d'arredo, piccoli e grandi elettrodomestici, biancheria per la casa" },
  { categoria: "offerte-cibo-supermercati", cosa: "volantini e promozioni dei supermercati, spesa online, prodotti alimentari e bevande" },
  { categoria: "offerte-abbigliamento", cosa: "abbigliamento uomo, donna e bambino, saldi e promozioni dei marchi di moda" },
  { categoria: "offerte-scarpe", cosa: "scarpe sportive, sneakers, scarpe eleganti e stivali" },
  { categoria: "offerte-elettronica", cosa: "smartphone, computer, TV, cuffie, console, accessori tech" },
  { categoria: "offerte-bellezza-cura-persona", cosa: "profumi, cosmetici, skincare, rasoi e prodotti per la cura della persona" },
  { categoria: "offerte-sport-outdoor", cosa: "attrezzatura sportiva, fitness, bici, campeggio, trekking" },
  { categoria: "offerte-bambini-giocattoli", cosa: "giocattoli, giochi da tavolo, prodotti per l'infanzia" },
  { categoria: "offerte-viaggi-voli", cosa: "voli low cost, pacchetti vacanza, hotel e treni in offerta con partenza dall'Italia" },
  { categoria: "offerte-fai-da-te-giardino", cosa: "utensili, elettroutensili, giardinaggio, bricolage" },
  { categoria: "offerte-auto-moto", cosa: "accessori auto e moto, pneumatici, ricambi, caschi" },
  { categoria: "offerte-codici-sconto", cosa: "codici sconto e coupon validi dei principali negozi online italiani" },
];

type RawDeal = {
  titolo?: unknown;
  negozio?: unknown;
  url?: unknown;
  prezzo?: unknown;
  prezzo_originale?: unknown;
  descrizione?: unknown;
  scade_il?: unknown;
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

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function price(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.,]/g, "").replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null;
}

// Parole "di contenuto" (4+ lettere, senza accenti), per confrontare il
// titolo proposto con quello vero della pagina.
const STOP = new Set(["offerta", "offerte", "sconto", "sconti", "saldi", "promo", "prezzo", "prezzi", "fino", "online", "acquista", "compra", "nuovo", "nuova", "migliori", "della", "delle", "degli", "dalla", "sulle", "sugli", "tutti", "tutte", "with", "your", "from"]);
function words(s: string): Set<string> {
  return new Set(
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w)),
  );
}

// Offerte di stagioni passate (es. "SALDI SS25" a fine 2026): Gemini a
// volte ripesca pagine vecchie ancora online. Anno intero o sigla di
// collezione (SS/FW/AW/PE + 2 cifre; non "AI", "ai 20" è italiano)
// precedenti all'anno in corso = scarto.
function looksStale(text: string): boolean {
  const year = new Date().getUTCFullYear();
  for (const m of text.matchAll(/\b(20\d{2})\b/g)) if (Number(m[1]) < year) return true;
  for (const m of text.matchAll(/\b(?:ss|fw|aw|pe)\s?(\d{2})\b/gi)) if (2000 + Number(m[1]) < year) return true;
  return false;
}

// La pagina parla davvero di quello che dice l'offerta? Se il titolo della
// pagina non ha nessuna parola in comune con quello proposto (tolto il nome
// del negozio), Gemini ha abbinato il link sbagliato: si scarta. Pagine
// senza titolo leggibile (negozi che bloccano i bot) passano.
function titleMatches(proposed: string, negozio: string, pageTitle: string | null): boolean {
  if (!pageTitle) return true;
  const shop = words(negozio);
  const mine = [...words(proposed)].filter((w) => !shop.has(w));
  if (!mine.length) return true;
  const page = words(pageTitle);
  return mine.some((w) => page.has(w));
}

// Chiave di deduplica: host + percorso, senza query (tag, utm...) né slash finale.
function normalizeUrl(u: URL): string {
  return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase().slice(0, 300);
}

function affiliateUrl(u: URL): string {
  const amazonTag = Deno.env.get("AMAZON_ASSOCIATE_TAG");
  if (amazonTag && /(^|\.)amazon\.it$/i.test(u.hostname)) {
    const out = new URL(u.toString());
    out.searchParams.set("tag", amazonTag);
    return out.toString();
  }
  return u.toString();
}

function isPublicHost(host: string): boolean {
  if (/^localhost$/i.test(host) || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return false; // niente IP diretti
  return host.includes(".");
}

// Il link si apre davvero? (Gemini a volte inventa pagine.) Restituisce
// l'URL finale, l'immagine og:image e il titolo della pagina, se ci sono.
async function checkPage(raw: string): Promise<{ url: URL; image: string | null; title: string | null } | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!isPublicHost(u.hostname)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(u.toString(), {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VersemoveDealsBot/1.0; +https://mike-majic.github.io)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "it-IT,it;q=0.9",
      },
    });
    const finalUrl = new URL(res.url || u.toString());
    if (!isPublicHost(finalUrl.hostname)) return null;
    // 403/503: molti negozi bloccano i bot ma la pagina esiste; 404/410 no.
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel();
      return null;
    }
    let image: string | null = null;
    let title: string | null = null;
    if (res.ok && /text\/html/i.test(res.headers.get("content-type") || "")) {
      const reader = res.body!.getReader();
      let html = "";
      while (html.length < 300_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += new TextDecoder().decode(value);
        if (/<\/head>/i.test(html)) break;
      }
      try {
        await reader.cancel();
      } catch {
        // già chiuso
      }
      const candidates = [
        ...html.matchAll(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*content=["']([^"']+)["']/gi),
        ...html.matchAll(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/gi),
        ...html.matchAll(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/gi),
      ].map((x) => x[1]);
      // Icone del sito (favicon, android-icon, logo): nella card sembrano
      // un'immagine vuota o trasparente, meglio il segnaposto.
      const m = candidates.find((c) => !/favicon|android-icon|apple-touch|(^|[/_.-])(logo|icon|sprite|placeholder)s?([/_.-]|$)|\.(ico|svg)(\?|$)/i.test(c));
      const tm =
        html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (tm) title = tm[1].replace(/&amp;/g, "&").trim().slice(0, 300);
      if (m) {
        try {
          const iu = new URL(m.replace(/&amp;/g, "&"), finalUrl);
          if (iu.protocol === "https:") image = iu.toString().slice(0, 600);
        } catch {
          image = null;
        }
      }
    } else {
      await res.body?.cancel();
    }
    return { url: finalUrl, image, title };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function buildPrompt(feed: Feed): string {
  const today = new Date().toISOString().slice(0, 10);
  const amazon = Deno.env.get("AMAZON_ASSOCIATE_TAG")
    ? " Includi quando possibile offerte disponibili su Amazon.it (con il link diretto alla pagina del prodotto amazon.it/dp/...)."
    : "";
  return `Oggi è ${today}. Cerca sul web offerte e sconti REALI e ATTIVI OGGI in Italia su: ${feed.cosa}.
Riporta al massimo ${MAX_DEALS_PER_FEED} offerte diverse, di negozi affidabili (grandi catene, e-commerce noti, siti ufficiali dei marchi).${amazon}
Ogni offerta deve avere il link diretto alla pagina del prodotto o della promozione (non la home del negozio, non siti di aggregatori) e il titolo deve descrivere esattamente quella pagina. Niente offerte scadute, di stagioni passate o inventate: se non sei sicuro, non includerla.
Rispondi SOLO con un array JSON valido (senza markdown), un oggetto per offerta con esattamente questi campi:
- "titolo": nome del prodotto o della promozione (max 140 caratteri)
- "negozio": nome del negozio (es. "Amazon", "MediaWorld", "Zalando")
- "url": link https diretto
- "prezzo": prezzo in offerta in euro (numero) oppure null
- "prezzo_originale": prezzo pieno in euro (numero) oppure null
- "descrizione": 1 frase in italiano, max 200 caratteri, senza esagerazioni
- "scade_il": "YYYY-MM-DD" se la scadenza è nota, altrimenti null`;
}

class RetryableError extends Error {}

async function askGeminiOnce(prompt: string, apiKey: string, model: string, timeoutMs: number): Promise<RawDeal[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 6144, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new RetryableError(`${model} non ha risposto entro ${timeoutMs / 1000} s`);
      throw e;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const msg = `${model} ${res.status}: ${detail.replace(/\s+/g, " ").slice(0, 160)}`;
      if ([404, 429, 500, 503].includes(res.status)) throw new RetryableError(msg);
      throw new Error(msg);
    }
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("\n");
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) throw new RetryableError(`${model}: risposta senza array JSON`);
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function askGemini(prompt: string, apiKey: string): Promise<RawDeal[]> {
  let lastError: Error | null = null;
  const started = Date.now();
  for (const attempt of GEMINI_ATTEMPTS) {
    if (Date.now() - started + attempt.timeoutMs > 100_000) break;
    try {
      return await askGeminiOnce(prompt, apiKey, attempt.model, attempt.timeoutMs);
    } catch (e) {
      lastError = e as Error;
      if (!(e instanceof RetryableError)) throw e;
    }
  }
  throw lastError ?? new Error("Gemini non disponibile");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const authHeader = req.headers.get("authorization") || "";
  const role = jwtRole(authHeader);
  let force = false;
  let categoria: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.categoria === "string") categoria = body.categoria;
  } catch {
    // body vuoto
  }
  if (role === "authenticated") {
    const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: isStaff } = await asUser.rpc("is_owner_or_moderator");
    if (!isStaff) return json({ error: "Solo owner e moderatori possono lanciare il bot" }, 403, origin);
    force = true;
  } else if (role !== "anon" && role !== "service_role") {
    return json({ error: "Non autorizzato" }, 401, origin);
  }

  const feed = FEEDS.find((f) => f.categoria === categoria);
  if (!feed) return json({ error: `Categoria sconosciuta: ${categoria}` }, 400, origin);
  const runKey = `vetrina/${feed.categoria}`;

  const { data: running } = await admin
    .from("events_bot_runs")
    .select("id")
    .eq("categoria", runKey)
    .is("finished_at", null)
    .gte("started_at", new Date(Date.now() - RUN_LOCK_MINUTES * 60_000).toISOString())
    .limit(1);
  if (running?.length) return json({ error: "Un giro è già in corso", skipped: true }, 409, origin);
  if (!force) {
    const { data: lastRuns } = await admin
      .from("events_bot_runs")
      .select("started_at")
      .eq("categoria", runKey)
      .order("started_at", { ascending: false })
      .limit(1);
    const last = lastRuns?.[0];
    if (last && Date.now() - Date.parse(last.started_at) < MIN_HOURS_BETWEEN_RUNS * 3_600_000) {
      return json({ ok: true, skipped: true }, 200, origin);
    }
  }

  const { data: run, error: runErr } = await admin
    .from("events_bot_runs")
    .insert({ avviato_da: role === "authenticated" ? "pannello" : "cron", categoria: runKey })
    .select("id")
    .single();
  if (runErr || !run) return json({ error: runErr?.message ?? "Impossibile registrare il giro" }, 500, origin);
  const finish = async (patch: Record<string, unknown>, status: number) => {
    await admin.from("events_bot_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", run.id);
    return json({ ok: status < 400, run_id: run.id, ...patch }, status, origin);
  };

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return finish({ errore: "Manca il segreto GEMINI_API_KEY nelle Edge Function" }, 500);

  // Offerte del bot scadute: fuori dal feed (stato 'scaduta').
  await admin
    .from("vetrina_deals")
    .update({ stato: "scaduta", updated_at: new Date().toISOString() })
    .eq("fonte", "feed")
    .eq("stato", "attiva")
    .lt("scade_il", new Date().toISOString());

  let raws: RawDeal[] = [];
  try {
    raws = await askGemini(buildPrompt(feed), apiKey);
  } catch (e) {
    return finish({ errore: (e as Error).message }, 200);
  }

  const { data: existing } = await admin.from("vetrina_deals").select("id, fonte_ref").eq("categoria", feed.categoria).eq("fonte", "feed");
  const byRef = new Map<string, string>((existing ?? []).filter((r) => r.fonte_ref).map((r) => [r.fonte_ref, r.id]));

  // Controllo dei link in parallelo (max 12 pagine, 7 s l'una).
  const checked = await Promise.all(raws.slice(0, MAX_DEALS_PER_FEED).map((r) => checkPage(str(r?.url, 600))));
  let inseriti = 0;
  let aggiornati = 0;
  let scartati = 0;
  const errori: string[] = [];
  const todayIso = new Date().toISOString().slice(0, 10);
  const seen = new Set<string>();
  for (let i = 0; i < checked.length; i += 1) {
    const raw = raws[i] ?? {};
    const page = checked[i];
    const titolo = str(raw.titolo, 160);
    const negozio = str(raw.negozio, 80) || (page ? page.url.hostname.replace(/^www\./, "") : "");
    if (
      !page ||
      titolo.length < 3 ||
      !negozio ||
      !titleMatches(titolo, negozio, page.title) ||
      looksStale(`${titolo} ${str(raw.descrizione, 300)} ${page.title ?? ""}`)
    ) {
      scartati += 1;
      continue;
    }
    const ref = normalizeUrl(page.url);
    if (seen.has(ref)) {
      scartati += 1;
      continue;
    }
    seen.add(ref);
    const prezzo = price(raw.prezzo);
    let prezzoOriginale = price(raw.prezzo_originale);
    if (prezzo != null && prezzoOriginale != null && prezzoOriginale <= prezzo) prezzoOriginale = null;
    const scadeRaw = str(raw.scade_il, 10);
    const scade =
      /^\d{4}-\d{2}-\d{2}$/.test(scadeRaw) && scadeRaw >= todayIso
        ? `${scadeRaw}T23:59:00Z`
        : new Date(Date.now() + DEFAULT_TTL_DAYS * 86_400_000).toISOString();
    const row = {
      titolo,
      negozio,
      descrizione: str(raw.descrizione, 300) || null,
      url: affiliateUrl(page.url),
      immagine: page.image,
      prezzo,
      prezzo_originale: prezzoOriginale,
      // sconto_pct la calcola il database (colonna generata).
      online: true,
      scade_il: scade,
      stato: "attiva",
      updated_at: new Date().toISOString(),
    };
    const id = byRef.get(ref);
    if (id) {
      const { error } = await admin.from("vetrina_deals").update(row).eq("id", id);
      if (error) errori.push(error.message);
      else aggiornati += 1;
    } else {
      const { error } = await admin.from("vetrina_deals").insert({ ...row, categoria: feed.categoria, fonte: "feed", fonte_ref: ref, author_id: null });
      if (error) errori.push(error.message);
      else inseriti += 1;
    }
  }
  return finish({ inseriti, aggiornati, scartati, errore: errori.length ? errori.slice(0, 3).join(" | ") : null }, 200);
});
