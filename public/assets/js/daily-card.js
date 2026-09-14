/* Añejo Daily — today's featured lunch, rendered on the homepage and at the top of /order.
   ONE renderer for both so the price, the portions left and the cutoff can never disagree between
   the page that promises them and the page that sells them.

   Everything here is DISPLAY. /api/checkout re-checks the date, the cutoff, the price tier and the
   allocation, and claims the portion atomically before Square — so a stale card can never oversell
   the kitchen. "3 left" is fetched fresh (the endpoint is no-store) and re-fetched after a failed
   checkout, because a number that lies is worse than no number at all. */
(function (root) {
  var DATA = null;

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var money = function (cents) { return '$' + (cents / 100).toFixed(2); };
  // The site's own language switch (assets/js/i18n.js) is the authority; fall back to the document
  // for any page that renders this card without it.
  var isEs = function () { return root.AnejoLang ? root.AnejoLang.get() === 'es' : (root.document && document.documentElement.lang === 'es'); };
  var L = function (en, es) { return isEs() ? es : en; };
  var photo = function (img) { return img ? '/assets/img/' + img : '/assets/img/menu-launch/cajitas-collection.webp'; };

  function load() {
    return fetch('/api/daily', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { DATA = d && d.ok ? d : null; return DATA; })
      .catch(function () { return null; });
  }

  // What the customer is told, in one place. A closed or sold-out day still SHOWS the meal — the
  // point of the module is that people learn what Añejo Daily is, even on the days they missed it.
  function statusLine(day, cutoffLabel) {
    if (!day) return { tone: 'none', text: '' };
    if (day.status === 'sold_out') return { tone: 'out', text: L('Sold out for today', 'Agotado por hoy') };
    if (day.status === 'closed') return { tone: 'out', text: L('Ordering closed for today (' + cutoffLabel + ' ET)', 'Pedidos cerrados por hoy (' + cutoffLabel + ' ET)') };
    if (day.status === 'unavailable') return { tone: 'out', text: L('Not available today', 'No disponible hoy') };
    var left = day.remaining;
    return {
      tone: 'open',
      text: L(left + (left === 1 ? ' portion left' : ' portions left') + ' · order by ' + cutoffLabel + ' ET',
        'Quedan ' + left + (left === 1 ? ' porción' : ' porciones') + ' · pide antes de las ' + cutoffLabel + ' ET'),
    };
  }

  function mealName(day) { return isEs() ? (day.item.name_es || day.item.name) : day.item.name; }
  function mealDesc(day) { return isEs() ? (day.item.description_es || day.item.description) : day.item.description; }

  /* Homepage module. Premium, self-contained, and honest when there is nothing scheduled: it then
     says what Añejo Daily IS rather than rendering an empty promise. */
  function renderHome(el, d) {
    if (!el) return;
    var day = d && d.today;
    var next = d && d.next;
    var cutoff = (day && day.cutoff_label) || (d && d.cutoff_label) || '11:00 AM';
    if (!day && !next) { el.innerHTML = ''; el.style.display = 'none'; return; }
    var show = day || next;
    var isToday = !!day;
    var st = isToday ? statusLine(day, cutoff) : { tone: 'next', text: L('Next: ' + show.date, 'Próximo: ' + show.date) };
    var open = isToday && day.status === 'open';
    el.style.display = '';
    el.innerHTML =
      '<div class="daily-wrap">' +
        '<figure class="daily-photo"><img src="' + esc(photo(show.item.image)) + '" alt="' + esc(mealName(show)) + '" loading="lazy"></figure>' +
        '<div class="daily-body">' +
          '<p class="daily-eyebrow">AÑEJO DAILY</p>' +
          '<p class="daily-kicker">' + L("Today's Lunch", 'Almuerzo del Día') + '</p>' +
          '<h2 class="daily-name">' + esc(mealName(show)) + '</h2>' +
          (mealDesc(show) ? '<p class="daily-desc">' + esc(mealDesc(show)) + '</p>' : '') +
          '<p class="daily-price">' + money(show.item.price_cents) + '</p>' +
          '<p class="daily-status daily-' + st.tone + '">' + esc(st.text) + '</p>' +
          (open
            ? '<a class="daily-cta" href="/order?daily=1">' + L("Order Today's Lunch", 'Pide el Almuerzo del Día') + '</a>'
            : '<a class="daily-cta daily-cta-quiet" href="/order">' + L('See the full menu', 'Ver el menú completo') + '</a>') +
          '<p class="daily-fine">' + L('Delivered across Palm Beach County. Delivery only — no pickup.', 'Entrega en Palm Beach County. Solo entrega — sin recogida.') + '</p>' +
        '</div>' +
      '</div>';
  }

  /* /order card. `hooks` supplies the page's own cart: { inCart(id), add(day), remove(id), blocked() }.
     blocked() returns a message when the cart already holds something Daily cannot travel with. */
  function renderOrder(el, d, hooks) {
    if (!el) return;
    var day = d && d.today;
    if (!day) { el.innerHTML = ''; el.style.display = 'none'; return; }
    var cutoff = day.cutoff_label || (d && d.cutoff_label) || '11:00 AM';
    var st = statusLine(day, cutoff);
    var open = day.status === 'open';
    var inCart = hooks && hooks.inCart ? hooks.inCart(day.item.id) : 0;
    var blocked = open && hooks && hooks.blocked ? hooks.blocked() : '';
    var btn;
    if (!open) btn = '<button class="daily-cta" disabled>' + (day.status === 'sold_out' ? L('SOLD OUT', 'AGOTADO') : L('Closed for today', 'Cerrado por hoy')) + '</button>';
    else if (inCart) btn = '<button class="daily-cta daily-cta-quiet" onclick="anejoDailyRemove()">' + L('Remove from order', 'Quitar del pedido') + '</button>';
    else btn = '<button class="daily-cta" onclick="anejoDailyAdd()"' + (blocked ? ' disabled' : '') + '>' + L('Add to order', 'Agregar al pedido') + '</button>';
    var drinks = (d.drinks || []).slice(0, 4);
    el.style.display = '';
    el.innerHTML =
      '<div class="daily-order-card">' +
        '<img class="daily-order-photo" src="' + esc(photo(day.item.image)) + '" alt="' + esc(mealName(day)) + '" loading="lazy">' +
        '<div class="daily-order-body">' +
          '<p class="daily-eyebrow">AÑEJO DAILY · ' + L("Today's Lunch", 'Almuerzo del Día') + '</p>' +
          '<h2 class="daily-name">' + esc(mealName(day)) + '</h2>' +
          (mealDesc(day) ? '<p class="daily-desc">' + esc(mealDesc(day)) + '</p>' : '') +
          '<p class="daily-price">' + money(day.item.price_cents) + '</p>' +
          '<p class="daily-status daily-' + st.tone + '">' + esc(st.text) + '</p>' +
          '<p class="daily-fine">' + L('Delivered today, 11:00 AM–1:00 PM. Delivery only — no pickup. Delivery from ' + money(d.delivery ? d.delivery.base_fee_cents : 500) + (d.delivery && d.delivery.distance_based ? ', by distance.' : '.'),
            'Entrega hoy, 11:00 AM–1:00 PM. Solo entrega — sin recogida. Envío desde ' + money(d.delivery ? d.delivery.base_fee_cents : 500) + (d.delivery && d.delivery.distance_based ? ', según la distancia.' : '.')) + '</p>' +
          (blocked ? '<p class="daily-status daily-out">' + esc(blocked) + '</p>' : '') +
          btn +
          (drinks.length ? '<p class="daily-fine daily-drinks-label">' + L('Add a drink', 'Agrega una bebida') + '</p><div class="daily-drinks">' +
            drinks.map(function (dr) {
              return '<button type="button" class="daily-drink" onclick="anejoDailyDrink(\'' + esc(dr.id) + '\')">' +
                '<img src="' + esc(photo(dr.img)) + '" alt="" loading="lazy"><span>' + esc(isEs() ? (dr.name_es || dr.name) : dr.name) + '<small>' + money(dr.price_cents) + '</small></span><b>+</b></button>';
            }).join('') + '</div>' : '') +
        '</div>' +
      '</div>';
  }

  root.AnejoDaily = { load: load, renderHome: renderHome, renderOrder: renderOrder, get data() { return DATA; }, photo: photo, statusLine: statusLine };
  if (typeof module !== 'undefined') module.exports = root.AnejoDaily;
})(typeof window !== 'undefined' ? window : globalThis);
