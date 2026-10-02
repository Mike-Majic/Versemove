import { createClient } from '@supabase/supabase-js';

// Chiave "anon"/publishable: pensata per stare nel bundle pubblico che
// arriva al browser (chiunque può leggerla dagli strumenti sviluppatore).
// Non è un segreto: l'accesso reale ai dati è deciso dalle regole RLS del
// progetto Supabase, non dalla segretezza di questa chiave. La
// service_role key (quella sì da non esporre mai) non viene mai usata qui.
export const SUPABASE_URL = 'https://bxcwwtydlaodntvilhik.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ4Y3d3dHlkbGFvZG50dmlsaGlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2MTU5NzQsImV4cCI6MjEwNTE5MTk3NH0.XJwgOKIkcAwoMaQdaQQacTQ5wdokzQAEkkZ5H4Ba7iQ';

const REMEMBER_ME_KEY = 'rb-remember-me';

// "Ricordami" (AuthModal): se spuntata (default) la sessione va in
// localStorage e resta anche a browser chiuso, come oggi; se l'utente la
// togliere prima di accedere, va invece in sessionStorage, che il browser
// stesso svuota alla chiusura — nessuna pulizia manuale da fare qui.
function rememberMeEnabled() {
  try {
    const stored = localStorage.getItem(REMEMBER_ME_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

export function setRememberMe(remember) {
  try {
    localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false');
  } catch {
    // storage non disponibile (privato/quota piena): resta il default.
  }
}

// Letto ad ogni chiamata (non una volta sola): AuthModal aggiorna la
// preferenza appena prima di accedere/registrarsi, e la sessione va scritta
// nello storage giusto fin da quella primissima volta, non solo da un
// eventuale prossimo avvio dell'app.
const authStorage = {
  getItem: (key) => (rememberMeEnabled() ? window.localStorage : window.sessionStorage).getItem(key),
  setItem: (key, value) => (rememberMeEnabled() ? window.localStorage : window.sessionStorage).setItem(key, value),
  removeItem: (key) => (rememberMeEnabled() ? window.localStorage : window.sessionStorage).removeItem(key),
};

// Account bloccato (App.jsx lo segnala con setApiBlocked): il server
// risponde 403 'account_bannato' a tutto tranne il proprio profilo, la guida
// FAQ e la chat INFO BAN (gate_account_bannato lato database). Le altre
// chiamate si fermano qui con la stessa risposta, senza andare in rete:
// niente traffico inutile né tentativi ripetuti da parte di aggiornamenti
// periodici e simili. Il login/logout (auth) passa sempre.
let apiBlocked = false;
export function setApiBlocked(blocked) {
  apiBlocked = Boolean(blocked);
}

const BLOCKED_READ_RE = /\/rest\/v1\/(profiles|faq_articles)\/?(\?|$)/;
const BLOCKED_RPC_RE = /\/rest\/v1\/rpc\/(get_ban_chat|send_ban_chat_message|ban_chat_rimasti|is_banned)\/?(\?|$)/;

function allowedWhileBlocked(url, method) {
  if (!url.startsWith(SUPABASE_URL)) return true;
  if (url.includes('/auth/v1/')) return true;
  if (BLOCKED_RPC_RE.test(url)) return true;
  return (method === 'GET' || method === 'HEAD') && BLOCKED_READ_RE.test(url);
}

function blockedResponse() {
  const body = JSON.stringify({
    code: '42501',
    message: 'account_bannato',
    details: null,
    hint: 'Account bloccato: è disponibile solo la chat INFO BAN nel mondo FAQ.',
  });
  return new Response(body, { status: 403, headers: { 'Content-Type': 'application/json' } });
}

function guardedFetch(input, init) {
  if (apiBlocked) {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    const method = (init?.method ?? (typeof input === 'object' && input?.method) ?? 'GET').toUpperCase();
    if (!allowedWhileBlocked(url, method)) return Promise.resolve(blockedResponse());
  }
  return fetch(input, init);
}

// persistSession/autoRefreshToken/detectSessionInUrl sono già i default di
// supabase-js, scritti qui solo per essere espliciti: la sessione va
// salvata nel browser e rinnovata da sola prima di scadere, così un
// aggiornamento della pagina non deve richiedere un nuovo login a chi ha
// già una sessione valida.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage,
  },
  global: { fetch: guardedFetch },
});
