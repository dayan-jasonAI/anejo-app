/* Añejo — owner-editable announcement bar.
   Renders the 'announcement' slot from /api/content at the top of public pages.

   Three deliberate choices:
   1. NEVER on /hub — that is the staff app, and an announcement aimed at customers appearing above
      the kitchen board would be noise at best and confusing at worst.
   2. Injected at runtime rather than written into 53 HTML files, so turning it on touches no page
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

  function lang() {
    try { return (window.AnejoLang && window.AnejoLang.get()) || 'en'; } catch (e) { return 'en'; }
  }

  function paint(b) {
    if (!b || !b.body) return;
    var old = document.getElementById('anejo-announce');
    if (old) old.parentNode.removeChild(old);

    var t = TONE[b.tone] || TONE.info;
    var bar = document.createElement('div');
    bar.id = 'anejo-announce';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'background:' + t.bg + ';color:' + t.fg + ';padding:10px 16px;text-align:center;' +
      'font:500 14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;position:relative;z-index:60';

    var span = document.createElement('span');
    span.textContent = b.body;                    // textContent, never innerHTML — owner copy is
    bar.appendChild(span);                        // still untrusted input to this page.

    if (b.link && b.link.url) {
      bar.appendChild(document.createTextNode(' '));
      var a = document.createElement('a');
      a.href = b.link.url;
      a.textContent = b.link.label || 'Learn more';
      a.style.cssText = 'color:' + t.link + ';font-weight:700;text-decoration:underline';
      bar.appendChild(a);
    }

    document.body.insertBefore(bar, document.body.firstChild);

    // Spanish not written yet → hand the English text to the on-demand translator rather than
    // leaving a lone English sentence on an otherwise Spanish page.
    if (b.needsTranslation && window.AnejoI18n && window.AnejoI18n.refresh) {
      try { window.AnejoI18n.refresh(); } catch (e) { /* the bar still shows */ }
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

  // Re-fetch on language switch so the bar follows the toggle like the rest of the page.
  document.addEventListener('anejo:langchange', load);
})();
