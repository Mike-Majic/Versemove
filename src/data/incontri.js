import { supabase } from './supabaseClient';
import { translateInteractionError } from './errors';
import { displayName } from './posts';
import { prepareUpload } from './mediaCompress';
import { translateUploadError } from './contents';
import { safeFileName } from './storagePath';

// Backend reale del mondo Incontri (RPC dedicate, vedi le funzioni SQL
// corrispondenti — is_incontri_eligible richiede mondo "incontri" abilitato
// e 18+, come isAdult()/mondiAbilitati lato client). Le RPC rispondono già
// in italiano sugli errori attesi, qui va solo evitato di lasciar passare
// un errore di rete grezzo.
function mapProfileRow(row) {
  return {
    id: row.id,
    name: displayName(row),
    avatar: row.avatar_url || '',
    age: row.eta ?? null,
    city: row.citta || '',
    bio: row.bio || '',
    attivita: row.attivita ?? null,
    giaVisto: Boolean(row.gia_visto),
  };
}

// Chiamata periodica (App.jsx: al login, ogni 2 minuti a pagina visibile, e
// quando torna visibile) per aggiornare profiles.last_seen_at, da cui le
// RPC sotto derivano il campo "attivita" (online/oggi/questa_settimana) di
// ogni profilo mostrato in Incontri.
export async function touchLastSeen() {
  try {
    const { error } = await supabase.rpc('touch_last_seen');
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Mazzo del mondo Incontri (get_match_candidates_v2): i filtri sono le
// preferenze "Chi vedo" salvate sul server (zona, distanza, età, foto, bio,
// interessi), niente più parametri dal client. Ogni profilo arriva già con
// foto, dettagli, lingue, segno (se lo mostra), distanza e fuori_preferenze.
export async function getMatchCandidates(limit = 20) {
  try {
    const { data, error } = await supabase.rpc('get_match_candidates_v2', { p_limit: limit });
    if (error) return { error: error.message };
    const rows = data ?? [];
    const urls = await datingPhotoUrlMap(rows.flatMap((r) => r.foto ?? []));
    return { candidates: rows.map((r) => ({ ...mapProfileRow(r), card: datingCardFrom(r, urls) })) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// true = è nato un match reciproco: chi chiama deve mostrare il toast solo
// in quel caso, non ad ogni "mi piace".
export async function recordSwipe(targetId, decisione) {
  try {
    const { data, error } = await supabase.rpc('record_swipe', { p_target_id: targetId, p_decisione: decisione });
    if (error) return { error: error.message };
    return { matched: Boolean(data) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function getLikesReceived() {
  try {
    const { data, error } = await supabase.rpc('get_likes_received');
    if (error) return { error: error.message };
    return {
      likes: (data ?? []).map((row) => ({ ...mapProfileRow(row), super: Boolean(row.super), createdAt: row.created_at })),
    };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function getMyMatches() {
  try {
    const { data, error } = await supabase.rpc('get_my_matches');
    if (error) return { error: error.message };
    return { matches: (data ?? []).map((row) => ({ ...mapProfileRow(row), matchedAt: row.matched_at })) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function getMyFavorites() {
  try {
    const { data, error } = await supabase.rpc('get_my_favorites');
    if (error) return { error: error.message };
    return { favorites: (data ?? []).map(mapProfileRow) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function unmatch(otherId) {
  try {
    const { error } = await supabase.rpc('unmatch', { p_other: otherId });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function updateOwnDatingProfile(citta, bio) {
  try {
    const { error } = await supabase.rpc('update_own_dating_profile', { p_citta: citta, p_bio: bio });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Preferiti: nessuna RPC dedicata, insert/delete diretti su match_favorites
// (RLS: solo le proprie righe, e solo su profili idonei/non bloccati per
// l'insert — un tentativo su un profilo non più disponibile arriva come un
// generico errore di row-level security, qui tradotto).
export async function addFavorite(favoriteId) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error } = await supabase.from('match_favorites').insert({ user_id: auth.user.id, favorite_id: favoriteId });
    if (error) return { error: translateInteractionError(error) };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function removeFavorite(favoriteId) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error } = await supabase
      .from('match_favorites')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('favorite_id', favoriteId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Canale realtime per i propri match (RLS di "matches" limita già alle
// righe dove si è user_a o user_b): notifica ogni nuovo match, anche quello
// creato dallo swipe reciproco dell'altra persona mentre non si è nella
// scheda "Mi piaci a...".
export function subscribeToOwnMatches(onInsert) {
  return supabase
    .channel('matches-own')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, (payload) => onInsert(payload.new))
    .subscribe();
}

// --- Scheda del Profilo Incontri (mai il profilo Social nel mondo rosso) ---

const DATING_PHOTOS_BUCKET = 'dating-photos';
const DATING_PHOTO_URL_SECONDS = 60 * 60;

// Link delle foto caricate (bucket privato "dating-photos"), firmati per
// un'ora e chiesti in una sola chiamata: Map path -> url. Le foto con url
// esterno non ne hanno bisogno.
async function datingPhotoUrlMap(foto) {
  const paths = [...new Set(foto.filter((f) => !f.url && f.path).map((f) => f.path))];
  const map = new Map();
  if (!paths.length) return map;
  try {
    const { data } = await supabase.storage.from(DATING_PHOTOS_BUCKET).createSignedUrls(paths, DATING_PHOTO_URL_SECONDS);
    (data ?? []).forEach((d) => d.signedUrl && map.set(d.path, d.signedUrl));
  } catch {
    // senza link restano le foto esterne e l'avatar
  }
  return map;
}

const photoSrc = (f, urls) => f.url || urls.get(f.path) || null;

// Forma unica della scheda (DatingProfileCard), da get_dating_card, dal
// mazzo (get_match_candidates_v2) o dal proprio profilo.
function datingCardFrom(row, urls) {
  return {
    id: row.id,
    nickname: row.nickname || 'Utente',
    avatar: row.avatar_url || '',
    eta: row.eta ?? null,
    citta: row.citta || '',
    bio: row.bio || '',
    attivita: row.attivita ?? null,
    genere: row.genere || '',
    cosaCerca: row.cosa_cerca ?? [],
    foto: (row.foto ?? []).map((f) => photoSrc(f, urls)).filter(Boolean),
    dettagli: row.dettagli ?? {},
    lingue: row.lingue ?? [],
    zodiaco: row.zodiaco ?? null,
    distanzaKm: row.distanza_km ?? null,
    fuoriPreferenze: Boolean(row.fuori_preferenze),
    miaDecisione: row.mia_decisione ?? null,
    match: Boolean(row.match),
  };
}

// Scheda completa di un profilo Incontri (get_dating_card): null dal server
// = profilo nascosto, bloccato o Incontri non abilitato.
export async function getDatingCard(id) {
  try {
    const { data, error } = await supabase.rpc('get_dating_card', { p_id: id });
    if (error) return { error: error.message };
    if (!data) return { error: 'Profilo non disponibile' };
    const urls = await datingPhotoUrlMap(data.foto ?? []);
    return { card: datingCardFrom(data, urls) };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// --- Il proprio Profilo Incontri (editor) ----------------------------------

const rpc = async (name, args) => {
  try {
    const { data, error } = await supabase.rpc(name, args);
    if (error) return { error: error.message };
    return { data };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
};

// Il proprio profilo: essenziali, foto (con link), dettagli, lingue,
// segno, preferenze "Chi vedo", visibile e cosa manca per comparire.
export async function getMyDatingProfile() {
  const { data, error } = await rpc('get_my_dating_profile');
  if (error) return { error };
  if (!data) return { error: 'Profilo non disponibile' };
  const urls = await datingPhotoUrlMap(data.foto ?? []);
  return {
    profile: {
      idoneo: Boolean(data.idoneo),
      genere: data.genere || '',
      cercaGeneri: data.cerca_generi ?? [],
      cosaCerca: data.cosa_cerca ?? [],
      consensoAt: data.consenso_orientamento_at ?? null,
      completatoAt: data.completato_at ?? null,
      citta: data.citta || '',
      cittaGeo: data.citta_incontri_geo ?? null,
      bio: data.bio || '',
      foto: (data.foto ?? []).map((f) => ({ id: f.id, posizione: f.posizione, path: f.path, src: photoSrc(f, urls) })),
      dettagli: data.dettagli ?? {},
      lingue: data.lingue ?? [],
      zodiaco: data.zodiaco ?? null,
      preferenze: data.preferenze ?? null,
      visibile: Boolean(data.visibile),
      mancano: data.mancano ?? [],
      // Avviso da mostrare adesso: 'essenziali' | 'facoltativi' | null (il
      // server lo spegne per 14 giorni dopo segna_avviso_incontri).
      avviso: data.avviso ?? null,
    },
  };
}

// Come ti definisci / chi vuoi incontrare / cosa cerchi. consenso: true
// al primo salvataggio (dato sull'orientamento).
export const saveDatingProfile = ({ genere, cercaGeneri, cosaCerca, consenso }) =>
  rpc('save_dating_profile', { p_genere: genere, p_cerca_generi: cercaGeneri, p_cosa_cerca: cosaCerca, p_consenso: Boolean(consenso) });

export const completeDatingOnboarding = () => rpc('complete_dating_onboarding');

// L'avviso "completa il Profilo Incontri" è stato mostrato: il server non
// lo ripropone per 14 giorni, su tutti i dispositivi.
export const segnaAvvisoIncontri = () => rpc('segna_avviso_incontri');

// Sostituisce TUTTI i dettagli (anche mostra_zodiaco); lingue null = invariate.
export const saveDatingDettagli = (dettagli, lingue = null) => rpc('save_dating_dettagli', { p_dettagli: dettagli, p_lingue: lingue });

// Solo le chiavi passate; distanza_km null = nessun limite.
export const saveDatingPreferenze = (prefs) => rpc('save_dating_preferenze', { p: prefs });

let schemaPromise = null;
export function getDatingDettagliSchema() {
  schemaPromise = schemaPromise ?? rpc('dating_dettagli_schema').then((r) => {
    if (r.error) schemaPromise = null;
    return r.data ?? null;
  });
  return schemaPromise;
}

export const DATING_PHOTOS_MIN = 2;
export const DATING_PHOTOS_MAX = 6;

// Foto: compressa, caricata in dating-photos/<uid>/..., poi registrata con
// add_dating_photo. Se la registrazione fallisce il file si toglie.
export async function addDatingPhoto(file) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const prepared = await prepareUpload(file);
    if (prepared.error) return { error: prepared.error };
    const upload = prepared.file;
    const path = `${auth.user.id}/${Date.now()}-${safeFileName(upload.name)}`;
    const { error: upErr } = await supabase.storage.from(DATING_PHOTOS_BUCKET).upload(path, upload);
    if (upErr) return { error: translateUploadError(upErr) };
    const res = await rpc('add_dating_photo', { p_path: path });
    if (res.error) {
      await supabase.storage.from(DATING_PHOTOS_BUCKET).remove([path]).catch(() => {});
      return { error: res.error };
    }
    return { id: res.data, path };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function removeDatingPhoto(id) {
  const res = await rpc('remove_dating_photo', { p_id: id });
  if (res.error) return res;
  if (res.data) await supabase.storage.from(DATING_PHOTOS_BUCKET).remove([res.data]).catch(() => {});
  return {};
}

export const reorderDatingPhotos = (ids) => rpc('reorder_dating_photos', { p_ids: ids });

// Avviso fra la scheda (DatingCardModal) e la colonna Match: una decisione
// presa dalla scheda toglie il profilo da "A chi piaci"/mazzo e, se nasce
// un match, evita il doppio "È un match" quando arriva dal canale realtime.
export const INCONTRI_DECISION_EVENT = 'vm:incontri-decision';
