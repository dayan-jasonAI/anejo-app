/* Private marketing photo library. Selecting a photo only opens the draft composer. */
(function () {
  'use strict';
  var root, photos = [], cursor = null, busy = false;
  function t(en, es) { return window.AnejoLang && window.AnejoLang.get() === 'es' ? es : en; }
  function el(tag, text, cls) { var n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; }
  function status(text) { root.querySelector('[data-photo-status]').textContent = text; }
  function read(file) { return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = function () { reject(new Error(t('Could not read this file.', 'No se pudo leer este archivo.'))); }; r.readAsDataURL(file); }); }
  function api(path, options) { return Hub.api(path, options).then(function (r) { if (!r || !r.ok) throw new Error((r && r.error) || t('Could not complete the request.', 'No se pudo completar la solicitud.')); return r; }); }
  function lock(value) { busy = value; root.querySelectorAll('button,input').forEach(function (n) { n.disabled = value; }); }
  function valid(file) { return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= 5 * 1024 * 1024; }
  async function upload(files) {
    if (busy || !files.length) return;
    var folder = root.querySelector('[data-photo-folder]').value.trim();
    lock(true);
    var saved = 0, errors = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!valid(f)) { errors.push(f.name + ': ' + t('Use JPEG, PNG or WebP up to 5 MB.', 'Usa JPEG, PNG o WebP de hasta 5 MB.')); continue; }
      status(t('Uploading ', 'Subiendo ') + (i + 1) + '/' + files.length + ': ' + f.name);
      try {
        var result = await api('/api/hub/owner/marketing-library', { method: 'POST', body: { data_url: await read(f), name: f.name, folder: folder, tags: [] } });
        photos.unshift(result.photo); saved++;
      } catch (e) { errors.push(f.name + ': ' + e.message); }
    }
    drawGallery(); lock(false);
    root.querySelector('[data-photo-files]').value = '';
    status(saved + t(' photo(s) saved. ', ' foto(s) guardada(s). ') + errors.join(' '));
  }
  async function jpegCopy(photo) {
    var img = new Image();
    await new Promise(function (resolve, reject) { img.onload = resolve; img.onerror = function () { reject(new Error(t('Could not open the photo.', 'No se pudo abrir la foto.'))); }; img.src = photo.url; });
    var scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
    var canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    var r = await api('/api/hub/owner/marketing-library', { method: 'POST', body: {
      data_url: canvas.toDataURL('image/jpeg', 0.92),
      name: (photo.name || 'Event photo').replace(/\.[^.]+$/, '').slice(0, 100) + ' Instagram.jpg',
      folder: photo.folder || '', tags: ['instagram-copy']
    } });
    photos.unshift(r.photo); drawGallery(); lock(true);
    return r.photo;
  }
  async function choose(photo) {
    if (busy) return;
    if(photo.ai_enhanced && !window.confirm(t('AI-enhanced copy: have you checked the food, packaging and printed text against the original?', 'Copia con IA: ¿comparaste comida, empaque y textos con el original?')))return;
    lock(true); status(t('Preparing your draft…', 'Preparando tu borrador…'));
    try {
      var jpeg = photo.content_type === 'image/jpeg' || /\.jpe?g$/i.test(photo.media_key);
      var selected = jpeg ? photo : await jpegCopy(photo);
      await window.MarketingTabs.pickLibraryPhoto(selected);
      status(t('Photo opened in Create. Review it and write your caption before saving a draft.', 'Foto abierta en Crear. Revísala y escribe el texto antes de guardar el borrador.'));
    } catch (e) { status(e.message); }
    finally { lock(false); }
  }
  function reviewForReuse(photo, card) {
    var detail = el('details', '', 'photo-reuse-review');
    detail.append(el('summary', t('Review for team reuse', 'Revisar para uso del equipo')));
    var pane = el('div', '', 'photo-reuse-pane'); detail.append(pane); card.append(detail);
    var loading = false, loaded = false;
    async function reload() {
      if (loading) return;
      loading = true; pane.replaceChildren(el('p', t('Loading saved review…', 'Cargando revisión guardada…')));
      var results = await Promise.allSettled([api('/api/hub/owner/marketing-asset-registry?asset_key=' + encodeURIComponent(photo.media_key)), api('/api/menu')]);
      loading = false; loaded = true; pane.replaceChildren();
      var preview = el('img'); preview.src = photo.url; preview.alt = photo.name || t('Photo under review', 'Foto en revisión'); preview.className = 'photo-reuse-preview';
      pane.append(preview, el('p', t('Permission to select this photo for draft posts only. This does not approve a public post, caption or schedule.', 'Permiso para seleccionar esta foto solo en borradores. No aprueba publicaciones, textos ni horarios.'), 'hint'));
      var feedback = el('p', '', 'photo-reuse-status'); feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'polite');
      var retry = el('button', t('Reload saved review', 'Recargar revisión'), 'btn ghost'); retry.type = 'button'; retry.onclick = reload;
      if (results[0].status !== 'fulfilled') {
        pane.append(el('p', t('Reuse registry unavailable. Approval status is unknown; no permission has been changed. ', 'Registro no disponible. El estado es desconocido; no se cambió ningún permiso. ') + results[0].reason.message), retry); return;
      }
      var registry = results[0].value;
      var record = (registry.assets || []).find(function (r) { return r.asset_key === photo.media_key; });
      if (!record && registry.truncated) {
        pane.append(el('p', t('The registry response is incomplete. Current review status cannot be confirmed for this photo.', 'La respuesta del registro está incompleta. No se puede confirmar la revisión de esta foto.')), retry); return;
      }
      pane.append(el('p', record ? (record.approved_for_draft_selection ? t('Allowed in draft selection', 'Permitida para borradores') : t('Not allowed in draft selection', 'No permitida para borradores')) + ' · ' + t('revision ', 'revisión ') + record.revision : t('Not registered. Uploading a photo never enables reuse automatically.', 'Sin registrar. Subir una foto nunca permite su reutilización automáticamente.'), 'photo-reuse-state'));
      if (record) pane.append(el('p', t('Saved content hash: ', 'Hash del contenido guardado: ') + record.content_sha256 + ' · ' + t('Reviewed by ', 'Revisada por ') + record.reviewed_by, 'photo-reuse-hash'));
      var changing = false, stale = false, mutationButtons = [];
      async function write(payload, saveButton) {
        if (changing || stale) return; changing = true; saveButton.disabled = true; retry.disabled = true;
        try {
          await api('/api/hub/owner/marketing-asset-registry', { method: 'POST', body: payload });
          await reload();
        } catch (error) {
          stale = true; mutationButtons.forEach(function (button) { button.disabled = true; });
          feedback.textContent = t('Not saved. Reload the review before retrying. ', 'No se guardó. Recarga la revisión antes de reintentar. ') + error.message;
          // Keep the old revision disabled after any failure. Never silently retry against a
          // newer review or turn a failed approval into a checked permission.
        } finally { changing = false; retry.disabled = false; }
      }
      if (record && record.approved_for_draft_selection) {
        var revoke = el('button', t('Stop team reuse', 'Detener reutilización'), 'btn ghost'); revoke.type = 'button';
        revoke.onclick = function () { write({ op: 'revoke', asset_key: photo.media_key, expected_revision: record.revision }, revoke); };
        mutationButtons.push(revoke); pane.append(revoke);
      }
      var menu = results[1].status === 'fulfilled' ? results[1].value : null;
      if (!menu || menu.source !== 'd1') {
        pane.append(el('p', t('Live catalog unavailable. New approval is disabled; an existing permission can still be revoked.', 'Catálogo en vivo no disponible. No se pueden dar nuevos permisos; los existentes sí se pueden revocar.')), feedback, retry); return;
      }
      var jpeg = /\.jpe?g$/i.test(photo.media_key);
      if (!jpeg) { pane.append(el('p', t('Reuse requires a JPEG. Prepare a JPEG draft copy, then review that copy separately.', 'Se necesita un JPEG. Prepara una copia JPEG y revísala por separado.')), feedback, retry); return; }
      var items = [].concat(menu.items || [], menu.bowls || [], menu.drinks || [], menu.addons || []);
      var seen = new Set(); items = items.filter(function (item) { if (!item.id || seen.has(item.id)) return false; seen.add(item.id); return true; });
      var products = el('fieldset', '', 'photo-reuse-products'); products.append(el('legend', t('Exactly which menu items appear?', '¿Qué productos del menú aparecen?')));
      var selected = record ? (record.menu_item_ids || []) : [];
      var checks = [], productRows = [];
      var searchLabel = el('label', t('Find menu items', 'Buscar productos del menú'), 'photo-reuse-search');
      var menuSearch = el('input'); menuSearch.type = 'search'; menuSearch.placeholder = t('Name or item ID', 'Nombre o ID del producto'); searchLabel.append(menuSearch);
      var productCount = el('p', '', 'photo-reuse-count'); productCount.setAttribute('role', 'status'); productCount.setAttribute('aria-live', 'polite');
      var productList = el('div', '', 'photo-reuse-product-list');
      products.append(searchLabel, productCount, productList);
      function filterProducts() {
        var query = menuSearch.value.trim().toLocaleLowerCase(); var visible = 0;
        productRows.forEach(function (row) { row.label.hidden = query.length > 0 && !row.search.includes(query); if (!row.label.hidden) visible++; });
        productCount.textContent = t(visible + ' of ' + items.length + ' shown · ' + checks.filter(function (input) { return input.checked; }).length + ' selected', visible + ' de ' + items.length + ' visibles · ' + checks.filter(function (input) { return input.checked; }).length + ' seleccionados');
      }
      menuSearch.oninput = filterProducts;
      items.forEach(function (item) {
        var label = el('label'); var input = el('input'); input.type = 'checkbox'; input.value = item.id; input.checked = selected.includes(item.id);
        checks.push(input); input.onchange = filterProducts; label.append(input, el('span', t(item.name, item.name_es || item.name) + ' · ' + item.id)); productList.append(label);
        productRows.push({ label: label, search: [item.name, item.name_es, item.id].filter(Boolean).join(' ').toLocaleLowerCase() });
      });
      filterProducts();
      var missing = selected.filter(function (id) { return !seen.has(id); });
      if (missing.length) products.append(el('p', t('Previously selected products are absent from the current catalog: ', 'Productos anteriores ausentes del catálogo actual: ') + missing.join(', ')));
      var themeLabel = el('label', t('Theme (optional; use consistent wording)', 'Tema (opcional; usa el mismo nombre)'));
      var theme = el('input'); theme.type = 'text'; theme.maxLength = 80; theme.value = record ? record.theme : ''; theme.placeholder = t('Signature, birthday, custom…', 'Signature, cumpleaños, personalizado…'); themeLabel.append(theme);
      var visualLabel = el('label', t('What does the image show?', '¿Qué muestra la imagen?'));
      var visual = el('select'); [['product','Single product','Un producto'],['combo','Several products together','Varios productos juntos'],['lifestyle','Event or lifestyle','Evento o ambiente'],['editorial','Editorial design','Diseño editorial']].forEach(function (v) { var option = el('option', t(v[1], v[2])); option.value = v[0]; visual.append(option); }); visual.value = record ? record.visual_type : 'product'; visualLabel.append(visual);
      var consentLabel = el('label', '', 'photo-reuse-optin'); var consent = el('input'); consent.type = 'checkbox'; consent.checked = !!(record && record.approved_for_draft_selection);
      consentLabel.append(consent, el('span', t('Allow team to reuse in draft posts', 'Permitir al equipo reutilizar en borradores')));
      var save = el('button', t('Save reuse review', 'Guardar revisión'), 'btn gold'); save.type = 'button'; mutationButtons.push(save);
      save.onclick = function () {
        var ids = checks.filter(function (input) { return input.checked; }).map(function (input) { return input.value; });
        if (!ids.length || ids.length > 12) { feedback.textContent = t('Select one to twelve actual products shown in this image.', 'Selecciona de uno a doce productos que aparezcan en esta imagen.'); return; }
        write({ asset_key: photo.media_key, expected_revision: record ? record.revision : 0, menu_item_ids: ids, theme: theme.value.trim(), visual_type: visual.value, approved_for_draft_selection: consent.checked }, save);
      };
      pane.append(products, themeLabel, visualLabel, consentLabel, save, feedback, retry);
    }
    detail.ontoggle = function () { if (detail.open && !loaded) reload(); };
  }
  function drawGallery() {
    var grid = root.querySelector('[data-photo-grid]'); grid.replaceChildren();
    var search = root.querySelector('[data-photo-search]');
    var term = (search.value || '').trim().toLowerCase();
    var visible = photos.filter(function (p) { return !term || ((p.name || '') + ' ' + (p.folder || '')).toLowerCase().includes(term); });
    root.querySelector('[data-photo-count]').textContent = visible.length + t(' shown of ', ' visibles de ') + photos.length + t(' loaded photos. Search covers loaded photos only; use Load more for older photos.', ' fotos cargadas. La búsqueda solo incluye fotos cargadas; usa Ver más para las anteriores.');
    visible.forEach(function (p) {
      var card = el('article', '', 'photo-library-card');
      var img = el('img'); img.src = p.url; img.alt = p.name || t('Uploaded event photo', 'Foto de evento subida'); img.loading = 'lazy';
      img.onerror = function () { img.hidden = true; card.prepend(el('p', t('Preview unavailable', 'Vista previa no disponible'))); };
      card.append(img, el('strong', p.name || t('Event photo', 'Foto de evento')), el('p', p.folder || t('Unfiled', 'Sin carpeta'), 'hint'));
      var jpeg = p.content_type === 'image/jpeg' || /\.jpe?g$/i.test(p.media_key);
      var button = el('button', jpeg ? t('Start a post', 'Crear publicación') : t('Prepare JPEG draft', 'Preparar borrador JPEG'), 'btn ghost'); button.type = 'button'; button.onclick = function () { choose(p); }; card.append(button);
      if (!jpeg) card.append(el('p', t('Creates a JPEG copy for Instagram. The original stays here.', 'Crea una copia JPEG para Instagram. El original se conserva aquí.'), 'hint'));
      if(p.ai_enhanced)card.append(el('p',t('AI-enhanced copy — review against original','Copia con IA — comparar con original'),'hint'));
      else if(p.source_key)card.append(el('p',t('Photographic polish — original preserved','Ajuste fotográfico — original conservado'),'hint'));
      else {var enhance=el('button',t('Enhance photo','Mejorar foto'),'btn ghost');enhance.type='button';enhance.onclick=async function(){await MarketingPhotoEnhance.open({photo:p,onUse:choose});load(false);};card.append(enhance);}
      reviewForReuse(p, card);
      grid.append(card);
    });
    root.querySelector('[data-photo-empty]').hidden = photos.length > 0;
    root.querySelector('[data-photo-more]').hidden = !cursor;
  }
  async function load(more) {
    if (busy) return;
    lock(true); status(t('Loading photos…', 'Cargando fotos…'));
    try {
      var r = await api('/api/hub/owner/marketing-library?limit=24' + (more && cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
      var known = new Set((more ? photos : []).map(function (p) { return p.media_key; }));
      photos = (more ? photos : []).concat(r.photos.filter(function (p) { return !known.has(p.media_key); })); cursor = r.cursor || null; drawGallery(); status('');
    } catch (e) { status(e.message); root.querySelector('[data-photo-empty]').hidden = true; }
    finally { lock(false); }
  }
  function mount() {
    root = document.getElementById('photos-root'); if (!root || root.dataset.mounted) return;
    root.dataset.mounted = 'true';
    root.innerHTML = '<div class="photo-library-intro"><div><p class="eyebrow">AÑEJO · '+t('YOUR PHOTOS','TUS FOTOS')+'</p><h2>'+t('From your table to your next post','De tu mesa a tu próxima publicación')+'</h2><p>'+t('Drop your real food and event photos here. Keep them together, then choose a favorite to start a draft.','Sube aquí tus fotos reales de comida y eventos. Organízalas y elige una para empezar un borrador.')+'</p></div></div>' +
      '<div class="photo-library-drop" data-photo-drop><label for="photo-folder">'+t('Event or folder (optional)','Evento o carpeta (opcional)')+'</label><input id="photo-folder" data-photo-folder maxlength="80" placeholder="'+t('e.g. Pink birthday catering','Ej. Catering de cumpleaños rosa')+'"><button type="button" class="btn gold" data-photo-choose>'+t('Choose photos','Elegir fotos')+'</button><input hidden id="photo-files" data-photo-files type="file" accept="image/jpeg,image/png,image/webp" multiple><p class="hint">'+t('Or drop files here · JPEG, PNG, WebP · up to 5 MB each','O arrastra archivos aquí · JPEG, PNG, WebP · hasta 5 MB cada uno')+'</p><p class="hint">'+t('Saved privately for the Hub and marketing team. Uploading does not publish or schedule anything.','Guardadas de forma privada para el Hub y el equipo de marketing. Subir no publica ni programa nada.')+'</p></div>' +
      '<p data-photo-status role="status" aria-live="polite"></p><div class="photo-library-toolbar"><h3>'+t('Your photo collection','Tu colección de fotos')+'</h3><button type="button" data-photo-refresh class="btn ghost">'+t('Refresh','Actualizar')+'</button></div><p class="hint">'+t('Before publishing, review names, people, menu accuracy and your final caption.','Antes de publicar, revisa nombres, personas, el menú y el texto final.')+'</p><label for="photo-search">'+t('Find in loaded photos','Buscar en fotos cargadas')+'</label><input id="photo-search" data-photo-search type="search" placeholder="'+t('File name or event folder','Nombre de archivo o carpeta')+'"><p class="hint" data-photo-count></p><p data-photo-empty hidden>'+t('No photos yet. Add your first event above.','Aún no hay fotos. Agrega tu primer evento arriba.')+'</p><div data-photo-grid class="photo-library-grid"></div><button data-photo-more type="button" class="btn ghost" hidden>'+t('Load more','Ver más')+'</button>';
    root.querySelector('[data-photo-choose]').onclick = function () { if (!busy) root.querySelector('[data-photo-files]').click(); };
    root.querySelector('[data-photo-files]').onchange = function () { upload(Array.from(this.files)); };
    var drop = root.querySelector('[data-photo-drop]'); drop.ondragover = function (e) { e.preventDefault(); }; drop.ondrop = function (e) { e.preventDefault(); upload(Array.from(e.dataTransfer.files)); };
    root.querySelector('[data-photo-search]').oninput = drawGallery;
    root.querySelector('[data-photo-refresh]').onclick = function () { load(false); };
    root.querySelector('[data-photo-more]').onclick = function () { load(true); };
    load(false);
  }
  window.MarketingPhotoLibrary = { mount: mount };
})();
