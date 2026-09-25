/* Private descriptors only. Explicit clicks; never auto-save, publish or silently redirect. */
(function () {
  var paths = {photos:'/hub/owner/marketing.html#photos',create:'/hub/owner/marketing.html#create',drafts:'/hub/owner/marketing.html#create?filter=drafts'};
  function button(root, label, fn) { var b=document.createElement('button'); b.type='button'; b.textContent=label; b.addEventListener('click',fn); root.appendChild(b); return b; }
  function paragraph(root, text) { var p=document.createElement('p'); p.textContent=text; root.appendChild(p); }
  // Baseline values catch unsaved normal inputs. A page may supply a more exact dirty hook.
  function dirty() {
    if(typeof window.AnejoOperatorHasUnsavedChanges==='function') return !!window.AnejoOperatorHasUnsavedChanges();
    return Array.from(document.querySelectorAll('input,textarea,select')).some(function(e){
      if(e.closest('.aop-panel') || e.disabled) return false;
      if(e.type==='file') return e.files && e.files.length>0;
      if(e.type==='checkbox'||e.type==='radio') return e.checked!==e.defaultChecked;
      if(e.tagName==='SELECT') return Array.from(e.options).some(function(o){return o.selected!==o.defaultSelected;});
      return e.value!==e.defaultValue;
    });
  }
  function canonical(path) { return path.replace(/\.html$/, '').replace(/\/$/, ''); }
  function campaignPreview(root, idea) {
    var card=document.createElement('section'); card.className='aop-proposal'; root.appendChild(card);
    var heading=document.createElement('h3'); heading.textContent='Proposed strategy'; card.appendChild(heading);
    paragraph(card,'Private review only · not active. Generate a proposal from this saved idea using the existing AI budget.');
    var status=document.createElement('p'); if(status.setAttribute){status.setAttribute('role','status'); status.setAttribute('aria-live','polite');} card.appendChild(status);
    var output=document.createElement('div'); card.appendChild(output);
    var requestId=null, busy=false, terminal=false;
    function section(label,value) {
      if(value===undefined||value===null||value==='')return;
      var h=document.createElement('h4');h.textContent=label;output.appendChild(h);
      if(Array.isArray(value)) {var list=document.createElement('ul');value.forEach(function(item){var li=document.createElement('li');li.textContent=typeof item==='string'?item:Object.keys(item||{}).map(function(k){return k.replace(/_/g,' ')+': '+String(item[k]);}).join(' · ');list.appendChild(li);});output.appendChild(list);}
      else paragraph(output,String(value));
    }
    function render(preview) {
      output.replaceChildren();
      if(!preview) {status.textContent='No saved proposal returned for this idea.';return;}
      if(preview.request_id)requestId=preview.request_id;
      if(preview.state==='generating') {
        status.textContent='Generation is recorded as in progress or awaiting an outcome. Completion is not verified. Check saved status; do not start another generation.';
        generate.textContent='Check saved status';return;
      }
      terminal=true;generate.disabled=true;
      if(preview.state!=='succeeded'||!preview.proposal) {
        status.textContent=preview.outcome_unknown?'Generation outcome is uncertain. No completed proposal is verified.':'No completed proposal was saved.';
        if(preview.error)paragraph(output,'Recorded error: '+String(preview.error));return;
      }
      status.textContent='Saved proposed strategy · private · review required · not active';
      var proposal=preview.proposal;
      paragraph(output,'AI-generated proposal for your review. Suggestions and assumptions are not verified business facts.');
      Object.keys(proposal).forEach(function(key){section(key.replace(/_/g,' ').replace(/^./,function(c){return c.toUpperCase();}),proposal[key]);});
      var details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Generation evidence';details.appendChild(summary);
      paragraph(details,'Model: '+String(preview.model||'unverified')+' · Saved preview: '+String(preview.id));
      var receipts=preview.source_receipts||{},receipt=receipts.inference_receipt||{};
      paragraph(details,'Input receipt: '+String(receipt.receipt_id||'unavailable')+' · '+(receipt.persisted===true?'input recorded; not proof every instruction was followed':'input recording unverified'));
      var context=receipts.input_context||{},components=Object.assign({},context.components||{});
      Object.keys(context.coverage||{}).forEach(function(key){components[key]=Object.assign({},components[key]||{},context.coverage[key]||{});});
      Object.keys(components).forEach(function(key){var c=components[key];if(!c||typeof c!=='object'||Array.isArray(c))return;paragraph(details,key+': '+String(c.read_status||'status not supplied')+(c.truncated===true?' · truncated':'')+(typeof c.supplied_chars==='number'?' · '+c.supplied_chars+' supplied characters':''));});
      output.appendChild(details);
    }
    async function get(url) {
      var response=await fetch(url,{credentials:'same-origin',cache:'no-store'}),body=await response.json();
      if(!response.ok||(!body.ok&&!body.preview)){var error=new Error(body.detail||body.error||'Saved proposal unavailable');error.httpStatus=response.status;throw error;}
      return body;
    }
    async function run() {
      if(busy||terminal)return;
      busy=true;generate.disabled=true;reload.disabled=true;status.textContent=requestId?'Checking saved outcome…':'Generating private proposal…';
      try {
        var body;
        if(!requestId){
          var existing=await get('/api/hub/owner/operator-campaign-preview?idea_id='+encodeURIComponent(idea.id));
          if(!Array.isArray(existing.previews))throw Error('Invalid saved proposal response');
          if(existing.previews.length){render(existing.previews[0]);return;}
        }
        if(requestId){try{body=await get('/api/hub/owner/operator-campaign-preview?request_id='+encodeURIComponent(requestId));}catch(readError){if(readError.httpStatus!==404)throw readError;}}
        if(!body) {
          if(!requestId)requestId=crypto.randomUUID();
          var response=await fetch('/api/hub/owner/operator-campaign-preview',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:requestId,idea_id:idea.id})});
          body=await response.json();
          if(!response.ok||(!body.ok&&!body.preview))throw Error(body.detail||body.error||'Generation outcome not verified');
        }
        render(body.preview);
      } catch(error) {status.textContent=String(error.message||error)+'. Outcome not verified. Check or retry this same request; no duplicate generation will be requested.';generate.textContent=requestId?'Check saved status':'Generate proposed strategy';}
      finally {busy=false;generate.disabled=terminal;reload.disabled=false;}
    }
    var generate=button(card,'Generate proposed strategy',run);
    var reload=button(card,'Load saved strategy',async function(){
      if(busy)return;busy=true;reload.disabled=true;generate.disabled=true;status.textContent='Loading saved private proposal…';
      try {var body=await get('/api/hub/owner/operator-campaign-preview?idea_id='+encodeURIComponent(idea.id));if(!Array.isArray(body.previews))throw Error('Invalid saved proposal response');render(body.previews[0]||null);}
      catch(error){status.textContent='Saved proposals unavailable: '+String(error.message||error);}
      finally{busy=false;reload.disabled=false;generate.disabled=terminal;}
    });
  }
  window.AnejoOperatorPrivateUI = function(result,root) {
    var ui=result && result.ui;
    if(!ui) return;
    if(ui.kind==='navigate' && Object.prototype.hasOwnProperty.call(paths,ui.destination)) {
      button(root,'Open '+({photos:'Photos',create:'Create & Schedule',drafts:'drafts'}[ui.destination]),function(){
        var url=new URL(paths[ui.destination],location.origin);
        if(canonical(url.pathname)===canonical(location.pathname)) { location.hash=url.hash; return; }
        if(dirty() && !window.confirm('Open Marketing and leave unsaved changes on this page?')) return;
        location.assign(url.pathname+url.hash);
      });
    } else if(ui.kind==='brief_preview' && ui.saved===false) {
      paragraph(root,'Unsaved campaign idea — '+String(ui.title||'')); paragraph(root,String(ui.notes||''));
      paragraph(root,'Your supplied words only; no developed campaign brief or saved record.');
      var requestId=null;
      var save=button(root,'Save private draft idea',async function(){
        if(save.disabled)return;
        save.disabled=true;
        try {
          if(!requestId)requestId=crypto.randomUUID();
          var response=await fetch('/api/hub/owner/operator-brief',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:requestId,topic:String(ui.notes||'')})});
          var saved=await response.json();
          if(!response.ok || !saved.ok || !saved.saved || !saved.brief || !saved.brief.id)throw new Error('save_unverified');
          paragraph(root,'Saved owner-supplied draft idea · '+saved.brief.id+' · '+saved.brief.status+' · '+new Date(saved.brief.created_at).toISOString());
          paragraph(root,'Your words were saved exactly. No strategy was generated or public action taken.');
          save.textContent='Saved private idea';
          campaignPreview(root,saved.brief);
        } catch (_) {
          paragraph(root,'Save not verified. Retry uses the same request key to avoid duplicates.');
          save.disabled=false;
        }
      });
    } else if(ui.kind==='saved_ideas') {
      var read=button(root,'Load my saved campaign ideas',async function(){
        if(read.disabled)return;
        read.disabled=true;
        try {
          var response=await fetch('/api/hub/owner/operator-brief',{credentials:'same-origin',cache:'no-store'});
          var result=await response.json();
          if(!response.ok || !result.ok || !Array.isArray(result.ideas))throw new Error('read_unavailable');
          paragraph(root,'Latest 20 private owner-supplied ideas. Generate or reload a proposed strategy below; nothing is activated.');
          if(!result.ideas.length)paragraph(root,'No saved ideas returned.');
          result.ideas.forEach(function(idea){paragraph(root,idea.title+' · '+idea.status+' · '+new Date(idea.created_at).toISOString());paragraph(root,idea.topic);campaignPreview(root,idea);});
        } catch (_) {paragraph(root,'Saved ideas unavailable. Try again.');read.disabled=false;}
      });
    } else if(ui.kind==='audit_status') {
      var s=result.audit;
      if(!s || !s.available) { paragraph(root,'Saved audit evidence unavailable. No audit was run.'); return; }
      paragraph(root,'Observed '+s.observed_at+' · latest 60 posts only. Audit pass is not permission to publish.');
      if(!s.posts.length) paragraph(root,'No posts returned by this read.');
      var counts = {};
      s.posts.forEach(function(p){counts[p.state]=(counts[p.state]||0)+1;});
      paragraph(root, Object.keys(counts).map(function(k){return counts[k]+' '+k.replace(/_/g,' ');}).join(' · '));
      if(s.posts.length) {
        var details=document.createElement('details'), summary=document.createElement('summary');
        summary.textContent='Show '+s.posts.length+' saved audit details'; details.appendChild(summary);
        s.posts.forEach(function(p){
          var date = Number(p.audit_at), audited = Number.isFinite(date) && date > 0 && date <= 8640000000000000 ? new Date(date).toISOString() : 'not recorded';
          paragraph(details,(p.caption_excerpt || 'Untitled post')+' · '+p.status+' · '+p.state.replace(/_/g,' ')+' · audited '+audited);
        });
        root.appendChild(details);
      }
    }
  };
})();

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
 * Voice-out: browser speech synthesis when available. A robotic voice that
 * tells the truth beats no answer.
 */
(function () {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recog = null, busy = false, currentAudio = null, tapTimer = null;

  var css = document.createElement('style');
  css.textContent = [
    // The FAB/hint/panel used to hard-code their bottom offset (22/38/96px), unaware of the
    // fixed bottom nav (--nav-h, defined in hub.css). On the owner HUB that meant the FAB sat
    // ON TOP of the nav bar instead of above it — the reported bug. --aop-base reuses the exact
    // clearance hub.css already documents for anything a page pins to the bottom itself
    // (.hub-above-nav: nav height + nav gap + the iPhone home-indicator safe area), so the FAB
    // always clears the bar by the same margin real content does, on any HUB page, phone or
    // desktop, notch or none.
    ':root{--aop-base:calc(var(--nav-h, 60px) + var(--nav-gap, 24px) + env(safe-area-inset-bottom, 0px));}',
    // 2026-08-11 — the FAB floated up into the middle of the page alongside the nav bar during a
    // scroll ("the home bar is floating"), and `will-change:transform` was added to promote it to
    // its own compositor layer on the theory that an unpromoted fixed box is repainted only after
    // the gesture settles.
    // 2026-09-14 — it floated again, on the Sales page, WITH that promotion in place, and by the
    // same offset as the nav bar. That is evidence against the theory: promotion is not preventing
    // this, and on iOS a promoted fixed layer is composited against the scroll offset captured when
    // it was rasterised, which produces exactly this stale-position painting during momentum
    // scrolling. Promotion removed from both bottom-pinned elements. The :hover transform below
    // still animates fine without it — `will-change` is a hint, not a requirement.
    '.aop-fab{position:fixed;right:22px;bottom:var(--aop-base);width:62px;height:62px;border-radius:50%;',
    'border:1px solid rgba(198,167,94,.55);background:radial-gradient(circle at 32% 28%,#2c2c26,#14140f);',
    'color:#e8dfc8;display:grid;place-items:center;cursor:pointer;z-index:9998;',
    'box-shadow:0 10px 30px rgba(0,0,0,.45);transition:transform .18s ease,box-shadow .18s ease}',
    '.aop-fab:hover{transform:translateY(-2px);box-shadow:0 14px 36px rgba(198,167,94,.3)}',
    '.aop-fab.listening{box-shadow:0 0 0 0 rgba(198,167,94,.55);animation:aopPulse 1.4s infinite}',
    '.aop-fab.thinking{opacity:.65}',
    '@keyframes aopPulse{70%{box-shadow:0 0 0 16px rgba(198,167,94,0)}100%{box-shadow:0 0 0 0 rgba(198,167,94,0)}}',
    // +16px keeps the hint vertically centered on the fab (same 16px offset as the original
    // 22/38 pair), just measured from the new base instead of the viewport edge.
    '.aop-hint{position:fixed;right:96px;bottom:calc(var(--aop-base) + 16px);background:#14140f;color:#e8dfc8;border:1px solid rgba(198,167,94,.35);',
    'padding:7px 12px;border-radius:8px;font-size:12.5px;opacity:0;pointer-events:none;transition:opacity .25s;z-index:9998}',
    '.aop-hint.show{opacity:1}',
    // +74px preserves the original gap between the fab and the panel above it (96 - 22 = 74).
    '.aop-panel{position:fixed;right:22px;bottom:calc(var(--aop-base) + 74px);width:min(420px,calc(100vw - 44px));max-height:58vh;overflow:auto;',
    'background:#14140f;border:1px solid rgba(198,167,94,.35);border-radius:14px;padding:14px;z-index:9998;display:none;',
    'box-shadow:0 18px 50px rgba(0,0,0,.5)}',
    '.aop-panel.open{display:block}',
    '.aop-proposal{margin:14px 0;padding:12px;border:1px solid rgba(198,167,94,.4);border-radius:10px;overflow-wrap:anywhere}',
    '.aop-proposal h3{margin:0 0 10px;color:#e8dfc8;font-size:18px}.aop-proposal h4{margin:14px 0 5px;color:#c6a75e;font-size:13px}',
    '.aop-proposal p,.aop-proposal li{font-size:13px;line-height:1.5;color:#e8dfc8}.aop-proposal button{margin:4px 6px 4px 0;padding:9px 11px;min-height:44px;cursor:pointer}',
    '.aop-proposal [role=status]{color:#c6a75e}.aop-proposal details{font-size:12px;margin-top:10px}.aop-proposal summary{cursor:pointer;padding:8px 0}',
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
  panel.innerHTML = '<div id="aopLog"></div><div class="aop-row"><button id="aopCapabilities" type="button">What can you do?</button><button id="aopMarketingStatus" type="button">Marketing status</button></div><div class="aop-row"><input id="aopIn" placeholder="Ask about orders or marketing status…" aria-label="Ask the operator"><button id="aopGo">Ask</button></div>';
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
    // Browser speech is the currently implemented output; no remote TTS is invoked.
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
        window.AnejoOperatorPrivateUI(res.j, document.getElementById('aopLog'));
        if (speakBack) speak(res.j.reply);
      })
      .catch(function (e) {
        busy = false; fab.classList.remove('thinking');
        log('could not reach the operator: ' + e.message, 'err');
      });
  }

  document.getElementById('aopCapabilities').addEventListener('click', function () { ask('capabilities', false); });
  document.getElementById('aopMarketingStatus').addEventListener('click', function () { ask('marketing status', false); });

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
