/* Owner-only bilingual daily operating guide. The page is instructional; it does not read
   business records, send messages, or record completion. */
(function (window, document) {
  'use strict';
  if (!window.Owner || !window.Hub) return;

  var COPY = {
    en: {
      back:'Owner home', title:'Your day at Añejo', intro:'Serve customers, prepare today’s work, and close with a clear handoff.',
      stepsLabel:'Today, in seven steps', related:'Other Hub screens', care:'Before sending, check the recipient and preview.',
      steps:[
        {title:'Handle requests & quotes', subtitle:'Start with the next customer waiting.', actions:['Check new requests and set the next follow-up.','Confirm the date, guest count, menu, and total before preparing a quote.','Before sending, check the recipient and preview.'], button:'Open requests', href:'/hub/owner/catering-service.html', related:[['Quotes & deposits','/hub/owner/catering.html']]},
        {title:'Plan orders & stock', subtitle:'Match orders to today’s kitchen capacity.', actions:['Compare confirmed orders with today’s team and counted stock.','Check dated lunch availability before promising more.','Review item, amount, and supplier before submitting a restock order.'], button:'Open orders & kitchen', href:'/hub/owner/kitchen.html', related:[['Daily Lunch','/hub/owner/daily-lunch.html'],['Inventory','/hub/kitchen/inventory.html'],['Restock orders','/hub/kitchen/restock.html']]},
        {title:'Run the kitchen & check temperatures', subtitle:'Keep preparation and food checks on track.', actions:['Check open orders and production plans with the kitchen team.','Review staff access and PIN resets in Staff.','Record the temperature you actually read; follow food-safety steps for an out-of-range reading.'], button:'Open kitchen', href:'/hub/owner/kitchen.html', related:[['Staff','/hub/owner/staff.html'],['Temperature entry','/hub/driver/temp.html'],['Temperature report','/hub/owner/finance.html']]},
        {title:'Assign & follow deliveries', subtitle:'Keep each ready order moving.', actions:['Review ready orders and routes in Deliveries.','Assign a driver, then check the saved route status.','Read the customer conversation before replying.'], button:'Open deliveries', href:'/hub/owner/deliveries.html', related:[['Customer messages','/hub/owner/comms.html']]},
        {title:'Record costs & payouts', subtitle:'Keep receipts and payment records together.', actions:['Add a receipt or short note to each expense.','Compare payment records with the provider record during reconciliation.','Check the exact payout amount before recording it.'], button:'Open finance', href:'/hub/owner/finance.html', related:[['Driver payouts','/hub/owner/payouts.html']]},
        {title:'Review marketing & follow up', subtitle:'Check the final details before action.', actions:['Review the final copy, image, language, price, and date.','Check the recipient and preview before sending a follow-up.','Review the final campaign asset before scheduling or publishing.'], button:'Open marketing', href:'/hub/owner/marketing.html', related:[['Social campaigns','/hub/owner/social-campaigns.html'],['Quote follow-up','/hub/owner/catering-service.html']]},
        {title:'Close the day', subtitle:'Leave a clear record and next step.', actions:['Scan open alerts, recent activity, and delivery issues.','Add the shift’s actual summary and blockers to the EOD report.','Confirm it is saved and leave a named next step.'], button:'Open EOD report', href:'/hub/kitchen/eod.html', related:[['Owner overview','/hub/owner/']]}
      ]
    },
    es: {
      back:'Inicio de dueña', title:'Tu día en Añejo', intro:'Atiende a tus clientes, prepara el trabajo de hoy y deja un traspaso claro al cerrar.',
      stepsLabel:'Siete pasos para hoy', related:'Otras pantallas del Hub',
      steps:[
        {title:'Atiende solicitudes y cotizaciones', subtitle:'Empieza con el próximo cliente que espera.', actions:['Revisa las solicitudes nuevas y deja la próxima fecha de seguimiento.','Confirma fecha, invitados, menú y total antes de preparar una cotización.','Antes de enviar, revisa el destinatario y la vista previa.'], button:'Abrir solicitudes', href:'/hub/owner/catering-service.html', related:[['Cotizaciones y depósitos','/hub/owner/catering.html']]},
        {title:'Planifica pedidos e inventario', subtitle:'Ajusta los pedidos a la capacidad de hoy.', actions:['Compara los pedidos confirmados con el equipo y el inventario contado.','Revisa las fechas de almuerzo antes de prometer más.','Revisa artículo, cantidad y proveedor antes de enviar una orden de compra.'], button:'Abrir pedidos y cocina', href:'/hub/owner/kitchen.html', related:[['Almuerzo Diario','/hub/owner/daily-lunch.html'],['Inventario','/hub/kitchen/inventory.html'],['Órdenes de compra','/hub/kitchen/restock.html']]},
        {title:'Dirige la cocina y revisa temperaturas', subtitle:'Mantén la preparación y los controles al día.', actions:['Revisa los pedidos abiertos y planes de producción con el equipo.','Revisa el acceso del personal y los reinicios de PIN en Personal.','Registra la temperatura que leíste; sigue los pasos de seguridad alimentaria si está fuera de rango.'], button:'Abrir cocina', href:'/hub/owner/kitchen.html', related:[['Personal','/hub/owner/staff.html'],['Registrar temperatura','/hub/driver/temp.html'],['Informe de temperaturas','/hub/owner/finance.html']]},
        {title:'Asigna y sigue las entregas', subtitle:'Mantén cada pedido listo en movimiento.', actions:['Revisa los pedidos listos y las rutas en Entregas.','Asigna un conductor y luego revisa el estado guardado de la ruta.','Lee la conversación con el cliente antes de responder.'], button:'Abrir entregas', href:'/hub/owner/deliveries.html', related:[['Mensajes con clientes','/hub/owner/comms.html']]},
        {title:'Registra gastos y pagos', subtitle:'Mantén juntos los recibos y pagos.', actions:['Adjunta un recibo o una nota breve a cada gasto.','Compara los pagos registrados con el proveedor al conciliarlos.','Revisa la cantidad exacta antes de registrar un pago.'], button:'Abrir finanzas', href:'/hub/owner/finance.html', related:[['Pagos a conductores','/hub/owner/payouts.html']]},
        {title:'Revisa marketing y da seguimiento', subtitle:'Comprueba los detalles antes de actuar.', actions:['Revisa el texto, la imagen, el idioma, el precio y la fecha finales.','Revisa el destinatario y la vista previa antes de enviar un seguimiento.','Revisa la pieza final antes de programar o publicar una campaña.'], button:'Abrir marketing', href:'/hub/owner/marketing.html', related:[['Campañas sociales','/hub/owner/social-campaigns.html'],['Seguimiento de cotizaciones','/hub/owner/catering-service.html']]},
        {title:'Cierra el día', subtitle:'Deja un registro claro y el siguiente paso.', actions:['Revisa alertas abiertas, actividad reciente y problemas de entrega.','Agrega al informe EOD el resumen real del turno y sus bloqueos.','Confirma que se guardó y deja indicado quién sigue.'], button:'Abrir informe EOD', href:'/hub/kitchen/eod.html', related:[['Resumen de la dueña','/hub/owner/']]}
      ]
    }
  };

  function esc(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }
  function currentLang() {
    return window.AnejoLang && window.AnejoLang.get() === 'es' ? 'es' : 'en';
  }
  function render() {
    var root = document.getElementById('owner-root');
    if (!root) return;
    var lang = currentLang();
    var c = COPY[lang];
    var html = '<a class="guide-back" href="/hub/owner/">‹ ' + esc(c.back) + '</a>' +
      '<header class="guide-hero"><div class="guide-eyebrow"><img src="/assets/img/emblem.png" alt="" aria-hidden="true"><span>' +
      esc(lang === 'es' ? 'La jornada de la dueña' : 'Owner’s daily rhythm') + '</span></div><h2>' + esc(c.title) + '</h2><p>' + esc(c.intro) + '</p></header>' +
      '<h3 class="guide-section-title">' + esc(c.stepsLabel) + '</h3><div class="guide-list">';
    c.steps.forEach(function (step, index) {
      html += '<details class="guide-card"' + (index === 0 ? ' open' : '') + '><summary><span class="guide-number" aria-hidden="true">' +
        (index + 1) + '</span><span class="guide-heading"><strong>' + esc(step.title) + '</strong><span>' + esc(step.subtitle) + '</span></span></summary>' +
        '<div class="guide-details"><ol>' + step.actions.map(function (action) { return '<li>' + esc(action) + '</li>'; }).join('') +
        '</ol><a class="guide-primary" href="' + esc(step.href) + '">' + esc(step.button) + ' <span aria-hidden="true">›</span></a>' +
        (step.related.length ? '<details class="guide-related"><summary>' + esc(c.related) + '</summary><div>' + step.related.map(function (link) {
          return '<a href="' + esc(link[1]) + '">' + esc(link[0]) + '</a>';
        }).join('') + '</div></details>' : '') + '</div></details>';
    });
    root.innerHTML = html + '</div>';
    if (window.AnejoI18n) window.AnejoI18n.refresh();
  }

  var toggle = document.getElementById('lang-toggle');
  if (toggle && window.AnejoLang) {
    function updateToggle() {
      var spanish = currentLang() === 'es';
      toggle.textContent = spanish ? 'EN' : 'ES';
      toggle.setAttribute('aria-label', spanish ? 'Cambiar idioma a inglés' : 'Change language to Spanish');
    }
    updateToggle();
    toggle.addEventListener('click', function () {
      window.AnejoLang.set(currentLang() === 'es' ? 'en' : 'es');
      updateToggle();
    });
    document.addEventListener('anejo:langchange', updateToggle);
  }
  document.addEventListener('anejo:langchange', render);
  window.AnejoOwnerOperationsGuide = {copy:COPY, render:render, currentLang:currentLang};
  window.Owner.init('operations-guide', render);
})(window, document);
