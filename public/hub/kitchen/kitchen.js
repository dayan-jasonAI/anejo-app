/* Añejo HUB — Kitchen app shared runtime.
   Renders the bottom nav, guards the surface to kitchen/owner, and exposes small
   helpers on window.Kitchen. Depends on window.Hub (hub.js) being loaded first. */
(function () {
  'use strict';
  var K = {};
  var Hub = window.Hub;

  // Bottom-nav definition (icon, label, href). Active item derived from the page key.
  var NAV = [
    { key: 'board',      ico: '🍽️', label: 'Orders',     href: '/hub/kitchen/' },
    { key: 'checklists', ico: '✅', label: 'Checklists', href: '/hub/kitchen/checklists.html' },
    { key: 'studio',     ico: '🎨', label: 'Studio',     href: '/studio/' },
    { key: 'library',    ico: '📚', label: 'Library',    href: '/hub/kitchen/library.html' },
    { key: 'eod',        ico: '🌙', label: 'EOD',        href: '/hub/kitchen/eod.html' }
  ];

  K.renderNav = function (activeKey) {
    var nav = document.createElement('nav');
    nav.className = 'hub-nav';
    nav.innerHTML = NAV.map(function (n) {
      var active = n.key === activeKey ? ' active' : '';
      return '<a class="' + active.trim() + '" href="' + n.href + '">' +
        '<span class="nav-ico">' + n.ico + '</span><span>' + n.label + '</span></a>';
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
