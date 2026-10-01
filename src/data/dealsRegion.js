// Paese per le offerte del mondo Vetrina e per le "pubblicità" fatte di
// offerte (getHouseDeal): chi sta a Roma vede offerte italiane, chi sta a
// New York offerte americane. Le offerte del bot hanno vetrina_deals.paese
// (ISO-2, vedi supabase/functions/deals-rss-bot); quelle degli utenti non
// ce l'hanno e si vedono ovunque.
//
// Ordine: 1) il paese della città scelta nel filtro "Dove" di Impostazioni
// (rb-location-filters.paese, da GeoNames); 2) il fuso orario del
// dispositivo; 3) la regione della lingua del browser (en-US → US).
// Se in quel paese non c'è ancora nessuna fonte di offerte si usa il paese
// "vicino" (stessa lingua o stessa zona, DEAL_COUNTRY_FALLBACK) e, come
// ultima spiaggia, gli Stati Uniti.

// Paesi con almeno una fonte nel bot (tenere allineato con SOURCES in
// supabase/functions/deals-rss-bot/index.ts).
export const DEAL_COUNTRIES = ['IT', 'GB', 'US', 'CA', 'AU', 'DE', 'AT', 'FR', 'ES', 'MX', 'NL', 'PL'];

const DEAL_COUNTRY_FALLBACK = {
  SM: 'IT', VA: 'IT', MT: 'IT',
  IE: 'GB', IM: 'GB', JE: 'GB', GG: 'GB',
  NZ: 'AU',
  CH: 'DE', LI: 'DE', LU: 'FR', BE: 'FR', MC: 'FR',
  PT: 'ES', AD: 'ES',
  AR: 'MX', CL: 'MX', CO: 'MX', PE: 'MX', VE: 'MX', EC: 'MX', BO: 'MX', PY: 'MX', UY: 'MX', GT: 'MX', CR: 'MX', PA: 'MX', DO: 'MX', CU: 'MX', HN: 'MX', SV: 'MX', NI: 'MX', PR: 'US',
  CZ: 'PL', SK: 'PL', LT: 'PL',
};

// Fusi orari più comuni → paese (solo quelli dove il fuso non è ambiguo).
const TIMEZONE_COUNTRY = {
  'Europe/Rome': 'IT', 'Europe/San_Marino': 'SM', 'Europe/Vatican': 'VA', 'Europe/Malta': 'MT',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Berlin': 'DE', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH',
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Luxembourg': 'LU', 'Europe/Monaco': 'MC',
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Europe/Lisbon': 'PT',
  'Europe/Amsterdam': 'NL', 'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ',
  'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Tijuana': 'MX', 'America/Cancun': 'MX',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/Montreal': 'CA', 'America/Regina': 'CA', 'America/St_Johns': 'CA',
  'America/Buenos_Aires': 'AR', 'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'Pacific/Auckland': 'NZ',
};

function countryFromTimezone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (TIMEZONE_COUNTRY[tz]) return TIMEZONE_COUNTRY[tz];
    if (tz.startsWith('Australia/')) return 'AU';
    // Gli altri fusi "America/..." di Stati Uniti (New_York, Chicago, Denver,
    // Los_Angeles, Phoenix, Anchorage, Detroit, Indiana/...).
    if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana|Kentucky|North_Dakota|Juneau|Adak)/.test(tz) || tz === 'Pacific/Honolulu') return 'US';
  } catch {
    // Intl non disponibile: si passa alla lingua.
  }
  return '';
}

function countryFromBrowserLanguage() {
  try {
    const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
    for (const l of langs) {
      const region = String(l ?? '').split('-')[1];
      if (region && /^[A-Za-z]{2}$/.test(region)) return region.toUpperCase();
    }
  } catch {
    // niente navigator (test/SSR)
  }
  return '';
}

function storedLocationCountry() {
  try {
    const f = JSON.parse(localStorage.getItem('rb-location-filters') || 'null');
    const c = String(f?.paese ?? '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(c) ? c : '';
  } catch {
    return '';
  }
}

// locationFilters facoltativo: se chi chiama ha già lo stato aggiornato
// (App → VetrinaOfferteColumn) vale quello, altrimenti si legge quello
// salvato (SponsorCard in giro per l'app non riceve il filtro).
export function getDealCountry(locationFilters) {
  const fromFilter = String(locationFilters?.paese ?? '').trim().toUpperCase();
  const raw = (/^[A-Z]{2}$/.test(fromFilter) ? fromFilter : '') || storedLocationCountry() || countryFromTimezone() || countryFromBrowserLanguage();
  if (DEAL_COUNTRIES.includes(raw)) return raw;
  return DEAL_COUNTRY_FALLBACK[raw] || 'US';
}

// ---------------------------------------------------------------------------
// Interessi: le "pubblicità" fatte di offerte seguono quello che la persona
// cerca e guarda nella Vetrina (categorie aperte, parole cercate, offerte
// cliccate). Restano SOLO su questo dispositivo (localStorage), non vanno
// al server e non servono a profilare nessuno: si cancellano con i dati del
// sito.
const INTERESTS_KEY = 'rb-deal-interests';
const MAX_TERMS = 20;

function loadInterests() {
  try {
    const v = JSON.parse(localStorage.getItem(INTERESTS_KEY) || 'null');
    return { categorie: v?.categorie ?? {}, termini: Array.isArray(v?.termini) ? v.termini : [] };
  } catch {
    return { categorie: {}, termini: [] };
  }
}

function saveInterests(v) {
  try {
    localStorage.setItem(INTERESTS_KEY, JSON.stringify(v));
  } catch {
    // storage pieno o bloccato: gli interessi non sono indispensabili
  }
}

export function recordDealInterest({ categoria, termine, peso = 1 } = {}) {
  const v = loadInterests();
  if (categoria && categoria !== 'novita') v.categorie[categoria] = (v.categorie[categoria] ?? 0) + peso;
  const t = String(termine ?? '').trim().toLowerCase();
  if (t.length >= 3) v.termini = [t, ...v.termini.filter((x) => x !== t)].slice(0, MAX_TERMS);
  saveInterests(v);
}

// Punteggio di un'offerta per chi guarda: categoria aperta spesso e parole
// cercate di recente contano di più. Mai zero, così anche le offerte fuori
// dagli interessi escono ogni tanto.
export function dealInterestScore(deal) {
  const { categorie, termini } = loadInterests();
  let score = 1 + Math.min(categorie[deal.categoria] ?? 0, 20);
  const testo = `${deal.titolo ?? ''} ${deal.negozio ?? ''} ${deal.descrizione ?? ''}`.toLowerCase();
  termini.forEach((t, i) => {
    if (testo.includes(t)) score += 10 - Math.min(i, 8);
  });
  return score;
}
