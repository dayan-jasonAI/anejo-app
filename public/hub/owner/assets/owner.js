/* Añejo HUB — Owner Command Center client helpers.
   Builds on window.Hub (public/hub/assets/hub.js): guard(), api(), track(), money(), esc().
   No build step; plain ES in the browser. Each owner page calls Owner.init(view, render).*/
(function () {
  'use strict';
  if (!window.Hub) { return; }
  var Hub = window.Hub;
  var Owner = {};

  // Bottom/desktop nav for the owner surface. Active tab is highlighted by `view`.
  //
  // 2026-08-04: all 15 of these used to render as one horizontally-scrolling row — the owner's
  // own complaint ("the menu bar in the bottom is covering information... specially in the
  // phone version"). Icons collided at desktop width and the bar was unusable on a phone.
  // `primary: true` marks the 5 an owner reaches for daily (Overview, Deliveries, Kitchen,
  // Marketing, Finance — order chosen to match how often each is opened, per Dayan's own
  // description of his day: check the board, watch deliveries, run the kitchen, work marketing,
  // check money). Every other destination is unchanged and still lives at the same URL — it
  // just now opens from the "More" sheet instead of the bar itself. Nothing was dropped.
  var NAV = [
    { view: 'overview', href: '/hub/owner/', ico: '◎', label: 'Overview', primary: true },
    { view: 'customers', href: '/hub/owner/customers.html', ico: '🧑‍🤝‍🧑', label: 'Customers' },
    { view: 'rewards', href: '/hub/owner/rewards.html', ico: '🎁', label: 'Rewards' },
    { view: 'deliveries', href: '/hub/owner/deliveries.html', ico: '🚚', label: 'Deliveries', primary: true },
    { view: 'kitchen', href: '/hub/owner/kitchen.html', ico: '🍳', label: 'Kitchen', primary: true },
    { view: 'menu', href: '/hub/owner/menu.html', ico: '🍽️', label: 'Menu' },
    { view: 'staff', href: '/hub/owner/staff.html', ico: '👥', label: 'Staff' },
    { view: 'finance', href: '/hub/owner/finance.html', ico: '💵', label: 'Finance', primary: true },
    { view: 'trainers', href: '/hub/owner/trainers.html', ico: '🤝', label: 'Trainers' },
    { view: 'partners', href: '/hub/owner/partners.html', ico: '📣', label: 'Affiliate' },
    // 2026-08-04: Campaigns / Social / Team / Train-the-team used to be four separate nav tabs for
    // one job (the owner's own complaint — see marketing.html). They are now one workspace behind
    // this single tab: Today / Teach / Create inside /hub/owner/marketing.html.
    { view: 'marketing', href: '/hub/owner/marketing.html', ico: '📈', label: 'Marketing', primary: true },
    { view: 'inventory', href: '/hub/kitchen/inventory.html', ico: '📦', label: 'Inventory' },
    { view: 'studio', href: '/studio/', ico: '🎨', label: 'Studio' },
    { view: 'brief', href: '/hub/owner/brief-proposals.html', ico: '📋', label: 'Reviews' },
    { view: 'comms', href: '/hub/owner/comms.html', ico: '💬', label: 'Comms' }
  ];

  function navLinkHtml(n) {
    // aria-current carries what the gold `active` colour conveys visually; the icon is
    // decorative and hidden so AT reads "Deliveries", not "delivery truck Deliveries".
    var cls = n.active ? ' class="active" aria-current="page"' : '';
    return '<a href="' + n.href + '"' + cls + '><span class="nav-ico" aria-hidden="true">' + n.ico + '</span><span data-i18n>' + n.label + '</span></a>';
  }

  // Build (once) and wire the "More" sheet holding every non-primary destination. Returns
  // { open, close } so renderNav can flag the trigger's active state.
  function buildMoreSheet(overflowItems, active) {
    var backdrop = document.getElementById('hub-more-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'hub-more-backdrop';
      backdrop.className = 'hub-more-backdrop';
      backdrop.innerHTML =
        '<div class="hub-more-sheet" role="dialog" aria-modal="true" aria-label="More">' +
          '<div class="hub-more-head"><h2 data-i18n>More</h2>' +
            '<button type="button" class="hub-more-close" aria-label="Close">&times;</button></div>' +
          '<div class="list" id="hub-more-list"></div>' +
        '</div>';
      document.body.appendChild(backdrop);
      // Backdrop tap (not the sheet itself) closes — standard sheet-dismiss affordance.
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
      backdrop.querySelector('.hub-more-close').addEventListener('click', close);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && backdrop.classList.contains('open')) close();
      });
    }
    var list = backdrop.querySelector('#hub-more-list');
    list.innerHTML = overflowItems.map(function (n) {
      return '<a class="row' + (n.view === active ? ' active' : '') + '" href="' + n.href + '"' +
        (n.view === active ? ' aria-current="page"' : '') + '>' +
        '<span class="nav-ico" aria-hidden="true">' + n.ico + '</span>' +
        '<span class="row-main row-title" data-i18n>' + n.label + '</span></a>';
    }).join('');

    var trigger = null; // set by caller after this returns
    function open() {
      backdrop.classList.add('open');
      trigger && trigger.setAttribute('aria-expanded', 'true');
      var closeBtn = backdrop.querySelector('.hub-more-close');
      closeBtn.focus();
      document.body.style.overflow = 'hidden'; // sheet owns scrolling while open
    }
    function close() {
      backdrop.classList.remove('open');
      trigger && trigger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      trigger && trigger.focus();              // return focus to the control that opened it
    }
    if (window.Hub && Hub.i18nRefresh) Hub.i18nRefresh();
    return { open: open, close: close, setTrigger: function (t) { trigger = t; } };
  }

  Owner.renderNav = function (active) {
    var nav = document.getElementById('owner-nav');
    if (!nav) return;
    nav.className = 'hub-nav';
    var primary = [], overflow = [];
    NAV.forEach(function (orig) {
      var item = { view: orig.view, href: orig.href, ico: orig.ico, label: orig.label, active: orig.view === active };
      (orig.primary ? primary : overflow).push(item);
    });
    var activeIsOverflow = overflow.some(function (n) { return n.active; });
    nav.innerHTML = primary.map(navLinkHtml).join('') +
      '<button type="button" class="hub-nav-more' + (activeIsOverflow ? ' active' : '') + '" ' +
        'aria-haspopup="dialog" aria-expanded="false"' + (activeIsOverflow ? ' aria-current="page"' : '') + '>' +
        '<span class="nav-ico" aria-hidden="true">⋯</span><span data-i18n>More</span></button>';

    var sheet = buildMoreSheet(overflow, active);
    var trigger = nav.querySelector('.hub-nav-more');
    sheet.setTrigger(trigger);
    trigger.addEventListener('click', sheet.open);

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
    if (root) { root.innerHTML = '<div class="card accent"><p data-i18n>Could not load. Pull to refresh.</p></div>'; return; }
    // Not every owner page has #owner-root (traffic, sms-test) — without a fallback those pages
    // render a permanently blank screen on a guard rejection or a render throw, with no clue why.
    if (Hub.toast) Hub.toast('Could not load. Pull to refresh.');
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
