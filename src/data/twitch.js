import { supabase } from './supabaseClient';

// Twitch dentro Versemove (mondo Nerd, "Streaming & Content Creator"):
// tutto passa dall'edge function `twitch` (le chiavi Helix restano sul
// server). Serve l'accesso. I minorenni non ricevono mai le dirette per
// adulti: il filtro è nel backend (channel.mature_blocked).
//
// Errori: TwitchError con code = 'not_configured' | 'rate' | 'down' |
// 'login' | 'bad' e message già pronto da mostrare.
const TIMEOUT_MS = 20000;

export const TWITCH_ERRORS = {
  not_configured: 'Twitch non è ancora collegato',
  rate: 'Troppe richieste, riprova tra poco',
  down: 'Twitch non disponibile',
  login: 'Accedi per vedere Twitch',
  bad: 'Richiesta non valida',
};

export class TwitchError extends Error {
  constructor(code) {
    super(TWITCH_ERRORS[code] ?? TWITCH_ERRORS.down);
    this.code = code;
  }
}

async function call(action, params = {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TwitchError('down')), TIMEOUT_MS);
  });
  try {
    const { data, error } = await Promise.race([supabase.functions.invoke('twitch', { body: { action, params } }), timeout]);
    if (!error) return data ?? {};
    const status = error.context?.status ?? 0;
    let code = '';
    try {
      code = (await error.context?.json?.())?.code ?? '';
    } catch {
      // risposta senza JSON
    }
    if (status === 503 || code === 'not_configured') throw new TwitchError('not_configured');
    if (status === 429 || code === 'rate') throw new TwitchError('rate');
    if (status === 401) throw new TwitchError('login');
    if (status === 400) throw new TwitchError('bad');
    throw new TwitchError('down'); // 502 / 504 / rete
  } catch (err) {
    throw err instanceof TwitchError ? err : new TwitchError('down');
  } finally {
    clearTimeout(timer);
  }
}

// language: 'it' (predefinito), 'all' = tutte, oppure codice di 2 lettere.
export async function fetchStreams({ language = 'it', gameId = '', first = 24, after = '' } = {}) {
  const params = { language, first: Math.min(first, 40) };
  if (gameId) params.game_id = gameId;
  if (after) params.after = after;
  const data = await call('streams', params);
  return { streams: data.streams ?? [], cursor: data.cursor ?? null };
}

export async function fetchTopGames(first = 30) {
  const data = await call('top_games', { first: Math.min(first, 60) });
  return data.games ?? [];
}

export async function searchChannels(q, liveOnly = false) {
  const data = await call('search', { q, live_only: liveOnly });
  return data.channels ?? [];
}

export async function fetchChannel(login) {
  const data = await call('channel', { login });
  return data.channel ?? null;
}

export async function fetchLiveStatus(logins) {
  const data = await call('live_status', { logins: logins.slice(0, 100) });
  return data.streams ?? [];
}

// parent= deve contenere il dominio reale del sito (Twitch rifiuta
// l'incorporamento altrove): preso dalla pagina, così va anche in locale.
function parentParam() {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `parent=${encodeURIComponent(host || 'localhost')}`;
}

export function playerUrl(login) {
  return `https://player.twitch.tv/?channel=${encodeURIComponent(login)}&${parentParam()}&autoplay=true&muted=false`;
}

export function vodPlayerUrl(videoId) {
  return `https://player.twitch.tv/?video=${encodeURIComponent(videoId)}&${parentParam()}&autoplay=true`;
}

export function chatUrl(login) {
  return `https://www.twitch.tv/embed/${encodeURIComponent(login)}/chat?${parentParam()}&darkpopout`;
}

export function channelPageUrl(login) {
  return `https://twitch.tv/${encodeURIComponent(login)}`;
}

export function formatViewers(n) {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1).replace('.', ',')} Mln`;
  if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',')} K`;
  return String(v);
}
