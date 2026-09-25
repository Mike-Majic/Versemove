import { supabase } from './supabaseClient';

// Eventi "di catalogo" delle categorie (tabella events con mondo +
// categoria: cosplay, nerd-live, teatro, arti-visive, live), letti con la
// RPC eventi_vicini già prevista dal backend: in corso / prossimi, tipo,
// distanza da un punto, conteggi "partecipo"/"interessato" e il proprio
// stato. Li riempiono il bot (Edge Function events-bot, fonte 'bot'), lo
// staff a mano (fonte 'curato') o gli utenti (fonte 'utente'). Diverso da
// data/events.js, che serve gli eventi del feed Social (mondo 'social').

export const EVENTO_TIPO_LABELS = {
  fiera: 'Fiera',
  raduno: 'Raduno',
  gara: 'Gara',
  shooting: 'Shooting',
  workshop: 'Workshop',
  spettacolo: 'Spettacolo',
  mostra: 'Mostra',
  concerto: 'Concerto',
  festival: 'Festival',
  torneo: 'Torneo',
  altro: 'Altro',
};

function mapRow(row) {
  return {
    id: row.id,
    autoreId: row.autore_id,
    mondo: row.mondo,
    categoria: row.categoria,
    tipo: row.tipo,
    titolo: row.titolo,
    descrizione: row.descrizione ?? '',
    citta: row.citta,
    indirizzo: row.indirizzo,
    paese: row.paese,
    lat: row.lat,
    lng: row.lng,
    dataEvento: row.data_evento,
    dataFine: row.data_fine,
    url: row.url_ufficiale,
    fotoUrl: row.foto_url,
    fonte: row.fonte,
    inCorso: !!row.in_corso,
    distanzaKm: row.distanza_km != null ? Number(row.distanza_km) : null,
    nPartecipa: Number(row.n_partecipa ?? 0),
    nInteressati: Number(row.n_interessati ?? 0),
    mioStato: row.mio_stato ?? null,
  };
}

// periodo: 'prossimi' (in corso + futuri, default), 'in_corso', 'futuri', 'passati'.
export async function listEventi({ mondo, categoria, periodo = 'prossimi', tipo = null, lat = null, lng = null, km = null, limit = 60, offset = 0 } = {}) {
  try {
    const { data, error } = await supabase.rpc('eventi_vicini', {
      p_lat: lat,
      p_lng: lng,
      p_km: km,
      p_mondo: mondo ?? null,
      p_categoria: categoria ?? null,
      p_periodo: periodo,
      p_tipo: tipo,
      p_limit: limit,
      p_offset: offset,
    });
    if (error || !data) return [];
    return data.map(mapRow);
  } catch {
    return [];
  }
}

// Stato personale su un evento: 'partecipa', 'interessato' o null (nessuno).
// Una riga per utente in event_attendees: si cancella e si reinserisce.
export async function setMioStatoEvento(eventId, stato) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error: delErr } = await supabase.from('event_attendees').delete().eq('event_id', eventId).eq('user_id', auth.user.id);
    if (delErr) return { error: delErr.message };
    if (!stato) return { stato: null };
    const { error } = await supabase.from('event_attendees').insert({ event_id: eventId, user_id: auth.user.id, stato });
    if (error) return { error: error.message };
    return { stato };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// --- Bot eventi (pannello Backend) ---

export async function listBotRuns(limit = 20) {
  try {
    const { data, error } = await supabase.from('events_bot_runs').select('*').order('started_at', { ascending: false }).limit(limit);
    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

// Lancia un giro del bot adesso (solo owner/moderatore: lo verifica la
// funzione stessa con il token dell'utente). categoria facoltativa.
export async function runEventsBot(categoria = null) {
  try {
    const { data, error } = await supabase.functions.invoke('events-bot', { body: categoria ? { categoria } : {} });
    if (error) {
      let detail = '';
      try {
        detail = (await error.context?.json?.())?.error ?? '';
      } catch {
        // nessun dettaglio
      }
      return { error: detail || error.message || 'Il bot non ha risposto.' };
    }
    return { result: data };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export function formatIntervalloEvento(inizioIso, fineIso) {
  if (!inizioIso) return '';
  const a = new Date(inizioIso);
  const b = fineIso ? new Date(fineIso) : null;
  const opt = { day: 'numeric', month: 'short' };
  const sameDay = b && a.toDateString() === b.toDateString();
  if (!b || sameDay) return a.toLocaleDateString('it-IT', { ...opt, year: 'numeric' });
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  const start = sameMonth ? String(a.getDate()) : a.toLocaleDateString('it-IT', opt);
  return `${start} – ${b.toLocaleDateString('it-IT', { ...opt, year: 'numeric' })}`;
}
