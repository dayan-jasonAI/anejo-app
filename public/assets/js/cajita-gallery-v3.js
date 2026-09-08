/* Occasion selection commits its image, caption and active button together. */
(function () {
  'use strict';
  function t(value) { return window.AnejoI18n && window.AnejoI18n.text ? window.AnejoI18n.text(value) : value; }
  function spanish() { return window.AnejoLang && window.AnejoLang.get() === 'es'; }
  window.initCajitaThemeGallery = function (themes) {
    var stage = document.getElementById('themeStage');
    var image = document.getElementById('themeImage');
    var name = document.getElementById('themeName');
    var description = document.getElementById('themeDescription');
    var toggle = document.getElementById('themeToggle');
    [image, name, description, toggle].forEach(function (node) { node.setAttribute('translate', 'no'); });
    var tabs = Array.from(document.querySelectorAll('[data-theme]'));
    var status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.id = 'themeLoadStatus';
    status.setAttribute('translate', 'no');
    status.style.cssText = 'text-align:center;min-height:28px;margin:12px 0;color:#F5F2EC';
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.setAttribute('translate', 'no');
    retry.textContent = t('Retry image');
    retry.hidden = true;
    retry.style.cssText = 'background:#C6A85B;color:#0D0D0D;border:0;padding:12px 18px;min-height:44px;cursor:pointer';
    stage.after(status, retry);
    var index = 0, requested = 0, revision = 0, timer = null, paused = true, busy = false;
    var cache = new Map();
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var failed = false, hasCommitted = false;
    function labels() {
      toggle.textContent = t(paused ? 'Play themes' : 'Pause themes');
      retry.textContent = t('Retry image');
      if (hasCommitted) {
        image.alt = t(themes[index].alt);
        name.textContent = t(themes[index].name);
        description.textContent = t(themes[index].description);
      }
      status.textContent = busy ? (spanish() ? 'Cargando ' : 'Loading ') + t(themes[requested].name) + '…' : failed ? (spanish() ? 'No se pudo cargar ' + t(themes[requested].name) + '. Se sigue mostrando ' + t(themes[index].name) + '. Vuelve a intentarlo.' : 'Could not load ' + themes[requested].name + '. Still showing ' + themes[index].name + '. Please retry.') : '';
    }
    document.addEventListener('anejo:langchange', labels);

    function load(i) {
      if (cache.has(i)) return cache.get(i);
      var promise = new Promise(function (resolve, reject) {
        var candidate = new Image();
        var timeout = setTimeout(function () { fail(); }, 15000);
        function fail() {
          clearTimeout(timeout);
          candidate.onload = candidate.onerror = null;
          reject(new Error('Image unavailable'));
        }
        candidate.onerror = fail;
        candidate.onload = function () {
          var decoded = candidate.decode ? candidate.decode() : Promise.resolve();
          decoded.then(function () {
            clearTimeout(timeout);
            candidate.onload = candidate.onerror = null;
            resolve(candidate);
          }, fail);
        };
        candidate.src = themes[i].src;
      });
      cache.set(i, promise);
      promise.catch(function () { if (cache.get(i) === promise) cache.delete(i); });
      return promise;
    }
    function pause() {
      paused = true;
      clearTimeout(timer);
      toggle.textContent = t('Play themes');
      toggle.setAttribute('aria-pressed', 'true');
    }
    function schedule() {
      clearTimeout(timer);
      if (!paused && !busy && !document.hidden) timer = setTimeout(function () { render(index + 1, false); }, 5000);
    }
    function render(next, userAction) {
      requested = (next + themes.length) % themes.length;
      var selected = requested, token = ++revision;
      if (userAction) pause();
      clearTimeout(timer);
      busy = true;
      failed = false;
      retry.hidden = true;
      stage.setAttribute('aria-busy', 'true');
      labels();
      load(selected).then(function () {
        if (token !== revision) return;
        var theme = themes[selected];
        image.src = theme.src;
        index = selected;
        hasCommitted = true;
        tabs.forEach(function (tab, i) { tab.setAttribute('aria-pressed', String(i === index)); });
        busy = false;
        labels();
        stage.setAttribute('aria-busy', 'false');
        // Warm the next slide only, avoiding eight large downloads on mobile.
        load((index + 1) % themes.length).catch(function () {});
        schedule();
      }).catch(function () {
        if (token !== revision) return;
        busy = false;
        failed = true;
        stage.setAttribute('aria-busy', 'false');
        pause();
        labels();
        retry.hidden = false;
      });
    }
    retry.addEventListener('click', function () { render(requested, true); });
    document.getElementById('themePrev').addEventListener('click', function () { render(requested - 1, true); });
    document.getElementById('themeNext').addEventListener('click', function () { render(requested + 1, true); });
    toggle.addEventListener('click', function () {
      if (!paused) pause();
      else { paused = false; toggle.textContent = t('Pause themes'); toggle.setAttribute('aria-pressed', 'false'); schedule(); }
    });
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { render(Number(tab.getAttribute('data-theme')), true); });
    });
    document.addEventListener('visibilitychange', schedule);
    if (reduced) pause();
    else { paused = false; toggle.textContent = t('Pause themes'); toggle.setAttribute('aria-pressed', 'false'); }
    // Load/decode the initial image as well, so initial failures have a retry path.
    render(0, false);
  };
})();
