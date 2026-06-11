/* Añejo HUB service worker — app-shell cache.
   Strategy:
   - /api/*  navigations  → NOT intercepted (browser-native, so 302 + Set-Cookie from
                            magic-link / dev login work and the session actually switches).
   - /api/*  data fetches → network-only, soft offline fallback (never cache ops data).
   - /hub/   navigations  → network-first, fall back to cache, then offline page.
                            Never cache redirected/non-OK responses.
   - other navigations    → browser-native (not the HUB's concern).
   - static assets        → cache-first with background refresh.
   - web push             → "tickle" pattern: pushes carry no payload; on push we fetch
                            /api/hub/push/peek (cookie-authed) and render the notification.
   Bump CACHE on shell changes to invalidate. */
const CACHE = 'anejo-hub-v3';
const SHELL = [
  '/hub/',
  '/hub/index.html',
  '/hub/offline.html',
  '/hub/assets/hub.css',
  '/hub/assets/hub.js',
  '/hub/manifest.webmanifest',
  '/assets/img/emblem.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // --- API ---
  if (url.pathname.startsWith('/api/')) {
    // Critical: do NOT intercept API *navigations* (e.g. /api/auth/verify, /api/dev/login).
    // Letting the browser handle them natively preserves the 302 redirect AND the
    // Set-Cookie that switches the session. Intercepting here breaks role switching.
    if (req.mode === 'navigate') return;
    // App-initiated data fetches: network-only, fail soft. Never cache ops data.
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }

  // --- Navigations ---
  if (req.mode === 'navigate') {
    // Only manage pages inside the HUB shell; leave the rest of the site to the browser.
    if (!url.pathname.startsWith('/hub/')) return;
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only cache clean, same-origin, non-redirected page responses.
          if (res && res.ok && !res.redirected && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/hub/offline.html')))
    );
    return;
  }

  // --- Static assets: cache-first, refresh in background. ---
  event.respondWith(
    caches.match(req).then((hit) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
      return hit || fetchPromise;
    })
  );
});

// ---------- Web push (tickle pattern) ----------
// Pushes are sent with NO payload (avoids RFC8291 encryption); the SW fetches a compact,
// cookie-authed summary and shows it. If the fetch fails we still show a generic note —
// browsers require a notification for every push event.
self.addEventListener('push', (event) => {
  event.waitUntil(
    fetch('/api/hub/push/peek', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const title = (d && d.title) || 'Añejo HUB';
        const body = (d && d.body) || 'You have a new update.';
        return self.registration.showNotification(title, {
          body,
          icon: '/assets/img/emblem.png',
          badge: '/assets/img/emblem.png',
          tag: 'anejo-hub',
          data: { url: '/hub/' },
        });
      })
      .catch(() =>
        self.registration.showNotification('Añejo HUB', {
          body: 'You have a new update.',
          icon: '/assets/img/emblem.png',
          tag: 'anejo-hub',
          data: { url: '/hub/' },
        })
      )
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/hub/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes('/hub') && 'focus' in w) return w.focus();
      }
      return clients.openWindow(url);
    })
  );
});
