/* ============================================================
   Añejo — "The Fuel Core"  ·  fuelcore.js
   ------------------------------------------------------------
   Drives the interactive macro orb. Dependency-free.
   - Sliders -> kcal, % split, conic ring, ignite/reward loop.
   - Always interactive (works under reduced motion too).
   - Ambient extras (parallax tilt + particle field) run only
     when motion is allowed AND the orb is on-screen.
   - Fully guarded: any failure leaves a static, usable orb.
   ============================================================ */
(function () {
  'use strict';

  var el = document.querySelector('.fuelcore');
  if (!el) return;

  var reduce = false;
  try { reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var rAF = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };

  var ring   = el.querySelector('.fc-ring');
  var core   = el.querySelector('.fc-core');
  var kcalEl = el.querySelector('.fc-kcal');
  var inputs = { p: el.querySelector('[data-macro="p"]'), c: el.querySelector('[data-macro="c"]'), f: el.querySelector('[data-macro="f"]') };
  var vals   = { p: el.querySelector('[data-val="p"]'), c: el.querySelector('[data-val="c"]'), f: el.querySelector('[data-val="f"]') };
  var words  = el.querySelectorAll('.fc-word');
  var badge  = el.querySelector('.fc-badge');

  var TARGET = { p: 40, c: 30, f: 30 };   // brand Golden Rule (% of kcal)
  var TOL = 3;                            // ± percentage points to "ignite"
  var shownKcal = null;                   // for smooth count tween

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  function read() {
    return {
      p: parseInt(inputs.p.value, 10) || 0,
      c: parseInt(inputs.c.value, 10) || 0,
      f: parseInt(inputs.f.value, 10) || 0
    };
  }

  function tweenKcal(to) {
    if (shownKcal === null || reduce) { shownKcal = to; kcalEl.textContent = to.toLocaleString('en-US'); return; }
    var from = shownKcal, t0 = null, dur = 420;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - k, 3);
      var v = Math.round(from + (to - from) * eased);
      kcalEl.textContent = v.toLocaleString('en-US');
      if (k < 1) rAF(step); else shownKcal = to;
    }
    rAF(step);
  }

  var state = { ignited: false, score: 0 };

  function update() {
    var g = read();
    var kP = g.p * 4, kC = g.c * 4, kF = g.f * 9;
    var total = kP + kC + kF || 1;
    var pp = kP / total * 100, pc = kC / total * 100, pf = kF / total * 100;

    // grams readout
    vals.p.textContent = g.p + 'g';
    vals.c.textContent = g.c + 'g';
    vals.f.textContent = g.f + 'g';

    // conic ring stops (animated via CSS)
    ring.style.setProperty('--fcA1', (pp * 3.6).toFixed(2) + 'deg');
    ring.style.setProperty('--fcA2', ((pp + pc) * 3.6).toFixed(2) + 'deg');

    // kcal
    tweenKcal(Math.round(total));

    // balance score + ignite
    var dist = Math.abs(pp - TARGET.p) + Math.abs(pc - TARGET.c) + Math.abs(pf - TARGET.f);
    var score = clamp(1 - dist / 40, 0, 1);
    var ignited = Math.abs(pp - TARGET.p) <= TOL && Math.abs(pc - TARGET.c) <= TOL && Math.abs(pf - TARGET.f) <= TOL;
    state.score = score; state.ignited = ignited;

    // glow scales with closeness
    core.style.setProperty('--fc-glow', Math.round(22 + score * 40) + 'px');
    core.classList.toggle('ignited', ignited);

    // brand words light progressively, then fully on ignite
    if (words[0]) words[0].classList.toggle('lit', score >= 0.45);
    if (words[1]) words[1].classList.toggle('lit', score >= 0.72);
    if (words[2]) words[2].classList.toggle('lit', ignited);

    // status badge
    if (badge) {
      badge.classList.toggle('on', ignited);
      badge.textContent = ignited ? 'Optimally Fueled · 40 / 30 / 30'
                                  : Math.round(pp) + ' / ' + Math.round(pc) + ' / ' + Math.round(pf) + ' — find 40/30/30';
    }
  }

  // Defeat browser form-state restoration so every load opens on the
  // canonical, balanced 40/30/30 state (the intended first impression).
  ['p', 'c', 'f'].forEach(function (k) {
    if (inputs[k]) { var d = inputs[k].getAttribute('value'); if (d != null) inputs[k].value = d; }
  });

  // ---- Wire sliders ----
  ['p', 'c', 'f'].forEach(function (k) {
    if (inputs[k]) inputs[k].addEventListener('input', update, { passive: true });
  });
  update();

  /* =======================================================
     Ambient extras — skipped entirely under reduced motion.
     ======================================================= */
  if (reduce) return;

  var onScreen = true;
  try {
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { onScreen = en.isIntersecting; if (onScreen) loop(); });
      }, { threshold: 0.05 }).observe(el);
    }
  } catch (e) {}

  // ---- Parallax tilt ----
  (function tilt() {
    var stage = el.querySelector('.fc-stage');
    var d3 = el.querySelector('.fc-3d');
    if (!stage || !d3) return;
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    function render() {
      raf = null;
      cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12;
      d3.style.transform = 'rotateY(' + cx.toFixed(2) + 'deg) rotateX(' + cy.toFixed(2) + 'deg)';
      if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) raf = rAF(render);
    }
    function kick() { if (!raf) raf = rAF(render); }
    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      var nx = (e.clientX - r.left) / r.width - 0.5;
      var ny = (e.clientY - r.top) / r.height - 0.5;
      tx = clamp(nx * 18, -9, 9); ty = clamp(-ny * 18, -9, 9); kick();
    }, { passive: true });
    stage.addEventListener('pointerleave', function () { tx = 0; ty = 0; kick(); }, { passive: true });
  })();

  // ---- Particle "clean fuel" field ----
  var canvas = el.querySelector('.fc-particles');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var parts = [], W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), running = false;
  var COLORS = ['rgba(214,192,116,', 'rgba(245,242,236,', 'rgba(79,164,106,'];

  function size() {
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function spawn() {
    var ang = Math.random() * Math.PI * 2;
    var rad = (Math.min(W, H) * 0.5) * (0.9 + Math.random() * 0.5);
    return {
      a: ang, r: rad,
      sp: 0.15 + Math.random() * 0.4,
      sz: 0.6 + Math.random() * 1.7,
      col: COLORS[(Math.random() * COLORS.length) | 0],
      al: 0.15 + Math.random() * 0.5
    };
  }
  function initParts() { parts = []; var n = Math.round(clamp(W / 9, 24, 54)); for (var i = 0; i < n; i++) parts.push(spawn()); }
  function frame() {
    if (!running) return;
    if (!onScreen) { running = false; return; }
    ctx.clearRect(0, 0, W, H);
    var cx = W / 2, cy = H / 2;
    var boost = 1 + state.score * 1.1;            // flows faster as you balance
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.r -= p.sp * boost;
      if (p.r < Math.min(W, H) * 0.26) { parts[i] = spawn(); continue; }
      var x = cx + Math.cos(p.a) * p.r, y = cy + Math.sin(p.a) * p.r;
      var fade = clamp((p.r / (Math.min(W, H) * 0.5)), 0, 1);
      ctx.beginPath();
      ctx.fillStyle = p.col + (p.al * (1 - fade) * (0.6 + state.score * 0.6)).toFixed(3) + ')';
      ctx.arc(x, y, p.sz, 0, Math.PI * 2); ctx.fill();
    }
    rAF(frame);
  }
  function loop() { if (ctx && !running && onScreen) { running = true; rAF(frame); } }

  if (ctx) {
    try {
      size(); initParts(); loop();
      var rt = null;
      window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { size(); initParts(); }, 150); }, { passive: true });
    } catch (e) {}
  }
})();
