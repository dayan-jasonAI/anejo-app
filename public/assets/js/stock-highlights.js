(function () {
  'use strict';

  var path = window.location && window.location.pathname;
  var isOrder = path === '/order' || path === '/order/';
  var isHome = path === '/' || path === '/index.html';
  if (!isHome && !isOrder) return;

  var root = null;
  var latest = [];
  var timer = null;
  var expiryTimer = null;
  var stopped = false;
  var refreshSequence = 0;

  if (!document.querySelector('link[data-stock-highlights-style]')) {
    var style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/assets/css/stock-highlights.css?v=20261103-1';
    style.setAttribute('data-stock-highlights-style', '');
    document.head.append(style);
  }

  function lang() {
    return window.AnejoLang && window.AnejoLang.get() === 'es' ? 'es' : 'en';
  }
  function text(en, es) { return lang() === 'es' ? es : en; }
  function safeItems(payload) {
    if (!payload || payload.ok !== true || payload.enabled !== true || !Array.isArray(payload.items)) return [];
    var now = Date.now();
    return payload.items.filter(function (item) {
      return item && typeof item.id === 'string' && item.id && typeof item.name === 'string' &&
        (typeof item.name_es === 'string' || item.name_es == null) && typeof item.image === 'string' &&
        Number.isSafeInteger(item.quantity) && item.quantity > 0 && Number.isSafeInteger(item.price_cents) &&
        item.price_cents >= 0 && Number.isSafeInteger(item.offer_revision) && item.offer_revision > 0 &&
        Number.isFinite(item.counted_at) && Number.isFinite(item.show_until) && item.show_until > now &&
        item.unit && typeof item.unit.en === 'string' && typeof item.unit.es === 'string' && typeof item.cta_url === 'string';
    }).filter(function (item) {
      try { var image = new URL(item.image, window.location.origin); return image.origin === window.location.origin && image.pathname.startsWith('/assets/img/'); }
      catch (_) { return false; }
    });
  }
  function ensureRoot() {
    if (root && root.isConnected) return root;
    var host;
    if (isHome) {
      host = document.querySelector('.hero.ahero');
      if (!host) return null;
      root = document.createElement('section');
      host.insertAdjacentElement('afterend', root);
    } else {
      host = document.querySelector('.order-hero');
      if (host) {
        root = document.createElement('section');
        host.insertAdjacentElement('afterend', root);
      } else {
        host = document.querySelector('#shopCategories, .order-layout, main');
        if (!host) return null;
        root = document.createElement('section');
        host.insertAdjacentElement('beforebegin', root);
      }
    }
    root.className = 'stock-highlights';
    root.hidden = true;
    root.setAttribute('aria-label', text('Recorded menu availability', 'Existencias registradas del menú'));
    return root;
  }
  function linkFor(item) {
    try {
      var url = new URL(item.cta_url, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname !== '/order' || url.searchParams.get('product') !== item.id) return null;
      url.searchParams.set('offer_revision', String(item.offer_revision));
      url.searchParams.set('utm_source', 'inventory_alert');
      return url.pathname + url.search;
    } catch (_) { return null; }
  }
  function clearExpiry() {
    if (expiryTimer) window.clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  function hide() {
    latest = [];
    clearExpiry();
    if (root) { root.replaceChildren(); root.hidden = true; }
  }
  function render() {
    if (!root) root = ensureRoot();
    if (!root) return;
    var now = Date.now();
    var items = latest.filter(function (item) { return item.show_until > now; });
    if (!items.length) { hide(); return; }
    latest = items;
    root.replaceChildren();
    root.hidden = false;
    root.setAttribute('aria-label', text('Recorded menu availability', 'Existencias registradas del menú'));

    var heading = document.createElement('div');
    heading.className = 'stock-highlights-heading';
    var intro = document.createElement('div');
    var eyebrow = document.createElement('p');
    eyebrow.className = 'stock-highlights-eyebrow';
    eyebrow.textContent = text('LIMITED MENU AVAILABILITY', 'EXISTENCIAS LIMITADAS DEL MENÚ');
    var title = document.createElement('h2');
    title.textContent = text('Recorded quantities', 'Cantidades registradas');
    var note = document.createElement('p');
    note.className = 'stock-highlights-note';
    note.textContent = text('Recorded at the count time. Check current availability before ordering.', 'Registrado al momento del conteo. Consulta las existencias actuales antes de pedir.');
    intro.append(eyebrow, title, note);
    heading.append(intro);
    root.append(heading);

    var list = document.createElement('div');
    list.className = 'stock-highlights-list';
    list.setAttribute('role', 'list');
    var expanded = false;
    function drawCards() {
      list.replaceChildren();
      items.forEach(function (item, index) {
        if (index >= 3 && !expanded) return;
        var card = document.createElement('article');
        card.className = 'stock-highlight-card';
        card.setAttribute('role', 'listitem');
        var img = document.createElement('img');
        img.className = 'stock-highlight-photo';
        img.src = item.image;
        img.alt = item.name_es && lang() === 'es' ? item.name_es : item.name;
        img.loading = 'lazy';
        img.decoding = 'async';
        var body = document.createElement('div');
        body.className = 'stock-highlight-body';
        var name = document.createElement('h3');
        name.textContent = item.name_es && lang() === 'es' ? item.name_es : item.name;
        var qty = document.createElement('p');
        qty.className = 'stock-highlight-quantity';
        qty.textContent = String(item.quantity) + ' ' + item.unit[lang()];
        var price = document.createElement('p');
        price.className = 'stock-highlight-price';
        price.textContent = new Intl.NumberFormat(lang() === 'es' ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format(item.price_cents / 100);
        var checked = document.createElement('p');
        checked.className = 'stock-highlight-time';
        checked.textContent = text('Recorded ', 'Registrado ') + new Intl.DateTimeFormat(lang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(item.counted_at);
        var href = linkFor(item);
        if (href) {
          var cta = document.createElement('a');
          cta.className = 'stock-highlight-cta';
          cta.href = href;
          cta.textContent = text('Choose delivery & order', 'Elige entrega y ordena');
          body.append(name, qty, price, checked, cta);
        } else body.append(name, qty, price, checked);
        card.append(img, body);
        list.append(card);
      });
    }
    drawCards();
    root.append(list);
    if (items.length > 3) {
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'stock-highlights-more';
      more.textContent = text('Show all ' + items.length + ' items', 'Mostrar los ' + items.length + ' artículos');
      more.setAttribute('aria-expanded', 'false');
      more.addEventListener('click', function () {
        expanded = !expanded;
        more.setAttribute('aria-expanded', String(expanded));
        more.textContent = expanded ? text('Show fewer items', 'Mostrar menos artículos') : text('Show all ' + items.length + ' items', 'Mostrar los ' + items.length + ' artículos');
        drawCards();
      });
      root.append(more);
    }
    var foot = document.createElement('p');
    foot.className = 'stock-highlights-footnote';
    foot.textContent = text('Availability can change. Confirm current stock in the menu.', 'Las existencias pueden cambiar. Confirma la disponibilidad actual en el menú.');
    root.append(foot);

    clearExpiry();
    var next = Math.min.apply(null, items.map(function (item) { return item.show_until; }));
    expiryTimer = window.setTimeout(function () { latest = latest.filter(function (item) { return item.show_until > Date.now(); }); render(); }, Math.max(0, next - Date.now() + 1));
  }
  async function refresh() {
    if (stopped || document.hidden) return;
    var sequence = ++refreshSequence;
    try {
      var response = await fetch('/api/stock-highlights', { cache: 'no-store', credentials: 'same-origin' });
      if (sequence !== refreshSequence || stopped || document.hidden) return;
      if (!response.ok) { hide(); return; }
      var payload = await response.json();
      if (sequence !== refreshSequence || stopped || document.hidden) return;
      latest = safeItems(payload);
      if (!payload || payload.ok !== true || payload.enabled !== true) { hide(); return; }
      render();
    } catch (_) { if (sequence === refreshSequence && !stopped && !document.hidden) hide(); }
  }
  function start() {
    if (stopped || document.hidden) return;
    if (timer) window.clearInterval(timer);
    refresh();
    timer = window.setInterval(refresh, 20000);
  }
  function stop() {
    stopped = true;
    if (timer) window.clearInterval(timer);
    timer = null;
    clearExpiry();
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (timer) window.clearInterval(timer); timer = null; } else start(); });
  window.addEventListener('focus', refresh);
  window.addEventListener('pagehide', stop, { once: true });
  window.addEventListener('pageshow', function () { stopped = false; start(); });
  document.addEventListener('anejo:langchange', render);

  window.InventorySalesCheckout = window.InventorySalesCheckout || {};
  window.InventorySalesCheckout.enrich = function (items) {
    var selected = new URLSearchParams(window.location.search);
    var product = selected.get('product');
    var revision = Number(selected.get('offer_revision'));
    if (!product || !Number.isSafeInteger(revision) || revision < 1 || !Array.isArray(items)) return Array.isArray(items) ? items.map(function (item) { return Object.assign({}, item); }) : [];
    return items.map(function (item) {
      var copy = Object.assign({}, item);
      if (copy.id === product) copy.sale_offer_revision = revision;
      return copy;
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
