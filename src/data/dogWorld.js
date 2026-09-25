import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';
import { translateUploadError } from './contents';
import { safeFileName } from './storagePath';

// Mondo Vetrina, categoria "Cani": luoghi (aree cani, autogrill, hotel,
// spiagge, sentieri, rifugi pet-friendly) su una mappa reale, con
// recensioni. Backend Supabase (tabelle dog_places/dog_place_reviews,
// vista dog_place_stats, funzione dog_places_in_bbox, RLS, PostGIS) creato
// da Cowork — qui solo lettura/scrittura con i nomi già decisi, nessuna
// tabella nuova.

// Un luogo per marker sulla mappa, dentro al riquadro visibile
// (dog_places_in_bbox fa il lavoro pesante lato database: solo i luoghi
// nel riquadro, con la media voti già calcolata — molto più leggero di
// scaricare tutta la tabella e filtrare qui). tipi/taglia/soloRecintate
// sono i filtri dell'utente, tutti opzionali.
export async function placesInBbox({ minLng, minLat, maxLng, maxLat, tipi, taglia, soloRecintate }) {
  const { data, error } = await supabase.rpc('dog_places_in_bbox', {
    p_min_lng: minLng,
    p_min_lat: minLat,
    p_max_lng: maxLng,
    p_max_lat: maxLat,
    p_tipi: tipi?.length ? tipi : null,
    p_taglia: taglia || null,
    p_solo_recintate: !!soloRecintate,
  });
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    tipo: row.tipo,
    nome: row.nome,
    lat: row.lat,
    lng: row.lng,
    taglia: row.taglia,
    recintata: row.recintata,
    votoMedio: row.voto_medio != null ? Number(row.voto_medio) : null,
    nRecensioni: row.n_recensioni ?? 0,
    condizioneRecente: row.condizione_recente,
  }));
}

function mapPlace(row) {
  return {
    id: row.id,
    tipo: row.tipo,
    nome: row.nome,
    descrizione: row.descrizione,
    regione: row.regione,
    provincia: row.provincia,
    comune: row.comune,
    taglia: row.taglia,
    recintata: row.recintata,
    acqua: row.acqua,
    ombra: row.ombra,
    illuminata: row.illuminata,
    extra: row.extra ?? {},
    foto: (row.foto ?? []).map(getDogPhotoUrl),
    source: row.source,
    stato: row.stato,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// Dettaglio completo di un luogo (aperto dal foglio in basso): niente
// lat/lng qui, la colonna "location" è una geography e PostgREST non la
// converte da sé in numeri semplici senza una funzione dedicata — il
// chiamante li ha già (il marker cliccato sulla mappa viene proprio da
// dog_places_in_bbox, che quei numeri li calcola già con st_y/st_x) e li
// passa pari pari al foglio insieme a questo dettaglio.
export async function getPlace(placeId) {
  const { data, error } = await supabase
    .from('dog_places')
    .select(
      'id, tipo, nome, descrizione, regione, provincia, comune, taglia, recintata, acqua, ombra, illuminata, extra, foto, source, stato, created_by, created_at'
    )
    .eq('id', placeId)
    .maybeSingle();
  if (error || !data) return null;
  return mapPlace(data);
}

// Statistiche aggregate di un luogo (media voti, condizione più recente
// segnalata) dalla vista dog_place_stats — calcolate lato database dalle
// recensioni, non ricalcolate qui.
export async function getPlaceStats(placeId) {
  const { data, error } = await supabase
    .from('dog_place_stats')
    .select('n_recensioni, voto_medio, condizione_recente, ultimo_aggiornamento')
    .eq('place_id', placeId)
    .maybeSingle();
  if (error || !data) return { nRecensioni: 0, votoMedio: null, condizioneRecente: null };
  return {
    nRecensioni: data.n_recensioni ?? 0,
    votoMedio: data.voto_medio != null ? Number(data.voto_medio) : null,
    condizioneRecente: data.condizione_recente,
  };
}

const TIPI_VALIDI = ['area_cani', 'autogrill', 'hotel', 'spiaggia', 'sentiero', 'rifugio'];

// Aggiunge un nuovo luogo (source sempre 'user', mai 'osm', imposto anche
// qui oltre che dalla RLS — così un tentativo con valori diversi fallisce
// subito con un messaggio chiaro invece del generico errore Postgres).
// location va passata come WKT con SRID esplicito: è l'unico formato che
// PostgREST accetta in scrittura per una colonna geography, prima la
// LONGITUDINE poi la latitudine (ordine X,Y del WKT, non lat,lng).
export async function createPlace({
  tipo,
  nome,
  descrizione,
  lat,
  lng,
  regione,
  provincia,
  comune,
  taglia,
  recintata,
  acqua,
  ombra,
  illuminata,
  foto = [],
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per aggiungere un luogo.' };
  if (!TIPI_VALIDI.includes(tipo)) return { error: 'Tipo di luogo non valido.' };
  if (!nome?.trim() || nome.trim().length < 2) return { error: 'Il nome deve avere almeno 2 caratteri.' };
  if (lat == null || lng == null) return { error: 'Manca la posizione sulla mappa.' };

  const { data, error } = await supabase
    .from('dog_places')
    .insert({
      tipo,
      nome: nome.trim(),
      descrizione: descrizione?.trim() || null,
      location: `SRID=4326;POINT(${lng} ${lat})`,
      regione: regione || null,
      provincia: provincia || null,
      comune: comune || null,
      taglia: taglia || null,
      recintata: recintata ?? null,
      acqua: acqua ?? null,
      ombra: ombra ?? null,
      illuminata: illuminata ?? null,
      foto,
      source: 'user',
      created_by: auth.user.id,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

function mapReview(row, profilesMap) {
  const author = profilesMap.get(row.author_id);
  return {
    id: row.id,
    placeId: row.place_id,
    authorId: row.author_id,
    authorName: author?.name ?? 'Utente',
    authorAvatar: author?.avatar ?? '',
    voto: row.voto,
    condizione: row.condizione,
    recinzioneOk: row.recinzione_ok,
    taglia: row.taglia,
    testo: row.testo,
    foto: (row.foto ?? []).map(getDogPhotoUrl),
    visitatoIl: row.visitato_il,
    createdAt: row.created_at,
    isMine: author?.id != null && row.author_id === author.id,
  };
}

// Recensioni di un luogo, più recenti prima, con nome/avatar di chi le ha
// scritte (mai anonime: sono opinioni personali, l'autore va sempre
// mostrato — vedi public_profiles, mai la tabella profiles diretta per gli
// altri utenti).
export async function listReviews(placeId) {
  const { data, error } = await supabase
    .from('dog_place_reviews')
    .select('id, place_id, author_id, voto, condizione, recinzione_ok, taglia, testo, foto, visitato_il, created_at')
    .eq('place_id', placeId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  const { data: auth } = await supabase.auth.getUser();
  const myId = auth?.user?.id ?? null;
  const profilesMap = await fetchProfilesMap(data.map((r) => r.author_id));
  return data.map((row) => {
    const review = mapReview(row, profilesMap);
    return { ...review, isMine: myId != null && row.author_id === myId };
  });
}

const CONDIZIONI_VALIDE = ['consigliata', 'ok', 'degrado'];

// Una recensione per volta per luogo non è imposto dallo schema: un utente
// può tornarci e aggiornare la propria opinione con una nuova riga, restano
// tutte visibili con la loro data (RLS: chiunque può leggerle, solo
// l'autore o lo staff le può modificare).
export async function createReview({
  placeId,
  voto,
  condizione,
  recinzioneOk,
  taglia,
  testo,
  foto = [],
  visitatoIl,
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per lasciare una recensione.' };
  if (!(voto >= 1 && voto <= 5)) return { error: 'Il voto deve essere da 1 a 5.' };
  if (!CONDIZIONI_VALIDE.includes(condizione)) return { error: 'Condizione non valida.' };

  const { data, error } = await supabase
    .from('dog_place_reviews')
    .insert({
      place_id: placeId,
      author_id: auth.user.id,
      voto,
      condizione,
      recinzione_ok: recinzioneOk ?? null,
      taglia: taglia || null,
      testo: testo?.trim() || null,
      foto,
      visitato_il: visitatoIl || null,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

// Carica una foto (luogo o recensione) nello stesso bucket pubblico
// "content-media" già usato dal resto dell'app (vedi data/contents.js):
// le policy di storage impongono come primo segmento del percorso il
// proprio uid, da qui il prefisso identico a publishContent. Restituisce
// il PERCORSO (non l'URL): è quello che va dentro l'array jsonb "foto",
// l'URL pubblico si ricava al volo con getDogPhotoUrl quando serve
// mostrarla, così se in futuro cambia dominio/bucket non serve riscrivere
// i dati già salvati.
export async function uploadDogPhoto(file) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato.' };
  const path = `${auth.user.id}/dogworld-${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from('content-media').upload(path, file);
  if (error) return { error: translateUploadError(error) };
  return { path };
}

export function getDogPhotoUrl(path) {
  const { data } = supabase.storage.from('content-media').getPublicUrl(path);
  return data.publicUrl;
}
