// Etichette italiane del mondo Incontri: un solo file, usato dalla scheda
// del profilo (DatingProfileCard) e dall'editor (DatingProfileEditor). Le
// chiavi sono quelle del server (dating_dettagli_schema, save_dating_profile).

export const GENERI = [
  { id: 'uomo', label: 'Uomo' },
  { id: 'donna', label: 'Donna' },
  { id: 'non_binario', label: 'Non binario' },
];
// "Chi vuoi incontrare": stesse chiavi, al plurale.
export const CERCA_GENERI = [
  { id: 'uomo', label: 'Uomini' },
  { id: 'donna', label: 'Donne' },
  { id: 'non_binario', label: 'Persone non binarie' },
];

export const COSA_CERCA = [
  { id: 'relazione_seria', label: 'Relazione seria' },
  { id: 'qualcosa_di_leggero', label: 'Qualcosa di leggero' },
  { id: 'vediamo', label: 'Vediamo come va' },
  { id: 'amicizia', label: 'Amicizia' },
  { id: 'uscire', label: 'Uscire insieme' },
  { id: 'senza_impegno', label: 'Senza impegno' },
  { id: 'relazione_aperta', label: 'Relazione aperta' },
  { id: 'una_sera', label: 'Una sera' },
];
export const COSA_CERCA_MAX = 3;

export const ZODIACO = {
  ariete: '♈ Ariete',
  toro: '♉ Toro',
  gemelli: '♊ Gemelli',
  cancro: '♋ Cancro',
  leone: '♌ Leone',
  vergine: '♍ Vergine',
  bilancia: '♎ Bilancia',
  scorpione: '♏ Scorpione',
  sagittario: '♐ Sagittario',
  capricorno: '♑ Capricorno',
  acquario: '♒ Acquario',
  pesci: '♓ Pesci',
};

// Dettagli facoltativi, nell'ordine in cui compaiono. multi: quante scelte
// al massimo (assente = una sola).
export const DETTAGLI = [
  {
    key: 'istruzione',
    label: 'Istruzione',
    icon: '🎓',
    values: {
      licenza_media: 'Licenza media',
      diploma_superiore: 'Diploma superiore',
      laurea_triennale: 'Laurea triennale',
      laurea_magistrale: 'Laurea magistrale',
      master: 'Master',
      dottorato: 'Dottorato',
      studio_ancora: 'Sto ancora studiando',
    },
  },
  {
    key: 'piani_famiglia',
    label: 'Famiglia',
    icon: '👶',
    values: {
      voglio_figli: 'Voglio figli',
      non_voglio_figli: 'Non voglio figli',
      ho_figli_ne_voglio: 'Ho figli e ne voglio altri',
      ho_figli_basta: 'Ho figli, mi bastano',
      non_so: 'Non so ancora',
    },
  },
  {
    key: 'stile_comunicazione',
    label: 'Comunicazione',
    icon: '💬',
    multi: 3,
    values: {
      messaggi: 'Messaggi',
      telefonate: 'Telefonate',
      videochiamate: 'Videochiamate',
      di_persona: 'Meglio di persona',
      poco_telefono: 'Poco al telefono',
    },
  },
  {
    key: 'linguaggio_amore',
    label: "Linguaggio d'amore",
    icon: '💞',
    multi: 3,
    values: {
      attenzioni: 'Gesti e attenzioni',
      regali: 'Regali',
      contatto_fisico: 'Contatto fisico',
      complimenti: 'Complimenti',
      tempo_insieme: 'Tempo insieme',
    },
  },
  {
    key: 'animali',
    label: 'Animali',
    icon: '🐾',
    multi: 3,
    values: {
      cane: 'Cane',
      gatto: 'Gatto',
      rettile: 'Rettile',
      uccello: 'Uccello',
      pesce: 'Pesci',
      altro: 'Altro',
      nessuno_ma_li_amo: 'Nessuno, ma li adoro',
      niente_animali: 'Niente animali',
    },
  },
  {
    key: 'alcol',
    label: 'Alcol',
    icon: '🍷',
    values: {
      mai: 'Mai',
      occasioni_speciali: 'Nelle occasioni speciali',
      in_compagnia: 'In compagnia',
      spesso: 'Spesso',
      sobrio: 'Sono astemio/a',
    },
  },
  {
    key: 'fumo',
    label: 'Fumo',
    icon: '🚬',
    values: {
      non_fumo: 'Non fumo',
      in_compagnia: 'In compagnia',
      quando_bevo: 'Quando bevo',
      fumatore: 'Fumo',
      sto_smettendo: 'Sto smettendo',
    },
  },
  {
    key: 'palestra',
    label: 'Palestra',
    icon: '🏋️',
    values: {
      ogni_giorno: 'Ogni giorno',
      spesso: 'Spesso',
      ogni_tanto: 'Ogni tanto',
      mai: 'Mai',
    },
  },
  {
    key: 'social_media',
    label: 'Social',
    icon: '📱',
    values: {
      molto_attivo: 'Molto attivo/a',
      attivo: 'Attivo/a',
      spettatore: 'Guardo e basta',
      poco_presente: 'Poco presente',
    },
  },
];

export const INTERESSI_MAX = 10;
// Nomi italiani degli interessi; l'elenco valido lo dà il server
// (dating_dettagli_schema), qui solo come mostrarli.
export const INTERESSI = {
  viaggi: 'Viaggi',
  cucina: 'Cucina',
  musica: 'Musica',
  cinema: 'Cinema',
  serie_tv: 'Serie TV',
  sport: 'Sport',
  palestra: 'Palestra',
  calcio: 'Calcio',
  escursioni: 'Escursioni',
  mare: 'Mare',
  montagna: 'Montagna',
  lettura: 'Lettura',
  arte: 'Arte',
  fotografia: 'Fotografia',
  videogiochi: 'Videogiochi',
  tecnologia: 'Tecnologia',
  moda: 'Moda',
  ballo: 'Ballo',
  concerti: 'Concerti',
  animali: 'Animali',
  motori: 'Motori',
  moto: 'Moto',
  yoga: 'Yoga',
  meditazione: 'Meditazione',
  volontariato: 'Volontariato',
  vino: 'Vino',
  birra: 'Birra',
  caffe: 'Caffè',
  teatro: 'Teatro',
  giardinaggio: 'Giardinaggio',
  anime: 'Anime',
  giochi_da_tavolo: 'Giochi da tavolo',
  podcast: 'Podcast',
  running: 'Corsa',
  ciclismo: 'Ciclismo',
  nuoto: 'Nuoto',
  tatuaggi: 'Tatuaggi',
  natura: 'Natura',
  shopping: 'Shopping',
  astrologia: 'Astrologia',
};

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x.label]));
const GENERI_BY_ID = byId(GENERI);
const CERCA_GENERI_BY_ID = byId(CERCA_GENERI);
const COSA_CERCA_BY_ID = byId(COSA_CERCA);

export const genereLabel = (id) => GENERI_BY_ID[id] ?? id ?? '';
export const cercaGenereLabel = (id) => CERCA_GENERI_BY_ID[id] ?? id ?? '';
export const cosaCercaLabel = (id) => COSA_CERCA_BY_ID[id] ?? id ?? '';
export const interesseLabel = (id) => INTERESSI[id] ?? id ?? '';
export const zodiacoLabel = (id) => ZODIACO[id] ?? '';

// Testo di un dettaglio già scelto ('' se vuoto): una scelta o un elenco.
export function dettaglioText(def, value) {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return value.map((v) => def.values[v] ?? v).join(', ');
  return def.values[value] ?? value;
}

// Cosa manca per comparire (get_my_dating_profile.mancano).
export const MANCANO_LABELS = {
  domande: 'come ti definisci e chi vuoi incontrare',
  foto: 'almeno 2 foto',
  citta: 'la città',
  conferma: 'la conferma del profilo',
};

const NOTICE_START = 'Per avere più possibilità nel mondo rosso completa il tuo Profilo Incontri (Il mio profilo > Profilo Incontri).';
const NOTICE_TIP = 'Consiglio: se hai già compilato tutto e hai avuto pochi match, prova ad aggiornare la bio.';

// Testo dell'avviso secondo get_my_dating_profile.avviso ('' se null).
export function incontriNoticeText(avviso, mancano = []) {
  if (avviso === 'facoltativi') return `${NOTICE_START} ${NOTICE_TIP}`;
  if (avviso === 'essenziali') {
    const elenco = mancano
      .filter((m) => m !== 'conferma' || mancano.length === 1)
      .map((m) => MANCANO_LABELS[m] ?? m)
      .join(', ');
    return `${NOTICE_START} Ti manca: ${elenco}. Finché non lo aggiungi il tuo profilo non viene mostrato agli altri. ${NOTICE_TIP}`;
  }
  return '';
}

// Riga di stato in cima al Profilo Incontri.
export function datingStatusText(profile) {
  if (!profile) return '';
  if (profile.visibile) return 'Visibile nel mondo rosso';
  const missing = profile.mancano.filter((m) => m !== 'conferma' || profile.mancano.length === 1);
  return `Per comparire ti manca: ${missing.map((m) => MANCANO_LABELS[m] ?? m).join(', ')}.`;
}
