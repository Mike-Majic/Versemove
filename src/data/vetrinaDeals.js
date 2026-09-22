import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Mondo Vetrina, categorie "Offerte": offerte pubblicate dagli utenti o
// arrivate automaticamente dal backend (badge "fonte": utente/automatica).
// Backend Supabase (tabelle vetrina_deals/vetrina_deal_votes/
// vetrina_deal_comments + vista vetrina_deal_stats, RLS, eventuale job di
// raccolta automatica) creato da Cowork — qui solo lettura/scrittura con i
// nomi già decisi, nessuna tabella nuova. Finché le tabelle non esistono le
// funzioni sotto restituiscono liste vuote/errori gestiti, mai
// un'eccezione: il feed mostra lo stato vuoto invece di rompersi (stesso
// principio di data/dogWorld.js).

function mapDeal(row, statsByDeal, myVotesByDeal) {
  const stats = statsByDeal?.get(row.id);
  return {
    id: row.id,
    categoria: row.categoria,
    negozio: row.negozio,
    titolo: row.titolo,
    descrizione: row.descrizione,
    url: row.url,
    immagine: row.immagine,
    prezzo: row.prezzo != null ? Number(row.prezzo) : null,
    prezzoOriginale: row.prezzo_originale != null ? Number(row.prezzo_originale) : null,
    scontoPct: row.sconto_pct != null ? Number(row.sconto_pct) : null,
    valuta: row.valuta || 'EUR',
    online: !!row.online,
    citta: row.citta,
    scadeIl: row.scade_il,
    fonte: row.fonte,
    authorId: row.author_id,
    stato: row.stato,
    createdAt: row.created_at,
    caldo: stats?.caldo ?? 0,
    freddo: stats?.freddo ?? 0,
    nCommenti: stats?.n_commenti ?? 0,
    // "scaduta" arriva già calcolata dalla vista vetrina_deal_stats
    // (autorevole, calcolata lì con lo stesso now() del resto delle
    // query) — se la vista non risponde ancora si ricade sul controllo
    // locale su scadeIl, mai un'offerta scaduta che sembra ancora attiva.
    scaduta: stats?.scaduta ?? (row.scade_il ? new Date(row.scade_il).getTime() <= Date.now() : false),
    mioVoto: myVotesByDeal?.get(row.id) ?? null,
  };
}

// Ordinamenti offerti nel filtro (vedi VetrinaOfferteColumn): "caldo" è il
// default (le offerte votate più calde dalla community prima).
const ORDER_COLUMNS = {
  caldo: null, // richiede la temperatura dalla vista stats, riordinata lato client sotto
  recenti: 'created_at',
  scadenza: 'scade_il',
  sconto: 'sconto_pct',
};

// Elenca le offerte attive di una categoria con i filtri scelti
// dall'utente — i filtri semplici (negozio, sconto minimo, online/negozio,
// città) sono lato query, non lato client (potrebbero essere migliaia).
// Voti/commenti arrivano da una vista aggregata (vetrina_deal_stats, da
// creare lato Cowork — stesso principio di dog_place_stats già in uso per
// Cani) invece di ricalcolarli qui ad ogni feed.
export async function listDeals({ categoria, negozio, scontoMin, online, citta, ordinamento = 'caldo' } = {}) {
  // Condizione di "attiva" esatta indicata da Cowork: stato='attiva' E
  // (scade_il è vuoto O nel futuro) — lato query, non filtrata dopo
  // (mai scaricare offerte scadute solo per poi nasconderle a mano).
  const nowIso = new Date().toISOString();
  let query = supabase
    .from('vetrina_deals')
    .select('*')
    .eq('categoria', categoria)
    .eq('stato', 'attiva')
    .or(`scade_il.is.null,scade_il.gt.${nowIso}`);
  if (negozio) query = query.eq('negozio', negozio);
  if (scontoMin) query = query.gte('sconto_pct', scontoMin);
  if (online === true) query = query.eq('online', true);
  if (online === false) query = query.eq('online', false);
  if (citta) query = query.ilike('citta', citta);

  const orderColumn = ORDER_COLUMNS[ordinamento];
  if (orderColumn) query = query.order(orderColumn, { ascending: ordinamento === 'scadenza' });

  const { data, error } = await query;
  if (error || !data) return [];

  const ids = data.map((row) => row.id);
  const [statsByDeal, myVotesByDeal] = await Promise.all([fetchDealStats(ids), fetchMyVotes(ids)]);
  const deals = data.map((row) => mapDeal(row, statsByDeal, myVotesByDeal));

  if (ordinamento === 'caldo') deals.sort((a, b) => b.caldo - a.caldo);
  return deals;
}

async function fetchDealStats(dealIds) {
  const map = new Map();
  if (!dealIds.length) return map;
  const { data, error } = await supabase.from('vetrina_deal_stats').select('deal_id, caldo, freddo, n_commenti').in('deal_id', dealIds);
  if (error || !data) return map;
  data.forEach((row) => map.set(row.deal_id, row));
  return map;
}

async function fetchMyVotes(dealIds) {
  const map = new Map();
  if (!dealIds.length) return map;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return map;
  const { data, error } = await supabase
    .from('vetrina_deal_votes')
    .select('deal_id, valore')
    .eq('user_id', auth.user.id)
    .in('deal_id', dealIds);
  if (error || !data) return map;
  data.forEach((row) => map.set(row.deal_id, row.valore));
  return map;
}

// Vota "caldo" (+1) o "freddo" (-1) un'offerta: un voto solo per utente per
// offerta, un secondo voto sullo stesso valore lo toglie (come un like),
// uno sul valore opposto lo sostituisce — richiede un vincolo unique
// (deal_id, user_id) lato tabella per l'upsert.
export async function voteDeal(dealId, valore) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per votare.' };

  const { data: existing } = await supabase
    .from('vetrina_deal_votes')
    .select('valore')
    .eq('deal_id', dealId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (existing?.valore === valore) {
    const { error } = await supabase.from('vetrina_deal_votes').delete().eq('deal_id', dealId).eq('user_id', auth.user.id);
    if (error) return { error: error.message };
    return { mioVoto: null };
  }

  const { error } = await supabase
    .from('vetrina_deal_votes')
    .upsert({ deal_id: dealId, user_id: auth.user.id, valore }, { onConflict: 'deal_id,user_id' });
  if (error) return { error: error.message };
  return { mioVoto: valore };
}

function mapComment(row, profilesMap) {
  const author = profilesMap.get(row.author_id);
  return {
    id: row.id,
    dealId: row.deal_id,
    authorId: row.author_id,
    authorName: author?.name ?? 'Utente',
    authorAvatar: author?.avatar ?? '',
    testo: row.testo,
    createdAt: row.created_at,
  };
}

export async function listComments(dealId) {
  const { data, error } = await supabase
    .from('vetrina_deal_comments')
    .select('id, deal_id, author_id, testo, created_at')
    .eq('deal_id', dealId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  const profilesMap = await fetchProfilesMap(data.map((r) => r.author_id));
  return data.map((row) => mapComment(row, profilesMap));
}

export async function addComment(dealId, testo) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per commentare.' };
  if (!testo?.trim()) return { error: 'Scrivi un commento.' };
  const { data, error } = await supabase
    .from('vetrina_deal_comments')
    .insert({ deal_id: dealId, author_id: auth.user.id, testo: testo.trim() })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

// Stesso link pubblicato negli ultimi 7 giorni? Evita doppioni prima di
// salvare (il form chiede conferma "È questa?" se trova un risultato).
export async function findRecentDuplicate(url) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('vetrina_deals')
    .select('id, titolo, negozio, immagine')
    .eq('url', url)
    .gte('created_at', sevenDaysAgo)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// Pubblica un'offerta segnalata da un utente (fonte sempre 'utente', mai
// 'automatica': quelle le scrive solo il backend). sconto_pct NON si invia:
// lo calcola il database da prezzo/prezzo_originale (indicato da Cowork),
// mandarlo qui lo sovrascriverebbe con un valore che potrebbe disallinearsi
// dalla logica server. fonte_ref resta implicito (null): lo impone la RLS.
export async function submitDeal({
  categoria,
  negozio,
  titolo,
  descrizione,
  url,
  immagine,
  prezzo,
  prezzoOriginale,
  valuta = 'EUR',
  online,
  citta,
  scadeIl,
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: 'Devi essere loggato per segnalare un’offerta.' };
  if (!categoria) return { error: 'Manca la categoria.' };
  if (!titolo?.trim()) return { error: 'Manca il titolo.' };
  if (!url?.trim()) return { error: 'Manca il link.' };

  const { data, error } = await supabase
    .from('vetrina_deals')
    .insert({
      categoria,
      negozio: negozio?.trim() || null,
      titolo: titolo.trim(),
      descrizione: descrizione?.trim() || null,
      url: url.trim(),
      immagine: immagine || null,
      prezzo: prezzo ?? null,
      prezzo_originale: prezzoOriginale ?? null,
      valuta,
      online: !!online,
      citta: online ? null : citta?.trim() || null,
      scade_il: scadeIl || null,
      fonte: 'utente',
      author_id: auth.user.id,
      stato: 'attiva',
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}

// Un titolo dai meta tag Open Graph può arrivare con entità HTML non
// decodificate (es. "&egrave;" invece di "è", segnalato da Cowork dopo
// aver testato la funzione dal vivo) — si decodificano passandole per un
// DOMParser, mai messe così com'è nel form.
function decodeHtmlEntities(text) {
  if (!text) return text;
  return new DOMParser().parseFromString(text, 'text/html').documentElement.textContent;
}

// Anteprima del link (titolo/immagine/eventualmente prezzo dai meta tag
// Open Graph) per precompilare il form: un fetch diretto da browser di un
// URL esterno qualunque fallisce quasi sempre per CORS, quindi passa da
// una funzione server-side (Edge Function "link-preview", ora attiva —
// richiede un utente loggato, risponde 401 altrimenti, per questo il
// pulsante di pubblicazione è già dietro login). Se non risponde (sito
// irraggiungibile, non è una pagina web, host non consentito — errore
// 422), il form resta compilabile a mano: mai bloccante.
export async function fetchLinkPreview(url) {
  try {
    const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } });
    if (error || !data) return null;
    return {
      titolo: decodeHtmlEntities(data.title) ?? null,
      immagine: data.image ?? null,
      prezzo: data.price != null ? Number(data.price) : null,
      valuta: data.currency ?? null,
    };
  } catch {
    return null;
  }
}
