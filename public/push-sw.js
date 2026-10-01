/* Notifiche push di Versemove (importato dal service worker generato da
   vite-plugin-pwa, vedi vite.config.js → workbox.importScripts). Il
   contenuto arriva dall'edge function send-push: { title, body, tag,
   url, kind } dove kind è 'chat' | 'call' | 'notifica'. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      // Con l'app aperta e in primo piano l'avviso lo mostra già lei
      // (toast delle notifiche, chiamata in arrivo): niente doppioni.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((w) => w.visibilityState === 'visible' && w.focused)) return;
      const isCall = data.kind === 'call';
      await self.registration.showNotification(data.title || 'Versemove', {
        body: data.body || '',
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        icon: 'icons/favicon-192.png',
        badge: 'icons/favicon-48.png',
        requireInteraction: isCall,
        vibrate: isCall ? [400, 200, 400, 200, 400] : [120],
        data: { url: data.url || './' },
      });
    })()
  );
});

// Tocco sulla notifica: riporta in primo piano l'app se è già aperta,
// altrimenti la apre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (existing) {
        await existing.focus();
        if (target !== self.registration.scope && 'navigate' in existing) existing.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});
