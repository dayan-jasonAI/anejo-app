/* ============================================================
   Añejo — Motion & Interaction Layer  ·  motion.js
   ------------------------------------------------------------
   Dependency-free progressive enhancement. Pairs with
   motion.css. Reveals content on scroll, animates the hero in,
   drives the scroll-progress bar + nav condense, adds a tasteful
   count-up on the sample macro card, and is fully fail-safe:
   if anything throws, or motion is disabled, all content stays
   visible. Nothing here is required for the page to function.
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = false;
  try { reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var rAF = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };

  /* ---- Nav condense: safe + subtle, runs regardless of motion pref ---- */
  function initNav() {
    var nav = document.querySelector('nav');
    if (!nav) return;
    var on = false;
    function upd() {
      var s = (window.pageYOffset || root.scrollTop || 0) > 12;
      if (s !== on) { on = s; nav.classList.toggle('aj-scrolled', s); }
    }
    window.addEventListener('scroll', upd, { passive: true });
    upd();
  }
  try { initNav(); } catch (e) {}

  /* If motion is disabled (reduced-motion, no class, or the head
     failsafe already fired), ensure everything is visible and stop. */
  if (reduce || !root.classList.contains('anejo-motion')) {
    root.classList.remove('anejo-motion');
    return;
  }

  /* We are committed to motion — cancel the head failsafe timer. */
  try { if (window.__ajFailsafe) { clearTimeout(window.__ajFailsafe); window.__ajFailsafe = null; } } catch (e) {}

  /* ---- Scroll progress bar ---- */
  function initProgress() {
    var bar = document.createElement('div');
    bar.className = 'aj-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    var ticking = false;
    function upd() {
      ticking = false;
      var max = (root.scrollHeight - root.clientHeight) || 1;
      var p = Math.min(1, Math.max(0, (window.pageYOffset || root.scrollTop || 0) / max));
      bar.style.width = (p * 100).toFixed(2) + '%';
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; rAF(upd); } }, { passive: true });
    window.addEventListener('resize', upd, { passive: true });
    upd();
  }

  /* ---- Reveal helpers ---- */
  function reveal(el) {
    if (el.classList.contains('aj-in')) return;
    el.classList.add('aj-in');
    var done = false;
    function finish() {
      if (done) return; done = true;
      el.removeEventListener('animationend', finish);
      el.classList.add('aj-done');
    }
    el.addEventListener('animationend', finish);
    var delay = parseInt(el.style.getPropertyValue('--aj-d') || 0, 10) || 0;
    setTimeout(finish, 1200 + delay); /* fallback if animationend never fires */
  }

  function initReveals() {
    /* Stagger groups: children cascade as the group scrolls into view */
    var groups = [
      ['.menu-grid', '.bowl-card'],
      ['.sauce-grid', '.sauce-card'],
      ['.subbrands', '.subbrand'],
      ['.fit-grid', '.fit-card'],
      ['.services-grid', '.service'],
      ['.testi-grid', '.testi-card'],
      ['.faq-list', '.faq-item'],
      ['.footer-grid', ':scope > *'],
      ['.cta-band .section-inner', ':scope > *']
    ];
    var targets = [];
    var seen = [];
    function add(el) { if (seen.indexOf(el) === -1) { seen.push(el); targets.push(el); } }

    groups.forEach(function (g) {
      document.querySelectorAll(g[0]).forEach(function (parent) {
        var kids;
        try { kids = parent.querySelectorAll(g[1]); }
        catch (e) { kids = []; } /* :scope fallback */
        if (!kids.length && g[1] === ':scope > *') kids = parent.children;
        Array.prototype.forEach.call(kids, function (k, i) {
          k.style.setProperty('--aj-d', Math.min(i * 70, 480) + 'ms');
          add(k);
        });
      });
    });

    document.querySelectorAll(
      '.section-head, .story-body, .macro-pitch, .macro-preview, .wholesale-text, .wholesale-card'
    ).forEach(add);

    if (!('IntersectionObserver' in window)) { targets.forEach(reveal); return; }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { reveal(en.target); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    targets.forEach(function (el) { io.observe(el); });
  }

  /* ---- Hero entrance: above the fold, so animate on load ---- */
  function initHero() {
    document.querySelectorAll('.hero-content > *').forEach(function (el, i) {
      el.style.setProperty('--aj-d', (120 + i * 110) + 'ms');
      reveal(el);
    });
  }

  /* ---- Count-up on the sample macro number ("2,100 kcal/day") ---- */
  function initCountUp() {
    var el = document.querySelector('.mp-cal');
    if (!el) return;
    var node = null, i;
    for (i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3 && /\d/.test(el.childNodes[i].nodeValue)) { node = el.childNodes[i]; break; }
    }
    if (!node) return;
    var target = parseInt(node.nodeValue.replace(/[^\d]/g, ''), 10);
    if (!target) return;
    var started = false;
    function run() {
      if (started) return; started = true;
      var dur = 1400, t0 = null;
      node.nodeValue = '0 ';
      function step(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        node.nodeValue = Math.round(target * eased).toLocaleString('en-US') + ' ';
        if (p < 1) rAF(step);
      }
      rAF(step);
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) { if (e.isIntersecting) { run(); io.disconnect(); } });
      }, { threshold: 0.5 });
      io.observe(el);
    } else { run(); }
  }

  function boot() {
    try { initProgress(); } catch (e) {}
    try { initHero(); } catch (e) {}
    try { initReveals(); } catch (e) {}
    try { initCountUp(); } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
