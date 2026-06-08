/* Añejo HUB — Driver app shared helpers. Builds on window.Hub (hub.js).
   Provides: role guard, bottom nav, geolocation, file→dataURL, and small form glue.
   Plain ES in the browser, no build step. */
(function () {
  'use strict';
  if (!window.Hub) { return; }
  var D = {};

  // Guard every driver screen to driver/owner.
  D.guard = function () { return Hub.guard(['driver', 'owner']); };

  // Bottom nav shared across driver screens. `active` = page key.
  D.nav = function (active) {
    var items = [
      { key: 'home', href: '/hub/driver/', ico: '🏠', label: 'Today' },
      { key: 'route', href: '/hub/driver/route.html', ico: '🗺️', label: 'Route' },
      { key: 'temp', href: '/hub/driver/temp.html', ico: '🌡️', label: 'Temp' },
      { key: 'expenses', href: '/hub/driver/expenses.html', ico: '🧾', label: 'Expenses' },
      { key: 'eod', href: '/hub/driver/eod.html', ico: '📋', label: 'EOD' }
    ];
    var html = items.map(function (it) {
      return '<a href="' + it.href + '" class="' + (it.key === active ? 'active' : '') +
        '"><span class="nav-ico">' + it.ico + '</span><span data-i18n>' + it.label + '</span></a>';
    }).join('');
    var nav = document.createElement('nav');
    nav.className = 'hub-nav';
    nav.innerHTML = html;
    document.body.appendChild(nav);
    if (window.AnejoI18n) window.AnejoI18n.refresh();
  };

  // Best-effort geolocation → {lat,lng,acc} or null (resolves, never rejects).
  D.geo = function (timeoutMs) {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, timeoutMs || 6000);
      navigator.geolocation.getCurrentPosition(
        function (p) {
          if (done) return; done = true; clearTimeout(t);
          resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy });
        },
        function () { if (!done) { done = true; clearTimeout(t); resolve(null); } },
        { enableHighAccuracy: true, timeout: timeoutMs || 6000, maximumAge: 30000 }
      );
    });
  };

  // Read a <input type=file> File into a compressed-ish data URL (JPEG, max ~1024px).
  // Falls back to the raw data URL if canvas isn't available.
  D.fileToDataUrl = function (file) {
    return new Promise(function (resolve) {
      if (!file) return resolve(null);
      var reader = new FileReader();
      reader.onload = function () {
        var src = reader.result;
        try {
          var img = new Image();
          img.onload = function () {
            var max = 1024;
            var scale = Math.min(1, max / Math.max(img.width, img.height));
            var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
            var c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', 0.7));
          };
          img.onerror = function () { resolve(src); };
          img.src = src;
        } catch (e) { resolve(src); }
      };
      reader.onerror = function () { resolve(null); };
      reader.readAsDataURL(file);
    });
  };

  // Map link from a {lat,lng} geo or a free-text label (opens native maps).
  D.mapsUrl = function (geo, label) {
    if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
      return 'https://maps.google.com/?q=' + geo.lat + ',' + geo.lng;
    }
    return 'https://maps.google.com/?q=' + encodeURIComponent(label || '');
  };

  D.fmtTime = function (ms) {
    if (!ms) return '—';
    try { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return '—'; }
  };

  window.Driver = D;
})();
