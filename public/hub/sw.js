/* Añejo HUB service worker — app-shell cache.
   Strategy:
   - /api/*  navigations  → NOT intercepted (browser-native, so 302 + Set-Cookie from
                            magic-link / dev login work and the session actually switches).
   - /api/*  data fetches → network-only, soft offline fallback (never cache ops data).
   - /hub/   navigations  → network-first, fall back to cache, then offline page.
                            Never cache redirected/non-OK responses.
   - other navigations    → browser-native (not the HUB's concern).
   - static assets        → cache-first with background refresh.
   - web push             → encrypted event-specific payload, with legacy tickle fallback.
   Bump CACHE on shell changes to invalidate. */
const CACHE = 'anejo-hub-v8';
const PREFERENCES_CACHE = 'anejo-hub-preferences';
const LANGUAGE_KEY = '/hub/__push-language';
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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('anejo-hub-v') && k !== CACHE).map((k) => caches.delete(k))))
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

// Store only the display preference, never auth or customer data. Persists through SW restarts.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'HUB_PUSH_LANGUAGE') return;
  try {
    const source = new URL(event.source && event.source.url);
    if (source.origin !== self.location.origin || !source.pathname.startsWith('/hub/')) return;
  } catch { return; }
  event.waitUntil(caches.open(PREFERENCES_CACHE).then((c) => c.put(LANGUAGE_KEY,
    new Response(event.data.lang === 'es' ? 'es' : 'en'))));
});

async function pushLanguage() {
  try {
    const value = await (await caches.open(PREFERENCES_CACHE)).match(LANGUAGE_KEY);
    if (value) return (await value.text()) === 'es' ? 'es' : 'en';
  } catch { /* default to the device language */ }
  return String(self.navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

function safePushUrl(value) {
  try {
    if (typeof value !== 'string' || !value.startsWith('/hub/') || /[\\\r\n]/.test(value)) return '/hub/';
    const parsed = new URL(value, self.location.origin);
    return parsed.origin === self.location.origin && parsed.pathname.startsWith('/hub/')
      ? parsed.pathname + parsed.search + parsed.hash : '/hub/';
  } catch { return '/hub/'; }
}

async function displayHubPush(event) {
  const lang = await pushLanguage();
  let d = null;
  // Payload is the exact event which triggered this push, not a later unrelated alert.
  if (event.data) {
    try { d = event.data.json(); } catch { /* unreadable payload: explicit fallback below */ }
  } else {
    try {
      const response = await fetch('/api/hub/push/peek', { credentials: 'same-origin', cache: 'no-store' });
      if (response.ok) d = await response.json();
    } catch { /* offline/session unavailable */ }
  }
  // Honor userVisibleOnly even for an old queued tickle, but do not invent a new
  // message/order or let the browser substitute its generic background-update notice.
  if (d && d.notify === false) d = {
    title: 'Hub is up to date', body: 'No unread messages or recent alerts were found.',
    title_es: 'El Hub está al día', body_es: 'No se encontraron mensajes sin leer ni alertas recientes.',
    tag: 'anejo-hub-current', url: '/hub/',
  };
  const valid = d && typeof d.title === 'string' && typeof d.body === 'string';
  const title = valid ? ((lang === 'es' && d.title_es) || d.title)
    : (lang === 'es' ? 'Detalles de notificación no disponibles' : 'Notification details unavailable');
  const body = valid ? ((lang === 'es' && d.body_es) || d.body)
    : (lang === 'es' ? 'Abre Añejo Hub para revisar tus notificaciones. Puede que necesites iniciar sesión.'
      : 'Open Añejo Hub to review your notifications. You may need to sign in.');
  return self.registration.showNotification(title, {
    body, lang, icon: '/assets/img/emblem.png', badge: '/assets/img/emblem.png',
    tag: (valid && typeof d.tag === 'string' && /^anejo-hub-[a-zA-Z0-9_-]{1,100}$/.test(d.tag))
      ? d.tag : `anejo-hub-legacy-${Date.now()}`,
    renotify: true, vibrate: [80, 40, 80], data: { url: safePushUrl(valid && d.url) },
  });
}

self.addEventListener('push', (event) => {
  event.waitUntil(displayHubPush(event));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safePushUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        const windowUrl = new URL(w.url);
        if (windowUrl.origin === self.location.origin && windowUrl.pathname.startsWith('/hub/') && 'focus' in w) {
          // Focus the existing HUB window AND send it to the notification's target.
          if ('navigate' in w) { try { return w.navigate(url).then((c) => (c || w).focus()); } catch (e) { /* fall through */ } }
          return w.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
