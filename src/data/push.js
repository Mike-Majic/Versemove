import { supabase } from './supabaseClient';

// Notifiche push (Web Push) su questo dispositivo: iscrizione del browser
// col service worker dell'app, salvata in push_subscriptions
// (save_push_subscription). Le manda l'edge function send-push quando
// arriva una notifica, un messaggio o una chiamata (trigger nel DB).
// La chiave VAPID pubblica non è un segreto: serve al browser per
// riconoscere chi manda le notifiche.
export const VAPID_PUBLIC_KEY = 'BKVUPXnZoJkUzPLpxthhbuma-JsX42GIJrGiQxOSko2nSCL6Y0BYOlrOzomqvwQXfk3yulxWWXN_AnuRoBzxmV8';

function base64UrlToBytes(b64) {
  const padded = (b64 + '==='.slice((b64.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const bytesToBase64Url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function pushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// iPhone/iPad: le push web funzionano solo con l'app aggiunta alla schermata
// Home (iOS 16.4+), non da Safari.
export function needsHomeScreenInstall() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
  return ios && !standalone;
}

async function registration() {
  return navigator.serviceWorker.ready;
}

// -> 'unsupported' | 'denied' | 'on' | 'off'
export async function getPushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await Promise.race([registration(), new Promise((r) => setTimeout(() => r(null), 3000))]);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

// Chiede il permesso (se serve), iscrive il browser e salva l'iscrizione.
// -> {} | { error }
export async function enablePush() {
  if (!pushSupported()) return { error: 'Questo browser non supporta le notifiche push.' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { error: 'Permesso negato: puoi riattivarlo dalle impostazioni del browser.' };
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) });
    const { error } = await supabase.rpc('save_push_subscription', {
      p_endpoint: sub.endpoint,
      p_p256dh: bytesToBase64Url(sub.getKey('p256dh')),
      p_auth: bytesToBase64Url(sub.getKey('auth')),
      p_user_agent: navigator.userAgent,
    });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Impossibile attivare le notifiche.' };
  }
}

// Toglie l'iscrizione di questo dispositivo (browser e DB).
export async function disablePush() {
  try {
    const reg = await registration();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    return {};
  } catch (err) {
    return { error: err?.message ?? 'Impossibile disattivare le notifiche.' };
  }
}
