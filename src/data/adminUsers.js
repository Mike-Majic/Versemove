import { supabase } from './supabaseClient';
import { mapProfileRow } from './accounts';

// Tabella Utenti del Backend: ricerca, ordinamento e pagine fatti DAL
// SERVER (supabase.from('profiles') con ilike/order/range), 50 righe alla
// volta — prima si scaricava tutto l'elenco e PostgREST si fermava a 1000
// righe. La RLS di profiles lascia leggere tutte le righe solo a owner e
// moderatori.

export const ADMIN_USERS_PAGE = 50;
export const ONLINE_WINDOW_MS = 5 * 60 * 1000;

// Colonne della tabella con ricerca e ordinamento. kind:
// - 'text': campo di ricerca libero (ilike, "contiene");
// - 'name': cerca in nome E cognome (ogni parola in uno dei due);
// - 'age': età esatta ("30") o intervallo ("18-25"), ordina su data_nascita;
// - 'select': scelta fra valori fissi.
export const USER_COLUMNS = [
  { key: 'username', label: 'Nome utente', kind: 'text', sort: 'username' },
  { key: 'nickname', label: 'Nickname', kind: 'text', sort: 'nickname' },
  { key: 'nome', label: 'Nome e cognome', kind: 'name', sort: 'nome' },
  { key: 'email', label: 'Mail', kind: 'text', sort: 'email' },
  { key: 'phone', label: 'Cellulare', kind: 'text', sort: 'phone' },
  { key: 'backup_email', label: 'Mail di backup', kind: 'text', sort: 'backup_email' },
  { key: 'eta', label: 'Età', kind: 'age', sort: 'data_nascita' },
  {
    key: 'online',
    label: 'Online',
    kind: 'select',
    sort: 'last_seen_at',
    options: [
      { value: '', label: 'Tutti' },
      { value: 'ora', label: 'Online ora' },
      { value: '24h', label: 'Ultime 24 ore' },
      { value: 'mai', label: 'Mai visti' },
    ],
  },
  {
    key: 'ruolo',
    label: 'Ruolo',
    kind: 'select',
    sort: 'ruolo',
    options: [
      { value: '', label: 'Tutti' },
      { value: 'owner', label: 'Owner' },
      { value: 'moderatore', label: 'Moderatore' },
      { value: 'utente', label: 'Utente' },
    ],
  },
  {
    key: 'verificato',
    label: 'Verifica',
    kind: 'select',
    sort: 'verificato',
    options: [
      { value: '', label: 'Tutti' },
      { value: 'si', label: 'Verificati' },
      { value: 'no', label: 'Non verificati' },
    ],
  },
  // Data di registrazione: filtro "dal … al …" (valore 'AAAA-MM-GG|AAAA-MM-GG',
  // uno dei due può mancare).
  { key: 'created_at', label: 'Registrato il', kind: 'daterange', sort: 'created_at' },
  {
    key: 'bannato',
    label: 'Bloccato',
    kind: 'select',
    sort: 'bannato',
    options: [
      { value: '', label: 'Tutti' },
      { value: 'si', label: 'Bloccati' },
      { value: 'no', label: 'Non bloccati' },
    ],
  },
];

// "%" e "_" nel testo cercato sono caratteri normali, non jolly di LIKE.
function likeValue(text) {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Dentro .or(...) virgole, parentesi e virgolette romperebbero il filtro.
function orSafe(text) {
  return text.replace(/[,()"\\%_*]/g, ' ').trim();
}

function isoDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Età N -> nati fra (oggi - N-1 anni, oggi - N anni]; "A-B" -> intervallo.
function ageRange(text) {
  const m = /^\s*(\d{1,3})\s*(?:-\s*(\d{1,3}))?\s*$/.exec(text);
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] ? Number(m[2]) : min;
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const today = new Date();
  const latest = new Date(today.getFullYear() - lo, today.getMonth(), today.getDate());
  const earliest = new Date(today.getFullYear() - hi - 1, today.getMonth(), today.getDate() + 1);
  return { from: isoDate(earliest), to: isoDate(latest) };
}

// Filtro di date: 'AAAA-MM-GG|AAAA-MM-GG' -> { from, to } (stringhe o '').
export function parseDateRange(value) {
  const [from = '', to = ''] = String(value ?? '').split('|');
  const ok = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '');
  return { from: ok(from), to: ok(to) };
}

export function formatDateRange(from, to) {
  return from || to ? `${from}|${to}` : '';
}

// Mezzanotte locale del giorno 'AAAA-MM-GG'.
function localDayStart(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// gg/mm/aaaa hh:mm (ora locale).
export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function applyFilters(query, filters) {
  let q = query;
  for (const col of USER_COLUMNS) {
    const raw = filters[col.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const value = String(raw).trim();
    if (col.kind === 'text') q = q.ilike(col.key, likeValue(value));
    else if (col.kind === 'name') {
      for (const word of orSafe(value).split(/\s+/).filter(Boolean)) {
        q = q.or(`nome.ilike.%${word}%,cognome.ilike.%${word}%`);
      }
    } else if (col.kind === 'age') {
      const range = ageRange(value);
      if (range) q = q.gte('data_nascita', range.from).lte('data_nascita', range.to);
    } else if (col.kind === 'daterange') {
      const { from, to } = parseDateRange(value);
      if (from) q = q.gte(col.key, localDayStart(from).toISOString());
      if (to) {
        const end = localDayStart(to);
        end.setDate(end.getDate() + 1);
        q = q.lt(col.key, end.toISOString());
      }
    } else if (col.key === 'online') {
      if (value === 'ora') q = q.gte('last_seen_at', new Date(Date.now() - ONLINE_WINDOW_MS).toISOString());
      else if (value === '24h') q = q.gte('last_seen_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
      else if (value === 'mai') q = q.is('last_seen_at', null);
    } else if (col.key === 'ruolo') q = q.eq('ruolo', value);
    else if (col.key === 'verificato' || col.key === 'bannato') q = q.eq(col.key, value === 'si');
  }
  return q;
}

// -> { rows, total, error }. sort: { key, dir: 'asc' | 'desc' } (key di
// USER_COLUMNS) o null (ordine di registrazione). Per l'età "crescente"
// vuol dire dal più giovane: data_nascita decrescente.
export async function searchAdminUsers({ filters = {}, sort = null, page = 0 } = {}) {
  try {
    let q = applyFilters(supabase.from('profiles').select('*', { count: 'exact' }), filters);
    const col = sort ? USER_COLUMNS.find((c) => c.key === sort.key) : null;
    if (col) {
      let ascending = sort.dir !== 'desc';
      if (col.key === 'eta') ascending = !ascending;
      q = q.order(col.sort, { ascending, nullsFirst: false });
      if (col.key === 'nome') q = q.order('cognome', { ascending, nullsFirst: false });
    } else {
      q = q.order('created_at', { ascending: true });
    }
    q = q.order('id', { ascending: true }).range(page * ADMIN_USERS_PAGE, page * ADMIN_USERS_PAGE + ADMIN_USERS_PAGE - 1);
    const { data, error, count } = await q;
    if (error) return { rows: [], total: 0, error: error.message };
    return { rows: (data ?? []).map(mapProfileRow), total: count ?? 0 };
  } catch (err) {
    return { rows: [], total: 0, error: err?.message ?? 'Errore di rete.' };
  }
}

// "N online ora": visti negli ultimi 5 minuti.
export async function countOnlineNow() {
  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .gte('last_seen_at', new Date(Date.now() - ONLINE_WINDOW_MS).toISOString());
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export function isOnlineNow(lastSeenAt) {
  return Boolean(lastSeenAt) && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;
}

// "12 min fa", "3 ore fa", "ieri", "4 giorni fa", poi la data.
export function lastSeenLabel(lastSeenAt) {
  if (!lastSeenAt) return 'mai';
  const then = new Date(lastSeenAt);
  const diffMin = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.round(diffMin / 60);
  const today = new Date();
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.floor((startToday - new Date(then.getFullYear(), then.getMonth(), then.getDate())) / 86400000);
  if (days <= 0) return diffH === 1 ? '1 ora fa' : `${diffH} ore fa`;
  if (days === 1) return 'ieri';
  if (days < 7) return `${days} giorni fa`;
  return then.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: then.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

// --- Funzione edge staff-actions (owner e moderatori) ---

const MAIL_LABELS = { inviata: 'Mail inviata', non_configurata: 'Mail non configurata', errore: 'Mail non inviata' };
export function mailLabel(esito) {
  return MAIL_LABELS[esito] ?? '';
}

// -> { email } | { error }. Con un errore HTTP il messaggio del server
// ({ error: "..." }) sta nel corpo della risposta (error.context).
async function invokeStaffAction(body) {
  try {
    const { data, error } = await supabase.functions.invoke('staff-actions', { body });
    if (error) {
      let message = error.message || 'Azione non riuscita.';
      try {
        const payload = await error.context?.json?.();
        if (payload?.error) message = payload.error;
      } catch {
        // corpo non JSON: resta il messaggio generico.
      }
      return { error: message };
    }
    if (data?.error) return { error: data.error };
    return { email: data?.email ?? null };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Dopo un blocco riuscito: la mail che avvisa l'utente.
export function notifyBan(userId, motivo) {
  return invokeStaffAction({ azione: 'notifica_ban', user_id: userId, motivo: motivo || '' });
}

// Eliminazione definitiva (mail, registro staff, file, account).
export function deleteUserForever(userId, motivo) {
  return invokeStaffAction({ azione: 'elimina_utente', user_id: userId, motivo: motivo || '', conferma: 'ELIMINA' });
}
