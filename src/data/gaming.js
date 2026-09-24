import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Gaming PC / PS / Xbox del mondo Nerd (components/nerd/gaming/): catalogo
// giochi condiviso (gaming_titles), libreria personale (gaming_library),
// "Cerco compagni" (gaming_lfg + gaming_lfg_members) e gamertag nel
// profilo (profiles.gamertags). Regole, fasce d'età, posti e doppioni li
// controlla il server (RPC): qui si mostra e si chiama. Gli errori delle
// RPC sono già frasi in italiano ("Il gruppo è al completo"...): si
// mostrano così come arrivano.

export const GAMING_CATEGORY_IDS = ['gaming-pc', 'gaming-ps', 'gaming-xbox'];

export const PLATFORM_BY_CATEGORY = { 'gaming-pc': 'pc', 'gaming-ps': 'ps', 'gaming-xbox': 'xbox' };
export const CATEGORY_BY_PLATFORM = { pc: 'gaming-pc', ps: 'gaming-ps', xbox: 'gaming-xbox' };

export const PLATFORMS = [
  { id: 'pc', label: 'PC', icon: '🖥️' },
  { id: 'ps', label: 'PlayStation', icon: '🎮' },
  { id: 'xbox', label: 'Xbox', icon: '🟢' },
  { id: 'switch', label: 'Switch', icon: '🔴' },
  { id: 'mobile', label: 'Mobile', icon: '📱' },
];
export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));
export const platformLabel = (id) => PLATFORM_BY_ID[id]?.label ?? id;

// Schede della colonna: quattro comuni più una propria per piattaforma.
export const GAMING_TABS = [
  { id: 'lfg', label: 'Cerco compagni' },
  { id: 'giochi', label: 'Giochi' },
  { id: 'clip', label: 'Clip' },
  { id: 'community', label: 'Community' },
];
export const PLATFORM_TAB = {
  pc: { id: 'build', label: 'Build', tag: 'build' },
  ps: { id: 'trofei', label: 'Trofei', tag: 'trofeo' },
  xbox: { id: 'gamepass', label: 'Game Pass', tag: 'gamepass' },
};

// Tag dei post di categoria (posts.tag): build solo in gaming-pc, trofeo
// solo in gaming-ps, gamepass solo in gaming-xbox (vincolo del server).
export const POST_TAGS = {
  clip: { label: 'Clip', icon: '🎬' },
  discussione: { label: 'Discussione', icon: '💬' },
  build: { label: 'Build', icon: '🛠️' },
  trofeo: { label: 'Trofeo', icon: '🏆' },
  gamepass: { label: 'Game Pass', icon: '🟢' },
};

export const LIBRARY_STATES = [
  { id: 'gioco', label: 'Ci gioco', icon: '🎮', stat: 'giocatori', statLabel: 'ci gioca', statLabelPlural: 'ci giocano' },
  { id: 'finito', label: 'Finito', icon: '✅', stat: 'finito', statLabel: 'finito', statLabelPlural: 'finito' },
  { id: 'wishlist', label: 'Lo voglio', icon: '⭐', stat: 'wishlist', statLabel: 'lo vuole', statLabelPlural: 'lo vogliono' },
];

// Gamertag (profiles.gamertags): chiavi ammesse dal server, stringhe 1-40.
export const GAMERTAG_FIELDS = [
  { key: 'psn', label: 'PSN', icon: '🎮', platforms: ['ps'] },
  { key: 'xbox', label: 'Xbox', icon: '🟢', platforms: ['xbox'] },
  { key: 'steam', label: 'Steam', icon: '♨️', platforms: ['pc'] },
  { key: 'epic', label: 'Epic', icon: '🧊', platforms: ['pc'] },
  { key: 'nintendo', label: 'Nintendo', icon: '🔴', platforms: ['switch'] },
  { key: 'battlenet', label: 'Battle.net', icon: '⚔️', platforms: ['pc'] },
  { key: 'riot', label: 'Riot', icon: '🔥', platforms: ['pc'] },
  { key: 'ea', label: 'EA', icon: '🏈', platforms: ['pc', 'ps', 'xbox'] },
];
export const GAMERTAG_MAX = 40;

// Il gamertag "della piattaforma corrente" da mostrare accanto al nome nel
// mondo Nerd: il primo campo compilato fra quelli di quella piattaforma.
export function platformGamertag(gamertags, platform) {
  if (!gamertags || typeof gamertags !== 'object') return null;
  for (const f of GAMERTAG_FIELDS) {
    if (f.platforms.includes(platform) && gamertags[f.key]) return { ...f, value: gamertags[f.key] };
  }
  return null;
}

// Solo le chiavi ammesse, ripulite: quello che si manda al server.
export function cleanGamertags(input) {
  const out = {};
  for (const f of GAMERTAG_FIELDS) {
    const v = String(input?.[f.key] ?? '').trim().slice(0, GAMERTAG_MAX);
    if (v) out[f.key] = v;
  }
  return out;
}

export const formatVote = (n) => (n == null ? '' : Number(n).toFixed(1).replace('.', ','));

// ---------------------------------------------------------------------------
// Catalogo giochi

function mapTitle(row) {
  return {
    id: row.id,
    nome: row.nome,
    anno: row.anno ?? null,
    piattaforme: row.piattaforme ?? [],
    generi: row.generi ?? [],
    copertina: row.copertina_url ?? null,
    fonte: row.fonte ?? 'utente',
    rawgId: row.rawg_id ?? null,
  };
}

export async function searchTitles(query, piattaforma = null, limit = 12) {
  const { data, error } = await supabase.rpc('search_gaming_titles', {
    p_query: query ?? '',
    p_piattaforma: piattaforma,
    p_limit: limit,
  });
  if (error || !data) return [];
  return data.map(mapTitle);
}

export async function fetchTitles(ids) {
  const unique = Array.from(new Set((ids ?? []).filter(Boolean)));
  if (!unique.length) return new Map();
  const { data, error } = await supabase.from('gaming_titles').select('*').in('id', unique);
  if (error || !data) return new Map();
  return new Map(data.map((r) => [r.id, mapTitle(r)]));
}

export async function fetchTitle(id) {
  if (!id) return null;
  return (await fetchTitles([id])).get(id) ?? null;
}

// { nome, anno, piattaforme, generi, copertinaUrl, rawgId } -> { id } | { error }.
// Il server deduplica per rawg_id o per nome+anno.
export async function upsertTitle({ nome, anno = null, piattaforme = [], generi = [], copertinaUrl = null, rawgId = null }) {
  const clean = String(nome ?? '').trim();
  if (!clean) return { error: 'Scrivi il nome del gioco.' };
  const { data, error } = await supabase.rpc('gaming_upsert_title', {
    p_nome: clean,
    p_anno: anno ?? null,
    p_piattaforme: piattaforme,
    p_generi: generi,
    p_copertina_url: copertinaUrl ?? null,
    p_rawg_id: rawgId ?? null,
  });
  if (error) return { error: error.message };
  return { id: data };
}

// Map title_id -> { giocatori, finito, wishlist, mediaVoto, voti }.
export async function fetchTitleStats(ids) {
  const unique = Array.from(new Set((ids ?? []).filter(Boolean)));
  if (!unique.length) return new Map();
  const { data, error } = await supabase.rpc('gaming_title_stats', { p_ids: unique });
  if (error || !data) return new Map();
  return new Map(
    data.map((r) => [
      r.title_id,
      {
        giocatori: Number(r.giocatori) || 0,
        finito: Number(r.finito) || 0,
        wishlist: Number(r.wishlist) || 0,
        mediaVoto: r.media_voto == null ? null : Number(r.media_voto),
        voti: Number(r.voti) || 0,
      },
    ])
  );
}

// ---------------------------------------------------------------------------
// RAWG (facoltativo): senza chiave la ricerca resta solo sul catalogo.

export const RAWG_KEY = import.meta.env.VITE_RAWG_KEY || '';
export const hasRawg = () => Boolean(RAWG_KEY);

const RAWG_PLATFORM = { pc: 'pc', playstation: 'ps', xbox: 'xbox', nintendo: 'switch', ios: 'mobile', android: 'mobile' };

function mapRawg(g) {
  const piattaforme = Array.from(
    new Set((g.parent_platforms ?? []).map((p) => RAWG_PLATFORM[p.platform?.slug]).filter(Boolean))
  );
  return {
    rawgId: g.id,
    nome: g.name,
    anno: g.released ? Number(String(g.released).slice(0, 4)) || null : null,
    copertina: g.background_image ?? null,
    piattaforme,
    generi: (g.genres ?? []).map((x) => x.name).filter(Boolean),
  };
}

export async function searchRawg(query, signal) {
  if (!hasRawg() || !query?.trim()) return [];
  try {
    const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(RAWG_KEY)}&search=${encodeURIComponent(query.trim())}&page_size=8`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results ?? []).map(mapRawg);
  } catch {
    return [];
  }
}

// Un risultato RAWG scelto entra nel catalogo (deduplicato per rawg_id).
export async function importRawgTitle(r) {
  return upsertTitle({
    nome: r.nome,
    anno: r.anno,
    piattaforme: r.piattaforme,
    generi: r.generi,
    copertinaUrl: r.copertina,
    rawgId: r.rawgId,
  });
}

// ---------------------------------------------------------------------------
// Libreria personale

function mapLibraryRow(r) {
  return { titleId: r.title_id, userId: r.user_id, stato: r.stato, piattaforma: r.piattaforma ?? null, voto: r.voto ?? null, updatedAt: r.updated_at };
}

// Le mie righe, con i titoli: [{ ...riga, title }].
export async function fetchMyLibrary() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return [];
  const { data, error } = await supabase
    .from('gaming_library')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false });
  if (error || !data) return [];
  const titles = await fetchTitles(data.map((r) => r.title_id));
  return data.map((r) => ({ ...mapLibraryRow(r), title: titles.get(r.title_id) ?? null })).filter((r) => r.title);
}

export async function fetchMyLibraryEntry(titleId) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await supabase
    .from('gaming_library')
    .select('*')
    .eq('user_id', auth.user.id)
    .eq('title_id', titleId)
    .maybeSingle();
  return data ? mapLibraryRow(data) : null;
}

// stato null = toglie il gioco dalla libreria. Il voto resta com'è.
export async function setLibraryState(titleId, stato, piattaforma = null) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato.' };
  if (!stato) {
    const { error } = await supabase.from('gaming_library').delete().eq('user_id', auth.user.id).eq('title_id', titleId);
    return error ? { error: error.message } : {};
  }
  const { error } = await supabase
    .from('gaming_library')
    .upsert({ user_id: auth.user.id, title_id: titleId, stato, piattaforma }, { onConflict: 'user_id,title_id' });
  return error ? { error: error.message } : {};
}

// Voto 1-10 (null = toglie il voto). Se il gioco non è ancora in libreria
// ci entra come "Ci gioco".
export async function setLibraryVote(titleId, voto, { stato = 'gioco', piattaforma = null } = {}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato.' };
  const { error } = await supabase
    .from('gaming_library')
    .upsert({ user_id: auth.user.id, title_id: titleId, stato, piattaforma, voto: voto ?? null }, { onConflict: 'user_id,title_id' });
  return error ? { error: error.message } : {};
}

// Chi ha il gioco in libreria (la RLS mostra solo la propria fascia d'età,
// niente blocchi), con profilo e gamertag.
export async function fetchTitlePlayers(titleId) {
  const { data, error } = await supabase
    .from('gaming_library')
    .select('user_id, stato, voto, piattaforma, updated_at')
    .eq('title_id', titleId)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error || !data) return [];
  const ids = data.map((r) => r.user_id);
  const [profiles, gamertags] = await Promise.all([fetchProfilesMap(ids), fetchGamertagsMap(ids)]);
  return data.map((r) => ({
    ...mapLibraryRow(r),
    profile: profiles.get(r.user_id) ?? { id: r.user_id, name: 'Utente', avatar: '' },
    gamertags: gamertags.get(r.user_id) ?? {},
  }));
}

// ---------------------------------------------------------------------------
// Gamertag degli altri: si leggono dalla vista pubblica se la espone
// (public_profiles.gamertags). Se la colonna non c'è ancora la vista
// risponde con un errore e qui si torna una mappa vuota: l'interfaccia
// mostra i gamertag appena il server li rende leggibili, senza cambiare
// nulla qui.
export async function fetchGamertagsMap(ids) {
  const unique = Array.from(new Set((ids ?? []).filter(Boolean)));
  if (!unique.length) return new Map();
  try {
    const { data, error } = await supabase.from('public_profiles').select('id, gamertags').in('id', unique);
    if (error || !data) return new Map();
    return new Map(data.map((r) => [r.id, r.gamertags ?? {}]));
  } catch {
    return new Map();
  }
}
