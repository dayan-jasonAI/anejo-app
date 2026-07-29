/* Añejo — owner-editable announcements: a bar across the top, or a centred pop-up.
   Renders the 'announcement' slot from /api/content on public pages.

   Deliberate choices:
   1. NEVER on /hub — that is the staff app, and a customer announcement above the kitchen board
      would be noise at best and confusing at worst.
   2. Injected at runtime rather than written into 60+ HTML files, so turning it on touches no page
      and cannot disturb the SEO schema or the hreflang pairing those pages carry.
   3. If the fetch fails, NOTHING renders. A copy block must never be able to break a storefront —
      the page simply looks the way it did before the bar existed. */
(function () {
  if (location.pathname.indexOf('/hub') === 0) return;

  var TONE = {
    info:   { bg: '#1A3D2E', fg: '#F5F2EC', link: '#C6A85B' },
    good:   { bg: '#2c6b3f', fg: '#ffffff', link: '#ffe9a8' },
    urgent: { bg: '#8a2b22', fg: '#ffffff', link: '#ffd9a8' }
  };
  var SEEN_KEY = 'anejo:seen-announce';

  /* WHICH LANGUAGE.
     This was the "Spanish never publishes" bug. The crawlable Spanish pages under /es/ load THIS
     script but NOT the i18n engine, so window.AnejoLang was undefined, the old code fell back to
     'en', and a Spanish page got the English announcement — while the API had the Spanish copy all
     along. Ask the page itself, in order of authority: the live toggle if one exists, then the
     document's own lang attribute (<html lang="es">), then the URL. */
  function lang() {
    try {
      if (window.AnejoLang && window.AnejoLang.get) return window.AnejoLang.get();
    } catch (e) { /* fall through */ }
    var declared = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (declared.indexOf('es') === 0) return 'es';
    if (/^\/es(\/|$)/.test(location.pathname)) return 'es';
    return 'en';
  }

  function toneOf(b) { return TONE[b.tone] || TONE.info; }

  // Owner copy is TEXT, never markup — same rule everywhere it is rendered.
  function withText(el, text) {
    String(text == null ? '' : text).split('\n').forEach(function (line, i) {
      if (i) el.appendChild(document.createElement('br'));
      el.appendChild(document.createTextNode(line));
    });
    return el;
  }

  function linkFor(b, colour) {
    if (!b.link || !b.link.url) return null;
    var a = document.createElement('a');
    a.href = b.link.url;
    a.textContent = b.link.label || 'Learn more';
    a.style.cssText = 'color:' + colour + ';font-weight:700;text-decoration:underline';
    return a;
  }

  /* ---------- the bar ----------
     POSITION:FIXED, NOT A CHILD OF THE FLOW.
     The old code did body.insertBefore(bar, body.firstChild), which assumes body lays out its
     children in normal flow. /login sets `body{display:flex;align-items:center}` to centre its
     card — so the bar became a FLEX ITEM sitting beside the card and squashed it sideways. Any
     flex or grid body broke the same way.
     Fixed positioning takes the bar out of flow entirely, so it cannot be laid out by whatever the
     page happens to be doing; the space it covers is given back by padding the body. */
  function paintBar(b) {
    var t = toneOf(b);
    var bar = document.createElement('div');
    bar.id = 'anejo-announce';
    bar.setAttribute('role', 'status');
    // The site already runs a 99999 z-index scale (chat widget, language toggle, cookie banner).
    // 9000 sat UNDER the storefront's own layers, so page content painted straight over the
    // pop-up. These sit above the page but deliberately BELOW the cookie consent banner (99998):
    // a marketing message must never cover a legal consent gate.
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99990;box-sizing:border-box;' +
      'background:' + t.bg + ';color:' + t.fg + ';padding:11px 44px 11px 16px;text-align:center;' +
      'font:500 14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
      'box-shadow:0 1px 10px rgba(0,0,0,.16)';

    var span = withText(document.createElement('span'), b.body);
    bar.appendChild(span);
    var a = linkFor(b, t.link);
    if (a) { bar.appendChild(document.createTextNode(' ')); bar.appendChild(a); }

    // Dismissable: an announcement the reader cannot get out of the way is an annoyance, and on a
    // phone a three-line bar is a large share of the viewport.
    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss announcement');
    x.textContent = '×';
    // Pinned to the TOP corner, not vertically centred: on a phone this message wraps to five
    // lines, and a centred × lands in the middle of the sentence it is meant to dismiss.
    x.style.cssText = 'position:absolute;top:4px;right:6px;' +
      'background:none;border:0;color:' + t.fg + ';font-size:20px;line-height:1;opacity:.72;' +
      'cursor:pointer;padding:6px 9px';
    x.addEventListener('click', function () { remember(b); closeBar(bar); });
    bar.appendChild(x);

    document.body.appendChild(bar);
    reserveSpace(bar);
  }

  // Give back exactly the height the fixed bar covers. box-sizing is forced to border-box so a
  // page using min-height:100dvh (like /login) does not grow past the viewport and gain a
  // scrollbar; the centred card simply centres in what is left.
  var basePad = null;
  function reserveSpace(bar) {
    var cs = window.getComputedStyle(document.body);
    if (basePad === null) basePad = parseFloat(cs.paddingTop) || 0;
    document.body.style.boxSizing = 'border-box';
    document.body.style.paddingTop = (basePad + bar.offsetHeight) + 'px';
  }
  function releaseSpace() {
    if (basePad === null) return;
    document.body.style.paddingTop = basePad + 'px';
  }
  function closeBar(bar) {
    bar.style.transition = 'transform .18s ease, opacity .18s ease';
    bar.style.transform = 'translateY(-100%)';
    bar.style.opacity = '0';
    releaseSpace();
    setTimeout(function () { if (bar.parentNode) bar.parentNode.removeChild(bar); }, 200);
  }

  /* ---------- the pop-up ----------
     For a message that must actually be READ once — a closure, a policy change — rather than a
     standing line. Shown once per message per browser: nagging on every page load is how people
     learn to dismiss without reading. */
  function paintModal(b) {
    var t = toneOf(b);
    var wrap = document.createElement('div');
    wrap.id = 'anejo-announce-modal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99995;display:flex;align-items:center;' +
      'justify-content:center;padding:22px;background:rgba(18,26,22,.55);opacity:0;' +
      'transition:opacity .2s ease;font:400 15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

    var card = document.createElement('div');
    card.style.cssText = 'background:#F5F2EC;color:#1A3D2E;border-radius:16px;max-width:400px;width:100%;' +
      'padding:26px 22px 20px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.35);' +
      'border-top:5px solid ' + t.bg + ';transform:translateY(10px) scale(.98);transition:transform .2s ease';

    var body = withText(document.createElement('p'), b.body);
    body.style.cssText = 'margin:0 0 18px;font-size:15.5px';
    card.appendChild(body);

    var a = linkFor(b, '#F5F2EC');
    if (a) {
      a.style.cssText = 'display:block;background:' + t.bg + ';color:#F5F2EC;text-decoration:none;' +
        'padding:13px 18px;border-radius:10px;font-weight:700;margin-bottom:8px';
      a.addEventListener('click', function () { remember(b); });
      card.appendChild(a);
    }

    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = a ? 'No thanks' : 'Got it';
    close.style.cssText = 'display:block;width:100%;background:none;border:0;color:#5c6b62;' +
      'font:inherit;font-size:14px;padding:10px;cursor:pointer';
    card.appendChild(close);

    wrap.appendChild(card);
    document.body.appendChild(wrap);

    // THE REVEAL MUST NOT DEPEND ON requestAnimationFrame ALONE.
    // rAF does not fire while a tab is backgrounded or the renderer is throttled, and the pop-up
    // starts at opacity:0 — so on any such load the message simply never appeared. An announcement
    // that silently fails to show is the worst outcome this feature has, worse than no animation.
    // Both timers race; reveal is idempotent, so whichever wins, it ends up visible.
    var revealed = false;
    function reveal() {
      if (revealed) return;
      revealed = true;
      wrap.style.opacity = '1';
      card.style.transform = 'none';
    }
    requestAnimationFrame(reveal);
    setTimeout(reveal, 80);

    function dismiss() {
      remember(b);
      wrap.style.opacity = '0';
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 220);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') dismiss(); }
    close.addEventListener('click', dismiss);
    // Click the backdrop, not the card. Escape works too — a dialog with no way out is a trap.
    wrap.addEventListener('click', function (e) { if (e.target === wrap) dismiss(); });
    document.addEventListener('keydown', onKey);
    try { close.focus(); } catch (e) { /* focus is a nicety */ }
  }

  // Remembered per message id, so EDITING a message shows it again (it is new information) while
  // re-reading the same one does not.
  function seenKeyFor(b) { return b.id || b.body || ''; }
  function remember(b) {
    try { localStorage.setItem(SEEN_KEY, seenKeyFor(b)); } catch (e) { /* private mode */ }
  }
  function alreadySeen(b) {
    try { return localStorage.getItem(SEEN_KEY) === seenKeyFor(b); } catch (e) { return false; }
  }

  function paint(b) {
    if (!b || !b.body) return;
    var old = document.getElementById('anejo-announce');
    if (old && old.parentNode) { old.parentNode.removeChild(old); releaseSpace(); }
    var oldModal = document.getElementById('anejo-announce-modal');
    if (oldModal && oldModal.parentNode) oldModal.parentNode.removeChild(oldModal);

    if (b.placement === 'modal') {
      if (alreadySeen(b)) return;
      paintModal(b);
    } else {
      paintBar(b);
    }

    // Spanish not written yet → hand the English text to the on-demand translator rather than
    // leaving a lone English sentence on an otherwise Spanish page.
    if (b.needsTranslation && window.AnejoI18n && window.AnejoI18n.refresh) {
      try { window.AnejoI18n.refresh(); } catch (e) { /* it still shows */ }
    }
  }

  function load() {
    fetch('/api/content?lang=' + encodeURIComponent(lang()))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.blocks && d.blocks.announcement) paint(d.blocks.announcement); })
      .catch(function () { /* silent: no bar is always better than a broken page */ });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();

  // Re-fetch on language switch so the message follows the toggle like the rest of the page.
  document.addEventListener('anejo:langchange', load);

  // A wrapped bar changes height on rotate/resize; recompute what it reserves.
  window.addEventListener('resize', function () {
    var bar = document.getElementById('anejo-announce');
    if (bar) reserveSpace(bar);
  });
})();
