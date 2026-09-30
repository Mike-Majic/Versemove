// Anagrafica delle città usate nei dati finti: coordinate per far "volare" il
// mappamondo quando si cerca una città, più regione/continente per i filtri.
export const CITIES = {
  Roma: { lat: 41.9028, lng: 12.4964, region: 'Lazio', continent: 'Europa' },
  Ardea: { lat: 41.615, lng: 12.5555, region: 'Lazio', continent: 'Europa' },
  Milano: { lat: 45.4642, lng: 9.19, region: 'Lombardia', continent: 'Europa' },
  Napoli: { lat: 40.8518, lng: 14.2681, region: 'Campania', continent: 'Europa' },
  Torino: { lat: 45.0703, lng: 7.6869, region: 'Piemonte', continent: 'Europa' },
  Bologna: { lat: 44.4949, lng: 11.3426, region: 'Emilia-Romagna', continent: 'Europa' },
  Firenze: { lat: 43.7696, lng: 11.2558, region: 'Toscana', continent: 'Europa' },
  Bari: { lat: 41.1177, lng: 16.8719, region: 'Puglia', continent: 'Europa' },
  Palermo: { lat: 38.1157, lng: 13.3615, region: 'Sicilia', continent: 'Europa' },
  Genova: { lat: 44.4056, lng: 8.9463, region: 'Liguria', continent: 'Europa' },
  Verona: { lat: 45.4384, lng: 10.9916, region: 'Veneto', continent: 'Europa' },
  Londra: { lat: 51.5072, lng: -0.1276, region: 'Regno Unito', continent: 'Europa' },
  Berlino: { lat: 52.52, lng: 13.405, region: 'Germania', continent: 'Europa' },
  Parigi: { lat: 48.8566, lng: 2.3522, region: 'Francia', continent: 'Europa' },
  Madrid: { lat: 40.4168, lng: -3.7038, region: 'Spagna', continent: 'Europa' },
  Lisbona: { lat: 38.7223, lng: -9.1393, region: 'Portogallo', continent: 'Europa' },
  'New York': { lat: 40.7128, lng: -74.006, region: 'Stati Uniti', continent: 'Nord America' },
  Tokyo: { lat: 35.6762, lng: 139.6503, region: 'Giappone', continent: 'Asia' },
  Dubai: { lat: 25.2048, lng: 55.2708, region: 'Emirati Arabi Uniti', continent: 'Asia' },
};

export const CONTINENTS = ['Europa', 'Nord America', 'Sud America', 'Asia', 'Africa', 'Oceania'];

// Valore massimo dello slider "Distanza" nelle Impostazioni: a differenza
// di un valore intermedio, non significa "entro 500 km" ma "nessun
// limite, considera tutto il mondo" — chi usa il filtro lo controlla con
// isUnlimitedDistance() invece di confrontare il numero direttamente.
export const MAX_DISTANCE_KM = 500;

export function isUnlimitedDistance(maxDistanceKm) {
  return maxDistanceKm >= MAX_DISTANCE_KM;
}

export const REGIONS = Object.values(CITIES)
  .map((c) => c.region)
  .filter((r, i, arr) => arr.indexOf(r) === i)
  .sort((a, b) => a.localeCompare(b));

export function getCityInfo(cityName) {
  return CITIES[cityName] ?? null;
}

// Trova la prima città nota il cui nome combacia (anche parzialmente) con la query digitata.
export function findCityMatch(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = Object.keys(CITIES).find((name) => name.toLowerCase() === q);
  if (exact) return { name: exact, ...CITIES[exact] };
  const partial = Object.keys(CITIES).find((name) => name.toLowerCase().startsWith(q));
  return partial ? { name: partial, ...CITIES[partial] } : null;
}

// Distanza in km tra due coordinate (formula dell'emisenoverso).
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Continente (come in CONTINENTS) di un paese ISO-2: serve ai filtri
// "Continente" per gli utenti veri sul globo (data/globeUsers.js), che
// hanno il paese GeoNames e non stanno nell'anagrafica CITIES qui sopra.
const COUNTRIES_BY_CONTINENT = {
  Europa: 'AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
  'Nord America': 'AG AI AW BB BL BM BQ BS BZ CA CR CU CW DM DO GD GL GP GT HN HT JM KN KY LC MF MQ MS MX NI PA PM PR SV SX TC TT US VC VG VI',
  'Sud America': 'AR BO BR CL CO EC FK GF GY PE PY SR UY VE',
  Asia: 'AE AF AM AZ BD BH BN BT CN GE HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE',
  Africa: 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG EH ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SH SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW',
  Oceania: 'AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV UM VU WF WS',
};
const CONTINENT_OF_COUNTRY = Object.fromEntries(
  Object.entries(COUNTRIES_BY_CONTINENT).flatMap(([continent, codes]) => codes.split(' ').map((c) => [c, continent]))
);

export function continentOfCountry(iso2) {
  return CONTINENT_OF_COUNTRY[String(iso2 ?? '').toUpperCase()] ?? '';
}
