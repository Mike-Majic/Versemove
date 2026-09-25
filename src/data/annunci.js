import { supabase } from './supabaseClient';
import { fetchProfilesMap, displayName } from './posts';
import { translateUploadError } from './contents';
import { isAdult } from './age';
import { safeFileName } from './storagePath';

// Mondo Annunci (arancione): auto/moto/biciclette/barche/case, vendita o
// affitto. Backend Supabase (tabella annunci_listings + annunci_favorites,
// RPC annunci_nearby, RLS che impone la pubblicazione solo ai maggiorenni)
// da Cowork — qui solo lettura/scrittura con i nomi già decisi, nessuna
// tabella nuova. Come dogWorld.js/vetrinaDeals.js: finché il backend non
// c'è le funzioni sotto restituiscono liste vuote/errori gestiti, mai
// un'eccezione.

function mapListing(row, favoriteIds) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    categoria: row.categoria,
    tipo: row.tipo,
    titolo: row.titolo,
    descrizione: row.descrizione,
    prezzo: row.prezzo != null ? Number(row.prezzo) : null,
    valuta: row.valuta || 'EUR',
    periodoAffitto: row.periodo_affitto,
    trattabile: !!row.trattabile,
    dettagli: row.dettagli || {},
    foto: Array.isArray(row.foto) ? row.foto : [],
    lat: row.location?.lat ?? row.lat ?? null,
    lng: row.location?.lng ?? row.lng ?? null,
    citta: row.citta,
    provincia: row.provincia,
    nazione: row.nazione,
    stato: row.stato,
    scadeIl: row.scade_il,
    createdAt: row.created_at,
    isFavorite: favoriteIds?.has(row.id) ?? false,
  };
}

async function fetchMyFavoriteIds() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return new Set();
  const { data, error } = await supabase.from('annunci_favorites').select('listing_id').eq('user_id', auth.user.id);
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.listing_id));
}

// Filtri "semplici" (colonne vere) lato query; i filtri sui campi della
// categoria (dentro dettagli, jsonb) restano lato client dopo il
// fetch — un confronto testuale sulle chiavi jsonb via ->> spezzerebbe gli
// ordinamenti numerici (es. "9" > "10" come stringa), quindi più
// semplice e corretto filtrare qui una volta scaricata la pagina. Se il
// volume di annunci crescerà, si può chiedere a Cowork colonne generate
// indicizzate per i campi più filtrati.
export async function listListings({
  categoria,
  tipo,
  citta,
  raggioKm,
  centerLat,
  centerLng,
  soloConFoto,
  prezzoMin,
  prezzoMax,
  ordinamento = 'recenti',
  fieldFilters = {},
  limit = 200,
} = {}) {
  let query = supabase.from('annunci_listings').select('*').eq('categoria', categoria).eq('stato', 'attivo').limit(limit);
  if (tipo) query = query.eq('tipo', tipo);
  if (citta) query = query.ilike('citta', `%${citta}%`);
  if (prezzoMin != null) query = query.gte('prezzo', prezzoMin);
  if (prezzoMax != null) query = query.lte('prezzo', prezzoMax);
  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error || !data) return [];

  const favoriteIds = await fetchMyFavoriteIds();
  let listings = data.map((row) => mapListing(row, favoriteIds));

  if (soloConFoto) listings = listings.filter((l) => l.foto.length > 0);

  for (const [key, value] of Object.entries(fieldFilters)) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    if (Array.isArray(value)) {
      listings = listings.filter((l) => value.includes(l.dettagli[key]));
    } else if (typeof value === 'object' && ('min' in value || 'max' in value)) {
      listings = listings.filter((l) => {
        const v = Number(l.dettagli[key]);
        if (Number.isNaN(v)) return false;
        if (value.min != null && v < value.min) return false;
        if (value.max != null && v > value.max) return false;
        return true;
      });
    } else if (value === true) {
      listings = listings.filter((l) => Boolean(l.dettagli[key]));
    }
  }

  if (raggioKm && centerLat != null && centerLng != null) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    listings = listings.filter((l) => {
      if (l.lat == null || l.lng == null) return false;
      const dLat = toRad(l.lat - centerLat);
      const dLng = toRad(l.lng - centerLng);
      const a =
        Math.sin(dLat / 2) ** 2 + Math.cos(toRad(centerLat)) * Math.cos(toRad(l.lat)) * Math.sin(dLng / 2) ** 2;
      const dist = 2 * R * Math.asin(Math.sqrt(a));
      return dist <= raggioKm;
    });
  }

  if (ordinamento === 'prezzo_asc') listings.sort((a, b) => (a.prezzo ?? 0) - (b.prezzo ?? 0));
  else if (ordinamento === 'prezzo_desc') listings.sort((a, b) => (b.prezzo ?? 0) - (a.prezzo ?? 0));
  else if (ordinamento === 'recenti') listings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return listings;
}

export async function getListing(id) {
  const { data, error } = await supabase.from('annunci_listings').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const favoriteIds = await fetchMyFavoriteIds();
  return mapListing(data, favoriteIds);
}

// Profilo pubblico del venditore: nickname + da quando è iscritto + numero
// di annunci attivi — mai nome reale, mai contatti diretti (il tasto
// "Contatta" apre i DM interni, vedi AnnuncioDetailModal).
export async function getSellerInfo(ownerId) {
  const [profilesMap, { count }] = await Promise.all([
    fetchProfilesMap([ownerId]),
    supabase.from('annunci_listings').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId).eq('stato', 'attivo'),
  ]);
  const profile = profilesMap.get(ownerId);
  return {
    id: ownerId,
    nickname: displayName(profile),
    avatar: profile?.avatar ?? '',
    nAnnunci: count ?? 0,
  };
}

export async function listMyListings() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return [];
  const { data, error } = await supabase
    .from('annunci_listings')
    .select('*')
    .eq('owner_id', auth.user.id)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((row) => mapListing(row, new Set()));
}

// Pubblica solo da maggiorenni: lo impone comunque la RLS, ma si
// intercetta qui per mostrare un messaggio chiaro invece del generico
// errore del database (stesso principio già usato per l'età minima in
// registrazione, vedi AuthModal.jsx).
export async function createListing({
  categoria,
  tipo,
  titolo,
  descrizione,
  prezzo,
  valuta = 'EUR',
  periodoAffitto,
  trattabile,
  dettagli,
  foto,
  lat,
  lng,
  citta,
  provincia,
  nazione,
  dataNascita,
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per pubblicare un annuncio.' };
  if (!isAdult(dataNascita)) return { error: 'Solo i maggiorenni possono pubblicare annunci.' };
  if (!titolo?.trim()) return { error: 'Manca il titolo.' };
  if (!categoria || !tipo) return { error: 'Manca categoria o tipo (vendita/affitto).' };

  const scadeIl = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('annunci_listings')
    .insert({
      owner_id: auth.user.id,
      categoria,
      tipo,
      titolo: titolo.trim(),
      descrizione: descrizione?.trim() || null,
      prezzo: prezzo ?? null,
      valuta,
      periodo_affitto: tipo === 'affitto' ? periodoAffitto || null : null,
      trattabile: !!trattabile,
      dettagli: dettagli || {},
      foto: foto || [],
      location: lat != null && lng != null ? { lat, lng } : null,
      citta: citta || null,
      provincia: provincia || null,
      nazione: nazione || null,
      stato: 'attivo',
      scade_il: scadeIl,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

export async function updateListing(id, patch) {
  const { error } = await supabase.from('annunci_listings').update(patch).eq('id', id);
  if (error) return { error: error.message };
  return {};
}

export async function setListingStatus(id, stato) {
  return updateListing(id, { stato });
}

// Rinnova: sposta la scadenza altri 60 giorni avanti da adesso.
export async function renewListing(id) {
  const scadeIl = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  return updateListing(id, { scade_il: scadeIl, stato: 'attivo' });
}

export async function deleteListing(id) {
  return setListingStatus(id, 'rimosso');
}

export async function toggleFavorite(listingId, currentlyFavorite) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato.' };
  if (currentlyFavorite) {
    const { error } = await supabase.from('annunci_favorites').delete().eq('listing_id', listingId).eq('user_id', auth.user.id);
    if (error) return { error: error.message };
    return { favorite: false };
  }
  const { error } = await supabase.from('annunci_favorites').insert({ listing_id: listingId, user_id: auth.user.id });
  if (error) return { error: error.message };
  return { favorite: true };
}

// Annunci nella vista mappa (RPC annunci_nearby, già prevista dalla
// specifica): passa il riquadro visibile, non tutta la categoria.
export async function annunciInBbox({ categoria, tipo, minLat, minLng, maxLat, maxLng }) {
  const { data, error } = await supabase.rpc('annunci_nearby', {
    p_categoria: categoria,
    p_tipo: tipo || null,
    p_min_lat: minLat,
    p_min_lng: minLng,
    p_max_lat: maxLat,
    p_max_lng: maxLng,
  });
  if (error || !data) return [];
  const favoriteIds = await fetchMyFavoriteIds();
  return data.map((row) => mapListing(row, favoriteIds));
}

// Fino a 20 foto per annuncio (vedi wizard di pubblicazione), stesso
// bucket/percorso degli altri upload dell'app.
export async function uploadAnnuncioPhoto(file) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato.' };
  const path = `${auth.user.id}/annuncio-${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from('content-media').upload(path, file);
  if (error) return { error: translateUploadError(error) };
  const { data } = supabase.storage.from('content-media').getPublicUrl(path);
  return { url: data.publicUrl };
}

// Bozza del form di pubblicazione salvata in locale (localStorage): se si
// esce a metà, la si ritrova aperta l'annuncio successivo (richiesta
// esplicita della specifica).
const DRAFT_KEY = 'rb-annunci-draft';
export function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage non disponibile: pazienza, si perde solo la bozza.
  }
}
export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Nessun problema, la bozza è già persa/inaccessibile.
  }
}
