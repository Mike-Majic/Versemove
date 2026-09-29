// deals-rss-bot: riempie il mondo Vetrina con le offerte pubblicate nei feed
// RSS/Atom dei siti di offerte di tutto il mondo (rete Pepper, Slickdeals,
// OzBargain, RedFlagDeals, dealnews, 9to5Toys, siti italiani di tecnologia,
// rete "Pirates" per i viaggi). Niente
// intelligenza artificiale e niente quote: si leggono i feed, si ricava la
// categoria dalle parole del titolo e della categoria del feed, e si
// inserisce l'offerta con il paese e la lingua della fonte (colonne
// vetrina_deals.paese/lingua). L'app mostra a ognuno solo le offerte del
// proprio paese (vedi src/data/dealsRegion.js).
//
// Sostituisce deals-bot (Gemini), che resta nel repo ma senza cron.
//
// Chi lo lancia: pg_cron (job deals-rss-bot) con la chiave anon, al massimo
// un giro ogni MIN_MINUTES_BETWEEN_RUNS; oppure owner/moderatore dal
// pannello (JWT), senza attesa. I giri si registrano in events_bot_runs con
// categoria "vetrina/rss". Scrive SOLO in vetrina_deals ed events_bot_runs.

import { createClient } from "npm:@supabase/supabase-js@2";

const MIN_MINUTES_BETWEEN_RUNS = 90;
const RUN_LOCK_MINUTES = 10;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ITEMS_PER_FEED = 40;
// I feed di offerte cambiano in fretta: senza scadenza nota un'offerta
// resta 4 giorni, poi esce (se è ancora nel feed il giro dopo la rinnova).
const DEFAULT_TTL_DAYS = 4;
const RUN_KEY = "vetrina/rss";
const ALLOWED_ORIGINS = ["https://mike-majic.github.io", "http://localhost:5173", "http://127.0.0.1:5173"];
const USER_AGENT = "VersemoveDeals/1.0 (+https://mike-majic.github.io)";

// categoria: fissa per le fonti di un solo tipo (i siti "Pirates" sono
// tutti viaggi, anche quando il titolo parla di "codice sconto").
type Source = { id: string; url: string; paese: string; lingua: string; valuta: string; negozio: string; categoria?: string };

// Solo feed verificati (rispondono 200 con voci dentro dai server Supabase).
const SOURCES: Source[] = [
  { id: "hukd-hot", url: "https://www.hotukdeals.com/rss/hot", paese: "GB", lingua: "en", valuta: "GBP", negozio: "hotukdeals" },
  { id: "hukd-new", url: "https://www.hotukdeals.com/rss/new", paese: "GB", lingua: "en", valuta: "GBP", negozio: "hotukdeals" },
  { id: "slick-fp", url: "https://slickdeals.net/newsearch.php?mode=frontpage&searcharea=deals&searchin=first&rss=1", paese: "US", lingua: "en", valuta: "USD", negozio: "Slickdeals" },
  { id: "slick-pop", url: "https://slickdeals.net/newsearch.php?mode=popdeals&searcharea=deals&searchin=first&rss=1", paese: "US", lingua: "en", valuta: "USD", negozio: "Slickdeals" },
  { id: "dealnews", url: "https://www.dealnews.com/?rss=1", paese: "US", lingua: "en", valuta: "USD", negozio: "dealnews" },
  { id: "rfd", url: "https://forums.redflagdeals.com/feed/forum/9", paese: "CA", lingua: "en", valuta: "CAD", negozio: "RedFlagDeals" },
  { id: "ozb", url: "https://www.ozbargain.com.au/deals/feed", paese: "AU", lingua: "en", valuta: "AUD", negozio: "OzBargain" },
  { id: "mydealz-hot", url: "https://www.mydealz.de/rss/hot", paese: "DE", lingua: "de", valuta: "EUR", negozio: "mydealz" },
  { id: "mydealz-new", url: "https://www.mydealz.de/rss/new", paese: "DE", lingua: "de", valuta: "EUR", negozio: "mydealz" },
  { id: "preisjaeger-hot", url: "https://www.preisjaeger.at/rss/hot", paese: "AT", lingua: "de", valuta: "EUR", negozio: "Preisjäger" },
  { id: "preisjaeger-new", url: "https://www.preisjaeger.at/rss/new", paese: "AT", lingua: "de", valuta: "EUR", negozio: "Preisjäger" },
  { id: "dealabs-hot", url: "https://www.dealabs.com/rss/hot", paese: "FR", lingua: "fr", valuta: "EUR", negozio: "Dealabs" },
  { id: "dealabs-new", url: "https://www.dealabs.com/rss/new", paese: "FR", lingua: "fr", valuta: "EUR", negozio: "Dealabs" },
  { id: "chollometro-hot", url: "https://www.chollometro.com/rss/hot", paese: "ES", lingua: "es", valuta: "EUR", negozio: "Chollometro" },
  { id: "chollometro-new", url: "https://www.chollometro.com/rss/new", paese: "ES", lingua: "es", valuta: "EUR", negozio: "Chollometro" },
  { id: "promodescuentos-hot", url: "https://www.promodescuentos.com/rss/hot", paese: "MX", lingua: "es", valuta: "MXN", negozio: "Promodescuentos" },
  { id: "promodescuentos-new", url: "https://www.promodescuentos.com/rss/new", paese: "MX", lingua: "es", valuta: "MXN", negozio: "Promodescuentos" },
  { id: "pepper-nl-hot", url: "https://nl.pepper.com/rss/hot", paese: "NL", lingua: "nl", valuta: "EUR", negozio: "Pepper" },
  { id: "pepper-nl-new", url: "https://nl.pepper.com/rss/new", paese: "NL", lingua: "nl", valuta: "EUR", negozio: "Pepper" },
  { id: "pepper-pl-hot", url: "https://www.pepper.pl/rss/hot", paese: "PL", lingua: "pl", valuta: "PLN", negozio: "Pepper" },
  { id: "pepper-pl-new", url: "https://www.pepper.pl/rss/new", paese: "PL", lingua: "pl", valuta: "PLN", negozio: "Pepper" },
  { id: "smartworld", url: "https://www.smartworld.it/offerte/feed", paese: "IT", lingua: "it", valuta: "EUR", negozio: "SmartWorld" },
  { id: "tuttotech", url: "https://www.tuttotech.net/offerte/feed", paese: "IT", lingua: "it", valuta: "EUR", negozio: "TuttoTech" },
  { id: "tomshw", url: "https://www.tomshw.it/feed/offerte", paese: "IT", lingua: "it", valuta: "EUR", negozio: "Tom's Hardware" },
  { id: "9to5toys", url: "https://9to5toys.com/feed/", paese: "US", lingua: "en", valuta: "USD", negozio: "9to5Toys" },
  { id: "piratinviaggio", url: "https://www.piratinviaggio.it/feed", paese: "IT", lingua: "it", valuta: "EUR", negozio: "Pirati in Viaggio", categoria: "offerte-viaggi-voli" },
  { id: "holidaypirates", url: "https://www.holidaypirates.com/feed", paese: "GB", lingua: "en", valuta: "GBP", negozio: "HolidayPirates", categoria: "offerte-viaggi-voli" },
  { id: "urlaubspiraten-de", url: "https://www.urlaubspiraten.de/feed", paese: "DE", lingua: "de", valuta: "EUR", negozio: "Urlaubspiraten", categoria: "offerte-viaggi-voli" },
  { id: "urlaubspiraten-at", url: "https://www.urlaubspiraten.at/feed", paese: "AT", lingua: "de", valuta: "EUR", negozio: "Urlaubspiraten", categoria: "offerte-viaggi-voli" },
  { id: "voyagespirates", url: "https://www.voyagespirates.fr/feed", paese: "FR", lingua: "fr", valuta: "EUR", negozio: "Voyages Pirates", categoria: "offerte-viaggi-voli" },
  { id: "viajerospiratas", url: "https://www.viajerospiratas.es/feed", paese: "ES", lingua: "es", valuta: "EUR", negozio: "Viajeros Piratas", categoria: "offerte-viaggi-voli" },
  { id: "vakantiepiraten", url: "https://www.vakantiepiraten.nl/feed", paese: "NL", lingua: "nl", valuta: "EUR", negozio: "Vakantiepiraten", categoria: "offerte-viaggi-voli" },
  { id: "wakacyjnipiraci", url: "https://www.wakacyjnipiraci.pl/feed", paese: "PL", lingua: "pl", valuta: "PLN", negozio: "Wakacyjni Piraci", categoria: "offerte-viaggi-voli" },
];

// Categoria dell'app dalle parole (titolo + categoria del feed), in tutte le
// lingue delle fonti. Prima le regole più specifiche: scarpe e animali si
// riconoscono dal titolo anche dentro "Moda" o "Famiglia"; elettronica e
// casa vengono prima di cibo/sport/auto (una TV da Costco o una telecamera
// "outdoor" restano elettronica). Ciò che non combacia va in "novita".
const RULES: [string, RegExp][] = [
  ["offerte-codici-sconto", /\b(voucher|coupon|promo ?code|discount code|code promo|gutschein|rabattcode|codice sconto|c[oó]digo (de )?descuento|cup[oó]n|kortingscode|kod rabatowy|kupon)\b/i],
  ["offerte-scarpe", /\b(shoes?|sneakers?|trainers|boots?|sandal[se]?|schuhe?|stiefel|chaussures?|baskets|bottes|zapat(o|os|illas)|botas|scarpe|stivali|sandali|schoenen|laarzen|buty|obuwie|trampki|air max|air force|jordan|new balance|asics|skechers|crocs|birkenstock|dr\.? ?martens|timberland|converse|vans)\b/i],
  ["offerte-animali", /\b(dogs?|cats?|pets?|puppy|kitten|hunde?|katzen?|haustier|chiens?|chats?|animaux|perros?|gatos?|mascotas?|cane|cani|gatt[oi]|animali|hond(en)?|katten|huisdier|psa?|kot(y|a)?|karma|whiskas|purina|royal canin|felix|pedigree)\b/i],
  ["offerte-viaggi-voli", /\b(travel|flights?|hotels?|holidays?|vacation|cruise|reisen?|fl[uü]ge?|urlaub|voyages?|vols?|s[eé]jour|viajes?|vuelos?|hoteles|viagg[io]|voli|vacanz[ae]|reizen|vakantie|vlucht(en)?|podr[oó]ż|loty|wakacje|ryanair|easyjet|booking\.com|airbnb|trenitalia|italo|flixbus)\b/i],
  ["offerte-bambini-giocattoli", /\b(family & kids|famil(y|ie|ia|le)|kids?|children|baby|toys?|lego|playmobil|barbie|hot wheels|spielzeug|kinder|jouets?|enfants?|b[eé]b[eé]|juguetes?|ni[nñ]os|beb[eé]|giocattol[io]|bambin[io]|neonat[io]|speelgoed|kinderen|zabawk[ai]|dzieci|dla dzieci)\b/i],
  ["offerte-bellezza-cura-persona", /\b(health & beauty|beauty|skincare|make-?up|perfume|parfum|fragrance|shaver|razor|toothbrush|oral-b|philips one|sch[oö]nheit|gesundheit|kosmetik|rasierer|cosm[eé]tiques?|sant[eé]|rasoir|salud y belleza|belleza|cosm[eé]tica|afeitadora|bellezza|profum[oi]|cosmetic[io]|rasoio|gezondheid|verzorging|uroda|zdrowie|perfumy|kosmetyki)\b/i],
  ["offerte-elettronica", /\b(electronics?|elektronik[a]?|high-tech|tech|gaming|games?|console|playstation|ps5|xbox|nintendo|switch|smartphones?|iphone|samsung|pixel|laptops?|notebook|tablets?|ipad|macbook|tv|television|monitor|headphones?|earbuds|airpods|kopfh[oö]rer|casque|[eé]couteurs|auriculares|cuffie|auricolari|koptelefoon|s[lł]uchawki|ssd|gpu|rtx|ram|pc|computer|ordinateur|ordenador|smartwatch|camera|kamera|appareil photo|c[aá]mara|fotocamera|drone|router|elettronica|electr[oó]nica|elektronica|jeux|juegos|videogioc(o|hi)|gry|steam|kindle|echo|alexa|fire tv|chromecast|anker|xiaomi|lenovo|asus|lg|sony|bose|jbl)\b/i],
  ["offerte-casa-arredamento", /\b(home & living|home|kitchen|furniture|mattress|vacuum|robot vacuum|air fryer|coffee machine|espresso machine|macchina (da|del) caff[eè]|kaffeevollautomat|cafetera|machine [aà] caf[eé]|appliances?|washing machine|dishwasher|bedding|wohnen|haushalt|k[uü]che|m[oö]bel|matratze|staubsauger|waschmaschine|maison|cuisine|meubles?|matelas|aspirateur|hogar|cocina|muebles?|colch[oó]n|aspirador(a)?|casa|cucina|mobil[ei]|materasso|aspirapolvere|lavatrice|lavastoviglie|friggitrice|wonen|keuken|meubels|matras|stofzuiger|dom|kuchnia|meble|materac|odkurzacz|ikea|dyson|roborock|dreame|ecovacs|nespresso|de'?longhi)\b/i],
  ["offerte-fai-da-te-giardino", /\b(garden|diy|tools?|drill|lawn ?mower|garten|baumarkt|werkzeug|akkuschrauber|bohrer|rasenm[aä]her|jardin|jard[ií]n|bricolage|bricolaje|outils?|herramientas?|taladro|perceuse|tondeuse|cortac[eé]sped|giardin[oa]ggio|giardino|fai da te|utensil[ei]|trapano|tagliaerba|tuin|doe-het-zelf|gereedschap|boormachine|ogr[oó]d|majsterkowanie|narz[eę]dzia|wiertarka|bosch professional|makita|dewalt|einhell|parkside|ryobi|milwaukee)\b/i],
  ["offerte-sport-outdoor", /\b(sports?|fitness|gym|bikes?|bicycle|cycling|camping|hiking|running|fahrrad|wandern|v[eé]lo|randonn[eé]e|deportes?|aire libre|bicicleta|senderismo|sport|bici(clett[ae])?|palestra|trekking|campeggio|fiets(en)?|kamperen|rower|turystyka|si[lł]ownia|garmin|decathlon)\b/i],
  ["offerte-auto-moto", /\b(car|cars|motorcycle|motorbike|tyres?|tires?|dashcam|auto|autos|motorrad|reifen|moto|pneus?|neum[aá]ticos|pneumatic[io]|casco|helmet|helm|motor|opony|motoryzacja|samoch[oó]d)\b/i],
  ["offerte-cibo-supermercati", /\b(groceries|grocery|food|drinks?|snacks?|coffee|beer|wine|whisky|gin|chocolate|lebensmittel|getr[aä]nke|kaffee|bier|wein|[eé]picerie|courses|boissons?|caf[eé]|bi[eè]re|vin|supermercado|alimentaci[oó]n|bebidas?|cerveza|vino|supermercat[io]|spesa|cibo|bevand[ae]|birra|boodschappen|eten|drinken|koffie|spo[zż]ywcze|jedzenie|kawa|piwo)\b/i],
  ["offerte-abbigliamento", /\b(fashion|clothing|clothes|jackets?|coats?|jeans|hoodies?|t-?shirts?|shirts?|polo|sweaters?|pullover|socks|underwear|dress(es)?|mode|bekleidung|jacke|kleidung|v[eê]tements?|veste|manteau|moda|ropa|chaqueta|abrigo|abbigliamento|giacca|cappotto|felpa|kleding|jas|odzie[zż]|kurtka|zara|h&m|uniqlo|levi'?s|the north face|tommy hilfiger|ralph lauren)\b/i],
];

function categorize(text: string): string {
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  return "novita";
}

// Contratti, assicurazioni, finanza, abbonamenti telefonici: non sono
// "offerte" da vetrina (e cambiano da persona a persona) — fuori.
const SKIP = /\b(broadband|phone contracts?|sim only|insurance|finance|credit card|vertr[aä]ge|versicherung|finanzen|kredit|forfait|assurance|banque|seguros?|tarifa m[oó]vil|banco|assicurazion[ei]|mutuo|contratti|verzekering|ubezpieczeni[ea]|abonament)\b/i;

function json(body: unknown, status: number, origin: string | null) {
  const o = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": o,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
      "Content-Type": "application/json",
    },
  });
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

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function cdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}
function text(s: string | undefined, max: number): string {
  if (!s) return "";
  // Due passaggi di decode: dealnews manda l'HTML già "escapato" una volta.
  const html = decode(cdata(s));
  return decode(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
function tag(block: string, name: string): string | undefined {
  return block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1];
}
function attr(block: string, tagName: string, attrName: string): string | undefined {
  const m = block.match(new RegExp(`<${tagName}\\b[^>]*\\b${attrName}=["']([^"']+)["']`, "i"));
  return m ? decode(m[1]) : undefined;
}

// Prezzo da "25,37€", "£134.99", "$157", "123,94zł", "€22,27", "$1,299.00".
function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  let n = m[1].replace(/\s/g, "");
  const lastSep = Math.max(n.lastIndexOf(","), n.lastIndexOf("."));
  if (lastSep !== -1 && n.length - lastSep - 1 <= 2) {
    n = n.slice(0, lastSep).replace(/[.,]/g, "") + "." + n.slice(lastSep + 1);
  } else {
    n = n.replace(/[.,]/g, "");
  }
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 && v < 1_000_000 ? Math.round(v * 100) / 100 : null;
}

// Prezzo dal titolo ("... a 79,91€", "$9.98"), saltando gli importi che
// sono sconti: "-400€", "100€ di sconto", "$20 off", "fino al 50%".
function titlePrice(titolo: string): number | null {
  for (const m of titolo.matchAll(/[$£€]\s?\d[\d.,]*|\d[\d.,]*\s?(?:€|zł)/g)) {
    const before = titolo.slice(Math.max(0, m.index! - 2), m.index);
    const after = titolo.slice(m.index! + m[0].length, m.index! + m[0].length + 16);
    if (/[-−]\s*$/.test(before) || /^\s*(off|di sconto|de sconto|de descuento|de r[ée]duction|rabatt|korting|zni[zż]ki|taniej)/i.test(after)) continue;
    return parsePrice(m[0]);
  }
  return null;
}

function httpsUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(decode(raw.trim()));
    return u.protocol === "https:" ? u.toString().slice(0, 600) : null;
  } catch {
    return null;
  }
}

// Immagini: la rete Pepper manda la miniatura 150x150, lo stesso file esiste
// a 300x300; dealnews ?h=125&w=125 si ingrandisce dai parametri.
function bigger(img: string | null): string | null {
  if (!img) return null;
  return img.replace(/\/re\/150x150\/qt\/\d+\//, "/re/300x300/qt/60/").replace(/([?&])h=125&w=125/, "$1h=300&w=300");
}

type Parsed = { ref: string; titolo: string; descrizione: string; url: string; immagine: string | null; negozio: string; prezzo: number | null; categoriaFeed: string; scade: string | null };

function parseFeed(xml: string, src: Source): Parsed[] {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const out: Parsed[] = [];
  for (const b of blocks.slice(0, MAX_ITEMS_PER_FEED)) {
    // Pepper mette "205° - " (temperatura) davanti al titolo.
    const titolo = text(tag(b, "title"), 160).replace(/^-?\d+°\s*-\s*/, "");
    const link = httpsUrl(cdata(tag(b, "link") ?? "") || attr(b, "link", "href"));
    if (titolo.length < 3 || !link) continue;
    const guid = text(tag(b, "guid") ?? tag(b, "id"), 300) || link;
    const content = tag(b, "content:encoded") ?? tag(b, "content") ?? "";
    const desc = tag(b, "description") ?? tag(b, "summary") ?? "";
    const imgInHtml = decode(cdata(desc + content)).match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
    const immagine = bigger(
      httpsUrl(attr(b, "media:content", "url")) ??
        httpsUrl(attr(b, "media:thumbnail", "url")) ??
        httpsUrl(attr(b, "enclosure", "url")) ??
        httpsUrl(attr(b, "ozb:meta", "image")) ??
        httpsUrl(imgInHtml),
    );
    const categorie = [...b.matchAll(/<category\b[^>]*?(?:term=["']([^"']+)["'][^>]*)?(?:\/>|>([\s\S]*?)<\/category>)/gi)]
      .map((m) => text(m[2] ?? m[1] ?? "", 80))
      .filter(Boolean)
      .join(" | ");
    const merchant = attr(b, "pepper:merchant", "name");
    const prezzoRaw = attr(b, "pepper:merchant", "price");
    // Negozio vero quando il feed lo dice (Pepper, RFD "[Amazon.ca] ...",
    // OzBargain "... @ negozio"), altrimenti il sito della fonte.
    const negozio = (merchant || titolo.match(/^\[([^\]]{2,40})\]/)?.[1] || titolo.match(/@\s*([^@]{2,40})$/)?.[1] || src.negozio).trim().slice(0, 80);
    const expiry = attr(b, "ozb:meta", "expiry");
    const scade = expiry && !Number.isNaN(Date.parse(expiry)) ? new Date(expiry).toISOString() : null;
    out.push({
      ref: `rss:${src.paese}:${guid}`.slice(0, 300),
      titolo,
      descrizione: text(desc || content, 300),
      url: link,
      immagine,
      negozio,
      prezzo: parsePrice(prezzoRaw) ?? titlePrice(titolo),
      categoriaFeed: categorie,
      scade,
    });
  }
  return out;
}

async function fetchFeed(src: Source): Promise<{ src: Source; items: Parsed[]; error?: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(src.url, { signal: ctrl.signal, headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
    if (!res.ok) {
      await res.body?.cancel();
      return { src, items: [], error: `${src.id} ${res.status}` };
    }
    return { src, items: parseFeed(await res.text(), src) };
  } catch (e) {
    return { src, items: [], error: `${src.id}: ${(e as Error).message.slice(0, 80)}` };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return json("ok", 200, origin);
  if (req.method !== "POST") return json({ error: "Usa POST" }, 405, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const authHeader = req.headers.get("authorization") || "";
  const role = jwtRole(authHeader);
  let force = false;
  if (role === "authenticated") {
    const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: isStaff } = await asUser.rpc("is_owner_or_moderator");
    if (!isStaff) return json({ error: "Solo owner e moderatori possono lanciare il bot" }, 403, origin);
    force = true;
  } else if (role !== "anon" && role !== "service_role") {
    return json({ error: "Non autorizzato" }, 401, origin);
  }

  const { data: lastRuns } = await admin
    .from("events_bot_runs")
    .select("started_at, finished_at")
    .eq("categoria", RUN_KEY)
    .order("started_at", { ascending: false })
    .limit(1);
  const last = lastRuns?.[0];
  if (last && !last.finished_at && Date.now() - Date.parse(last.started_at) < RUN_LOCK_MINUTES * 60_000) {
    return json({ error: "Un giro è già in corso", skipped: true }, 409, origin);
  }
  if (!force && last && Date.now() - Date.parse(last.started_at) < MIN_MINUTES_BETWEEN_RUNS * 60_000) {
    return json({ ok: true, skipped: true }, 200, origin);
  }

  const { data: run, error: runErr } = await admin
    .from("events_bot_runs")
    .insert({ avviato_da: role === "authenticated" ? "pannello" : "cron", categoria: RUN_KEY })
    .select("id")
    .single();
  if (runErr || !run) return json({ error: runErr?.message ?? "Impossibile registrare il giro" }, 500, origin);
  const finish = async (patch: Record<string, unknown>) => {
    await admin.from("events_bot_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("id", run.id);
    return json({ ok: true, run_id: run.id, ...patch }, 200, origin);
  };

  const nowIso = new Date().toISOString();
  await admin.from("vetrina_deals").update({ stato: "scaduta", updated_at: nowIso }).eq("fonte", "feed").eq("stato", "attiva").lt("scade_il", nowIso);

  const results = await Promise.all(SOURCES.map(fetchFeed));
  const errori = results.filter((r) => r.error).map((r) => r.error!);

  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let scartati = 0;
  for (const { src, items } of results) {
    for (const it of items) {
      const words = `${it.categoriaFeed} ${it.titolo}`;
      if (seen.has(it.ref) || SKIP.test(words)) {
        scartati += 1;
        continue;
      }
      seen.add(it.ref);
      rows.push({
        fonte_ref: it.ref,
        categoria: src.categoria ?? categorize(`${it.titolo} | ${it.categoriaFeed}`),
        titolo: it.titolo,
        negozio: it.negozio,
        descrizione: it.descrizione || null,
        url: it.url,
        immagine: it.immagine,
        prezzo: it.prezzo,
        valuta: src.valuta,
        online: true,
        paese: src.paese,
        lingua: src.lingua,
        scade_il: it.scade ?? new Date(Date.now() + DEFAULT_TTL_DAYS * 86_400_000).toISOString(),
        stato: "attiva",
        updated_at: nowIso,
      });
    }
  }

  // Già presenti (stesso fonte_ref): si aggiornano testo, categoria e
  // scadenza sulla stessa riga, così l'offerta ancora nel feed resta
  // visibile e mantiene voti e commenti.
  // Gruppi piccoli: i fonte_ref sono link lunghi e 200 insieme superano la
  // lunghezza massima dell'URL della richiesta (risposta vuota = tutto
  // sembrava nuovo e l'insert andava contro l'indice unico).
  const existing = new Set<string>();
  for (let i = 0; i < rows.length; i += 25) {
    const refs = rows.slice(i, i + 25).map((r) => r.fonte_ref as string);
    const { data, error } = await admin.from("vetrina_deals").select("fonte_ref").eq("fonte", "feed").in("fonte_ref", refs);
    if (error) return finish({ inseriti: 0, aggiornati: 0, scartati, errore: `lettura esistenti: ${error.message.slice(0, 120)}` });
    (data ?? []).forEach((r) => existing.add(r.fonte_ref));
  }
  const nuovi = rows.filter((r) => !existing.has(r.fonte_ref as string)).map((r) => ({ ...r, fonte: "feed", author_id: null }));
  const vecchi = rows.filter((r) => existing.has(r.fonte_ref as string));

  let inseriti = 0;
  for (let i = 0; i < nuovi.length; i += 100) {
    const chunk = nuovi.slice(i, i + 100);
    const { error } = await admin.from("vetrina_deals").insert(chunk);
    if (error) errori.push(`insert: ${error.message.slice(0, 120)}`);
    else inseriti += chunk.length;
  }
  let aggiornati = 0;
  for (const r of vecchi) {
    const { error } = await admin
      .from("vetrina_deals")
      .update({ categoria: r.categoria, titolo: r.titolo, descrizione: r.descrizione, immagine: r.immagine, prezzo: r.prezzo, scade_il: r.scade_il, stato: "attiva", updated_at: nowIso })
      .eq("fonte", "feed")
      .eq("fonte_ref", r.fonte_ref as string)
      .neq("stato", "rimossa");
    if (!error) aggiornati += 1;
  }

  return finish({ inseriti, aggiornati, scartati, errore: errori.length ? errori.slice(0, 5).join(" | ") : null });
});
