/* Occasion selection commits its image, caption and active button together. */
(function () {
  'use strict';
  window.initCajitaThemeGallery = function (themes) {
    var stage = document.getElementById('themeStage');
    var image = document.getElementById('themeImage');
    var name = document.getElementById('themeName');
    var description = document.getElementById('themeDescription');
    var toggle = document.getElementById('themeToggle');
    var tabs = Array.from(document.querySelectorAll('[data-theme]'));
    var status = document.createElement('p');
    status.setAttribute('role', 'status');
    status.id = 'themeLoadStatus';
    status.style.cssText = 'text-align:center;min-height:28px;margin:12px 0;color:#F5F2EC';
    var retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry image';
    retry.hidden = true;
    retry.style.cssText = 'background:#C6A85B;color:#0D0D0D;border:0;padding:12px 18px;min-height:44px;cursor:pointer';
    stage.after(status, retry);
    var index = 0, requested = 0, revision = 0, timer = null, paused = true, busy = false;
    var cache = new Map();
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
      toggle.textContent = 'Play themes';
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
      retry.hidden = true;
      stage.setAttribute('aria-busy', 'true');
      status.textContent = 'Loading ' + themes[selected].name + '…';
      load(selected).then(function () {
        if (token !== revision) return;
        var theme = themes[selected];
        image.src = theme.src;
        image.alt = theme.alt;
        name.textContent = theme.name;
        description.textContent = theme.description;
        index = selected;
        tabs.forEach(function (tab, i) { tab.setAttribute('aria-pressed', String(i === index)); });
        busy = false;
        stage.setAttribute('aria-busy', 'false');
        status.textContent = '';
        // Warm the next slide only, avoiding eight large downloads on mobile.
        load((index + 1) % themes.length).catch(function () {});
        schedule();
      }).catch(function () {
        if (token !== revision) return;
        busy = false;
        stage.setAttribute('aria-busy', 'false');
        pause();
        status.textContent = 'Could not load ' + themes[selected].name + '. Still showing ' + themes[index].name + '. Please retry.';
        retry.hidden = false;
      });
    }
    retry.addEventListener('click', function () { render(requested, true); });
    document.getElementById('themePrev').addEventListener('click', function () { render(requested - 1, true); });
    document.getElementById('themeNext').addEventListener('click', function () { render(requested + 1, true); });
    toggle.addEventListener('click', function () {
      if (!paused) pause();
      else { paused = false; toggle.textContent = 'Pause themes'; toggle.setAttribute('aria-pressed', 'false'); schedule(); }
    });
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () { render(Number(tab.getAttribute('data-theme')), true); });
    });
    document.addEventListener('visibilitychange', schedule);
    if (reduced) pause();
    else { paused = false; toggle.textContent = 'Pause themes'; toggle.setAttribute('aria-pressed', 'false'); }
    // Load/decode the initial image as well, so initial failures have a retry path.
    render(0, false);
  };
})();
