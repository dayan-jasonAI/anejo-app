// Añejo — lightweight cookie consent + gated GA4 loader.
// Analytics (GA4) only loads AFTER the visitor accepts. To enable it site-wide, paste your GA4
// Measurement ID into GA4_ID below (one place, applies to every page that includes this script).
// A per-page <meta name="ga4-id" content="G-XXXX"> still works and overrides GA4_ID if present.
(function () {
  var KEY = 'anejo:cookie';
  var GA4_ID = ''; // ← paste your GA4 Measurement ID here, e.g. 'G-AB12CD34EF' (leave '' to keep analytics off)

  function loadGA() {
    var meta = document.querySelector('meta[name="ga4-id"]');
    var metaId = meta && meta.content && meta.content.indexOf('G-') === 0 ? meta.content : null;
    var id = metaId || (GA4_ID.indexOf('G-') === 0 ? GA4_ID : null);
    if (!id || window.__anejoGA) return;
    window.__anejoGA = true;
    var s = document.createElement('script');
    s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id, { anonymize_ip: true });
  }

  function hide() { var b = document.getElementById('anejo-cookie'); if (b) b.remove(); }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} hide(); if (v === 'accepted') loadGA(); }

  function banner() {
    if (document.getElementById('anejo-cookie')) return;
    var d = document.createElement('div');
    d.id = 'anejo-cookie';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-label', 'Cookie consent');
    d.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:99998;max-width:560px;margin:0 auto;background:#0D0D0D;color:#F5F2EC;border:1px solid rgba(198,168,91,.4);border-radius:12px;padding:16px 18px;font:14px/1.5 \'Josefin Sans\',-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.4)';
    d.innerHTML =
      '<div style="margin-bottom:10px">We use essential cookies to keep you signed in, and — with your OK — analytics to improve the site. See our <a href="/legal/privacy" style="color:#C6A85B">Privacy Policy</a>.</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
      '<button id="ck-d" style="background:transparent;border:1px solid rgba(245,242,236,.3);color:#F5F2EC;border-radius:6px;padding:8px 14px;cursor:pointer;font:inherit">Decline</button>' +
      '<button id="ck-a" style="background:#C6A85B;border:none;color:#0D0D0D;border-radius:6px;padding:8px 16px;cursor:pointer;font:600 14px \'Josefin Sans\',sans-serif">Accept</button></div>';
    document.body.appendChild(d);
    document.getElementById('ck-a').onclick = function () { set('accepted'); };
    document.getElementById('ck-d').onclick = function () { set('declined'); };
  }

  var choice;
  try { choice = localStorage.getItem(KEY); } catch (e) {}
  if (choice === 'accepted') { loadGA(); }
  else if (choice !== 'declined') {
    if (document.body) banner();
    else document.addEventListener('DOMContentLoaded', banner);
  }
})();
