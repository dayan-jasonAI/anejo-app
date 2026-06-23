/* ============================================================
   Añejo — "Living Gold" emblem  ·  logo-life.js
   ------------------------------------------------------------
   3D pointer-parallax tilt for the hero logo. Pure progressive
   enhancement: skipped entirely under reduced motion, and any
   failure leaves a perfectly good static (CSS-animated) logo.
   ============================================================ */
(function () {
  'use strict';
  var reduce = false;
  try { reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  if (reduce) return;

  var life = document.querySelector('.logo-life');
  var tilt = life && life.querySelector('.logo-tilt');
  if (!tilt) return;
  var hero = life.closest('.hero') || document.querySelector('.hero');
  if (!hero) return;

  var rAF = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
  var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

  function render() {
    raf = null;
    cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12;
    tilt.style.transform = 'rotateY(' + cx.toFixed(2) + 'deg) rotateX(' + cy.toFixed(2) + 'deg)';
    if (Math.abs(tx - cx) > 0.04 || Math.abs(ty - cy) > 0.04) raf = rAF(render);
  }
  function kick() { if (!raf) raf = rAF(render); }

  hero.addEventListener('pointermove', function (e) {
    var r = hero.getBoundingClientRect();
    var nx = (e.clientX - r.left) / r.width - 0.5;
    var ny = (e.clientY - r.top) / r.height - 0.5;
    tx = Math.max(-6, Math.min(6, nx * 12));
    ty = Math.max(-6, Math.min(6, -ny * 12));
    kick();
  }, { passive: true });
  hero.addEventListener('pointerleave', function () { tx = 0; ty = 0; kick(); }, { passive: true });
})();
