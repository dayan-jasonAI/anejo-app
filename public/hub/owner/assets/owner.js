/* Añejo HUB — Owner Command Center client helpers.
   Builds on window.Hub (public/hub/assets/hub.js): guard(), api(), track(), money(), esc().
   No build step; plain ES in the browser. Each owner page calls Owner.init(view, render).*/
(function () {
  'use strict';
  if (!window.Hub) { return; }
  var Hub = window.Hub;
  var Owner = {};

  // Bottom/desktop nav for the owner surface. Active tab is highlighted by `view`.
  var NAV = [
    { view: 'overview', href: '/hub/owner/', ico: '◎', label: 'Overview' },
    { view: 'deliveries', href: '/hub/owner/deliveries.html', ico: '🚚', label: 'Deliveries' },
    { view: 'kitchen', href: '/hub/owner/kitchen.html', ico: '🍳', label: 'Kitchen' },
    { view: 'staff', href: '/hub/owner/staff.html', ico: '👥', label: 'Staff' },
    { view: 'finance', href: '/hub/owner/finance.html', ico: '💵', label: 'Finance' },
    { view: 'comms', href: '/hub/owner/comms.html', ico: '💬', label: 'Comms' }
  ];

  Owner.renderNav = function (active) {
    var nav = document.getElementById('owner-nav');
    if (!nav) return;
    nav.className = 'hub-nav';
    nav.innerHTML = NAV.map(function (n) {
      var cls = n.view === active ? ' class="active"' : '';
      return '<a href="' + n.href + '"' + cls + '><span class="nav-ico">' + n.ico + '</span><span data-i18n>' + n.label + '</span></a>';
    }).join('');
    if (window.Hub && Hub.i18nRefresh) Hub.i18nRefresh();
  };

  // Guard to owner, render nav, fire dashboard.viewed, then run the page renderer.
  Owner.init = function (view, render) {
    Owner.renderNav(view);
    return Hub.guard(['owner']).then(function (me) {
      if (!me) return;            // guard already redirected
      Hub.track('dashboard.viewed', { view: view, platform: 'pwa' });
      try { render(me); } catch (e) { Owner.fail(); }
      if (window.AnejoI18n) window.AnejoI18n.refresh();
      return me;
    }).catch(function () { Owner.fail(); });
  };

  Owner.fail = function () {
    var root = document.getElementById('owner-root');
    if (root) root.innerHTML = '<div class="card accent"><p data-i18n>Could not load. Pull to refresh.</p></div>';
  };

  // Convenience: GET an owner API path, returning parsed JSON (or {} on error).
  Owner.get = function (path) { return Hub.api(path); };

  // ---------- formatting ----------
  Owner.money = Hub.money;
  Owner.esc = Hub.esc;

  Owner.timeAgo = function (ms) {
    if (!ms) return '';
    var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s + 's ago';
    var m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  };

  Owner.clock = function (ms) {
    if (!ms) return '';
    try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
  };

  // A stat tile (card.stat) for the overview grid.
  Owner.tile = function (num, label, opts) {
    opts = opts || {};
    var cls = 'card stat';
    if (opts.accent) cls += ' ' + opts.accent;     // 'accent' (gold) | 'accent-green'
    var badge = opts.badge ? ' <span class="badge ' + (opts.badgeKind || '') + '">' + Owner.esc(opts.badge) + '</span>' : '';
    var href = opts.href || null;
    var inner =
      '<div class="stat-num">' + Owner.esc(String(num)) + '</div>' +
      '<div class="stat-label">' + Owner.esc(label) + badge + '</div>';
    if (href) return '<a class="' + cls + '" style="text-decoration:none;display:block" href="' + href + '">' + inner + '</a>';
    return '<div class="' + cls + '">' + inner + '</div>';
  };

  // A simple status badge from a severity/status string.
  Owner.badge = function (text, kind) {
    return '<span class="badge ' + (kind || '') + '">' + Owner.esc(text) + '</span>';
  };

  // Map alert/delivery severities → badge kind class.
  Owner.kindFor = function (sev) {
    switch (sev) {
      case 'critical': case 'failed': case 'urgent': case 'high': return 'crit';
      case 'warning': case 'medium': case 'pending': return 'warn';
      case 'info': case 'low': return 'info';
      case 'completed': case 'done': case 'ok': case 'approved': return 'ok';
      default: return '';
    }
  };

  window.Owner = Owner;
})();
