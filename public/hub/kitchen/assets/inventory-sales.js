(function (window, document) {
  'use strict';
  if (!window || !document || window.InventorySalesPluginLoaded) return;
  window.InventorySalesPluginLoaded = true;

  var API = '/api/hub/kitchen/inventory-sales';
  var page = document.getElementById('prepared');
  var sales = null, authority = 'loading', prepared = [], actorRole = null, section = null;
  var controls = new Map(), drafts = new Map(), countBases = new Map(), saleExpiries = new Map(), reviewDrafts = new Map(), websiteDraft = null, websiteMessage = '', promotions = [], offers = [], websiteEnabled = null;
  var processing = false, refreshQueued = false, renderQueue = Promise.resolve();
  var Hub = window.Hub, Kitchen = window.Kitchen;
  var esc = Hub && Hub.esc ? Hub.esc : function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]; }); };
  function enEs(en, es) { return window.AnejoLang && window.AnejoLang.get() === 'es' ? es : en; }
  function txNode(en, es, tag) { return '<' + (tag || 'span') + ' data-ivs-en="' + esc(en) + '" data-ivs-es="' + esc(es) + '" translate="no">' + esc(enEs(en, es)) + '</' + (tag || 'span') + '>'; }
  function localize(root) {
    var isEs = window.AnejoLang && window.AnejoLang.get() === 'es';
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-ivs-en][data-ivs-es]'), function (node) {
      node.textContent = node.getAttribute(isEs ? 'data-ivs-es' : 'data-ivs-en');
    });
  }
  function get(path) {
    if (!Kitchen || !Kitchen.get) return Promise.resolve({ ok:false, error:'Inventory sales are unavailable.' });
    return Kitchen.get(path);
  }
  function post(body) {
    if (!Kitchen || !Kitchen.post) return Promise.resolve({ ok:false, error:'Inventory sales are unavailable.' });
    return Kitchen.post(API, body);
  }
  function catalogPhoto(path) { return !path ? '' : path.indexOf('/assets/img/') === 0 ? path : '/assets/img/' + path.replace(/^\//, ''); }
  function reviewKey(promo) { return promo.snapshot_hash + ':' + promo.jpeg_sha256; }
  function href(itemId, hash, jpeg) {
    return API + '?preview=' + encodeURIComponent(itemId) + '&snapshot=' + encodeURIComponent(hash) + (jpeg ? '&jpeg=1' : '');
  }
  function row(id) { return document.querySelector('.inv-prep-card[data-menu-id="' + CSS.escape(String(id)) + '"]'); }
  function findPrepared(id) { return prepared.find(function (p) { return String(p.id) === String(id); }); }
  function declaration(id) { return sales && Array.isArray(sales.declarations) ? sales.declarations.find(function (d) { return String(d.menu_item_id) === String(id); }) || null : null; }
  function promotion(id) { return promotions.find(function (p) { return String(p.menu_item_id) === String(id); }) || null; }
  function offer(id) { return offers.find(function (o) { return String(o.item_id) === String(id); }) || null; }
  function suppression(id) { return sales && Array.isArray(sales.suppressed) ? sales.suppressed.find(function (entry) { return entry.item_id === id; }) : null; }
  function suppressionLabel(reason) {
    var labels = { catalog_image_missing:['Catalog photo required · add it in Menu before promoting.','Falta la foto del catálogo · agrégala en Menú antes de promocionar.'], offer_expired:['Sale window ended','Vigencia de venta terminada'], zero_remaining:['All listed units are reserved','Todas las unidades publicadas están reservadas'], inventory_revision_changed:['Count changed · confirm sale availability again','Cambió el conteo · confirma de nuevo la disponibilidad de venta'], menu_item_unavailable:['Item is unavailable in Menu','El artículo no está disponible en Menú'], menu_item_not_orderable:['Complete this item in Menu before promoting','Completa este artículo en Menú antes de promocionar'] };
    return enEs.apply(null, labels[reason] || ['Sale promotion unavailable · review this item','Promoción no disponible · revisa este artículo']);
  }
  function staleSnapshot(promo, offerData) { return !!(promo && (promo.state === 'withdrawn' ? !!offerData : (!offerData || Number(promo.offer_revision) !== Number(offerData.revision)))); }
  function currentRevision(id) { var d = declaration(id); return d && Number.isInteger(Number(d.revision)) ? Number(d.revision) : null; }
  function ensureStyle() {
    if (document.getElementById('inventory-sales-css')) return;
    var link = document.createElement('link'); link.id = 'inventory-sales-css'; link.rel = 'stylesheet'; link.href = '/hub/kitchen/assets/inventory-sales.css'; document.head.appendChild(link);
  }
  function ensureSection() {
    if (section && section.isConnected) return;
    section = document.getElementById('inventory-sales-promotions');
    if (!section) {
      section = document.createElement('section'); section.id = 'inventory-sales-promotions'; section.className = 'hub-section ivs-section'; section.setAttribute('aria-labelledby', 'ivs-heading');
      section.innerHTML = '<div class="inv-section-title"><h2 id="ivs-heading">' + txNode('Inventory sales', 'Ventas de inventario', 'span') + '</h2></div><div class="ivs-live" role="status" aria-live="polite"></div><div class="ivs-website"></div><div class="ivs-cards"></div>';
      page.insertAdjacentElement('afterend', section);
    }
  }
  function live(text, error) {
    if (!section) return;
    var node = section.querySelector('.ivs-live'); node.textContent = text || ''; node.classList.toggle('ivs-error', !!error);
  }
  function controlMarkup(p, existing) {
    var id = String(p.id), decl = declaration(id), draft = drafts.get(id);
    var checked = draft ? draft.enabled : !!(decl && decl.enabled);
    var hours = draft ? draft.hours : (decl && decl.sale_expires_at > Date.now() ? ([4,12,24,48].find(function (n) { return n >= Math.ceil((decl.sale_expires_at - Date.now()) / 3600000); }) || 48) : 24);
    var locale = draft ? draft.locale : ((promotion(id) && promotion(id).locale) || 'es');
    var controlsHtml = '<div class="ivs-sale-controls" data-ivs-sale="' + esc(id) + '">' +
      '<label class="ivs-toggle"><input type="checkbox" data-ivs-enabled' + (checked ? ' checked' : '') + (!sales ? ' disabled' : '') + '><span>' + txNode('Available for sale', 'Disponible para la venta') + '</span></label>' +
      '<label class="ivs-choice"><span>' + txNode('Sale window', 'Vigencia de venta') + '</span><select data-ivs-hours' + (!sales ? ' disabled' : '') + '>' + [4,12,24,48].map(function (n) { return '<option value="' + n + '" data-ivs-en="' + n + ' hours" data-ivs-es="' + n + ' horas"' + (hours === n ? ' selected' : '') + '>' + n + ' ' + esc(enEs('hours','horas')) + '</option>'; }).join('') + '</select></label>' +
      '<label class="ivs-choice"><span>' + txNode('Story language', 'Idioma de la historia') + '</span><select data-ivs-locale><option value="en"' + (locale === 'en' ? ' selected' : '') + '>EN</option><option value="es"' + (locale === 'es' ? ' selected' : '') + '>ES</option></select></label>' +
      '<span class="ivs-declaration" data-ivs-declaration>' + (!sales ? enEs('Availability status unavailable', 'Estado de disponibilidad no disponible') : decl ? (decl.enabled && decl.sale_expires_at <= Date.now() ? enEs('Sale window ended', 'Vigencia de venta terminada') : decl.enabled ? enEs('Sale declaration active', 'Declaración de venta activa') : enEs('Sale declaration paused', 'Declaración de venta pausada')) : enEs('Count only · no sale declaration', 'Solo conteo · sin declaración de venta')) + '</span><span class="ivs-declaration" data-ivs-sale-note></span>' +
      '</div>';
    var host = existing || document.createElement('div');
    host.innerHTML = controlsHtml;
    return host.firstElementChild;
  }
  function decoratePrepared() {
    if (!page) return;
    prepared = Array.isArray(window.InventoryPage && window.InventoryPage.prepared && window.InventoryPage.prepared()) ? window.InventoryPage.prepared() : prepared;
    prepared.forEach(function (p) {
      var card = row(p.id); if (!card || card.querySelector('[data-ivs-sale]')) return;
      var main = card.querySelector('.inv-prep-main'); if (!main) return;
      var salesControl = controlMarkup(p);
      main.insertAdjacentElement('afterend', salesControl);
      var state = { id:String(p.id), decl:declaration(p.id), checkbox:salesControl.querySelector('[data-ivs-enabled]'), hours:salesControl.querySelector('[data-ivs-hours]'), locale:salesControl.querySelector('[data-ivs-locale]'), note:salesControl.querySelector('[data-ivs-sale-note]') };
      controls.set(state.id, state);
      function capture() {
        var prior = drafts.get(state.id);
        drafts.set(state.id, { enabled:state.checkbox.checked, hours:Number(state.hours.value) || 24, locale:state.locale.value === 'en' ? 'en' : 'es', revision:prior ? prior.revision : currentRevision(state.id), touched:true });
        renderPromotions();
      }
      state.checkbox.addEventListener('change', capture); state.hours.addEventListener('change', capture); state.locale.addEventListener('change', capture);
    });
  }
  function syncControls() {
    controls.forEach(function (control, id) {
      var card = row(id); if (!card) return;
      var decl = declaration(id), draft = drafts.get(id);
      control.decl = decl;
      control.checkbox.disabled = false;
      control.hours.disabled = authority !== 'available';
      control.checkbox.indeterminate = authority !== 'available';
      if (authority !== 'available') {
        control.checkbox.checked = draft ? !!draft.enabled : false;
        var unknown = card.querySelector('[data-ivs-declaration]');
        if (unknown) unknown.textContent = enEs('Availability status unavailable','Estado de disponibilidad no disponible');
        return;
      }
      if (!draft) {
        control.checkbox.checked = !!(decl && decl.enabled);
        control.hours.value = String(decl && decl.sale_expires_at > Date.now() ? ([4,12,24,48].find(function (n) { return n >= Math.ceil((decl.sale_expires_at - Date.now()) / 3600000); }) || 48) : 24);
        var promo = promotion(id); if (promo && promo.locale) control.locale.value = promo.locale;
      }
      var state = card.querySelector('[data-ivs-declaration]');
      if (state) state.textContent = authority !== 'available' ? enEs('Availability status unavailable','Estado de disponibilidad no disponible') : decl ? (decl.enabled && decl.sale_expires_at <= Date.now() ? enEs('Sale window ended','Vigencia de venta terminada') : decl.enabled ? enEs('Sale declaration active','Declaración de venta activa') : enEs('Sale declaration paused','Declaración de venta pausada')) : enEs('Count only · no sale declaration','Solo conteo · sin declaración de venta');
    });
  }
  function stateLabel(state) {
    var map = { pending:['Preparing Story…','Preparando historia…'], preview_ready:['Preparing exact preview…','Preparando la vista previa exacta…'], ready_for_review:['Ready for owner review','Lista para revisión del propietario'], reviewed:['Approved for scheduling','Aprobada para programar'], published:['Published','Publicada'], withdrawn:['Unavailable · Story withdrawn','No disponible · Historia retirada'], error:['Story preparation failed','Falló la preparación de la historia'] };
    return enEs.apply(null, map[state] || ['No Story prepared','No hay una historia preparada']);
  }
  function promoCard(promo, item) {
    var id = String(promo.menu_item_id), offerData = offer(id), menu = findPrepared(id) || item || {}, qty = offerData ? offerData.remaining : null;
    var image = (offerData && offerData.image) || menu.image || '';
    var displayName = promo.locale === 'es' ? (menu.name_es || offerData && offerData.name_es || menu.name || id) : (menu.name || offerData && offerData.name || id);
    var blocked = suppression(id);
    var label = qty == null ? enEs('No active sale quantity', 'Sin cantidad de venta activa') : String(qty);
    var stale = staleSnapshot(promo, offerData);
    var url = '/order?product=' + encodeURIComponent(id) + (offerData ? '&offer_revision=' + encodeURIComponent(offerData.revision) : '');
    var previewReady = ['ready_for_review','reviewed'].includes(promo.state) && !!promo.jpeg_sha256;
    var previewUrl = previewReady ? href(id, promo.snapshot_hash, true) : '';
    var owner = actorRole === 'owner';
    var card = '<article class="ivs-promo" data-ivs-promo="' + esc(id) + '"><div class="ivs-promo-head">' + (image ? '<img class="ivs-photo" src="' + esc(catalogPhoto(image)) + '" alt="' + esc(enEs('Catalog photo for ', 'Foto del catálogo para ') + (menu.name || promo.name || id)) + '" loading="lazy">' : '<div class="ivs-photo ivs-photo-empty" role="img" aria-label="' + esc(enEs('Catalog photo unavailable', 'Foto del catálogo no disponible')) + '"></div>') +
      '<div class="ivs-promo-main"><strong>' + esc(displayName) + '</strong><span>' + esc(enEs('Current listed quantity: ', 'Cantidad publicada actual: ') + label) + '</span><span class="ivs-state">' + esc(stale ? enEs('Story snapshot needs refresh', 'La vista de la historia necesita actualizarse') : stateLabel(promo.state)) + '</span><span>' + esc(enEs('Website: ', 'Sitio web: ') + (websiteEnabled == null ? enEs('unknown', 'desconocido') : websiteEnabled ? enEs('active', 'activo') : enEs('paused', 'en pausa'))) + '</span></div></div>' +
      (previewReady ? '<img class="ivs-story-preview" src="' + esc(previewUrl) + '" alt="' + esc(enEs('Exact rendered Story preview', 'Vista previa exacta de la historia renderizada')) + '"><a class="ivs-link" href="' + esc(previewUrl) + '" download="anejo-inventory-story-' + esc(id) + '.jpg">' + txNode('Download exact JPEG', 'Descargar JPEG exacto') + '</a>' : '') +
      '<p class="ivs-order-link"><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a><small>' + esc(enEs('Customers choose delivery at checkout.', 'El cliente elige la entrega al finalizar la compra.')) + '</small></p>' +
      (blocked ? '<p class="ivs-error">' + esc(suppressionLabel(blocked.reason)) + '</p>' : '') +
      (promo.error ? '<p class="ivs-error" role="status">' + esc(promo.error) + '</p>' : '') +
      '<div class="ivs-actions">' + (!stale && ['preview_ready','ready_for_review'].includes(promo.state) && !promo.jpeg_sha256 ? '<button type="button" class="ivs-button" data-ivs-render="' + esc(id) + '">' + txNode('Render exact JPEG', 'Generar JPEG exacto') + '</button>' : '') +
      (stale || promo.state === 'error' || !promo.snapshot_hash ? '<button type="button" class="ivs-button" data-ivs-retry="' + esc(id) + '">' + txNode(stale ? 'Refresh current Story' : 'Retry Story preparation', stale ? 'Actualizar historia actual' : 'Reintentar preparación de la historia') + '</button>' : '') +
      (owner && !stale && previewReady && promo.state === 'ready_for_review' ? '<label class="ivs-review"><input type="checkbox" data-ivs-review="' + esc(id) + '" disabled' + (reviewDrafts.get(id) === reviewKey(promo) ? ' checked' : '') + '><span>' + txNode('I reviewed this Story', 'Revisé esta historia') + '</span></label><button type="button" class="ivs-button" data-ivs-approve="' + esc(id) + '" disabled>' + txNode('Approve Story', 'Aprobar historia') + '</button>' : '') +
      '</div>' + (owner && promo.state === 'reviewed' ? '<p class="ivs-confirmed">' + esc(enEs('Reviewed. Schedule or publish from ', 'Revisada. Programa o publica desde ')) + '<a href="/hub/owner/social.html">' + esc('/hub/owner/social.html') + '</a>.</p>' : '') + '</article>';
    return card;
  }
  function websiteCard() {
    var mount = section.querySelector('.ivs-website'), oldDetails = mount.querySelector('details'), keepOpen = !!(oldDetails && oldDetails.open) || !!websiteDraft;
    if (websiteEnabled == null) { mount.innerHTML = '<p class="ivs-unavailable">' + esc(enEs('Website availability could not be verified.', 'No se pudo verificar la disponibilidad del sitio web.')) + '</p>'; return; }
    var isOwner = actorRole === 'owner';
    var enabled = websiteDraft ? websiteDraft.enabled : !!websiteEnabled;
    var reviewed = websiteDraft && websiteDraft.reviewed;
    var exampleOffers = offers.map(function (o) { var name = window.AnejoLang && window.AnejoLang.get() === 'es' ? (o.name_es || o.name) : o.name; var order = '/order?product=' + encodeURIComponent(o.item_id) + '&offer_revision=' + encodeURIComponent(o.revision); return '<div class="ivs-site-preview-row"><img src="' + esc(catalogPhoto(o.image)) + '" alt=""><span>' + esc(name || o.item_id) + ' · ' + esc(o.remaining) + '</span><a href="' + esc(order) + '" target="_blank" rel="noopener">' + esc(order) + '</a></div>'; }).join('');
    mount.innerHTML = '<details class="ivs-website-card"' + (keepOpen ? ' open' : '') + '><summary>' + txNode('Website stock alerts: ' + (enabled ? 'active' : 'paused'), 'Alertas de existencias del sitio web: ' + (enabled ? 'activas' : 'en pausa')) + '</summary>' +
      (isOwner ? '<div class="ivs-website-body"><p>' + esc(enEs('Preview: current listed quantities appear on order pages. Customers choose delivery using the existing checkout options.', 'Vista previa: las cantidades publicadas aparecen en las páginas de pedido. El cliente elige la entrega con las opciones existentes.')) + '</p><div class="ivs-site-preview">' + (exampleOffers || '<span>' + esc(enEs('No active sale quantities to preview.', 'No hay cantidades de venta activas para mostrar.')) + '</span>') + '</div><label class="ivs-toggle"><input type="checkbox" data-ivs-website-value' + (enabled ? ' checked' : '') + '><span>' + txNode('Enable website stock alerts', 'Activar alertas de existencias del sitio web') + '</span></label><label class="ivs-review"><input type="checkbox" data-ivs-website-reviewed' + (reviewed ? ' checked' : '') + '><span>' + txNode('I reviewed this website card', 'Revisé esta tarjeta del sitio web') + '</span></label><button class="ivs-button" type="button" data-ivs-website-save' + (reviewed ? '' : ' disabled') + '>' + txNode('Review and save setting', 'Revisar y guardar configuración') + '</button><span class="ivs-website-status" role="status" aria-live="polite">' + esc(websiteMessage) + '</span></div>' : '<p class="ivs-website-body">' + esc(enEs('Only the owner can change this setting.', 'Solo el propietario puede cambiar esta configuración.')) + '</p>') + '</details>';
    if (isOwner) {
      var review = mount.querySelector('[data-ivs-website-reviewed]'), save = mount.querySelector('[data-ivs-website-save]');
      review.addEventListener('change', function () { websiteDraft = { enabled:mount.querySelector('[data-ivs-website-value]').checked, reviewed:review.checked }; save.disabled = !review.checked; });
      mount.querySelector('[data-ivs-website-value]').addEventListener('change', function (event) { websiteDraft = { enabled:event.target.checked, reviewed:review.checked }; });
      save.addEventListener('click', function () {
        if (!review.checked) return;
        var value = mount.querySelector('[data-ivs-website-value]').checked, status = mount.querySelector('.ivs-website-status');
        save.disabled = true; status.textContent = enEs('Saving reviewed setting…', 'Guardando configuración revisada…');
        post({ op:'website_setting', enabled:value, reviewed:true }).then(function (result) {
          if (result && result.ok && result.settings) { websiteEnabled = !!result.settings.website_enabled; websiteDraft = null; websiteMessage = enEs('Setting saved and read back.', 'Configuración guardada y confirmada al volver a leer.'); websiteCard(); }
          else { websiteMessage = (result && result.error) || enEs('Could not save setting.', 'No se pudo guardar la configuración.'); status.textContent = websiteMessage; status.classList.add('ivs-error'); save.disabled = false; }
        });
      });
    }
  }
  function renderPromotions() {
    if (!section) return;
    websiteCard();
    var host = section.querySelector('.ivs-cards');
    var ids = new Set(); promotions.forEach(function (p) { ids.add(String(p.menu_item_id)); }); offers.forEach(function (o) { ids.add(String(o.item_id)); }); if (sales && Array.isArray(sales.suppressed)) sales.suppressed.forEach(function (entry) { var decl = declaration(entry.item_id); if (decl && decl.enabled) ids.add(String(entry.item_id)); });
    host.innerHTML = ids.size ? Array.from(ids).map(function (id) {
      var p = promotion(id) || { menu_item_id:id, state:suppression(id) ? 'withdrawn' : 'pending', snapshot_hash:'', error:'' };
      var offerData = offer(id); return promoCard(p, offerData);
    }).join('') : '<p class="ivs-empty">' + esc(enEs('No sale Stories are available yet.', 'Aún no hay historias de venta disponibles.')) + '</p>';
    localize(section);
    Array.prototype.forEach.call(host.querySelectorAll('.ivs-story-preview'), function (image) {
      var card = image.closest('[data-ivs-promo]'), checkbox = card && card.querySelector('[data-ivs-review]'), approve = card && card.querySelector('[data-ivs-approve]');
      image.addEventListener('load', function () { if (checkbox) checkbox.disabled = false; if (approve) approve.disabled = !checkbox || !checkbox.checked; });
      image.addEventListener('error', function () { if (checkbox) checkbox.disabled = true; if (approve) approve.disabled = true; setCardStatus(card, enEs('Exact JPEG preview could not be loaded; review is unavailable.', 'No se pudo cargar la vista JPEG exacta; la revisión no está disponible.'), true); });
      if (image.complete && image.naturalWidth > 0 && checkbox) { checkbox.disabled = false; if (approve) approve.disabled = !checkbox.checked; }
    });
    wirePromotionActions();
  }
  function wirePromotionActions() {
    Array.prototype.forEach.call(section.querySelectorAll('[data-ivs-review]'), function (input) {
      input.addEventListener('change', function () { var id = input.getAttribute('data-ivs-review'), button = section.querySelector('[data-ivs-approve="' + CSS.escape(id) + '"]'); if (input.checked) reviewDrafts.set(id, reviewKey(promotion(id))); else reviewDrafts.delete(id); if (button) button.disabled = !input.checked; });
    });
    Array.prototype.forEach.call(section.querySelectorAll('[data-ivs-approve]'), function (button) {
      button.addEventListener('click', function () {
        var id = button.getAttribute('data-ivs-approve'), promo = promotion(id), review = section.querySelector('[data-ivs-review="' + CSS.escape(id) + '"]');
        if (!review || review.disabled || !review.checked || !promo || !promo.jpeg_sha256) return;
        button.disabled = true; var card = button.closest('[data-ivs-promo]'); setCardStatus(card, enEs('Approving reviewed Story…', 'Aprobando historia revisada…'));
        post({ op:'approve', item_id:id, snapshot_hash:promo.snapshot_hash, jpeg_sha256:promo.jpeg_sha256, reviewed:true }).then(function (result) {
          if (result && result.ok) { reviewDrafts.delete(id); refresh(); } else { button.disabled = false; setCardStatus(card, (result && result.error) || enEs('Could not approve Story.', 'No se pudo aprobar la historia.'), true); }
        });
      });
    });
    Array.prototype.forEach.call(section.querySelectorAll('[data-ivs-render]'), function (button) { button.addEventListener('click', function () { renderExact(button.getAttribute('data-ivs-render')); }); });
    Array.prototype.forEach.call(section.querySelectorAll('[data-ivs-retry]'), function (button) { button.addEventListener('click', function () { retryStory(button.getAttribute('data-ivs-retry')); }); });
  }
  function setCardStatus(card, message, error) {
    if (!card) return;
    var node = card.querySelector('[data-ivs-action-status]');
    if (!node) { node = document.createElement('p'); node.className = 'ivs-action-status'; node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); node.setAttribute('data-ivs-action-status', ''); card.appendChild(node); }
    node.textContent = message || ''; node.classList.toggle('ivs-error', !!error);
  }
  function fetchSvg(id, promo) {
    promo = promo || promotion(id); if (!promo || !promo.snapshot_hash) return Promise.reject(new Error(enEs('Current Story snapshot is unavailable.', 'La vista actual de la historia no está disponible.')));
    return fetch(href(id, promo.snapshot_hash, false), { credentials:'same-origin', cache:'no-store' }).then(function (response) {
      if (!response.ok) throw new Error(enEs('Current Story preview could not be loaded.', 'No se pudo cargar la vista previa actual de la historia.'));
      return response.text();
    });
  }
  function renderExact(id) {
    renderQueue = renderQueue.then(function () {
      var card = section.querySelector('[data-ivs-promo="' + CSS.escape(String(id)) + '"]');
      if (!window.InventoryStoryCard || typeof window.InventoryStoryCard.rasterize !== 'function') { setCardStatus(card, enEs('Story renderer is unavailable. Reload after the renderer loads.', 'No se puede generar la imagen de la historia. Vuelve a cargar para reintentar.'), true); return; }
      setCardStatus(card, enEs('Rendering the exact catalog Story…', 'Generando la historia exacta del catálogo…'));
      var captured = promotion(id);
      return fetchSvg(id, captured).then(function (svg) { return window.InventoryStoryCard.rasterize(svg); }).then(function (dataUrl) {
        var promo = promotion(id);
        if (!promo || !captured || promo.snapshot_hash !== captured.snapshot_hash) throw new Error(enEs('Inventory changed. Refresh the Story preview.', 'El inventario cambió. Actualiza la vista previa de la historia.'));
        return post({ op:'render', item_id:id, snapshot_hash:captured.snapshot_hash, data_url:dataUrl });
      }).then(function (result) {
        if (!result || !result.ok) { setCardStatus(card, (result && result.error) || enEs('JPEG render was not saved.', 'No se guardó el render JPEG.'), true); return; }
        setCardStatus(card, enEs('JPEG saved; loading exact readback…', 'JPEG guardado; cargando lectura exacta…'));
        return refresh();
      }).catch(function (error) { setCardStatus(card, error.message || enEs('Story render failed.', 'No se pudo generar la imagen de la historia.'), true); });
    });
    return renderQueue;
  }
  function retryStory(id) {
    var promo = promotion(id), card = section.querySelector('[data-ivs-promo="' + CSS.escape(String(id)) + '"]');
    if (promo && !staleSnapshot(promo, offer(id)) && ['preview_ready','ready_for_review'].includes(promo.state) && promo.snapshot_hash) return renderExact(id);
    var control = controls.get(String(id)), locale = control ? control.locale.value : ((promo && promo.locale) || 'es');
    setCardStatus(card, enEs('Retrying Story preparation…', 'Reintentando la preparación de la historia…'));
    return post({ op:'reconcile', item_id:id, locale:locale, force:true }).then(function (result) {
      if (!result || !result.ok) { setCardStatus(card, (result && result.error) || enEs('Story retry failed.', 'No se pudo reintentar la historia.'), true); return; }
      return refresh();
    });
  }
  function tryRenderReady() {
    if (processing) { refreshQueued = true; return; }
    processing = true;
    var candidates = promotions.filter(function (p) { return ['preview_ready','ready_for_review'].includes(p.state) && !p.jpeg_sha256 && !staleSnapshot(p, offer(p.menu_item_id)); });
    var chain = Promise.resolve();
    candidates.forEach(function (p) { chain = chain.then(function () { return renderExact(p.menu_item_id); }); });
    chain.finally(function () { processing = false; if (refreshQueued) { refreshQueued = false; refresh(); } });
  }
  function refresh() {
    ensureSection();
    return get(API).then(function (data) {
      if (!data || data.ok !== true || data._networkError || data._status || !Array.isArray(data.declarations) || !Array.isArray(data.offers) || !Array.isArray(data.promotions) || !data.settings) {
        sales = null; authority = 'unavailable'; actorRole = data && data.actor_role || actorRole; offers = []; promotions = []; websiteEnabled = null;
        decoratePrepared(); syncControls(); renderPromotions(); live((data && data.error) || enEs('Sale availability could not be verified. Count-only saves remain available.', 'No se pudo verificar la disponibilidad de venta. Los conteos normales siguen disponibles.'), true); return data;
      }
      sales = data; authority = 'available'; actorRole = data.actor_role || actorRole; promotions = data.promotions; offers = data.offers; websiteEnabled = !!data.settings.website_enabled;
      decoratePrepared(); syncControls(); renderPromotions(); live(''); tryRenderReady(); return data;
    });
  }
  function prepareSave(body, item) {
    var copy = Object.assign({}, body || {}), raw = copy.stock_count;
    var quantity = raw == null || String(raw).trim() === '' ? null : Number(raw);
    if (quantity != null && (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 9999)) throw new TypeError(enEs('Finished count must be a whole number from 0 to 9999.', 'El conteo debe ser un número entero de 0 a 9999.'));
    copy.stock_count = quantity;
    var id = String(copy.id || item && item.id || ''), control = controls.get(id), decl = declaration(id);
    if (!control) return { stock_count:quantity };
    var enabled = !!control.checkbox.checked;
    if (authority !== 'available' || !sales) {
      if (enabled) throw new Error(enEs('Sale availability could not be verified. Uncheck sale availability or wait for the status to load.', 'No se pudo verificar la disponibilidad. Desmarca la venta o espera a que cargue el estado.'));
      return { stock_count:quantity };
    }
    // An unchecked row with no existing declaration is a normal count only.
    if (!enabled && !decl) return { stock_count:quantity };
    var savedDraft = drafts.get(id), countBase = countBases.get(id);
    if (countBase && countBase.saleRevision == null && decl && !savedDraft) {
      if (control.note) control.note.textContent = enEs('Count can save, but the sale declaration was not observed when these edits began. Refresh before changing sale availability.', 'El conteo se puede guardar, pero no se observó la declaración de venta cuando comenzaron estos cambios. Actualiza antes de cambiar la disponibilidad.');
      return { stock_count:quantity };
    }
    var saleExpected = countBase && countBase.saleRevision != null ? countBase.saleRevision : savedDraft ? savedDraft.revision : (decl ? Number(decl.revision) : null);
    var ttl = Math.max(4, Math.min(48, Number(control.hours.value) || 24));
    var forSale = enabled && quantity != null && quantity > 0;
    if (control.note) control.note.textContent = enabled && !forSale ? enEs('A positive finished count is required to list this item.', 'Se requiere un conteo positivo de productos terminados para publicar este artículo.') : '';
    var locale = control.locale.value === 'en' ? 'en' : 'es';
    var bodyRevision = copy.expected_revision != null ? Number(copy.expected_revision) : item && item.inventory_revision != null ? Number(item.inventory_revision) : null;
    var intentKey = JSON.stringify([id, bodyRevision, quantity, forSale, saleExpected, ttl, locale]);
    var pinned = saleExpiries.get(id);
    if (!pinned || pinned.key !== intentKey) { pinned = { key:intentKey, expiresAt:Date.now() + ttl * 60 * 60 * 1000 }; saleExpiries.set(id, pinned); }
    return { stock_count:quantity, for_sale:forSale, sale_expected_revision:saleExpected, sale_expires_at:pinned.expiresAt, locale:locale };
  }
  function onFinishedSaved(event) {
    var detail = event && event.detail; if (!detail || !detail.body || detail.body.action !== 'menu_count') return;
    var body = detail.body, id = String(body.id);
    countBases.delete(id);
    // The stock count has already been persisted and read back by the parent page. Story work is a separate queue.
    refresh().then(function (data) {
      if (body.for_sale === undefined) return;
      if (!data || data.ok !== true || !Array.isArray(data.declarations)) { live(enEs('Sale availability readback is unavailable. Your selection remains.', 'No se pudo verificar la disponibilidad guardada. Se conserva tu selección.'), true); return; }
      var decl = declaration(id), saved = body.for_sale ? !!(decl && decl.enabled) : !decl || !decl.enabled;
      if (saved) { drafts.delete(id); saleExpiries.delete(id); }
      else live(enEs('Count saved, but sale availability did not match readback. Your selection remains.', 'El conteo se guardó, pero la venta no coincide con la lectura. Se conserva tu selección.'), true);
    });
  }
  function onRendered(event) {
    prepared = event && event.detail && Array.isArray(event.detail.prepared) ? event.detail.prepared : prepared;
    countBases.forEach(function (base, id) {
      var item = findPrepared(id), field = document.getElementById('pq-' + id);
      if (item && field && Number(item.inventory_revision) !== Number(base.inventoryRevision) && (field.value === '' ? item.stock_count == null : Number(field.value) === Number(item.stock_count))) countBases.delete(id);
    });
    decoratePrepared(); refresh();
  }
  function init() {
    if (!page || !Hub || !Kitchen) return;
    ensureStyle(); ensureSection();
    window.InventorySales = { prepareSave:prepareSave, refresh:refresh };
    decoratePrepared(); refresh();
    page.addEventListener('input', function (event) {
      if (!event.target || !/^pq-/.test(event.target.id || '')) return;
      var id = String(event.target.id.slice(3)); if (countBases.has(id)) return;
      var item = findPrepared(id);
      countBases.set(id, { inventoryRevision:Number(item && item.inventory_revision), saleRevision:currentRevision(id) });
    });
    document.addEventListener('inventory:rendered', onRendered);
    document.addEventListener('inventory:finished-saved', onFinishedSaved);
    document.addEventListener('anejo:langchange', function () { localize(document); syncControls(); renderPromotions(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})(window, document);
