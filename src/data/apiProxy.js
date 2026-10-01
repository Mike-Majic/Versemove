import { supabase } from './supabaseClient';

// Ricerche Giphy / YouTube / TMDB passando dall'edge function api-proxy
// (supabase/functions/api-proxy): le chiavi restano sul server (Vault),
// il sito non le contiene più. Serve l'accesso. Gli errori arrivano come
// Error con message = 'quota' | 'chiave' | 'timeout' | 'login' | 'rete',
// gli stessi codici che le colonne già traducono in messaggi.
const TIMEOUT_MS = 20000;

export async function apiProxy(service, params = {}) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS);
  });
  try {
    const { data, error } = await Promise.race([supabase.functions.invoke('api-proxy', { body: { service, params } }), timeout]);
    if (!error) return data;
    let code = 'rete';
    const status = error.context?.status ?? 0;
    try {
      const body = await error.context?.json?.();
      if (body?.code) code = body.code;
    } catch {
      // risposta senza JSON: resta "rete"
    }
    if (status === 401) code = 'login';
    if (code === 'rate') code = 'quota';
    throw new Error(code);
  } finally {
    clearTimeout(timer);
  }
}
