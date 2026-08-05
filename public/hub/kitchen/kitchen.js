/* Añejo HUB — Kitchen app shared runtime.
   Renders the bottom nav, guards the surface to kitchen/owner, and exposes small
   helpers on window.Kitchen. Depends on window.Hub (hub.js) being loaded first. */
(function () {
  'use strict';
  var K = {};
  var Hub = window.Hub;

  // Bottom-nav definition (icon, label, href). Active item derived from the page key.
  var NAV = [
    { key: 'board',      ico: '🍽️', label: 'Orders',     href: '/hub/kitchen/', primary: true },
    { key: 'checklists', ico: '✅', label: 'Checklists', href: '/hub/kitchen/checklists.html', primary: true },
    { key: 'inventory',  ico: '📦', label: 'Inventory',  href: '/hub/kitchen/inventory.html', primary: true },
    { key: 'studio',     ico: '🎨', label: 'Studio',     href: '/studio/', primary: true },
    { key: 'eod',        ico: '🌙', label: 'EOD',        href: '/hub/kitchen/eod.html', primary: true },
    // Behind ⋯ More. Both are look-something-up surfaces rather than service tasks, and the bar
    // stays 6 slots wide — a 7th slot pushed the last item entirely off a 375px screen.
    { key: 'library',    ico: '📚', label: 'Library',    href: '/hub/kitchen/library.html' },
    // Keep LAST. It is a rights surface, not a task surface — nobody opens it during service, so
    // it must not push a task tab out of reach. Mirror any change in hub.js NAVS.kitchen.
    { key: 'mydata',     ico: '🔒', label: 'My data',    href: '/hub/my-activity.html' }
  ];

  K.renderNav = function (activeKey) {
    var nav = document.createElement('nav');
    nav.className = 'hub-nav';
    if (window.Hub && Hub.renderNavWithMore) {
      document.body.appendChild(nav);
      Hub.renderNavWithMore(nav, NAV, activeKey);
      return;
    }
    nav.innerHTML = NAV.map(function (n) {
      // aria-current carries what the gold `active` colour conveys visually; the icon is
      // decorative and hidden so AT reads "Orders", not "plate with cutlery Orders".
      var on = n.key === activeKey;
      return '<a class="' + (on ? 'active' : '') + '"' + (on ? ' aria-current="page"' : '') + ' href="' + n.href + '">' +
        '<span class="nav-ico" aria-hidden="true">' + n.ico + '</span><span>' + n.label + '</span></a>';
    }).join('');
    document.body.appendChild(nav);
    if (window.Hub && Hub.i18nRefresh) Hub.i18nRefresh();
  };

  // Guard + boot a kitchen page. cb(me) runs once authenticated as kitchen/owner.
  K.boot = function (activeKey, cb) {
    Hub.boot({ installButton: 'install-btn' });
    K.renderNav(activeKey);
    Hub.guard(['kitchen', 'owner']).then(function (me) {
      if (!me) return; // guard already redirected
      if (cb) cb(me);
    });
  };

  // Convenience GET/POST that surface errors via toast.
  K.get = function (path) { return Hub.api(path); };
  K.post = function (path, body) { return Hub.api(path, { method: 'POST', body: body || {} }); };

  K.fail = function (data, fallback) {
    var msg = (data && data.error) || fallback || 'Something went wrong.';
    Hub.toast(msg);
    return data;
  };

  // Best-effort geolocation (resolves null rather than rejecting).
  K.geo = function () {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); },
        function () { resolve(null); },
        { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 }
      );
    });
  };

  window.Kitchen = K;
})();
