/* Añejo homepage — the moving parts of the 2026-09-15 premium pass. Loaded deferred on index.html only; it
   replaces home-background.js and cajita-hero.js.

   RULES IT KEEPS
   · Nothing is hidden at rest unless this script is running to reveal it: html.js-reveal is only added here,
     and only when IntersectionObserver works and the visitor has not asked for reduced motion.
   · prefers-reduced-motion stops both slideshows and every entrance animation.
   · Auto-advancing content can be paused (WCAG 2.2.2), and never advances while the tab is hidden or its
     section is off screen.
   · The La Cajita card appears at most once a week, never over an owner announcement or while someone is
     typing, never steals focus, and closes with ×, "Maybe later" or Escape. */
(function () {
  'use strict';
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function t(s) {
    try { return window.AnejoI18n && window.AnejoI18n.text ? window.AnejoI18n.text(s) : s; } catch (e) { return s; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function loaded(img) { return !!(img && img.complete && img.naturalWidth); }

  // ---------- hero ----------
  (function hero() {
    var slides = document.querySelectorAll('.ahero-slide');
    var label = document.querySelector('.ahero-label');
    var btn = document.querySelector('.ahero-pause');
    if (!slides.length) return;
    var i = 0;
    var paused = reduce;
    function setLabel() { if (label) label.textContent = t(slides[i].getAttribute('data-label') || ''); }
    function setBtn() {
      if (!btn) return;
      btn.setAttribute('aria-pressed', String(paused));
      btn.setAttribute('aria-label', t(paused ? 'Play background' : 'Pause background'));
    }
    function go(n) {
      var img = slides[n].querySelector('img');
      if (img && !loaded(img)) { img.loading = 'eager'; return; }   // never fade to a blank frame
      slides[i].classList.remove('is-active');
      i = n;
      slides[i].classList.add('is-active');
      setLabel();
    }
    if (btn) btn.addEventListener('click', function () { paused = !paused; setBtn(); });
    document.addEventListener('anejo:langchange', function () { setLabel(); setBtn(); });
    setLabel();
    setBtn();
    if (slides.length > 1) {
      setInterval(function () { if (!paused && !document.hidden) go((i + 1) % slides.length); }, 6000);
    }
  })();

  // ---------- La Cajita slideshow ----------
  (function cajita() {
    var show = document.querySelector('[data-cajita-show]');
    if (!show) return;
    var imgs = show.querySelectorAll('.cajita-show-frame img');
    var cap = show.querySelector('.cajita-show-cap');
    var chips = show.querySelectorAll('.cajita-themes button');
    if (!imgs.length) return;
    var i = 0;
    var pinned = false;
    var hover = false;
    var visible = !('IntersectionObserver' in window);
    function paint() {
      each(imgs, function (im, k) { im.classList.toggle('is-active', k === i); });
      each(chips, function (c, k) { var on = k === i; c.classList.toggle('is-active', on); c.setAttribute('aria-pressed', String(on)); });
      if (cap) cap.textContent = t(imgs[i].getAttribute('data-theme') || '');
    }
    function go(n) {
      i = (n + imgs.length) % imgs.length;
      if (!loaded(imgs[i])) imgs[i].loading = 'eager';
      paint();
    }
    // A theme the visitor chose stays on screen: tapping Christmas and watching it slide away is a small insult.
    each(chips, function (c) { c.addEventListener('click', function () { pinned = true; go(Number(c.getAttribute('data-go')) || 0); }); });
    show.addEventListener('pointerenter', function () { hover = true; });
    show.addEventListener('pointerleave', function () { hover = false; });
    show.addEventListener('focusin', function () { hover = true; });
    show.addEventListener('focusout', function () { hover = false; });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0.35 }).observe(show);
    }
    document.addEventListener('anejo:langchange', paint);
    paint();
    setInterval(function () {
      if (reduce || pinned || hover || !visible || document.hidden) return;
      var next = imgs[(i + 1) % imgs.length];
      if (!loaded(next)) { next.loading = 'eager'; return; }
      go(i + 1);
    }, 4500);
  })();

  // ---------- entrance reveals ----------
  (function reveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    var els = document.querySelectorAll('.serve-card, .celebrate-card, .story-litany li');
    if (!els.length) return;
    document.documentElement.classList.add('js-reveal');
    var alive = false;
    var io = new IntersectionObserver(function (entries) {
      alive = true;
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target;
        var delay = Math.min(Array.prototype.indexOf.call(el.parentNode.children, el) * 70, 420);
        el.style.transitionDelay = delay + 'ms';
        el.classList.add('is-in');
        io.unobserve(el);
        // The stagger is for the entrance only; left in place it would delay every later hover.
        setTimeout(function () { el.style.transitionDelay = ''; }, delay + 1200);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
    each(els, function (el) { io.observe(el); });
    // Failsafe for an observer that never reports (a screenshot tool, a frozen tab): show everything.
    setTimeout(function () { if (!alive) each(els, function (el) { el.classList.add('is-in'); }); }, 3000);
  })();

  // ---------- La Cajita promo card ----------
  (function promo() {
    var KEY = 'anejo:cajita-promo';
    var WEEK = 7 * 86400000;
    try {
      var last = Number(window.localStorage.getItem(KEY) || 0);
      if (last && Date.now() - last < WEEK) return;
    } catch (e) { return; }   // no storage means no way to cap it, so do not show it at all
    if (!/^\/(index\.html)?$/.test(window.location.pathname)) return;

    // The season picks the Cajita: the card should look like it was made this month, because it was.
    var m = new Date().getMonth();
    var theme = m === 9 ? 'halloween' : m >= 10 ? 'christmas' : m === 1 ? 'valentines' : (m === 2 || m === 3) ? 'easter'
      : (m === 5 || m === 6) ? 'patriotic' : 'anejo-signature';
    var shown = false;
    var ready = false;
    setTimeout(function () { ready = true; }, 6000);

    function blocked() {
      var a = document.activeElement;
      return !!document.getElementById('anejo-announce-modal') || !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    }
    function open() {
      if (shown || !ready || blocked()) return;
      shown = true;
      window.removeEventListener('scroll', onScroll);
      try { window.localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* capped by `shown` for this visit */ }
      var wrap = document.createElement('div');
      wrap.className = 'cajita-promo';
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'false');
      wrap.setAttribute('aria-labelledby', 'cajita-promo-title');
      wrap.setAttribute('translate', 'no');
      wrap.innerHTML = '<div class="cajita-promo-card">' +
        '<button type="button" class="cajita-promo-close" aria-label="' + esc(t('Close')) + '">&times;</button>' +
        '<img class="cajita-promo-img" src="/assets/img/cajita/themes/web/' + theme + '.webp" alt="" width="1200" height="900">' +
        '<div class="cajita-promo-body"><div class="cajita-promo-kicker">' + esc(t('New · La Cajita')) + '</div>' +
        '<div class="cajita-promo-title" id="cajita-promo-title">' + esc(t('A whole celebration, in one box.')) + '</div>' +
        '<p class="cajita-promo-text">' + esc(t('Personal Cuban party boxes, dressed for your holiday or your moment.')) + '</p>' +
        '<div class="cajita-promo-actions"><a class="btn btn-gold" href="/cajita-builder">' + esc(t('Design your Cajita')) + '</a>' +
        '<button type="button" class="cajita-promo-later">' + esc(t('Maybe later')) + '</button></div></div></div>';
      document.body.appendChild(wrap);
      function close() {
        wrap.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
        setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 480);
      }
      function onKey(e) { if (e.key === 'Escape') close(); }
      wrap.querySelector('.cajita-promo-close').addEventListener('click', close);
      wrap.querySelector('.cajita-promo-later').addEventListener('click', close);
      document.addEventListener('keydown', onKey);
      // Revealed on two clocks: requestAnimationFrame alone never fires in a throttled or background tab.
      var done = false;
      function show() { if (!done) { done = true; wrap.classList.add('is-open'); } }
      window.requestAnimationFrame(function () { window.requestAnimationFrame(show); });
      setTimeout(show, 140);
    }
    // Shown once the visitor has scrolled PAST La Cajita without acting on it, or after 25 seconds.
    var section = document.getElementById('cajitas');
    function onScroll() { if (section && section.getBoundingClientRect().bottom < 0) open(); }
    window.addEventListener('scroll', onScroll, { passive: true });
    setTimeout(open, 25000);
  })();
})();
