import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Gaming PC / PS / Xbox / Nintendo del mondo Nerd (components/nerd/gaming/): catalogo
// giochi condiviso (gaming_titles), libreria personale (gaming_library),
// "Cerco compagni" (gaming_lfg + gaming_lfg_members) e gamertag nel
// profilo (profiles.gamertags). Regole, fasce d'età, posti e doppioni li
// controlla il server (RPC): qui si mostra e si chiama. Gli errori delle
// RPC sono già frasi in italiano ("Il gruppo è al completo"...): si
// mostrano così come arrivano.

export const GAMING_CATEGORY_IDS = ['gaming-pc', 'gaming-ps', 'gaming-xbox', 'gaming-nintendo'];

export const PLATFORM_BY_CATEGORY = { 'gaming-pc': 'pc', 'gaming-ps': 'ps', 'gaming-xbox': 'xbox', 'gaming-nintendo': 'switch' };
export const CATEGORY_BY_PLATFORM = { pc: 'gaming-pc', ps: 'gaming-ps', xbox: 'gaming-xbox', switch: 'gaming-nintendo' };

export const PLATFORMS = [
  { id: 'pc', label: 'PC', icon: '🖥️' },
  { id: 'ps', label: 'PlayStation', icon: '🎮' },
  { id: 'xbox', label: 'Xbox', icon: '🟢' },
  { id: 'switch', label: 'Switch', icon: '🔴' },
  { id: 'mobile', label: 'Mobile', icon: '📱' },
];
export const PLATFORM_BY_ID = Object.fromEntries(PLATFORMS.map((p) => [p.id, p]));
export const platformLabel = (id) => PLATFORM_BY_ID[id]?.label ?? id;

// Schede della colonna: quattro comuni più una propria per piattaforma
// (Nintendo non ne ha una sua).
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
// Ricerca esterna: Wikipedia (senza chiave, CORS con origin=*). Una sola
// chiamata: ricerca a testo pieno limitata alle pagine con il template
// "Infobox video game", con la miniatura dell'infobox (la copertina).
// Risultati nell'ordine di Wikipedia (page.index), titolo della pagina
// come nome. Dal titolo "Doom (2016 video game)" escono nome "Doom" e
// anno 2016, così due giochi omonimi restano distinti nel catalogo
// (dedup del server per nome + anno). Cache in memoria per query.
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
export const WIKI_MIN_CHARS = 2;
export const WIKI_SOURCE_LABEL = 'Dati: Wikipedia';

const WIKI_TITLE_SUFFIX_RE = /\s*\((?:(\d{4}) )?(?:video ?game|computer game)\)\s*$/i;

export function wikiUrl(query) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    redirects: '1',
    generator: 'search',
    gsrsearch: `${query} hastemplate:"Infobox video game"`,
    gsrlimit: '6',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: '160',
    pilicense: 'any',
  });
  return `${WIKI_API}?${params}`;
}

export function mapWikiPage(pg) {
  const title = String(pg.title ?? '').trim();
  if (!title) return null;
  const m = title.match(WIKI_TITLE_SUFFIX_RE);
  const nome = title.replace(WIKI_TITLE_SUFFIX_RE, '').trim() || title;
  return {
    source: 'wiki',
    wikiId: pg.pageid,
    nome,
    anno: m?.[1] ? Number(m[1]) : null,
    copertina: pg.thumbnail?.source ?? null,
    piattaforme: [],
    generi: [],
  };
}

const wikiCache = new Map();
const WIKI_CACHE_MAX = 200;

export async function searchWikipedia(query, signal) {
  const clean = String(query ?? '').trim();
  if (clean.length < WIKI_MIN_CHARS) return [];
  const key = clean.toLowerCase();
  if (wikiCache.has(key)) return wikiCache.get(key);
  try {
    const res = await fetch(wikiUrl(clean), { signal });
    if (!res.ok) return [];
    const json = await res.json();
    const pages = Object.values(json.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const out = pages.map(mapWikiPage).filter(Boolean);
    if (wikiCache.size >= WIKI_CACHE_MAX) wikiCache.delete(wikiCache.keys().next().value);
    wikiCache.set(key, out);
    return out;
  } catch {
    return [];
  }
}

// Un risultato Wikipedia scelto entra nel catalogo (dedup del server per
// nome + anno) con la copertina e la piattaforma della categoria in cui
// è stato scelto (il server somma le piattaforme, non le sostituisce).
export async function importWikiTitle(r, platform = null) {
  return upsertTitle({
    nome: r.nome,
    anno: r.anno,
    piattaforme: platform ? [platform] : [],
    generi: r.generi ?? [],
    copertinaUrl: r.copertina,
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
// Gamertag degli altri, dalla vista pubblica (public_profiles.gamertags,
// visibile a chi non è bloccato, come il resto del Profilo Social). In
// caso di errore si torna una mappa vuota: la lista resta, senza chip.
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

// ---------------------------------------------------------------------------
// Cerco compagni (gaming_lfg + gaming_lfg_members, tutte e due su Realtime).
// L'autore è anche membro (riga in gaming_lfg_members): "posti" conta gli
// altri, quindi i posti occupati sono i membri meno l'autore.

function mapLfg(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    categoria: row.categoria,
    piattaforma: row.piattaforma,
    titleId: row.title_id ?? null,
    gioco: row.gioco_nome,
    modalita: row.modalita ?? '',
    quando: row.quando,
    posti: row.posti,
    mic: Boolean(row.mic),
    lingua: row.lingua ?? 'it',
    note: row.note ?? '',
    stato: row.stato,
    videoRoomId: row.video_room_id ?? null,
    createdAt: row.created_at,
  };
}

// Annunci aperti della categoria (più quelli chiusi di cui si è membri,
// che la RLS lascia vedere), ordinati per quando, con autore, membri
// (senza l'autore) e gioco del catalogo.
export async function fetchLfgList(categoria) {
  const { data, error } = await supabase
    .from('gaming_lfg')
    .select('*')
    .eq('categoria', categoria)
    .eq('stato', 'aperto')
    .order('quando', { ascending: true });
  if (error || !data) return [];
  return hydrateLfg(data.map(mapLfg));
}

export async function fetchLfg(id) {
  if (!id) return null;
  const { data } = await supabase.from('gaming_lfg').select('*').eq('id', id).maybeSingle();
  if (!data) return null;
  const [one] = await hydrateLfg([mapLfg(data)]);
  return one ?? null;
}

async function hydrateLfg(list) {
  if (!list.length) return [];
  const ids = list.map((l) => l.id);
  const { data: memberRows } = await supabase
    .from('gaming_lfg_members')
    .select('lfg_id, user_id, joined_at')
    .in('lfg_id', ids)
    .order('joined_at', { ascending: true });
  const members = memberRows ?? [];
  const userIds = [...list.map((l) => l.authorId), ...members.map((m) => m.user_id)];
  const [profiles, gamertags, titles] = await Promise.all([
    fetchProfilesMap(userIds),
    fetchGamertagsMap(userIds),
    fetchTitles(list.map((l) => l.titleId)),
  ]);
  const profileOf = (id) => ({ ...(profiles.get(id) ?? { id, name: 'Utente', avatar: '' }), gamertags: gamertags.get(id) ?? {} });
  return list.map((l) => ({
    ...l,
    author: profileOf(l.authorId),
    title: l.titleId ? titles.get(l.titleId) ?? null : null,
    members: members
      .filter((m) => m.lfg_id === l.id && m.user_id !== l.authorId)
      .map((m) => ({ userId: m.user_id, joinedAt: m.joined_at, profile: profileOf(m.user_id) })),
  }));
}

const rpcVoid = async (name, args) => {
  const { error } = await supabase.rpc(name, args);
  return error ? { error: error.message } : {};
};

// -> { id } | { error }. Massimo 5 annunci aperti a testa, data fra ora e
// 30 giorni: lo dice il server, in italiano.
export async function createLfg({ categoria, giocoNome, quando, posti, titleId = null, modalita = null, mic = true, lingua = 'it', note = null }) {
  const { data, error } = await supabase.rpc('create_gaming_lfg', {
    p_categoria: categoria,
    p_gioco_nome: String(giocoNome ?? '').trim(),
    p_quando: quando,
    p_posti: posti,
    p_title_id: titleId,
    p_modalita: modalita?.trim() || null,
    p_mic: Boolean(mic),
    p_lingua: lingua || 'it',
    p_note: note?.trim() || null,
  });
  if (error) return { error: error.message };
  return { id: data };
}

export const joinLfg = (id) => rpcVoid('join_gaming_lfg', { p_id: id });
export const leaveLfg = (id) => rpcVoid('leave_gaming_lfg', { p_id: id });
export const kickLfg = (id, userId) => rpcVoid('kick_gaming_lfg', { p_id: id, p_user: userId });
export const closeLfg = (id) => rpcVoid('close_gaming_lfg', { p_id: id });

// Solo l'autore: crea (o riusa) la stanza video di gruppo dell'annuncio
// e restituisce il suo id.
export async function openLfgRoom(id) {
  const { data, error } = await supabase.rpc('open_gaming_lfg_room', { p_id: id });
  if (error) return { error: error.message };
  return { roomId: data };
}

// Un canale per categoria: qualunque cambiamento agli annunci di quella
// categoria o ai membri (che non hanno la categoria: si filtra dopo)
// chiama onChange(). Da rimuovere con supabase.removeChannel.
export function subscribeLfg(categoria, onChange) {
  return supabase
    .channel(`gaming-lfg-${categoria}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gaming_lfg', filter: `categoria=eq.${categoria}` }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'gaming_lfg_members' }, () => onChange())
    .subscribe();
}

// "Oggi 21:30", "Domani 18:00", "gio 26 · 21:30".
export function formatLfgWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, today)) return `Oggi ${time}`;
  if (sameDay(d, tomorrow)) return `Domani ${time}`;
  return `${d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' })} · ${time}`;
}

// Fra 1 ora, arrotondato ai 15 minuti, nel formato di <input type="datetime-local">.
export function defaultLfgWhen() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
