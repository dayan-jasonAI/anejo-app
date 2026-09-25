// Shared session convention used by /order: explicit URL campaign wins; otherwise reuse it.
// Only known scalar attribution fields are retained. Direct visits do not invent a source.
(function () {
  var key = 'anejo:attr';
  function clean(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    var out = {};
    ['src', 'utm_source', 'utm_medium', 'utm_campaign'].forEach(function (field) {
      if (typeof value[field] !== 'string') return;
      var text = value[field].trim().slice(0, field === 'src' ? 64 : 120);
      if (text) out[field] = text;
    });
    return out;
  }
  var params = new URLSearchParams(window.location.search);
  var current = clean({src:params.get('src') || params.get('ref'),utm_source:params.get('utm_source'),utm_medium:params.get('utm_medium'),utm_campaign:params.get('utm_campaign')});
  if (!current.utm_source && params.get('gclid')) { current.utm_source='google'; current.utm_medium=current.utm_medium||'cpc'; }
  if (!current.utm_source && params.get('fbclid')) { current.utm_source='facebook'; current.utm_medium=current.utm_medium||'social'; }
  if (Object.keys(current).length) {
    try { sessionStorage.setItem(key,JSON.stringify(current)); } catch (_) { /* retain in memory */ }
  } else {
    try { current=clean(JSON.parse(sessionStorage.getItem(key)||'null')); } catch (_) { /* unknown stays absent */ }
  }
  window.AnejoAttribution = { read: function () { return Object.keys(current).length ? Object.assign({},current) : null; } };
})();
