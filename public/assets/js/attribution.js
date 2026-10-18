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
    if(typeof value.referrer==='string')try{var ref=new URL(value.referrer);if(/^https?:$/.test(ref.protocol)&&ref.origin!==(window.location.origin||'https://anejocateringco.com'))out.referrer=ref.origin;}catch(_){}
    if(typeof value.entry_path==='string'&&/^\/(?:catering(?:\/[a-z-]+)?|menu|order|cajita|go)?(?:\.html)?$/.test(value.entry_path))out.entry_path=value.entry_path;
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
  // Preserve first external origin and public landing route. Never retain query strings,
  // contact details or private quote/account paths. Submit this context only with the request.
  if(!current.referrer&&typeof document!=='undefined')try{var external=new URL(document.referrer);if(/^https?:$/.test(external.protocol)&&external.origin!==(window.location.origin||'https://anejocateringco.com'))current.referrer=external.origin;}catch(_){}
  if(!current.entry_path&&window.location.pathname&&/^\/(?:catering(?:\/[a-z-]+)?|menu|order|cajita|go)?(?:\.html)?$/.test(window.location.pathname))current.entry_path=window.location.pathname;
  if(Object.keys(current).length)try{sessionStorage.setItem(key,JSON.stringify(current));}catch(_){}
  window.AnejoAttribution = { read: function () { return Object.keys(current).length ? Object.assign({},current) : null; } };
})();
