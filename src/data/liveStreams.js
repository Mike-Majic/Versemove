import { supabase } from './supabaseClient';
import { fetchProfilesMap } from './posts';

// Live reali dei mondi Social, Lavoro, Nerd e Intrattenimento (tabelle
// live_sessions/live_messages): non uno streaming nostro, ma
// l'incorporazione della diretta che la persona sta già facendo su
// Twitch/YouTube/Kick/TikTok — qui si registra solo
// piattaforma+canale (validati dal DB, vedi i CHECK di live_sessions) e si
// tiene una chat a fianco.

// Piattaforme ammesse per mondo (il DB accetta twitch/youtube/kick/tiktok
// in social, lavoro, nerd e arte — vedi i CHECK di live_sessions).
export const LIVE_PLATFORMS_BY_WORLD = {
  social: ['twitch', 'youtube', 'kick'],
  lavoro: ['twitch', 'youtube', 'kick'],
  nerd: ['twitch', 'youtube', 'kick'],
  arte: ['youtube', 'tiktok'],
};

const PLATFORM_LABEL = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok' };
export function platformLabel(piattaforma) {
  return PLATFORM_LABEL[piattaforma] ?? piattaforma;
}

function platformsText(list) {
  const names = list.map(platformLabel);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} o ${names.at(-1)}` : names[0];
}

export function liveLinkPlaceholder(platforms) {
  return `Link della diretta (${platformsText(platforms)})...`;
}

// Riconosce un link incollato (non un URL a caso: solo questi formati) e
// ne ricava piattaforma+canale, gli unici due campi che poi finiscono nel
// DB e nell'URL dell'embed — mai l'URL incollato così com'è.
// TikTok: canale = nome utente (diretta: tiktok.com/@nome/live o
// tiktok.com/@nome) oppure id numerico di un video (tiktok.com/@nome/video/ID).
export function parseLiveLink(rawUrl, platforms = ['twitch', 'youtube', 'kick']) {
  const url = (rawUrl ?? '').trim();
  if (!url) return { error: 'Incolla il link della tua diretta.' };
  const ok = (res) => (platforms.includes(res.piattaforma) ? res : { error: `Qui si possono condividere solo link di ${platformsText(platforms)}.` });

  const twitch = url.match(/twitch\.tv\/([A-Za-z0-9_]{3,25})\b/i);
  if (twitch) return ok({ piattaforma: 'twitch', canale: twitch[1] });

  const kick = url.match(/kick\.com\/([A-Za-z0-9_]{3,25})\b/i);
  if (kick) return ok({ piattaforma: 'kick', canale: kick[1] });

  if (/youtu\.?be/i.test(url)) {
    const short = url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/i);
    if (short) return ok({ piattaforma: 'youtube', canale: short[1] });
    const live = url.match(/youtube\.com\/(?:live|shorts)\/([A-Za-z0-9_-]{11})/i);
    if (live) return ok({ piattaforma: 'youtube', canale: live[1] });
    const watch = url.match(/[?&]v=([A-Za-z0-9_-]{11})/i);
    if (watch) return ok({ piattaforma: 'youtube', canale: watch[1] });
    return { error: 'Link YouTube non riconosciuto: usa il link del video o della diretta (youtube.com/live/… o youtube.com/watch?v=…).' };
  }

  if (/tiktok\.com/i.test(url)) {
    const video = url.match(/tiktok\.com\/@[A-Za-z0-9_.]{2,24}\/video\/([0-9]{15,21})/i);
    if (video) return ok({ piattaforma: 'tiktok', canale: video[1] });
    const user = url.match(/tiktok\.com\/@([A-Za-z0-9_.]{2,24})/i);
    if (user) return ok({ piattaforma: 'tiktok', canale: user[1] });
    return { error: 'Link TikTok non riconosciuto: incolla il link completo (tiktok.com/@nome/live).' };
  }

  return { error: `Link non riconosciuto. Incolla un link di ${platformsText(platforms)}.` };
}

const isTiktokVideo = (canale) => /^[0-9]{15,21}$/.test(canale ?? '');

// Costruisce l'URL dell'embed SOLO da piattaforma+canale già validati (mai
// dall'URL grezzo che qualcuno ha incollato): unici domini possibili.
// null = non incorporabile (le dirette TikTok: TikTok non permette di
// guardarle dentro altri siti — si apre tiktok.com).
export function buildEmbedUrl(piattaforma, canale) {
  if (piattaforma === 'twitch') {
    const host = typeof window !== 'undefined' ? window.location.hostname || 'localhost' : 'localhost';
    return `https://player.twitch.tv/?channel=${encodeURIComponent(canale)}&parent=${encodeURIComponent(host)}&autoplay=true`;
  }
  if (piattaforma === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(canale)}?autoplay=1`;
  }
  if (piattaforma === 'kick') {
    return `https://player.kick.com/${encodeURIComponent(canale)}`;
  }
  if (piattaforma === 'tiktok' && isTiktokVideo(canale)) {
    return `https://www.tiktok.com/player/v1/${encodeURIComponent(canale)}?autoplay=1&rel=0`;
  }
  return null;
}

// Link alla pagina originale (pulsante "Apri su ...").
export function externalLiveUrl(piattaforma, canale) {
  if (piattaforma === 'twitch') return `https://www.twitch.tv/${encodeURIComponent(canale)}`;
  if (piattaforma === 'youtube') return `https://www.youtube.com/watch?v=${encodeURIComponent(canale)}`;
  if (piattaforma === 'kick') return `https://kick.com/${encodeURIComponent(canale)}`;
  if (piattaforma === 'tiktok') {
    return isTiktokVideo(canale) ? `https://www.tiktok.com/embed/v2/${encodeURIComponent(canale)}` : `https://www.tiktok.com/@${encodeURIComponent(canale)}/live`;
  }
  return null;
}

// Anteprime della diretta, dalla più "viva" alla più generica; se nessuna
// si carica, la card mostra la foto profilo di chi l'ha condivisa.
// YouTube: miniatura della diretta; Twitch: fotogramma attuale (cambia
// ogni pochi minuti, per questo il parametro con l'ora); Kick e TikTok non
// hanno un'anteprima pubblica senza chiavi: foto profilo.
export function livePreviewUrls(piattaforma, canale) {
  if (piattaforma === 'youtube') {
    const id = encodeURIComponent(canale);
    return [`https://i.ytimg.com/vi/${id}/hqdefault_live.jpg`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`];
  }
  if (piattaforma === 'twitch') {
    const slot = Math.floor(Date.now() / 300000);
    return [`https://static-cdn.jtvnw.net/previews-ttv/live_user_${encodeURIComponent(canale.toLowerCase())}-440x248.jpg?t=${slot}`];
  }
  return [];
}

// Dirette attive di un mondo, con l'host già risolto (public_profiles) — la
// RLS (live_sessions_select_all) esclude già da sola quelle dell'altra
// fascia d'età o di un mondo non accessibile.
export async function listActiveLiveSessions(mondo) {
  try {
    const { data, error } = await supabase
      .from('live_sessions')
      .select('*')
      .eq('mondo', mondo)
      .eq('attiva', true)
      .order('iniziata_at', { ascending: true });
    if (error || !data) return [];

    const profilesMap = await fetchProfilesMap(data.map((s) => s.host_id));
    return data.map((row) => ({
      id: row.id,
      hostId: row.host_id,
      host: profilesMap.get(row.host_id) ?? { id: row.host_id, name: 'Utente', avatar: '' },
      piattaforma: row.piattaforma,
      canale: row.canale,
      titolo: row.titolo ?? '',
      iniziataAt: row.iniziata_at,
    }));
  } catch {
    return [];
  }
}

// Una sola diretta attiva per persona (vincolo del DB, live_sessions_one_active_per_host):
// un secondo tentativo arriva come violazione di unicità, tradotta qui.
export async function startLiveSession({ mondo, piattaforma, canale, titolo }) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { data, error } = await supabase
      .from('live_sessions')
      .insert({
        host_id: auth.user.id,
        mondo,
        piattaforma,
        canale,
        titolo: titolo?.trim() ? titolo.trim().slice(0, 100) : null,
        attiva: true,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return { error: 'Hai già una diretta attiva: terminala prima di avviarne un\'altra.' };
      return { error: error.message };
    }
    return { id: data.id };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function endLiveSession(sessionId) {
  try {
    const { error } = await supabase
      .from('live_sessions')
      .update({ attiva: false, terminata_at: new Date().toISOString() })
      .eq('id', sessionId);
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export async function fetchLiveMessages(sessionId) {
  try {
    const { data, error } = await supabase
      .from('live_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) return { error: error.message };
    if (!data) return { messages: [] };

    const profilesMap = await fetchProfilesMap(data.map((m) => m.user_id));
    const messages = data.map((row) => ({
      id: row.id,
      autoreId: row.user_id,
      author: profilesMap.get(row.user_id) ?? { id: row.user_id, name: 'Utente', avatar: '' },
      testo: row.testo,
      data: row.created_at,
    }));
    return { messages };
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

// Un messaggio respinto qui è sempre per un motivo di permesso (diretta
// finita, fascia d'età diversa dall'host, bloccati a vicenda): il messaggio
// richiesto è specifico per la live, non il generico "non puoi interagire".
export async function sendLiveMessage(sessionId, testo) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return { error: 'Devi essere loggato.' };
    const { error } = await supabase
      .from('live_messages')
      .insert({ session_id: sessionId, user_id: auth.user.id, testo });
    if (error) {
      if (error.code === '42501' || /row-level security/i.test(error.message ?? '')) {
        return { error: 'Non puoi scrivere in questa live.' };
      }
      return { error: error.message };
    }
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Errore di rete.' };
  }
}

export function subscribeToLiveMessages(sessionId, onInsert) {
  return supabase
    .channel(`live-messages-${sessionId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'live_messages', filter: `session_id=eq.${sessionId}` },
      (payload) => onInsert(payload.new)
    )
    .subscribe();
}

// Canale realtime per le dirette di un mondo: comparire/scomparire dalla
// lista quando qualcuno inizia o termina, senza dover ricaricare la pagina.
export function subscribeToLiveSessions(mondo, onChange) {
  return supabase
    .channel(`live-sessions-${mondo}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions', filter: `mondo=eq.${mondo}` }, onChange)
    .subscribe();
}
