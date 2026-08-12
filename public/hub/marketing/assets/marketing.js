/* Añejo HUB — Marketing Expert desk helpers.
   Mirrors the shape of kitchen.js / driver.js: this role's own pages render their own nav and
   guard themselves, and the item list is imported from Hub.navFor('marketing') so the bar is
   identical here and on the owner pages she shares (marketing workspace, affiliates, site copy).
   No build step; plain ES in the browser. */
(function () {
  'use strict';
  if (!window.Hub) { return; }
  var Hub = window.Hub;
  var M = {};

  // owner + marketing. Her surface admits the owner too: he has to be able to see the desk he
  // is asking her to run, and on any day she is out the run is still his to do.
  M.ROLES = ['owner', 'marketing'];

  M.renderNav = function (active) {
    var nav = document.getElementById('mkt-nav');
    if (!nav) return;
    nav.className = 'hub-nav';
    Hub.renderNavWithMore(nav, Hub.navFor('marketing') || [], active);
  };

  M.init = function (view, render) {
    M.renderNav(view);
    return Hub.guard(M.ROLES).then(function (me) {
      if (!me) return;                 // guard already redirected
      Hub.track('dashboard.viewed', { view: view, platform: 'pwa' });
      try { render(me); } catch (e) { M.fail(); }
      if (window.AnejoI18n) window.AnejoI18n.refresh();
      return me;
    }).catch(function () { M.fail(); });
  };

  M.fail = function () {
    var root = document.getElementById('mkt-root');
    if (root) root.innerHTML = '<div class="card accent"><p data-i18n>Could not load. Pull to refresh.</p></div>';
    else if (Hub.toast) Hub.toast('Could not load. Pull to refresh.');
  };

  M.get = function (path) {
    return Hub.api(path).catch(function () { return null; });
  };

  window.Marketing = M;
})();
