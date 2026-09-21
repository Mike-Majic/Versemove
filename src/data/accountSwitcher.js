import { supabase } from './supabaseClient';

// Sessioni salvate su QUESTO dispositivo per passare da un account
// collegato all'altro senza reinserire la password ogni volta (switcher
// stile Facebook): stesso principio con cui Supabase stesso tiene la
// sessione attiva in localStorage. La prima volta che si passa a un
// account serve comunque la password — da lì in poi lo switch è istantaneo
// su questo stesso dispositivo, finché non si effettua un logout esplicito.
const DEVICE_SESSIONS_KEY = 'rb-device-sessions';

function loadDeviceSessions() {
  try {
    const raw = localStorage.getItem(DEVICE_SESSIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDeviceSessions(sessions) {
  try {
    localStorage.setItem(DEVICE_SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    // storage piena/privata: si perde solo la comodità dello switch rapido
  }
}

// Da richiamare ad ogni sessione attiva riconosciuta (vedi
// subscribeAuthChanges in accounts.js): memorizza i token di questo login
// così la prossima volta lo switcher può riattivarlo senza password.
export function rememberDeviceSession(account, session) {
  if (!account?.id || !session?.access_token || !session?.refresh_token) return;
  const sessions = loadDeviceSessions();
  sessions[account.id] = {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    nickname: account.nickname,
    avatar: account.avatar,
  };
  saveDeviceSessions(sessions);
}

export function forgetDeviceSession(accountId) {
  const sessions = loadDeviceSessions();
  delete sessions[accountId];
  saveDeviceSessions(sessions);
}

export function hasDeviceSession(accountId) {
  return Boolean(loadDeviceSessions()[accountId]);
}

// Riattiva la sessione salvata di un account collegato, se questo
// dispositivo la conosce già. { needsPassword: true } se non c'è (primo
// switch su questo dispositivo, o token ormai scaduto) — va chiesta la
// password e poi richiamato loginAccount, che la ri-registra da solo
// tramite subscribeAuthChanges.
export async function switchToDeviceSession(accountId) {
  const saved = loadDeviceSessions()[accountId];
  if (!saved) return { needsPassword: true };
  const { data, error } = await supabase.auth.setSession({
    access_token: saved.accessToken,
    refresh_token: saved.refreshToken,
  });
  if (error || !data?.session) {
    forgetDeviceSession(accountId);
    return { needsPassword: true };
  }
  return {};
}
