/* Añejo — customer-service chat widget ("Aña"). Self-contained, on-brand, bilingual.
   Talks to /api/chat (Claude). Include with <script src="/assets/js/chat.js" defer></script>. */
(function () {
  if (window.__anejoChat) return; window.__anejoChat = true;

  var GOLD = '#C6A85B', GREEN = '#1A3D2E', BLACK = '#0D0D0D', CREAM = '#F5F2EC', LINE = 'rgba(26,61,46,.15)';
  function lang() { try { return (window.AnejoLang && window.AnejoLang.get() === 'es') ? 'es' : 'en'; } catch (e) { return 'en'; } }
  var T = {
    en: { title: 'Ask Añejo', sub: 'Menu · delivery · plans', hi: "Hi! I'm Aña, the Añejo assistant. Ask me about the menu, delivery, meal plans — or anything else. 🌿", ph: 'Type your message…', send: 'Send', open: 'Chat with Añejo', err: 'Something went wrong. Please email dayan@anejocateringco.com.', tip: 'Questions? <strong>Chat with Añejo</strong> 🌿' },
    es: { title: 'Pregúntale a Añejo', sub: 'Menú · entrega · planes', hi: '¡Hola! Soy Aña, la asistente de Añejo. Pregúntame sobre el menú, la entrega, los planes — o lo que necesites. 🌿', ph: 'Escribe tu mensaje…', send: 'Enviar', open: 'Chatea con Añejo', err: 'Algo salió mal. Escríbenos a dayan@anejocateringco.com.', tip: '¿Preguntas? <strong>Escríbenos</strong> 🌿' }
  };
  function t(k) { return (T[lang()] || T.en)[k]; }

  var css = document.createElement('style');
  css.textContent =
    '.anc-btn{position:fixed;right:18px;bottom:18px;z-index:99998;width:58px;height:58px;border-radius:50%;background:' + GOLD + ';color:' + BLACK + ';border:none;cursor:pointer;box-shadow:0 8px 28px rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;transition:transform .15s}' +
    '.anc-btn:hover{transform:scale(1.06)}.anc-btn svg{width:26px;height:26px}' +
    '.anc-panel{position:fixed;right:18px;bottom:86px;z-index:99999;width:370px;max-width:calc(100vw - 28px);height:540px;max-height:calc(100vh - 120px);background:' + CREAM + ';border:1px solid ' + LINE + ';border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.34);display:none;flex-direction:column;overflow:hidden;font-family:"Josefin Sans",-apple-system,sans-serif}' +
    '.anc-panel.open{display:flex}' +
    '.anc-head{background:' + BLACK + ';color:' + CREAM + ';padding:15px 18px;display:flex;align-items:center;justify-content:space-between}' +
    '.anc-head .ti{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;letter-spacing:2px;color:' + GOLD + ';font-size:18px}' +
    '.anc-head .su{font-size:11px;letter-spacing:1px;text-transform:uppercase;color:rgba(245,242,236,.6);margin-top:2px}' +
    '.anc-x{background:none;border:none;color:' + GOLD + ';font-size:22px;cursor:pointer;line-height:1}' +
    '.anc-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}' +
    '.anc-msg{max-width:84%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}' +
    '.anc-bot{background:#fff;border:1px solid ' + LINE + ';color:#1a1a1a;align-self:flex-start;border-bottom-left-radius:4px}' +
    '.anc-bot a{color:' + GREEN + ';font-weight:600}' +
    '.anc-me{background:' + GREEN + ';color:' + CREAM + ';align-self:flex-end;border-bottom-right-radius:4px}' +
    '.anc-typing{align-self:flex-start;color:#6b6b6b;font-size:13px;font-style:italic;padding:2px 4px}' +
    '.anc-in{display:flex;gap:8px;padding:12px;border-top:1px solid ' + LINE + ';background:#fff}' +
    '.anc-in textarea{flex:1;resize:none;border:1px solid ' + LINE + ';border-radius:10px;padding:10px 12px;font:inherit;font-size:14px;background:' + CREAM + ';max-height:90px}' +
    '.anc-in textarea:focus{outline:2px solid ' + GOLD + ';border-color:transparent}' +
    '.anc-go{background:' + GOLD + ';color:' + BLACK + ';border:none;border-radius:10px;padding:0 16px;font:700 12px/1 "Josefin Sans";letter-spacing:1px;text-transform:uppercase;cursor:pointer}' +
    '.anc-go:disabled{opacity:.5;cursor:not-allowed}' +
    '.anc-foot{font-size:10px;color:#9a9a8f;text-align:center;padding:0 0 8px;background:#fff}' +
    '.anc-tip{position:fixed;right:18px;bottom:86px;z-index:99997;max-width:232px;background:' + CREAM + ';color:' + BLACK + ';border:1px solid ' + LINE + ';border-radius:14px;border-bottom-right-radius:4px;box-shadow:0 8px 26px rgba(0,0,0,.22);padding:11px 30px 11px 14px;font:500 13px/1.45 "Josefin Sans",-apple-system,sans-serif;opacity:0;transform:translateY(8px) scale(.96);transform-origin:bottom right;transition:opacity .25s,transform .25s;pointer-events:none;cursor:pointer}' +
    '.anc-tip.show{opacity:1;transform:translateY(0) scale(1);pointer-events:auto}' +
    '.anc-tip strong{color:' + GREEN + ';font-weight:600}' +
    '.anc-tip-x{position:absolute;top:5px;right:7px;border:none;background:none;color:#9a9a8f;font-size:16px;line-height:1;cursor:pointer;padding:2px}' +
    '.anc-tip-x:hover{color:' + BLACK + '}' +
    '@media (max-width:480px){.anc-panel{right:8px;left:8px;width:auto;bottom:80px}.anc-tip{right:10px;max-width:200px}}';
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.className = 'anc-btn'; btn.setAttribute('aria-label', t('open')); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.6A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/></svg>';
  document.body.appendChild(btn);

  var panel = document.createElement('div');
  panel.className = 'anc-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Añejo chat');
  panel.innerHTML =
    '<div class="anc-head"><div><div class="ti">AÑEJO</div><div class="su" id="ancSub"></div></div><button class="anc-x" id="ancX" aria-label="Close">×</button></div>' +
    '<div class="anc-log" id="ancLog"></div>' +
    '<div class="anc-in"><textarea id="ancT" rows="1" aria-label="Message"></textarea><button class="anc-go" id="ancGo">' + t('send') + '</button></div>' +
    '<div class="anc-foot">AI assistant · may be imperfect · dayan@anejocateringco.com</div>';
  document.body.appendChild(panel);

  var log = panel.querySelector('#ancLog'), ta = panel.querySelector('#ancT'), go = panel.querySelector('#ancGo');
  panel.querySelector('#ancSub').textContent = t('sub');
  ta.placeholder = t('ph');
  var msgs = [], greeted = false, busy = false;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]; }); }
  function linkify(s) {
    s = esc(s);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');          // **bold** → <strong>
    s = s.replace(/(^|\n)\s*[-*•]\s+/g, '$1• ');                      // markdown bullets → •
    s = s.replace(/(^|\s)(\/(order|subscribe|calculator|portal|legal\/[a-z]+)(#[\w-]+)?)/g, '$1<a href="$2">$2</a>');
    s = s.replace(/(#tasting|#wholesale|#menu|#fit|#faq)/g, '<a href="/$1">$1</a>');
    s = s.replace(/([\w.+-]+@anejocateringco\.com)/g, '<a href="mailto:$1">$1</a>');
    s = s.replace(/\b(561-567-1047)\b/g, '<a href="tel:5615671047">$1</a>');
    return s;
  }
  function add(role, text) {
    var el = document.createElement('div');
    el.className = 'anc-msg ' + (role === 'user' ? 'anc-me' : 'anc-bot');
    el.innerHTML = role === 'user' ? esc(text) : linkify(text);
    log.appendChild(el); log.scrollTop = log.scrollHeight;
  }
  function typing(on) {
    var ex = log.querySelector('.anc-typing'); if (ex) ex.remove();
    if (on) { var d = document.createElement('div'); d.className = 'anc-typing'; d.textContent = 'Aña…'; log.appendChild(d); log.scrollTop = log.scrollHeight; }
  }

  async function sendMsg() {
    var text = ta.value.trim(); if (!text || busy) return;
    busy = true; go.disabled = true; ta.value = ''; ta.style.height = 'auto';
    add('user', text); msgs.push({ role: 'user', content: text }); typing(true);
    try {
      var r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: msgs }) });
      var d = await r.json(); typing(false);
      if (!r.ok || !d.reply) throw new Error(d.error || t('err'));
      add('bot', d.reply); msgs.push({ role: 'assistant', content: d.reply });
    } catch (e) { typing(false); add('bot', (e && e.message) || t('err')); }
    finally { busy = false; go.disabled = false; ta.focus(); }
  }

  function open() {
    hideTip(true);
    panel.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    if (!greeted) { greeted = true; panel.querySelector('#ancSub').textContent = t('sub'); add('bot', t('hi')); }
    setTimeout(function () { ta.focus(); }, 50);
  }
  function close() { panel.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }

  btn.addEventListener('click', function () { panel.classList.contains('open') ? close() : open(); });
  panel.querySelector('#ancX').addEventListener('click', close);
  go.addEventListener('click', sendMsg);
  ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 90) + 'px'; });
  ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  // Gentle nudge bubble over the chat icon, prompting first-time visitors to ask a question.
  var tip = document.createElement('div');
  tip.className = 'anc-tip'; tip.setAttribute('role', 'button'); tip.setAttribute('tabindex', '0'); tip.setAttribute('aria-label', t('open'));
  tip.innerHTML = '<button class="anc-tip-x" aria-label="Dismiss">×</button><span class="anc-tip-t"></span>';
  document.body.appendChild(tip);
  var tipT = tip.querySelector('.anc-tip-t');
  function setTipText() { tipT.innerHTML = t('tip'); }
  setTipText();

  function dismissed() { try { return sessionStorage.getItem('anejo:chatTip') === 'done'; } catch (e) { return false; } }
  function hideTip(remember) { tip.classList.remove('show'); if (remember) { try { sessionStorage.setItem('anejo:chatTip', 'done'); } catch (e) {} } }
  function showTip() {
    if (dismissed() || panel.classList.contains('open')) return;
    setTipText(); tip.classList.add('show');
    setTimeout(function () { tip.classList.remove('show'); }, 12000); // fade out if ignored (no remember → may reappear on next page)
  }

  tip.querySelector('.anc-tip-x').addEventListener('click', function (e) { e.stopPropagation(); hideTip(true); });
  tip.addEventListener('click', function () { open(); });
  tip.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  document.addEventListener('anejo:langchange', setTipText);
  setTimeout(showTip, 2600);
})();
