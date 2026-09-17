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
