(function () {
  'use strict';
  const seenKey = 'anejo:croquetas-box-12:seen';
  const orderPath = '/order?product=croquetas-box-12';
  const imagePath = '/assets/img/menu-launch/croquetas-box-12.webp';
  const spanish = () => window.AnejoLang?.get() === 'es' || (!window.AnejoLang && document.documentElement.lang.startsWith('es'));
  const translate = (en, es) => spanish() ? es : en;

  function openBoxPromo(price) {
    if (document.querySelector('dialog[open], [aria-modal="true"]') || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
    try { if (sessionStorage.getItem(seenKey)) return; } catch (_) { /* Storage is optional. */ }
    const dialog = document.getElementById('croqueta-box-promo');
    if (typeof dialog?.showModal !== 'function') return;
    const priorFocus = document.activeElement;
    const close = dialog.querySelector('button');
    const updateCopy = () => {
      const money = new Intl.NumberFormat(spanish() ? 'es-US' : 'en-US', { style: 'currency', currency: 'USD' }).format(price / 100);
      dialog.querySelector('h2').textContent = translate('A dozen Añejo croquetas', 'Una docena de croquetas Añejo');
      dialog.querySelector('.lunch-promo-price').textContent = money;
      dialog.querySelector('.lunch-promo-intro').textContent = translate('Ready to fry at home or ready to eat. Choose your favorite filling.', 'Listas para freír en casa o listas para comer. Elige tu relleno favorito.');
      dialog.querySelector('.lunch-promo-cta').textContent = translate('Order your 12-pack', 'Pide tu caja de 12');
      dialog.querySelector('.lunch-promo-footnote').textContent = translate('Plus tax and delivery. Same-day windows require two hours of prep.', 'Más impuestos y entrega. Para entrega el mismo día, reserva dos horas de preparación.');
      close.setAttribute('aria-label', translate('Close croqueta announcement', 'Cerrar anuncio de croquetas'));
      dialog.querySelector('img').alt = translate('Boxes of 12 Añejo croquetas, ready to fry and ready to eat', 'Cajas de 12 croquetas Añejo, listas para freír y listas para comer');
    };
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      document.removeEventListener('anejo:langchange', updateCopy);
      if (priorFocus?.isConnected) priorFocus.focus();
    }, { once: true });
    dialog.querySelector('a').href = orderPath;
    dialog.querySelector('img').src = imagePath;
    updateCopy();
    document.addEventListener('anejo:langchange', updateCopy);
    dialog.showModal();
    try { sessionStorage.setItem(seenKey, '1'); } catch (_) { /* Storage is optional. */ }
  }

  // The live catalog determines when the campaign can appear and what price it shows.
  window.AnejoCroquetaPromo = (async () => {
    try {
      const response = await fetch('/api/menu', { signal: AbortSignal.timeout(4000) });
      if (!response.ok) return false;
      const menu = await response.json();
      if (!menu.ok || menu.source !== 'd1' || !Array.isArray(menu.addons)) return false;
      const boxes = menu.addons.filter(item => item.id.startsWith('traditional_croq-box12-') && item.available && item.orderable && item.price_cents > 0);
      if (!boxes.length) return false;
      const preparations = new Set(boxes.map(item => item.id.split('-')[2]));
      if (preparations.size !== 2 || new Set(boxes.map(item => item.price_cents)).size !== 1) return false;
      window.setTimeout(() => openBoxPromo(boxes[0].price_cents), 900);
      return true;
    } catch (_) { return false; }
  })();
})();
