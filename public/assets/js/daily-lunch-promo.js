(function () {
  'use strict';
  const key = 'anejo:lunch-promo:seen';
  let data, day, dialog, previousFocus;
  const es = () => window.AnejoLang ? window.AnejoLang.get() === 'es' : document.documentElement.lang.startsWith('es');
  const text = (en, spanish) => es() ? spanish : en;
  const node = (tag, content, className) => {
    const element = document.createElement(tag);
    if (content) element.textContent = content;
    if (className) element.className = className;
    return element;
  };
  function remember() { try { sessionStorage.setItem(key, '1'); } catch (_) { /* In-memory dialog still closes. */ } }
  function close() { dialog.close(); }
  function render() {
    const copy = dialog.querySelector('.lunch-promo-copy');
    copy.replaceChildren();
    const emblem = node('img', null, 'lunch-promo-emblem');
    emblem.src = '/assets/img/emblem.png'; emblem.alt = 'Añejo';
    const date = new Intl.DateTimeFormat(es() ? 'es-US' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(day.date + 'T12:00:00Z'));
    const eyebrow = node('p', text('THE DAILY LUNCH MENU', 'EL MENÚ DE ALMUERZO DIARIO'), 'lunch-promo-eyebrow');
    const title = node('h2', text('Añejo made lunch.', 'Añejo preparó tu almuerzo.')); title.id = 'lunch-promo-title';
    const price = node('p', '$' + (data.price_cents / 100).toFixed(data.price_cents % 100 ? 2 : 0), 'lunch-promo-price');
    price.append(node('span', text(' / meal', ' / plato')));
    const description = node('p', text('One special lunch each day. Fresh from our kitchen to your table.', 'Un almuerzo especial cada día. Fresco, de nuestra cocina a tu mesa.'), 'lunch-promo-intro');
    description.id = 'lunch-promo-description';
    const meal = node('div', null, 'lunch-promo-meal');
    meal.append(node('p', date, 'lunch-promo-date'), node('h3', day.name));
    let status;
    if (day.orderable) status = day.free_delivery ? text('Preorder · FREE delivery', 'Preordena · ENVÍO GRATIS') : text('Order today · regular delivery fee applies', 'Ordena hoy · aplica la tarifa de entrega habitual');
    else if (day.reason === 'sold_out') status = text('Sold out for this date.', 'Agotado para esta fecha.');
    else if (day.reason === 'same_day_cutoff' || day.reason === 'preorder_cutoff') status = text('Ordering has closed for this date.', 'Los pedidos para esta fecha están cerrados.');
    else status = text('Ordering is currently unavailable for this date.', 'Los pedidos para esta fecha no están disponibles.');
    meal.append(node('p', status, 'lunch-promo-status'));
    const link = node('a', day.orderable ? (day.date === data.today ? text('Order today’s lunch →', 'Ordena el almuerzo de hoy →') : text('Preorder this lunch →', 'Preordena este almuerzo →')) : text('Explore the $10 menu →', 'Explora el menú de $10 →'), 'lunch-promo-cta');
    link.href = '/order?category=daily' + (day.orderable ? '&date=' + encodeURIComponent(day.date) : '');
    link.addEventListener('click', remember);
    const foot = node('p', text('Plus tax. Availability and delivery confirmed at checkout.', 'Más impuestos. Disponibilidad y entrega confirmadas al pagar.'), 'lunch-promo-footnote');
    copy.append(emblem, eyebrow, title, price, description, meal, link, foot);
    dialog.querySelector('.lunch-promo-close').setAttribute('aria-label', text('Close daily lunch announcement', 'Cerrar anuncio del almuerzo diario'));
  }
  async function openPromo() {
    try { if (sessionStorage.getItem(key)) return; } catch (_) { /* Storage is optional. */ }
    try {
      const response = await fetch('/api/daily-lunch', { cache: 'no-store' });
      data = await response.json();
      if (!response.ok || !data.ok || !Array.isArray(data.days) || !Number.isFinite(data.price_cents)) return;
      day = data.days.find(d => d.date === data.today && d.orderable && d.product_id)
        || data.days.find(d => d.date >= data.today && d.orderable && d.product_id)
        || data.days.find(d => d.date === data.today && d.product_id);
      if (!day || !day.image_url || !day.image_url.startsWith('/assets/')) return;
      // Never interrupt a customer who already opened another dialog or form.
      if (document.querySelector('dialog[open], [aria-modal="true"]') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
      dialog = node('dialog', null, 'lunch-promo');
      if (typeof dialog.showModal !== 'function') return;
      dialog.setAttribute('aria-labelledby', 'lunch-promo-title');
      dialog.setAttribute('aria-describedby', 'lunch-promo-description');
      const layout = node('div', null, 'lunch-promo-layout');
      const photo = node('img', null, 'lunch-promo-photo'); photo.src = day.image_url; photo.alt = day.name; photo.width = 1254; photo.height = 1254;
      photo.addEventListener('error', () => { if (dialog.open) close(); });
      layout.append(photo, node('div', null, 'lunch-promo-copy'));
      const dismiss = node('button', '×', 'lunch-promo-close'); dismiss.type = 'button'; dismiss.autofocus = true; dismiss.addEventListener('click', close);
      dialog.append(layout, dismiss); document.body.append(dialog); render();
      dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } });
      dialog.addEventListener('close', () => { remember(); if (previousFocus?.isConnected) previousFocus.focus(); });
      previousFocus = document.activeElement;
      dialog.showModal(); remember();
      document.addEventListener('anejo:langchange', render);
    } catch (_) { /* Marketing must never block the website when availability fails. */ }
  }
  window.setTimeout(openPromo, 1800);
})();
