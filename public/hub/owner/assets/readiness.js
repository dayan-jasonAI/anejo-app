/* Owner-only, read-only readiness feed. Polls only its own panel, never assignment inputs. */
(function () {
  'use strict';
  var W = window, D = document;
  function es() { return W.AnejoLang && W.AnejoLang.get() === 'es'; }
  function text(en, spanish) { return es() ? spanish : en; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function label(en, spanish) { return '<span translate="no" data-ready-en="' + esc(en) + '" data-ready-es="' + esc(spanish) + '">' + esc(text(en, spanish)) + '</span>'; }
  function setLabel(el, en, spanish) { if (!el) return; el.setAttribute('data-ready-en', en); el.setAttribute('data-ready-es', spanish); el.textContent = text(en, spanish); }
  function refreshLabels() { D.querySelectorAll('[data-ready-en]').forEach(function (el) { el.textContent = el.getAttribute(es() ? 'data-ready-es' : 'data-ready-en'); }); }
  D.addEventListener('anejo:langchange', refreshLabels);
  function deliveryUrl(order) {
    var params = new URLSearchParams();
    if (order && order.id) params.set('order', order.id);
    if (order && /^\d{4}-\d{2}-\d{2}$/.test(order.delivery_date || '')) params.set('date', order.delivery_date);
    return '/hub/owner/deliveries.html' + (params.toString() ? '?' + params.toString() : '') + '#assign';
  }
  function mount(id) {
    var root = D.getElementById(id);
    if (!root) return;
    root.setAttribute('translate', 'no');
    var snapshot = null, lastSuccess = 0, failed = false, busy = false, timer, started = 0, requestId = 0;
    function render() {
      var stale = failed || (lastSuccess && Date.now() - lastSuccess > 90000);
      var header = text('Kitchen · ready for delivery', 'Cocina · listo para entregar');
      var status = !lastSuccess ? text('Checking kitchen readiness…', 'Consultando el estado de cocina…')
        : text('Last checked: ', 'Última consulta: ') + new Date(lastSuccess).toLocaleTimeString(es() ? 'es-US' : 'en-US', { hour:'numeric', minute:'2-digit', second:'2-digit' });
      if (failed) status = text('Could not refresh. Readiness is unverified; showing the last successful check.', 'No se pudo actualizar. El estado no está verificado; se muestra la última consulta correcta.');
      else if (stale) status = text('This readiness snapshot is stale. Refresh before assigning.', 'Este estado está desactualizado. Actualiza antes de asignar.');
      var body = '';
      if (snapshot) {
        body += '<p style="font-weight:700">' + esc(snapshot.total) + ' ' + text('ready', 'listos') + ' · ' + esc(snapshot.awaiting_driver) + ' ' + text('awaiting a driver', 'esperando conductor') + '</p>';
        body += (snapshot.items || []).map(function (o) {
          return '<div class="row"><div class="row-main" style="overflow-wrap:anywhere"><div class="row-title">' + esc(o.customer_name || o.id) + '</div>' +
            '<div class="row-sub">' + esc(o.id) + ' · ' + esc(o.delivery_date || '—') + ' ' + esc(o.delivery_window || '') + '</div>' +
            '<span class="badge ' + (o.awaiting_driver ? 'warn' : 'ok') + '">' + (o.awaiting_driver ? (o.route_id ? text('Ready · awaiting driver', 'Listo · esperando conductor') : text('Ready · assign a driver', 'Listo · asignar conductor')) : text('Ready · route exists', 'Listo · tiene ruta')) + '</span>' +
            '</div><a class="btn ghost" href="' + esc(deliveryUrl(o)) + '">' + (!o.route_id && o.awaiting_driver ? text('Assign driver', 'Asignar conductor') : text('View route', 'Ver ruta')) + '</a></div>';
        }).join('');
        if (!snapshot.total) body += '<p>' + text('No orders currently marked ready in the kitchen.', 'No hay pedidos marcados como listos en cocina actualmente.') + '</p>';
        if (snapshot.total > snapshot.items.length) body += '<p>' + text('Showing the first ', 'Mostrando los primeros ') + snapshot.items.length + text(' ready orders.', ' pedidos listos.') + '</p>';
      }
      root.innerHTML = '<h2>' + header + '</h2><div class="card">' +
        '<p role="status" style="' + (stale ? 'color:#9b2226;' : '') + '">' + esc(status) + '</p>' +
        '<button class="btn ghost" type="button" data-ready-refresh>' + text('Refresh readiness', 'Actualizar estado') + '</button>' + body + '</div>';
      root.querySelector('[data-ready-refresh]').addEventListener('click', load);
    }
    function load() {
      if (D.hidden || (busy && Date.now() - started < 20000)) return;
      if (busy) { failed = true; render(); }
      busy = true; started = Date.now(); var current = ++requestId;
      W.Owner.get('/api/hub/owner/ready-orders').then(function (data) {
        if (current !== requestId) return;
        if (!data || !data.ok || !Array.isArray(data.items) || typeof data.total !== 'number' || typeof data.awaiting_driver !== 'number') throw new Error('unverified');
        snapshot = data; lastSuccess = Date.now(); failed = false;
      }).catch(function () { if (current === requestId) failed = true; }).finally(function () { if (current === requestId) { busy = false; render(); } });
    }
    function visible() { render(); if (!D.hidden) load(); }
    render(); load();
    function startPolling() { W.clearInterval(timer); timer = W.setInterval(function () { render(); load(); }, 30000); }
    startPolling();
    W.addEventListener('focus', visible);
    D.addEventListener('visibilitychange', visible);
    D.addEventListener('anejo:langchange', render);
    W.addEventListener('pagehide', function () { W.clearInterval(timer); });
    W.addEventListener('pageshow', function () { startPolling(); visible(); });
    return { refresh:load };
  }
  W.OwnerReadiness = { mount:mount, deliveryUrl:deliveryUrl, text:text, label:label, setLabel:setLabel };
})();
