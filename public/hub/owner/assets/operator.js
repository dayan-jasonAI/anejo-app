/* operator.js — the Añejo Voice Operator widget.
 *
 * Part 3 of the DMD Venture standard. Ported from the proven DRH CORE HUB widget so the
 * interaction is the SAME across businesses: 1 tap = talk, 2 taps = type. Dayan should not
 * have to learn a different gesture per business.
 *
 * Grounding is server-side (/api/hub/owner/operator). This file never invents an answer; if
 * the operator refuses — no key, no database — that refusal is shown verbatim rather than
 * smoothed into something reassuring.
 *
 * Voice-out: ElevenLabs when a key is bound, browser speech otherwise. A robotic voice that
 * tells the truth beats no answer.
 */
(function () {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recog = null, busy = false, currentAudio = null, tapTimer = null;

  var css = document.createElement('style');
  css.textContent = [
    '.aop-fab{position:fixed;right:22px;bottom:22px;width:62px;height:62px;border-radius:50%;',
    'border:1px solid rgba(198,167,94,.55);background:radial-gradient(circle at 32% 28%,#2c2c26,#14140f);',
    'color:#e8dfc8;display:grid;place-items:center;cursor:pointer;z-index:9998;',
    'box-shadow:0 10px 30px rgba(0,0,0,.45);transition:transform .18s ease,box-shadow .18s ease}',
    '.aop-fab:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(198,167,94,.3)}',
    '.aop-fab.listening{box-shadow:0 0 0 0 rgba(198,167,94,.55);animation:aopPulse 1.4s infinite}',
    '.aop-fab.thinking{opacity:.65}',
    '@keyframes aopPulse{70%{box-shadow:0 0 0 16px rgba(198,167,94,0)}100%{box-shadow:0 0 0 0 rgba(198,167,94,0)}}',
    '.aop-hint{position:fixed;right:96px;bottom:38px;background:#14140f;color:#e8dfc8;border:1px solid rgba(198,167,94,.35);',
    'padding:7px 12px;border-radius:8px;font-size:12.5px;opacity:0;pointer-events:none;transition:opacity .25s;z-index:9998}',
    '.aop-hint.show{opacity:1}',
    '.aop-panel{position:fixed;right:22px;bottom:96px;width:min(420px,calc(100vw - 44px));max-height:58vh;overflow:auto;',
    'background:#14140f;border:1px solid rgba(198,167,94,.35);border-radius:14px;padding:14px;z-index:9998;display:none;',
    'box-shadow:0 18px 50px rgba(0,0,0,.5)}',
    '.aop-panel.open{display:block}',
    '.aop-msg{margin:0 0 10px;font-size:14px;line-height:1.55;white-space:pre-wrap}',
    '.aop-msg.me{color:#c6a75e;font-weight:600}.aop-msg.ai{color:#e8dfc8}.aop-msg.err{color:#ff9b8a}',
    '.aop-row{display:flex;gap:8px;margin-top:10px}',
    '.aop-row input{flex:1;background:rgba(255,255,255,.05);border:1px solid rgba(198,167,94,.3);',
    'border-radius:8px;padding:9px 11px;color:#e8dfc8;font:inherit;font-size:14px}',
    '.aop-row button{background:#c6a75e;border:0;border-radius:8px;padding:0 14px;font-weight:700;cursor:pointer}',
    '@media (prefers-reduced-motion: reduce){.aop-fab,.aop-fab.listening{animation:none;transition:none}}',
  ].join('');
  document.head.appendChild(css);

  var fab = document.createElement('button');
  fab.className = 'aop-fab'; fab.setAttribute('aria-label', 'Añejo voice operator — one tap to talk, two to type');
  fab.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><path d="M12 18v4"/></svg>';
  var hint = document.createElement('div'); hint.className = 'aop-hint';
  var panel = document.createElement('div'); panel.className = 'aop-panel';
  panel.innerHTML = '<div id="aopLog"></div><div class="aop-row"><input id="aopIn" placeholder="Ask about orders, deliveries, rewards…" aria-label="Ask the operator"><button id="aopGo">Ask</button></div>';
  document.body.appendChild(fab); document.body.appendChild(hint); document.body.appendChild(panel);

  function showHint(t, ms) {
    hint.innerHTML = t; hint.classList.add('show');
    clearTimeout(showHint._t); showHint._t = setTimeout(function () { hint.classList.remove('show'); }, ms || 2600);
  }
  function log(text, cls) {
    var p = document.createElement('p'); p.className = 'aop-msg ' + (cls || 'ai'); p.textContent = text;
    document.getElementById('aopLog').appendChild(p); panel.scrollTop = panel.scrollHeight;
  }
  setTimeout(function () { showHint('<b>1 tap</b> talk · <b>2</b> type', 4000); }, 1200);

  function stopSpeech() {
    try { if (currentAudio) { currentAudio.pause(); currentAudio = null; } } catch (_) {}
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
  }
  function speak(text, done) {
    // Browser speech. Añejo has no ElevenLabs key bound; when one is added this is where the
    // /api/hub/owner/operator/tts call goes, with this as the fallback — same shape as DRH.
    if (!('speechSynthesis' in window)) { done && done(); return; }
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.onend = done; u.onerror = done;
      window.speechSynthesis.speak(u);
    } catch (_) { done && done(); }
  }

  function ask(q, speakBack) {
    if (busy || !q) return;
    busy = true; fab.classList.add('thinking');
    panel.classList.add('open'); log(q, 'me');
    fetch('/api/hub/owner/operator', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: q }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        busy = false; fab.classList.remove('thinking');
        if (!res.ok || !res.j.ok) {
          // Show the refusal VERBATIM. An operator that says "no key bound" is being honest;
          // dressing that up as "sorry, try again" would hide a fixable configuration problem.
          log(res.j.detail || res.j.error || 'the operator could not answer', 'err');
          return;
        }
        log(res.j.reply, 'ai');
        if (speakBack) speak(res.j.reply);
      })
      .catch(function (e) {
        busy = false; fab.classList.remove('thinking');
        log('could not reach the operator: ' + e.message, 'err');
      });
  }

  function listen() {
    if (!SR) { panel.classList.add('open'); document.getElementById('aopIn').focus(); showHint('this browser has no speech input — type instead'); return; }
    stopSpeech();
    recog = new SR(); recog.lang = 'en-US'; recog.interimResults = false; recog.maxAlternatives = 1;
    fab.classList.add('listening'); showHint('listening…');
    recog.onresult = function (e) { ask(String(e.results[0][0].transcript || '').trim(), true); };
    recog.onerror = function () { showHint('did not catch that'); };
    recog.onend = function () { fab.classList.remove('listening'); };
    try { recog.start(); } catch (_) { fab.classList.remove('listening'); }
  }

  // 1 tap = talk · 2 taps = type. Same gesture as DRH CORE HUB, deliberately.
  fab.addEventListener('click', function () {
    if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; stopSpeech(); panel.classList.toggle('open'); document.getElementById('aopIn').focus(); return; }
    tapTimer = setTimeout(function () { tapTimer = null; listen(); }, 260);
  });
  document.getElementById('aopGo').addEventListener('click', function () {
    var i = document.getElementById('aopIn'); ask(i.value.trim(), false); i.value = '';
  });
  document.getElementById('aopIn').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { ask(this.value.trim(), false); this.value = ''; }
  });
})();
