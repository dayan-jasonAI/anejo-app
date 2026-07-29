/* Añejo storefront service worker — customer order notifications.
 *
 * Scope is the whole site ('/'), separate from /hub/sw.js which serves the staff app. Two workers
 * rather than one because the audiences must not bleed: a customer must never be woken by a
 * kitchen alert, and vice versa.
 *
 * DELIBERATELY NOT A CACHE. This worker exists only to receive pushes. Caching the storefront
 * would put stale menu prices and stale legal pages in front of customers, which is a worse
 * problem than a slightly slower load.
 *
 * Push carries no payload — it wakes us, then we ask /api/push/peek what to show. Browsers
 * require a notification for EVERY push event, so the failure path still shows something rather
 * than letting the browser display its own "This site has been updated in the background".
 */
const ICON = '/assets/img/emblem.png';

self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let items = [];
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const res = await fetch('/api/push/peek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        if (res.ok) {
          const d = await res.json();
          items = (d && d.items) || [];
        }
      }
    } catch (e) { /* fall through to the generic notice below */ }

    if (!items.length) {
      // Every push MUST produce a notification or the browser shows its own. A vague one is
      // better than the browser's, but this is the path we do not want to be on.
      await self.registration.showNotification('Añejo Catering Co.', {
        body: 'Tap to see your order.', icon: ICON, badge: ICON, tag: 'anejo-order',
        data: { url: '/account' },
      });
      return;
    }

    for (const n of items) {
      await self.registration.showNotification(n.title || 'Añejo Catering Co.', {
        body: n.body || '',
        icon: ICON,
        badge: ICON,
        // Same tag per order → a new stage REPLACES the old notice instead of stacking five
        // of them down the lock screen.
        tag: n.kind === 'order' ? 'anejo-order' : ('anejo-' + (n.kind || 'note')),
        renotify: true,
        data: { url: n.url || '/account' },
      });
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/account';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reuse an open tab rather than piling up new ones every time they tap a notification.
    for (const c of all) {
      if ('focus' in c) { try { await c.navigate(url); } catch (e) { /* cross-origin */ } return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
