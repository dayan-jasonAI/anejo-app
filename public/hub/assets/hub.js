/* Añejo HUB — shared client runtime.
   Exposes window.Hub with: session check, role-based redirect, PWA install prompt,
   service-worker registration, a track() wrapper that POSTs to /api/hub/track,
   and small DOM/toast helpers. No build step; plain ES in the browser. */
(function () {
  'use strict';

  var Hub = {};

  // ---------- tiny helpers ----------
  Hub.$ = function (sel, root) { return (root || document).querySelector(sel); };
  Hub.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  };
  Hub.money = function (cents) { return '$' + ((cents || 0) / 100).toFixed(2); };

  // Re-apply EN/ES translation after dynamic content renders. Debounced and triggered by
  // network completion / toasts (NOT DOM mutations), so it can never feedback-loop.
  var _i18nT = 0;
  Hub.i18nRefresh = function () {
    if (!window.AnejoI18n) return;
    if (_i18nT) return;
    _i18nT = setTimeout(function () { _i18nT = 0; try { window.AnejoI18n.refresh(); } catch (e) {} }, 50);
  };

  Hub.toast = function (msg) {
    var el = document.getElementById('hub-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hub-toast';
      el.className = 'hub-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    Hub.i18nRefresh();
    clearTimeout(Hub._toastT);
    Hub._toastT = setTimeout(function () { el.classList.remove('show'); }, 2400);
  };

  // ---------- api ----------
  Hub.api = function (path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(path, init).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) { data._status = r.status; }
        Hub.i18nRefresh();
        return data;
      });
    }).catch(function () {
      // Network drop (offline / dead zone). NEVER reject — that would leave callers that
      // disabled a button waiting forever (frozen UI). Resolve with an error object so the
      // caller's normal `if (!resp.ok)` path runs: re-enables the button + shows the toast.
      return { _networkError: true, error: 'Network error — check your connection and try again.' };
    });
  };

  // ---------- session ----------
  // Returns the /api/me payload. We tolerate both the trainer shape and a future
  // staff/role shape (role lives at top level or under .staff / .trainer).
  Hub.me = function () {
    return Hub.api('/api/me').then(function (data) { Hub._me = data; return data; });
  };

  Hub.roleFromMe = function (data) {
    if (!data) return null;
    if (data.role) return data.role;
    if (data.staff && data.staff.role) return data.staff.role;
    if (data.user && data.user.role) return data.user.role;
    if (data.trainer) return 'trainer';
    if (data.authenticated && data.email && !data.trainer) return data.client ? 'client' : null;
    return null;
  };

  // ---------- shared bottom nav ----------
  // Per-role nav items (mirror owner.js / kitchen.js / driver.js so the SHARED pages —
  // comms, account, team — and the vendor surface get the same fixed bottom bar the
  // role-specific pages already have. Owner/kitchen/driver pages render their own nav and
  // are skipped here via the existing-nav guard.)
  var NAVS = {
    owner: [
      { key: 'overview', ico: '◎', label: 'Overview', href: '/hub/owner/' },
      { key: 'customers', ico: '🧑‍🤝‍🧑', label: 'Customers', href: '/hub/owner/customers.html' },
      { key: 'deliveries', ico: '🚚', label: 'Deliveries', href: '/hub/owner/deliveries.html' },
      { key: 'kitchen', ico: '🍳', label: 'Kitchen', href: '/hub/owner/kitchen.html' },
      { key: 'staff', ico: '👥', label: 'Staff', href: '/hub/owner/staff.html' },
      { key: 'finance', ico: '💵', label: 'Finance', href: '/hub/owner/finance.html' },
      { key: 'comms', ico: '💬', label: 'Comms', href: '/hub/owner/comms.html' }
    ],
    // Mirror kitchen.js exactly so the bar is identical on a kitchen user's own pages and
    // on the shared comms/account/team pages.
    kitchen: [
      { key: 'board', ico: '🍽️', label: 'Orders', href: '/hub/kitchen/' },
      { key: 'checklists', ico: '✅', label: 'Checklists', href: '/hub/kitchen/checklists.html' },
      { key: 'studio', ico: '🎨', label: 'Studio', href: '/studio/' },
      { key: 'library', ico: '📚', label: 'Library', href: '/hub/kitchen/library.html' },
      { key: 'eod', ico: '🌙', label: 'EOD', href: '/hub/kitchen/eod.html' }
    ],
    // Mirror driver.js exactly (same reason).
    driver: [
      { key: 'home', ico: '🏠', label: 'Today', href: '/hub/driver/' },
      { key: 'route', ico: '🗺️', label: 'Route', href: '/hub/driver/route.html' },
      { key: 'temp', ico: '🌡️', label: 'Temp', href: '/hub/driver/temp.html' },
      { key: 'expenses', ico: '🧾', label: 'Expenses', href: '/hub/driver/expenses.html' },
      { key: 'eod', ico: '📋', label: 'EOD', href: '/hub/driver/eod.html' }
    ],
    vendor: [
      { key: 'home', ico: '🏠', label: 'Home', href: '/hub/vendor/' },
      { key: 'comms', ico: '💬', label: 'Comms', href: '/hub/comms.html' },
      { key: 'account', ico: '👤', label: 'Account', href: '/hub/account.html' }
    ]
  };

  // Render the fixed bottom nav for `role` (no-op if the page already has one, or role
  // has no nav defined). `activeKey` highlights the current tab.
  Hub.nav = function (role, activeKey) {
    try {
      if (document.querySelector('.hub-nav')) return; // page already renders its own
      var items = NAVS[role];
      if (!items) return;
      var nav = document.createElement('nav');
      nav.className = 'hub-nav';
      nav.innerHTML = items.map(function (n) {
        return '<a class="' + (n.key === activeKey ? 'active' : '') + '" href="' + n.href + '">' +
          '<span class="nav-ico">' + n.ico + '</span><span data-i18n>' + n.label + '</span></a>';
      }).join('');
      document.body.appendChild(nav);
      if (Hub.i18nRefresh) Hub.i18nRefresh();
    } catch (e) { /* nav is non-critical */ }
  };

  Hub.routeForRole = function (role) {
    switch (role) {
      case 'owner': return '/hub/owner';
      case 'kitchen': return '/hub/kitchen';
      case 'driver': return '/hub/driver';
      case 'vendor': return '/hub/vendor';
      case 'trainer': return '/trainer/dashboard';
      case 'client': return '/client/dashboard';
      default: return null;
    }
  };

  // Redirect to the right surface based on the current session.
  // If unauthenticated, sends to the magic-link portal.
  Hub.routeByRole = function (opts) {
    opts = opts || {};
    return Hub.me().then(function (data) {
      if (!data || !data.authenticated) {
        if (opts.onAnon) return opts.onAnon();
        window.location.replace('/login');
        return null;
      }
      var role = Hub.roleFromMe(data);
      var dest = Hub.routeForRole(role);
      if (!dest) {
        if (opts.onUnknown) return opts.onUnknown(data);
        return data;
      }
      if (!opts.noRedirect) window.location.replace(dest);
      return data;
    });
  };

  // Guard a surface: ensure the signed-in role is allowed; otherwise bounce.
  Hub.guard = function (allowed) {
    return Hub.me().then(function (data) {
      if (!data || !data.authenticated) { window.location.replace('/login'); return null; }
      var role = Hub.roleFromMe(data);
      if (allowed && allowed.indexOf(role) === -1) {
        var dest = Hub.routeForRole(role) || '/hub/';
        window.location.replace(dest);
        return null;
      }
      return data;
    });
  };

  // ---------- tracking ----------
  // Fire-and-forget client event → /api/hub/track (identity resolved server-side).
  Hub.track = function (event, properties) {
    try {
      var body = JSON.stringify({ event: event, properties: properties || {} });
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/hub/track', new Blob([body], { type: 'application/json' }));
        return Promise.resolve();
      }
      return fetch('/api/hub/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: body,
        keepalive: true,
      }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  };

  // ---------- PWA install prompt ----------
  Hub._deferredPrompt = null;
  Hub.initInstallPrompt = function () {
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      Hub._deferredPrompt = e;
      var box = document.getElementById('hub-install');
      if (box) box.classList.add('show');
    });
    window.addEventListener('appinstalled', function () {
      var os = /android/i.test(navigator.userAgent) ? 'android'
        : /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'ios' : 'desktop';
      Hub.track('app.installed', { os: os });
      var box = document.getElementById('hub-install');
      if (box) box.classList.remove('show');
    });
  };

  Hub.promptInstall = function () {
    var box = document.getElementById('hub-install');
    if (!Hub._deferredPrompt) { if (box) box.classList.remove('show'); return; }
    Hub._deferredPrompt.prompt();
    Hub._deferredPrompt.userChoice.finally(function () {
      Hub._deferredPrompt = null;
      if (box) box.classList.remove('show');
    });
  };

  Hub.dismissInstall = function () {
    var box = document.getElementById('hub-install');
    if (box) box.classList.remove('show');
  };

  // ---------- service worker ----------
  Hub.registerSW = function () {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/hub/sw.js', { scope: '/hub/' }).catch(function () {});
      });
    }
  };

  // ---------- boot ----------
  // Inject a universal Account button (top-right) on every HUB surface so staff can
  // always change their PIN or sign out, regardless of each page's own markup.
  Hub.mountAccountButton = function () {
    if (document.getElementById('hub-account-btn')) return;
    if (location.pathname.indexOf('/hub/account') === 0) return; // not on the account page itself
    var a = document.createElement('a');
    a.id = 'hub-account-btn';
    a.href = '/hub/account.html';
    a.setAttribute('aria-label', 'Account');
    a.textContent = '☰';
    a.style.cssText = 'position:fixed;top:10px;right:12px;z-index:60;width:38px;height:38px;display:flex;' +
      'align-items:center;justify-content:center;border-radius:50%;background:rgba(0,0,0,.18);color:#fff;' +
      'text-decoration:none;font-size:18px;backdrop-filter:blur(4px)';
    document.body.appendChild(a);
  };

  Hub.boot = function (opts) {
    opts = opts || {};
    Hub.registerSW();
    Hub.initInstallPrompt();
    if (opts.installButton) {
      var btn = document.getElementById(opts.installButton);
      if (btn) btn.addEventListener('click', Hub.promptInstall);
    }
    if (opts.account !== false) {
      if (document.body) Hub.mountAccountButton();
      else document.addEventListener('DOMContentLoaded', Hub.mountAccountButton);
    }
    return Hub;
  };

  // Global unread-messages badge: any link to /hub/comms.html gets a count pill, and the
  // ☰ account button gets a dot. Quietly no-ops pre-deploy (404) or signed-out (401).
  Hub.refreshUnreadBadge = function () {
    return fetch('/api/hub/comms/unread', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok) return;
        var n = Number(d.count) || 0;
        var links = document.querySelectorAll('a[href="/hub/comms.html"], a[href="/hub/comms"]');
        Array.prototype.forEach.call(links, function (a) {
          var b = a.querySelector('.hub-unread');
          if (!n) { if (b) b.remove(); return; }
          if (!b) {
            b = document.createElement('span');
            b.className = 'hub-unread';
            b.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;' +
              'margin-left:6px;padding:0 5px;border-radius:999px;background:#b3261e;color:#fff;font-size:11px;font-weight:700';
            a.appendChild(b);
          }
          b.textContent = n > 99 ? '99+' : String(n);
        });
        var acct = document.getElementById('hub-account-btn');
        if (acct) {
          var dot = acct.querySelector('.hub-unread-dot');
          if (n && !dot) {
            dot = document.createElement('span');
            dot.className = 'hub-unread-dot';
            dot.style.cssText = 'position:absolute;top:2px;right:2px;width:10px;height:10px;border-radius:50%;background:#b3261e';
            acct.style.position = 'fixed';
            acct.appendChild(dot);
          } else if (!n && dot) { dot.remove(); }
        }
      })
      .catch(function () {});
  };

  // ---------- Web push (subscribe/unsubscribe) ----------
  function urlB64ToUint8(s) {
    var pad = '='.repeat((4 - (s.length % 4)) % 4);
    var raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  // Current push state: 'unsupported' | 'denied' | 'off' | 'on'
  Hub.pushStatus = function () {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return Promise.resolve('unsupported');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return navigator.serviceWorker.ready
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) { return sub ? 'on' : 'off'; })
      .catch(function () { return 'off'; });
  };

  // Ask permission, subscribe with the server's VAPID key, register server-side.
  Hub.enablePush = function () {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return Promise.resolve({ ok: false, error: 'unsupported' });
    }
    return Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') return { ok: false, error: 'denied' };
      return fetch('/api/hub/push/subscribe', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (cfg) {
          if (!cfg || !cfg.vapid_public_key) return { ok: false, error: 'not_configured' };
          return navigator.serviceWorker.ready.then(function (reg) {
            return reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlB64ToUint8(cfg.vapid_public_key),
            });
          }).then(function (sub) {
            return Hub.api('/api/hub/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } })
              .then(function (res) { return { ok: !!(res && res.ok) }; });
          });
        });
    }).catch(function () { return { ok: false, error: 'failed' }; });
  };

  Hub.disablePush = function () {
    return navigator.serviceWorker.ready
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) {
        if (!sub) return { ok: true };
        var payload = { subscription: sub.toJSON(), action: 'unsubscribe' };
        return sub.unsubscribe().then(function () {
          return Hub.api('/api/hub/push/subscribe', { method: 'POST', body: payload })
            .then(function () { return { ok: true }; });
        });
      })
      .catch(function () { return { ok: false }; });
  };

  window.Hub = Hub;

  // Load the HUB Spanish (EN/ES) dictionary once — it registers with the shared i18n engine.
  if (!document.getElementById('hub-i18n-js')) {
    var i18nScript = document.createElement('script');
    i18nScript.id = 'hub-i18n-js';
    i18nScript.src = '/hub/assets/hub-i18n.js';
    (document.head || document.documentElement).appendChild(i18nScript);
  }

  // Auto-mount the universal Account button + unread badge on any page that loads hub.js.
  function autoMount() {
    Hub.mountAccountButton();
    Hub.refreshUnreadBadge();
    setInterval(Hub.refreshUnreadBadge, 60000); // refresh the badge once a minute
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
