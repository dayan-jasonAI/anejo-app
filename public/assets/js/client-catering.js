/* Her catering account.
 *
 * Dayan, 2026-09-25: "When she goes into her account, she has to see all of the catering details,
 * the orders, like option to add more ... add more items, add additional counts, request cajita,
 * make changes. Last minute calls always reach us."
 *
 * THE ONE RULE THIS FILE IS BUILT AROUND: a customer can ASK, never CHANGE. Nothing here edits a
 * quote, a price, a total or a guest count. Every control writes a REQUEST that the owner answers
 * from the Hub, because the money is his decision and because by the day before an event the
 * kitchen is already cooking from a production plan that a self-service edit would silently
 * contradict.
 *
 * What she gets for asking is a reply. Each request shows its status and, once answered, what she
 * was told — which is the part that stops her phoning to find out whether anyone saw it.
 *
 * Bilingual because the quote is: she was sold in Spanish and her account must not switch to
 * English the moment she signs in.
 */
(function () {
  var T = {
    en: {
      yours: 'Your events', past: 'Past events', guests: 'guests', at: 'at',
      paidFull: 'Paid in full', owes: 'balance due', depositPaid: 'Deposit paid',
      unpaid: 'Deposit unpaid', total: 'Total', menu: 'Your menu', theme: 'Your theme',
      pay: 'Pay the balance', viewQuote: 'View the full quote',
      ask: 'Need something changed?',
      addItems: 'Add more food', addItemsSub: 'Pick what you want more of — we will send you an updated quote.',
      count: 'Change the guest count', countSub: 'Tell us the new number and we will reprice it.',
      cajita: 'Request cajitas', cajitaSub: 'Individual gift boxes for your guests to take home.',
      diet: 'Allergies or dietary needs', dietSub: 'Anything the kitchen must know.',
      msg: 'Ask us anything else', msgSub: 'A person reads every one of these.',
      send: 'Send request', sending: 'Sending…', cancel: 'Cancel',
      newCount: 'New guest count', notePh: 'Anything else we should know?',
      howMany: 'How many cajitas?', dietPh: 'e.g. two guests cannot have pork',
      msgPh: 'What would you like to change?',
      history: 'What you have asked for', open: 'We have this — no answer yet',
      accepted: 'Accepted', declined: 'Not possible', ourReply: 'Our reply',
      sent: 'Sent. We will come back to you — nothing has been charged.',
      failed: 'That did not send. Please call us.',
      reach: 'Last minute? Call us — it always reaches a person.',
      call: 'Call 561-778-7474', email: 'Email us',
      loading: 'Loading the menu…', addSel: 'Add', none: 'Nothing selected yet.',
      pickQty: 'Quantity',
    },
    es: {
      yours: 'Sus eventos', past: 'Eventos pasados', guests: 'invitados', at: 'a las',
      paidFull: 'Pagado por completo', owes: 'saldo pendiente', depositPaid: 'Depósito pagado',
      unpaid: 'Depósito pendiente', total: 'Total', menu: 'Su menú', theme: 'Su tema',
      pay: 'Pagar el saldo', viewQuote: 'Ver la cotización completa',
      ask: '¿Necesita cambiar algo?',
      addItems: 'Agregar más comida', addItemsSub: 'Elija lo que quiere agregar — le enviaremos una cotización actualizada.',
      count: 'Cambiar el número de invitados', countSub: 'Díganos el número nuevo y lo recalculamos.',
      cajita: 'Pedir cajitas', cajitaSub: 'Cajitas individuales para que sus invitados lleven a casa.',
      diet: 'Alergias o dietas', dietSub: 'Lo que la cocina debe saber.',
      msg: 'Pregúntenos cualquier cosa', msgSub: 'Una persona lee cada mensaje.',
      send: 'Enviar', sending: 'Enviando…', cancel: 'Cancelar',
      newCount: 'Nuevo número de invitados', notePh: '¿Algo más que debamos saber?',
      howMany: '¿Cuántas cajitas?', dietPh: 'ej. dos invitados no pueden comer cerdo',
      msgPh: '¿Qué le gustaría cambiar?',
      history: 'Lo que ha pedido', open: 'Lo tenemos — aún sin respuesta',
      accepted: 'Aceptado', declined: 'No es posible', ourReply: 'Nuestra respuesta',
      sent: 'Enviado. Le responderemos — no se ha cobrado nada.',
      failed: 'No se pudo enviar. Por favor llámenos.',
      reach: '¿Última hora? Llámenos — siempre contesta una persona.',
      call: 'Llamar 561-778-7474', email: 'Escríbanos',
      loading: 'Cargando el menú…', addSel: 'Agregar', none: 'Nada seleccionado todavía.',
      pickQty: 'Cantidad',
    },
  };

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };
  var money = function (c) { return '$' + ((Number(c) || 0) / 100).toFixed(2); };
  var today = function () { return new Date().toISOString().slice(0, 10); };

  function shortDate(ms, lang) {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US',
        { day: 'numeric', month: 'short' });
    } catch (e) { return ''; }
  }

  function longDate(d, lang) {
    if (!d) return '';
    var dt = new Date(d + 'T12:00:00');
    if (isNaN(dt)) return d;
    try {
      return dt.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US',
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch (e) { return d; }
  }

  // Days out, stated plainly. "In 3 days" is the fact she opens this page for.
  function countdown(d, lang) {
    if (!d) return '';
    var days = Math.ceil((Date.parse(d + 'T00:00:00') - Date.parse(today() + 'T00:00:00')) / 86400000);
    if (isNaN(days)) return '';
    if (days === 0) return lang === 'es' ? 'HOY' : 'TODAY';
    if (days === 1) return lang === 'es' ? 'MAÑANA' : 'TOMORROW';
    if (days < 0) return '';
    return (lang === 'es' ? 'en ' + days + ' días' : 'in ' + days + ' days');
  }

  var catalogPromise = null;
  function catalog() {
    if (!catalogPromise) {
      catalogPromise = fetch('/api/catering-catalog')
        .then(function (r) { return r.json(); })
        .catch(function () { return { products: [] }; });
    }
    return catalogPromise;
  }

  function post(body) {
    return fetch('/api/catering-quote-change', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok && d && d.ok, d: d }; }); })
      .catch(function () { return { ok: false, d: null }; });
  }

  // ---- one event -------------------------------------------------------------------------

  function statusPill(e, t) {
    if (e.balance_status === 'paid') return '<span class="cc-pill ok">' + esc(t.paidFull) + '</span>';
    if (e.deposit_status === 'paid') {
      return '<span class="cc-pill warn">' + money(e.balance_cents) + ' ' + esc(t.owes) +
        (e.balance_due_date ? ' · ' + esc(e.balance_due_date) : '') + '</span>';
    }
    return '<span class="cc-pill crit">' + esc(t.unpaid) + '</span>';
  }

  function historyHtml(e, t) {
    var lang = e.lang === 'es' ? 'es' : 'en';
    var rows = e.requests || [];
    if (!rows.length) return '';
    return '<div class="cc-block"><h3>' + esc(t.history) + '</h3>' + rows.map(function (r) {
      var label = r.status === 'accepted' ? t.accepted : r.status === 'declined' ? t.declined : t.open;
      var cls = r.status === 'accepted' ? 'ok' : r.status === 'declined' ? 'crit' : 'warn';
      var itemText = (r.items || []).map(function (i) { return i.qty + ' × ' + i.name; }).join(', ');
      var items = esc(itemText);
      // The endpoint derives a readable sentence from the items when she adds no note of her own,
      // so showing both prints the same line twice.
      var note = (r.message || '').trim();
      if (note && itemText && note === itemText) note = '';
      return '<div class="cc-req">' +
        '<div class="cc-req-top"><span class="cc-pill ' + cls + '">' + esc(label) + '</span>' +
        '<span class="cc-when">' + esc(shortDate(r.created_at, lang)) + '</span></div>' +
        (items ? '<p class="cc-req-items">' + items + '</p>' : '') +
        (r.guests ? '<p class="cc-req-items">' + esc(t.newCount) + ': ' + esc(String(r.guests)) + '</p>' : '') +
        (note ? '<p class="cc-req-msg">' + esc(note) + '</p>' : '') +
        (r.owner_note ? '<p class="cc-reply"><b>' + esc(t.ourReply) + ':</b> ' + esc(r.owner_note) + '</p>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  var ACTIONS = [
    { key: 'add_items', icon: '🍽️', label: 'addItems', sub: 'addItemsSub' },
    { key: 'guests', icon: '👥', label: 'count', sub: 'countSub' },
    { key: 'cajita', icon: '🎁', label: 'cajita', sub: 'cajitaSub' },
    { key: 'dietary', icon: '⚠️', label: 'diet', sub: 'dietSub' },
    { key: 'message', icon: '💬', label: 'msg', sub: 'msgSub' },
  ];

  function eventHtml(e, t, isPast) {
    var lang = e.lang === 'es' ? 'es' : 'en';
    var cd = isPast ? '' : countdown(e.event_date, lang);
    return '<section class="cc-event' + (isPast ? ' past' : '') + '" data-quote="' + esc(e.id) + '">' +
      '<header class="cc-head">' +
        '<div>' +
          (cd ? '<p class="cc-cd">' + esc(cd) + '</p>' : '') +
          '<h2>' + esc(longDate(e.event_date, lang)) + '</h2>' +
          '<p class="cc-sub">' + (Number(e.guests) || 0) + ' ' + esc(t.guests) +
            (e.serving_time ? ' · ' + esc(t.at) + ' ' + esc(e.serving_time) : '') + '</p>' +
          (e.address ? '<p class="cc-sub">' + esc(e.address) + '</p>' : '') +
        '</div>' +
        '<div class="cc-money"><div class="cc-total">' + money(e.total_cents) + '</div>' +
          statusPill(e, t) + '</div>' +
      '</header>' +

      ((e.items && e.items.length)
        ? '<div class="cc-block"><h3>' + esc(t.menu) + '</h3><ul class="cc-menu">' +
          e.items.map(function (i) {
            return '<li><span>' + esc(lang === 'es' && i.name_es ? i.name_es : i.name) + '</span>' +
              '<span class="cc-qty">' + esc(i.qty || '') + '</span></li>';
          }).join('') + '</ul></div>'
        : '') +

      ((e.theme || e.colors)
        ? '<div class="cc-block"><h3>' + esc(t.theme) + '</h3><p class="cc-theme">' +
          esc([e.theme, e.colors].filter(Boolean).join(' · ')) + '</p></div>'
        : '') +

      '<div class="cc-cta">' +
        (e.url ? '<a class="cc-btn" href="' + esc(e.url) + '">' + esc(t.viewQuote) + '</a>' : '') +
        (e.balance_status === 'due' && e.url
          ? '<a class="cc-btn gold" href="' + esc(e.url) + '">' + esc(t.pay) + '</a>' : '') +
      '</div>' +

      (isPast ? '' :
        '<div class="cc-block"><h3>' + esc(t.ask) + '</h3>' +
        '<div class="cc-actions">' + ACTIONS.map(function (a) {
          return '<button type="button" class="cc-act" data-act="' + a.key + '">' +
            '<span class="cc-act-i">' + a.icon + '</span>' +
            '<span><b>' + esc(t[a.label]) + '</b><br><small>' + esc(t[a.sub]) + '</small></span></button>';
        }).join('') + '</div>' +
        '<div class="cc-form" hidden></div></div>') +

      historyHtml(e, t) +

      (isPast ? '' :
        '<p class="cc-reach">' + esc(t.reach) + '<br>' +
        '<a href="tel:5617787474">' + esc(t.call) + '</a> · ' +
        '<a href="mailto:dayan@anejocateringco.com?subject=' +
          encodeURIComponent((lang === 'es' ? 'Mi evento ' : 'My event ') + (e.event_date || '')) +
        '">' + esc(t.email) + '</a></p>') +
    '</section>';
  }

  // ---- the forms -------------------------------------------------------------------------

  function formHtml(kind, t, e) {
    var lang = e.lang === 'es' ? 'es' : 'en';
    if (kind === 'add_items') {
      return '<div class="cc-picker"><p class="cc-hint">' + esc(t.loading) + '</p></div>' +
        '<textarea class="cc-note" rows="2" placeholder="' + esc(t.notePh) + '"></textarea>';
    }
    if (kind === 'guests') {
      return '<label class="cc-lab">' + esc(t.newCount) + '</label>' +
        '<input class="cc-guests" type="number" inputmode="numeric" min="1" max="2000" value="' +
          esc(String(e.guests || '')) + '">' +
        '<textarea class="cc-note" rows="2" placeholder="' + esc(t.notePh) + '"></textarea>';
    }
    if (kind === 'cajita') {
      return '<label class="cc-lab">' + esc(t.howMany) + '</label>' +
        '<input class="cc-count" type="number" inputmode="numeric" min="1" max="2000" value="' +
          esc(String(e.guests || '')) + '">' +
        '<textarea class="cc-note" rows="3" placeholder="' + esc(t.notePh) + '"></textarea>';
    }
    if (kind === 'dietary') {
      return '<textarea class="cc-note" rows="3" placeholder="' + esc(t.dietPh) + '"></textarea>';
    }
    return '<textarea class="cc-note" rows="4" placeholder="' + esc(t.msgPh) + '"></textarea>';
  }

  function paintPicker(box, data, t, lang) {
    var products = (data && data.products) || [];
    if (!products.length) { box.innerHTML = '<p class="cc-hint">—</p>'; return; }
    box.innerHTML = products.map(function (p) {
      var name = lang === 'es' && p.es ? p.es : p.en;
      var from = p.from_cents ? money(p.from_cents) : '';
      return '<label class="cc-item">' +
        (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy">' : '<span class="cc-noimg">🍽️</span>') +
        '<span class="cc-item-n"><b>' + esc(name) + '</b>' +
          (from ? '<br><small>' + esc(from) + (p.unit ? ' / ' + esc(p.unit) : '') + '</small>' : '') + '</span>' +
        '<input class="cc-item-q" type="number" inputmode="numeric" min="0" max="999" value="0" ' +
          'data-name="' + esc(name) + '" data-id="' + esc(p.id) + '" aria-label="' + esc(t.pickQty) + ' ' + esc(name) + '">' +
        '</label>';
    }).join('');
  }

  function collect(kind, wrap, e, t) {
    var note = wrap.querySelector('.cc-note');
    var message = note ? note.value.trim() : '';
    if (kind === 'add_items') {
      var items = [];
      wrap.querySelectorAll('.cc-item-q').forEach(function (i) {
        var q = Number(i.value);
        if (q > 0) items.push({ id: i.dataset.id, name: i.dataset.name, qty: q });
      });
      if (!items.length && !message) return { error: t.none };
      return { kind: kind, items: items, message: message };
    }
    if (kind === 'guests') {
      var g = Number((wrap.querySelector('.cc-guests') || {}).value);
      if (!g || g < 1) return { error: t.newCount };
      return { kind: kind, guests: g, message: message };
    }
    if (kind === 'cajita') {
      var n = Number((wrap.querySelector('.cc-count') || {}).value) || 0;
      return {
        kind: kind,
        message: (n ? (e.lang === 'es' ? n + ' cajitas. ' : n + ' cajitas. ') : '') + message,
      };
    }
    if (!message) return { error: t.msgPh };
    return { kind: kind, message: message };
  }

  function wire(section, e, t) {
    var lang = e.lang === 'es' ? 'es' : 'en';
    var form = section.querySelector('.cc-form');
    if (!form) return;

    section.querySelectorAll('.cc-act').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.dataset.act;
        if (form.dataset.kind === kind && !form.hidden) { form.hidden = true; form.dataset.kind = ''; return; }
        form.dataset.kind = kind;
        form.hidden = false;
        form.innerHTML = formHtml(kind, t, e) +
          '<div class="cc-form-cta">' +
          '<button type="button" class="cc-btn gold cc-send">' + esc(t.send) + '</button> ' +
          '<button type="button" class="cc-btn cc-cancel">' + esc(t.cancel) + '</button>' +
          '</div><p class="cc-msg" role="status"></p>';

        if (kind === 'add_items') {
          catalog().then(function (d) {
            var box = form.querySelector('.cc-picker');
            if (box) paintPicker(box, d, t, lang);
          });
        }

        form.querySelector('.cc-cancel').addEventListener('click', function () {
          form.hidden = true; form.dataset.kind = '';
        });

        form.querySelector('.cc-send').addEventListener('click', function () {
          var send = form.querySelector('.cc-send');
          var out = form.querySelector('.cc-msg');
          var payload = collect(kind, form, e, t);
          if (payload.error) { out.textContent = payload.error; out.className = 'cc-msg bad'; return; }
          send.disabled = true; send.textContent = t.sending;
          payload.quote_id = e.id;
          post(payload).then(function (r) {
            send.disabled = false; send.textContent = t.send;
            if (r.ok) {
              out.textContent = (r.d && r.d.message) || t.sent;
              out.className = 'cc-msg good';
              form.querySelectorAll('input,textarea').forEach(function (i) {
                if (i.type === 'number') i.value = '0'; else i.value = '';
              });
              // Reload so the new request appears in her history with its status, rather than
              // leaving her to wonder whether it stuck.
              if (window.AnejoCatering && window.AnejoCatering.onSent) window.AnejoCatering.onSent();
            } else {
              out.textContent = (r.d && r.d.error) || t.failed;
              out.className = 'cc-msg bad';
            }
          });
        });
      });
    });
  }

  function render(list, mount) {
    if (!mount) return;
    var events = (list || []).slice();
    if (!events.length) { mount.innerHTML = ''; return; }
    var lang = (events[0] && events[0].lang) === 'es' ? 'es' : 'en';
    var t = T[lang];
    var td = today();
    var upcoming = events.filter(function (e) { return !e.event_date || e.event_date >= td; });
    var past = events.filter(function (e) { return e.event_date && e.event_date < td; });

    mount.innerHTML =
      (upcoming.length ? '<h1 class="cc-h1">' + esc(t.yours) + '</h1>' +
        upcoming.map(function (e) { return eventHtml(e, T[e.lang === 'es' ? 'es' : 'en'], false); }).join('') : '') +
      (past.length ? '<h2 class="cc-h2">' + esc(t.past) + '</h2>' +
        past.map(function (e) { return eventHtml(e, T[e.lang === 'es' ? 'es' : 'en'], true); }).join('') : '');

    mount.querySelectorAll('.cc-event').forEach(function (sec) {
      var e = events.find(function (x) { return x.id === sec.dataset.quote; });
      if (e) wire(sec, e, T[e.lang === 'es' ? 'es' : 'en']);
    });
  }

  window.AnejoCatering = { render: render, onSent: null };
})();
