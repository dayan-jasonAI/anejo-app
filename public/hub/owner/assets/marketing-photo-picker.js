/* Shared private photo selector. Callers decide what selection does; this never saves a post. */
(function () {
  'use strict';
  var active = null;
  function tr(en, es) { return window.AnejoLang && window.AnejoLang.get() === 'es' ? es : en; }
  function element(tag, text, cls) { var el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el; }
  async function request(path, options) { var r = await Hub.api(path, options); if (!r || !r.ok) throw new Error(r && r.error || tr('Could not load photos.', 'No se pudieron cargar las fotos.')); return r; }
  async function jpeg(photo) {
    if (photo.content_type === 'image/jpeg' || /\.jpe?g$/i.test(photo.media_key)) return photo;
    var img = new Image();
    await new Promise(function (resolve, reject) { img.onload = resolve; img.onerror = function () { reject(new Error(tr('Could not read this photo.', 'No se pudo leer esta foto.'))); }; img.src = photo.url; });
    var canvas = document.createElement('canvas'), scale = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    var r = await request('/api/hub/owner/marketing-library', { method: 'POST', body: { data_url: canvas.toDataURL('image/jpeg', 0.92), name: (photo.name || 'Photo').replace(/\.[^.]+$/, '').slice(0, 100) + ' Instagram.jpg', folder: photo.folder || '', tags: ['instagram-copy'] } });
    return r.photo;
  }
  function open(options) {
    options = options || {};
    // Do not interrupt an open caller's selection with a second dialog.
    if (active) return Promise.resolve(null);
    var previous = document.activeElement, dialog = element('dialog', '', 'marketing-photo-picker');
    var heading = element('h2', tr('Choose from your photos', 'Elige entre tus fotos')); heading.id = 'marketing-photo-picker-title';
    dialog.setAttribute('aria-labelledby', heading.id);
    var cancel = element('button', tr('Cancel', 'Cancelar'), 'btn ghost'); cancel.type = 'button';
    var header = element('div', '', 'mpp-header'); header.append(heading, cancel);
    var label = element('label', tr('Search loaded photos by name or event', 'Buscar fotos cargadas por nombre o evento')); label.htmlFor = 'mpp-search';
    var search = element('input'); search.type = 'search'; search.id = 'mpp-search';
    var note = element('p', tr('Search covers loaded photos only. Load more to see older photos. Selection does not publish or schedule a post.', 'La búsqueda incluye solo fotos cargadas. Carga más para ver fotos anteriores. Seleccionar no publica ni programa una publicación.'), 'mpp-hint');
    var status = element('p', '', 'mpp-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    var grid = element('div', '', 'mpp-grid');
    var more = element('button', tr('Load more', 'Cargar más'), 'btn ghost'); more.type = 'button'; more.hidden = true;
    var retry = element('button', tr('Retry loading', 'Reintentar carga'), 'btn ghost'); retry.type = 'button'; retry.hidden = true;
    dialog.append(header, label, search, note, status, retry, grid, more);
    document.body.append(dialog);
    var photos = [], cursor = null, closed = false, busy = false, resolveResult;
    var promise = new Promise(function (resolve) { resolveResult = resolve; });
    active = dialog;
    function finish(value) { if (closed) return; closed = true; dialog.close(); dialog.remove(); active = null; if (previous && previous.isConnected) previous.focus(); resolveResult(value); }
    function lock(on) { busy = on; dialog.querySelectorAll('button,input').forEach(function (n) { n.disabled = on; }); cancel.disabled = false; }
    async function select(photo, enhance) {
      if (busy) return;
      if (!enhance && photo.ai_enhanced && !window.confirm(tr('AI-enhanced copy: have you compared the food, quantities, packaging and printed text with the original? Use this reviewed copy?', 'Copia mejorada con IA: ¿comparaste comida, cantidades, empaque y texto impreso con el original? ¿Usar esta copia revisada?'))) return;
      lock(true); status.textContent = tr('Preparing photo…', 'Preparando foto…');
      try {
        if (enhance) {
          // Restore caller focus and release modal before its enhancement interface opens.
          finish(null); await options.onEnhance(photo); return;
        }
        var selected = await jpeg(photo);
        if (closed) return;
        // Cache a conversion before invoking the caller so retry never makes another JPEG.
        if (selected.media_key !== photo.media_key) { Object.assign(photo, selected); }
        if (options.onSelect) await options.onSelect(selected);
        if (!closed) finish(selected);
      } catch (error) { if (!closed) { status.textContent = error.message || tr('Could not select the photo.', 'No se pudo seleccionar la foto.'); draw(); } }
      finally { if (!closed) lock(false); }
    }
    function draw() {
      grid.replaceChildren();
      var term = search.value.trim().toLowerCase();
      var visible = photos.filter(function (p) { return !term || ((p.name || '') + ' ' + (p.folder || '')).toLowerCase().includes(term); });
      visible.forEach(function (photo) {
        var card = element('article', '', 'mpp-card'), img = element('img'); img.src = photo.url; img.alt = photo.name || tr('Event photo', 'Foto de evento'); img.loading = 'lazy';
        img.onerror = function () { img.hidden = true; card.prepend(element('p', tr('Preview unavailable', 'Vista previa no disponible'))); };
        var isJpeg = photo.content_type === 'image/jpeg' || /\.jpe?g$/i.test(photo.media_key);
        var use = element('button', isJpeg ? tr('Use photo', 'Usar foto') : tr('Use JPEG copy', 'Usar copia JPEG'), 'btn gold'); use.type = 'button'; use.onclick = function () { select(photo, false); };
        card.append(img, element('strong', photo.name || tr('Photo', 'Foto')), element('p', photo.folder || tr('Unfiled', 'Sin carpeta'), 'mpp-hint'), use);
        if (photo.ai_enhanced) {
          card.append(element('strong', tr('AI-enhanced · Review required', 'Mejorada con IA · Requiere revisión')));
          if (photo.source_key) { var original = element('img'); original.src = '/api/hub/media/' + photo.source_key; original.alt = tr('Original for comparison', 'Original para comparar'); original.loading = 'lazy'; card.append(element('p', tr('Compare with original', 'Comparar con el original'), 'mpp-hint'), original); }
        }
        if (!isJpeg) card.append(element('p', tr('Creates a private JPEG copy on white; preserves the original.', 'Crea una copia JPEG privada sobre blanco; conserva el original.'), 'mpp-hint'));
        if (photo.enhancement_method === 'photographic') card.append(element('p', tr('Photographic polish — original preserved', 'Ajuste fotográfico — original conservado'), 'mpp-hint'));
        if (options.onEnhance && !photo.source_key && !photo.ai_enhanced) { var enhance = element('button', tr('Enhance a copy', 'Mejorar una copia'), 'btn ghost'); enhance.type = 'button'; enhance.onclick = function () { select(photo, true); }; card.append(enhance); }
        grid.append(card);
      });
      if (!visible.length) grid.append(element('p', term ? tr('No matches in loaded photos.', 'Sin coincidencias entre las fotos cargadas.') : tr('No photos saved yet. Add photos in Photos / Fotos.', 'Aún no hay fotos guardadas. Agrega fotos en Photos / Fotos.')));
      more.hidden = !cursor;
    }
    async function load() {
      if (busy) return; lock(true); retry.hidden = true; status.textContent = tr('Loading photos…', 'Cargando fotos…');
      try {
        var r = await request('/api/hub/owner/marketing-library?limit=24' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
        if (closed) return;
        var known = new Set(photos.map(function (p) { return p.media_key; }));
        photos = photos.concat(r.photos.filter(function (p) { return !known.has(p.media_key); })); cursor = r.cursor || null; draw(); status.textContent = photos.length + tr(' photos loaded.', ' fotos cargadas.');
      } catch (error) { if (!closed) { status.textContent = error.message; retry.hidden = false; } }
      finally { if (!closed) lock(false); }
    }
    cancel.onclick = function () { finish(null); };
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); finish(null); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) { var r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) finish(null); } });
    search.oninput = draw; more.onclick = load; retry.onclick = load;
    dialog.showModal(); search.focus(); load();
    return promise;
  }
  window.MarketingPhotoPicker = { open: open };
})();
