// Configurazione unica per categoria del mondo Annunci: da questa stessa
// lista si generano sia i filtri (colonna sinistra/bottom sheet, vedi
// AnnunciFilters.jsx) sia il form di pubblicazione (passo 2 del wizard,
// vedi PublishAnnuncioWizard.jsx) — un solo posto dove aggiungere o
// togliere un campo, mai due copie da tenere allineate a mano.
//
// Ogni campo: { key, label, type, options?, unit?, forRent? }
// - key: nome della chiave dentro annunci_listings.dettagli (snake_case,
//   inglese, come richiesto dalla specifica: make, model, year...).
// - type: 'select' (scelta singola nel form, multi-scelta nei filtri),
//   'number' (un numero nel form, un min/max nei filtri), 'year' (anno
//   scelto da tendina nel form, min/max nei filtri), 'date' (mese + anno
//   da tendina, salvato "YYYY-MM"), 'boolean', 'text'.
// - options: per i campi 'select', { value, label }[].
// - suggest: per i campi 'text', 'make' (marche della categoria) o
//   'model' (modelli della marca scritta nel campo make) — suggerimenti
//   dalle prime due lettere, vedi data/annunciBrands.js.
// - forRent: se true il campo si applica solo agli annunci di tipo
//   affitto (es. durata minima, animali ammessi).
export const ANNUNCI_CATEGORIES_META = {
  auto: {
    label: 'Auto',
    icon: '🚗',
    fields: [
      { key: 'make', label: 'Marca', type: 'text', suggest: 'make' },
      { key: 'model', label: 'Modello', type: 'text', suggest: 'model' },
      { key: 'year', label: 'Anno', type: 'year' },
      { key: 'km', label: 'Km', type: 'number', unit: 'km' },
      {
        key: 'fuel',
        label: 'Alimentazione',
        type: 'select',
        options: [
          { value: 'benzina', label: 'Benzina' },
          { value: 'diesel', label: 'Diesel' },
          { value: 'gpl', label: 'GPL' },
          { value: 'metano', label: 'Metano' },
          { value: 'ibrida', label: 'Ibrida' },
          { value: 'elettrica', label: 'Elettrica' },
        ],
      },
      {
        key: 'gearbox',
        label: 'Cambio',
        type: 'select',
        options: [
          { value: 'manuale', label: 'Manuale' },
          { value: 'automatico', label: 'Automatico' },
        ],
      },
      { key: 'power_hp', label: 'Potenza', type: 'number', unit: 'CV' },
      {
        key: 'body',
        label: 'Carrozzeria',
        type: 'select',
        options: [
          { value: 'berlina', label: 'Berlina' },
          { value: 'suv', label: 'SUV' },
          { value: 'citycar', label: 'Citycar' },
          { value: 'station_wagon', label: 'Station wagon' },
          { value: 'coupe', label: 'Coupé' },
          { value: 'cabrio', label: 'Cabrio' },
          { value: 'monovolume', label: 'Monovolume' },
        ],
      },
      { key: 'color', label: 'Colore', type: 'text' },
      { key: 'doors', label: 'N. porte', type: 'number' },
      { key: 'neopatentati', label: 'Adatta ai neopatentati', type: 'boolean' },
      { key: 'owners', label: 'Proprietari', type: 'number' },
    ],
  },
  moto: {
    label: 'Moto',
    icon: '🏍️',
    fields: [
      { key: 'make', label: 'Marca', type: 'text', suggest: 'make' },
      { key: 'model', label: 'Modello', type: 'text', suggest: 'model' },
      {
        key: 'moto_type',
        label: 'Tipo',
        type: 'select',
        options: [
          { value: 'naked', label: 'Naked' },
          { value: 'sportiva', label: 'Sportiva' },
          { value: 'touring', label: 'Touring' },
          { value: 'enduro', label: 'Enduro' },
          { value: 'scooter', label: 'Scooter' },
          { value: 'custom', label: 'Custom' },
          { value: 'cross', label: 'Cross' },
        ],
      },
      { key: 'displacement_cc', label: 'Cilindrata', type: 'number', unit: 'cc' },
      { key: 'year', label: 'Anno', type: 'year' },
      { key: 'km', label: 'Km', type: 'number', unit: 'km' },
      {
        key: 'license',
        label: 'Patente',
        type: 'select',
        options: [
          { value: 'AM', label: 'AM' },
          { value: 'A1', label: 'A1' },
          { value: 'A2', label: 'A2' },
          { value: 'A', label: 'A' },
        ],
      },
    ],
  },
  biciclette: {
    label: 'Biciclette',
    icon: '🚲',
    fields: [
      {
        key: 'bike_type',
        label: 'Tipo',
        type: 'select',
        options: [
          { value: 'citta', label: 'Città' },
          { value: 'corsa', label: 'Corsa' },
          { value: 'mtb', label: 'MTB' },
          { value: 'gravel', label: 'Gravel' },
          { value: 'ebike', label: 'E-bike' },
          { value: 'bambino', label: 'Bambino' },
        ],
      },
      { key: 'frame_size', label: 'Taglia telaio', type: 'text' },
      {
        key: 'material',
        label: 'Materiale',
        type: 'select',
        options: [
          { value: 'alluminio', label: 'Alluminio' },
          { value: 'carbonio', label: 'Carbonio' },
          { value: 'acciaio', label: 'Acciaio' },
          { value: 'titanio', label: 'Titanio' },
        ],
      },
      { key: 'make', label: 'Marca', type: 'text', suggest: 'make' },
      {
        key: 'gearbox',
        label: 'Cambio',
        type: 'select',
        options: [
          { value: 'meccanico', label: 'Meccanico' },
          { value: 'elettronico', label: 'Elettronico' },
          { value: 'nessuno', label: 'A scatto fisso / nessuno' },
        ],
      },
      { key: 'ebike', label: 'E-bike', type: 'boolean' },
    ],
  },
  barche: {
    label: 'Barche',
    icon: '⛵',
    fields: [
      {
        key: 'boat_type',
        label: 'Tipo',
        type: 'select',
        options: [
          { value: 'gommone', label: 'Gommone' },
          { value: 'motoscafo', label: 'Motoscafo' },
          { value: 'vela', label: 'Vela' },
          { value: 'yacht', label: 'Yacht' },
          { value: 'moto_acqua', label: "Moto d'acqua" },
        ],
      },
      { key: 'length_m', label: 'Lunghezza', type: 'number', unit: 'm' },
      { key: 'year', label: 'Anno', type: 'year' },
      { key: 'engine_power_hp', label: 'Motore/potenza', type: 'number', unit: 'CV' },
      { key: 'boat_license', label: 'Patente nautica richiesta', type: 'boolean' },
      { key: 'berth_included', label: 'Posto barca incluso', type: 'boolean' },
    ],
  },
  case: {
    label: 'Case',
    icon: '🏠',
    fields: [
      {
        key: 'property_type',
        label: 'Tipo',
        type: 'select',
        options: [
          { value: 'appartamento', label: 'Appartamento' },
          { value: 'villa', label: 'Villa' },
          { value: 'attico', label: 'Attico' },
          { value: 'monolocale', label: 'Monolocale' },
          { value: 'box_garage', label: 'Box/Garage' },
          { value: 'terreno', label: 'Terreno' },
          { value: 'ufficio_negozio', label: 'Ufficio/Negozio' },
        ],
      },
      { key: 'sqm', label: 'Metri quadri', type: 'number', unit: 'm²' },
      { key: 'rooms', label: 'Locali', type: 'number' },
      { key: 'bathrooms', label: 'Bagni', type: 'number' },
      { key: 'floor', label: 'Piano', type: 'text' },
      { key: 'elevator', label: 'Ascensore', type: 'boolean' },
      { key: 'furnished', label: 'Arredato', type: 'boolean' },
      {
        key: 'energy_class',
        label: 'Classe energetica',
        type: 'select',
        options: ['A4', 'A3', 'A2', 'A1', 'B', 'C', 'D', 'E', 'F', 'G'].map((v) => ({ value: v, label: v })),
      },
      { key: 'balcony', label: 'Balcone/Terrazzo', type: 'boolean' },
      { key: 'garden', label: 'Giardino', type: 'boolean' },
      { key: 'parking', label: 'Posto auto', type: 'boolean' },
      { key: 'condo_fees', label: 'Spese condominiali', type: 'number', unit: '€/mese' },
      { key: 'min_lease_months', label: 'Durata minima', type: 'number', unit: 'mesi', forRent: true },
      { key: 'pets_allowed', label: 'Animali ammessi', type: 'boolean', forRent: true },
      { key: 'available_from', label: 'Disponibile dal', type: 'date', forRent: true },
    ],
  },
  abbigliamento: {
    label: 'Abbigliamento & Accessori',
    icon: '👕',
    fields: [
      {
        key: 'clothing_type',
        label: 'Tipo',
        type: 'select',
        options: [
          { value: 'abbigliamento', label: 'Abbigliamento' },
          { value: 'scarpe', label: 'Scarpe' },
          { value: 'borse', label: 'Borse' },
          { value: 'orologi_gioielli', label: 'Orologi & Gioielli' },
          { value: 'accessori', label: 'Altri accessori' },
        ],
      },
      { key: 'brand', label: 'Marca', type: 'text', suggest: 'make' },
      {
        key: 'gender',
        label: 'Genere',
        type: 'select',
        options: [
          { value: 'uomo', label: 'Uomo' },
          { value: 'donna', label: 'Donna' },
          { value: 'unisex', label: 'Unisex' },
          { value: 'bambino', label: 'Bambino/a' },
        ],
      },
      { key: 'size', label: 'Taglia', type: 'text' },
      {
        key: 'condition',
        label: 'Condizioni',
        type: 'select',
        options: [
          { value: 'nuovo_con_cartellino', label: 'Nuovo con cartellino' },
          { value: 'nuovo_senza_cartellino', label: 'Nuovo senza cartellino' },
          { value: 'ottimo', label: 'Ottimo' },
          { value: 'buono', label: 'Buono' },
          { value: 'discreto', label: 'Discreto' },
        ],
      },
    ],
  },
  'oggetti-vari': {
    label: 'Oggetti vari',
    icon: '📦',
    fields: [
      { key: 'item_category', label: 'Categoria', type: 'text' },
      { key: 'brand', label: 'Marca (facoltativo)', type: 'text', suggest: 'make' },
      {
        key: 'condition',
        label: 'Condizioni',
        type: 'select',
        options: [
          { value: 'nuovo', label: 'Nuovo' },
          { value: 'ottimo', label: 'Ottimo' },
          { value: 'buono', label: 'Buono' },
          { value: 'da_riparare', label: 'Da riparare' },
        ],
      },
    ],
  },
};

// Campi 'date' (mese + anno da tendina, salvati "YYYY-MM"): nomi dei mesi
// per le tendine e per la scheda dell'annuncio.
export const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

export function formatMonthYear(value) {
  const m = typeof value === 'string' && value.match(/^(\d{4})-(\d{2})$/);
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${m[1]}` : value;
}

export const ANNUNCI_CATEGORY_IDS = Object.keys(ANNUNCI_CATEGORIES_META);

export function fieldsForCategory(categoria, tipo) {
  const meta = ANNUNCI_CATEGORIES_META[categoria];
  if (!meta) return [];
  return meta.fields.filter((f) => !f.forRent || tipo === 'affitto');
}
