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
});
