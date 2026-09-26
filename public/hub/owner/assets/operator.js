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
    paragraph(card,'Generate a private proposal from this saved idea using the existing AI budget. Team planning requires your explicit review.');
    var status=document.createElement('p'); if(status.setAttribute){status.setAttribute('role','status'); status.setAttribute('aria-live','polite');} card.appendChild(status);
    var output=document.createElement('div'); card.appendChild(output);
    var requestId=null, busy=false, terminal=false, promotionRequests={}, requestEpoch=0, readBusy=false;
    function section(label,value) {
      if(value===undefined||value===null||value==='')return;
      var h=document.createElement('h4');h.textContent=label;output.appendChild(h);
      if(Array.isArray(value)) {var list=document.createElement('ul');value.forEach(function(item){var li=document.createElement('li');li.textContent=typeof item==='string'?item:Object.keys(item||{}).map(function(k){return k.replace(/_/g,' ')+': '+String(item[k]);}).join(' · ');list.appendChild(li);});output.appendChild(list);}
      else paragraph(output,String(value));
    }
    function newProposalButton(parent,preview,stale) {
      paragraph(parent,(stale?'The old proposal remains saved.':'The failed record remains saved.')+' Generating a new proposal starts a separate AI request and uses the existing AI budget. Review the new result before any planning use.');
      var fresh=button(parent,stale?'Generate a new current proposal':'Generate a new proposal',async function(){
        if(busy||!terminal||fresh.disabled)return;
        fresh.disabled=true;
        paragraph(card,(stale?'Previous proposal retained: ':'Previous failed proposal retained: ')+String(preview.id||'saved record')+'. A separate proposal was explicitly requested.');
        requestId=crypto.randomUUID();terminal=false;
        await run(true);
      });
    }
    function planningReview(preview) {
      if(!/^[a-f0-9]{64}$/.test(preview.proposal_sha256||'')) {
        paragraph(output,'Planning use unavailable: the saved proposal version could not be verified. Reload saved strategy.');return;
      }
      var hash=preview.proposal_sha256, key=preview.id+':'+hash;
      var area=document.createElement('section');output.appendChild(area);
      paragraph(area,'Use the exact proposal above as direction for the existing Team Lead and planner. An enabled planner may use this direction later. This does not publish, send or schedule anything, and does not change automation permissions.');
      var note=document.createElement('p');note.setAttribute('role','status');note.setAttribute('aria-live','polite');area.appendChild(note);
      function receiptMatches(r) {
        return r && r.preview_id===preview.id && r.proposal_sha256===hash && r.review_scope==='team_planning_only' && typeof r.brief_id==='string' && r.brief_id && typeof r.promotion_id==='string' && r.promotion_id;
      }
      function showReceipt(r) {
        note.textContent='Saved for team planning · brief '+r.brief_id+' · receipt '+r.promotion_id+'. This confirms planning direction only, not publication or that a planner has run.';
        status.textContent='Saved proposed strategy · used as team planning direction';
      }
      if(preview.promotion_status==='recorded' && receiptMatches(preview.promotion)){
        var prior=preview.promotion;
        status.textContent='Saved proposed strategy · historical planning receipt recorded';
        note.textContent='Historical team planning receipt '+prior.promotion_id+' · brief '+prior.brief_id+'. Current brief status: '+String(prior.brief_status||'unavailable')+'. '+(prior.brief_matches_reviewed_proposal===true?'Current saved brief matches the reviewed proposal.':'Current brief is missing or differs from the reviewed proposal.')+' This receipt does not prove active execution or publication.';
        return;
      }
      if(preview.promotion_status!=='not_recorded' || preview.promotion) {
        status.textContent='Saved proposed strategy · planning status unavailable';
        note.textContent='Prior planning use could not be verified. Reload saved strategy before using this proposal; unavailable does not mean no prior planning use.';return;
      }
      var label=document.createElement('label'),ack=document.createElement('input');ack.type='checkbox';ack.checked=false;
      label.appendChild(ack);var words=document.createElement('span');words.textContent='I reviewed this exact proposal, including its assumptions and open questions. Unresolved facts remain unverified; I am allowing team planning only.';label.appendChild(words);area.appendChild(label);
      var pending=false, stopped=false;
      var use=button(area,'Use as team planning brief',async function(){
        if(pending||stopped||!ack.checked)return;
        pending=true;use.disabled=true;ack.disabled=true;reload.disabled=true;note.textContent='Saving reviewed planning direction…';
        try {
          if(!promotionRequests[key])promotionRequests[key]=crypto.randomUUID();
          var response=await fetch('/api/hub/owner/operator-campaign-promote',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:promotionRequests[key],preview_id:preview.id,expected_proposal_sha256:hash,acknowledge_open_questions:true})});
          var result=await response.json();
          if(response.ok && result.ok && result.promoted===true && receiptMatches(result)){stopped=true;showReceipt(result);use.textContent='Saved as team planning brief';return;}
          var error=String(result.error||'promotion_not_verified');
          if(['stale_preview_regenerate_required','proposal_changed','request_key_conflict','authority_or_preview_changed','preview_not_found'].includes(error)) {
            stopped=true;note.textContent='Planning use was not verified: '+error+'. The proposal or its authority has changed. A new current proposal must be reviewed before planning use; no override was applied.';
            if(response.status===409 && result.ok===false && result.promoted===false && result.review_scope==='team_planning_only' && error==='stale_preview_regenerate_required')newProposalButton(area,preview,true);
          }else note.textContent='Planning use not verified: '+error+'. Reload saved strategy or retry this same request; no duplicate brief will be requested.';
        }catch(error){note.textContent='Planning use not verified. Reload saved strategy or retry this same request; no duplicate brief will be requested.';}
        finally{pending=false;ack.disabled=stopped;use.disabled=stopped||!ack.checked;reload.disabled=false;}
      });
      use.disabled=true;ack.addEventListener('change',function(){use.disabled=pending||stopped||!ack.checked;});
    }
    function editProposal(preview) {
      if(busy||readBusy)return;
      reload.disabled=true;check.disabled=true;
      output.replaceChildren();
      paragraph(output,'Edit this private proposal. The original stays saved. Channels and catalog selections stay as shown in the original. Saving does not approve or activate planning.');
      if(preview.promotion_status==='recorded')paragraph(output,'An earlier planning brief remains unchanged. Saving this revision does not replace or withdraw that earlier direction.');
      var inputs={},frozen=null,saving=false;
      ['title','objective','audience','angle','cadence','success_metric','assets','assumptions','questions'].forEach(function(key){
        var label=document.createElement('label'),text=document.createElement('span'),input=document.createElement('textarea');
        text.textContent=key.replace(/_/g,' ')+(Array.isArray(preview.proposal[key])?' — one item per line':'');
        input.value=Array.isArray(preview.proposal[key])?preview.proposal[key].join('\n'):preview.proposal[key];
        input.setAttribute('rows',key==='title'?'2':'4');
        label.appendChild(text);label.appendChild(input);output.appendChild(label);inputs[key]=input;
      });
      var note=document.createElement('p');note.setAttribute('role','status');output.appendChild(note);
      var save=button(output,'Save private revision',async function(){
        if(saving)return;
        if(!frozen){
          var proposal=Object.assign({},preview.proposal);
          Object.keys(inputs).forEach(function(key){proposal[key]=Array.isArray(preview.proposal[key])?inputs[key].value.split('\n').map(function(x){return x.trim();}).filter(Boolean):inputs[key].value;});
          frozen={request_id:crypto.randomUUID(),preview_id:preview.id,expected_proposal_sha256:preview.proposal_sha256,proposal:proposal};
        }
        saving=true;busy=true;save.disabled=true;cancel.disabled=true;reload.disabled=true;check.disabled=true;
        Object.keys(inputs).forEach(function(key){inputs[key].disabled=true;});
        note.textContent='Saving a separate private revision…';
        var savedSuccessfully=false;
        try{
          var response=await fetch('/api/hub/owner/operator-campaign-preview',{method:'PATCH',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(frozen)});
          var result=await response.json(),saved=result.preview;
          if(response.ok&&result.saved===true&&saved&&saved.request_id===frozen.request_id&&saved.generated===false&&saved.source_receipts&&saved.source_receipts.revision&&saved.source_receipts.revision.parent_id===preview.id){
            requestEpoch++;requestId=saved.request_id;savedSuccessfully=true;render(saved);return;
          }
          // Explicit pre-save validation failures permit correction; uncertain writes keep
          // the identical frozen request so retries cannot create a second revision.
          if(response.status===400&&result.ok===false&&['invalid_proposal','invalid_revision_request'].includes(result.error)){
            frozen=null;cancel.disabled=false;Object.keys(inputs).forEach(function(key){inputs[key].disabled=false;});
            note.textContent='Revision was not saved: '+String(result.error)+'. Correct the wording or list lengths and save again.';
          }else note.textContent='Revision save not verified. Retry this same save; no planning action was requested.';
        }catch(error){note.textContent='Revision save not verified. Retry this same save; no planning action was requested.';}
        finally{saving=false;busy=false;save.disabled=false;save.textContent=frozen?'Retry same save':'Save private revision';reload.disabled=!savedSuccessfully;check.disabled=!savedSuccessfully||!requestId;}
      });
      var cancel=button(output,'Cancel edits',function(){if(!saving&&!frozen){reload.disabled=false;render(preview);}});
    }
    function render(preview) {
      output.replaceChildren();
      if(!preview) {status.textContent='No saved proposal returned for this idea.';return;}
      if(preview.request_id){requestId=preview.request_id;check.disabled=readBusy;}
      if(preview.state==='generating') {
        status.textContent='Generation is recorded as in progress or awaiting an outcome. Completion is not verified. Check saved status; do not start another generation.';
        generate.textContent='Check saved status';return;
      }
      terminal=true;generate.disabled=true;
      if(preview.state!=='succeeded'||!preview.proposal) {
        status.textContent=preview.outcome_unknown?'Generation outcome is uncertain. No completed proposal is verified.':'No completed proposal was saved.';
        if(preview.error)paragraph(output,'Recorded error: '+String(preview.error));
        var diagnostic=preview.preview_diagnostic;
        if(diagnostic && ['shape','json','completion','validation'].includes(diagnostic.stage)) {
          var codes=['content_array_required','single_content_block_required','text_block_required','text_string_required','text_too_long','invalid_json','end_turn_required','object_required','missing_field','unexpected_field','string_required','empty_string','string_too_long','array_required','too_many_items','item_string_required','empty_item','item_too_long','duplicate_item','empty_channels','unsupported_channel','unavailable_product_id'];
          if(codes.includes(diagnostic.code)) {
            var parts=[diagnostic.stage+' issue: '+diagnostic.code.replace(/_/g,' ')];
            if(['title','objective','audience','angle','cadence','success_metric','channels','product_ids','assets','assumptions','questions'].includes(diagnostic.field))parts.push('field '+diagnostic.field.replace(/_/g,' '));
            ['index','actual','limit'].forEach(function(k){if(Number.isInteger(diagnostic[k])&&diagnostic[k]>=0&&diagnostic[k]<=1000000)parts.push(k+' '+diagnostic[k]);});
            paragraph(output,parts.join(' · '));
          }
        }
        if(preview.state==='failed' && preview.outcome_unknown!==true)newProposalButton(output,preview,false);
        return;
      }
      status.textContent='Saved proposed strategy · private · review required · not active';
      var proposal=preview.proposal;
      paragraph(output,preview.generated===false?'Privately edited proposal for your review. The original remains saved; editing is not approval.':'AI-generated proposal for your review. Suggestions and assumptions are not verified business facts.');
      Object.keys(proposal).forEach(function(key){section(key.replace(/_/g,' ').replace(/^./,function(c){return c.toUpperCase();}),proposal[key]);});
      var details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=preview.generated===false?'Original generation and revision evidence':'Generation evidence';details.appendChild(summary);
      paragraph(details,(preview.generated===false?'Original model: ':'Model: ')+String(preview.model||'unverified')+' · Saved preview: '+String(preview.id));
      if(preview.generated===false&&preview.source_receipts&&preview.source_receipts.revision)paragraph(details,'Private edit of '+String(preview.source_receipts.revision.parent_id)+'. No model was called for this revision; original source context remains unchanged.');
      var receipts=preview.source_receipts||{},receipt=receipts.inference_receipt||{};
      paragraph(details,'Input receipt: '+String(receipt.receipt_id||'unavailable')+' · '+(receipt.persisted===true?'input recorded; not proof every instruction was followed':'input recording unverified'));
      var context=receipts.input_context||{},components=Object.assign({},context.components||{});
      Object.keys(context.coverage||{}).forEach(function(key){components[key]=Object.assign({},components[key]||{},context.coverage[key]||{});});
      Object.keys(components).forEach(function(key){var c=components[key];if(!c||typeof c!=='object'||Array.isArray(c))return;paragraph(details,key+': '+String(c.read_status||'status not supplied')+(c.truncated===true?' · truncated':'')+(typeof c.supplied_chars==='number'?' · '+c.supplied_chars+' supplied characters':''));});
      output.appendChild(details);
      if(/^[a-f0-9]{64}$/.test(preview.proposal_sha256||''))button(output,'Edit this proposal privately',function(){editProposal(preview);});
      planningReview(preview);
    }
    async function get(url) {
      var response=await fetch(url,{credentials:'same-origin',cache:'no-store'}),body=await response.json();
      if(!response.ok||(!body.ok&&!body.preview)){var error=new Error(body.detail||body.error||'Saved proposal unavailable');error.httpStatus=response.status;throw error;}
      return body;
    }
    async function run(freshRequest) {
      if(busy||terminal)return;
      var runEpoch=++requestEpoch;
      busy=true;generate.disabled=true;reload.disabled=true;status.textContent=requestId?'Checking saved outcome…':'Generating private proposal…';
      try {
        var body;
        if(!requestId){
          var existing=await get('/api/hub/owner/operator-campaign-preview?idea_id='+encodeURIComponent(idea.id));
          if(runEpoch!==requestEpoch)return;
          if(!Array.isArray(existing.previews))throw Error('Invalid saved proposal response');
          if(existing.previews.length){render(existing.previews[0]);return;}
        }
        if(requestId && freshRequest!==true){try{body=await get('/api/hub/owner/operator-campaign-preview?request_id='+encodeURIComponent(requestId));}catch(readError){if(readError.httpStatus!==404)throw readError;}}
        if(runEpoch!==requestEpoch)return;
        if(!body) {
          if(!requestId)requestId=crypto.randomUUID();
          check.disabled=false;status.textContent='Generation request in progress. You can check this same saved request while the response is pending.';
          var response=await fetch('/api/hub/owner/operator-campaign-preview',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:requestId,idea_id:idea.id})});
          body=await response.json();
          if(runEpoch!==requestEpoch)return;
          if(!response.ok||(!body.ok&&!body.preview))throw Error(body.detail||body.error||'Generation outcome not verified');
        }
        render(body.preview);
      } catch(error) {if(runEpoch!==requestEpoch)return;status.textContent=String(error.message||error)+'. Outcome not verified. Check or retry this same request; no duplicate generation will be requested.';generate.textContent=requestId?'Check saved status':'Generate proposed strategy';}
      finally {if(runEpoch===requestEpoch){busy=false;generate.disabled=terminal;reload.disabled=false;check.disabled=!requestId||readBusy;}}
    }
    var generate=button(card,'Generate proposed strategy',run);
    var check=button(card,'Check this request now',async function(){
      if(!requestId||readBusy)return;
      var readId=requestId,readEpoch=requestEpoch;
      readBusy=true;check.disabled=true;status.textContent='Reading the saved outcome for this same request…';
      try{
        var body=await get('/api/hub/owner/operator-campaign-preview?request_id='+encodeURIComponent(readId));
        if(readEpoch!==requestEpoch||readId!==requestId)return;
        var preview=body.preview;
        if(!preview||preview.request_id!==readId||!['generating','succeeded','failed'].includes(preview.state))throw Error('Saved request identity or state was not verified');
        if(preview.state==='succeeded'||preview.state==='failed'){
          // Durable terminal readback wins over the still-pending original transport.
          // Invalidate its callbacks without aborting server work or posting again.
          requestEpoch++;busy=false;generate.disabled=true;reload.disabled=false;
        }
        render(preview);
      }catch(error){if(readEpoch===requestEpoch&&readId===requestId)status.textContent='Saved outcome not verified: '+String(error.message||error)+'. No new generation was requested; check this same request again.';}
      finally{readBusy=false;check.disabled=!requestId;}
    });
    check.disabled=true;
    var reload=button(card,'Load saved strategy',async function(){
      if(busy)return;var reloadEpoch=++requestEpoch;busy=true;reload.disabled=true;generate.disabled=true;status.textContent='Loading saved private proposal…';
      try {var body=await get('/api/hub/owner/operator-campaign-preview?idea_id='+encodeURIComponent(idea.id));if(reloadEpoch!==requestEpoch)return;if(!Array.isArray(body.previews))throw Error('Invalid saved proposal response');render(body.previews[0]||null);}
      catch(error){if(reloadEpoch===requestEpoch)status.textContent='Saved proposals unavailable: '+String(error.message||error);}
      finally{if(reloadEpoch===requestEpoch){busy=false;reload.disabled=false;generate.disabled=terminal;}}
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
          paragraph(root,'Latest 20 private owner-supplied ideas. Generate or reload a proposed strategy and review its recorded planning status below.');
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
    '.aop-proposal label{display:block;margin:12px 0;font-size:13px;color:#e8dfc8}.aop-proposal label>span{display:block;margin-bottom:6px}.aop-proposal textarea{display:block;box-sizing:border-box;width:100%;resize:vertical;padding:10px;border:1px solid rgba(198,167,94,.5);border-radius:8px;background:#15251e;color:#f5efdf;font:inherit;line-height:1.5}.aop-proposal textarea:focus{outline:2px solid #c6a75e;outline-offset:2px}',
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

  function voiceInputFailure(error) {
    var code = error && (error.error || error.name);
    var messages = {
      'not-allowed': 'Microphone access was denied or blocked. Check this site’s microphone permission.',
      'service-not-allowed': 'The browser blocked the speech recognition service.',
      'audio-capture': 'The microphone is unavailable. Check that it is connected and available to this browser.',
      'no-speech': 'No speech was detected.',
      'network': 'Speech recognition failed because of a network error.',
      'aborted': 'Speech input was cancelled.',
      'language-not-supported': 'This browser’s speech service does not support the selected language.',
      'unsupported': 'This browser has no speech input.'
    };
    var aliases = { NotAllowedError: 'not-allowed', NotFoundError: 'audio-capture', NotReadableError: 'audio-capture', NetworkError: 'network' };
    var message = (messages[aliases[code] || code] || 'Speech input could not start or continue.') + ' Type your request below instead.';
    fab.classList.remove('listening');
    panel.classList.add('open');
    log(message, 'err');
    document.getElementById('aopIn').focus();
    showHint(message, 6000);
  }

  function listen() {
    if (!SR) { voiceInputFailure({ error: 'unsupported' }); return; }
    stopSpeech();
    try {
      recog = new SR(); recog.lang = 'en-US'; recog.interimResults = false; recog.maxAlternatives = 1;
      fab.classList.add('listening'); showHint('listening…');
      recog.onresult = function (e) { ask(String(e.results[0][0].transcript || '').trim(), true); };
      recog.onerror = voiceInputFailure;
      recog.onend = function () { fab.classList.remove('listening'); };
      recog.start();
    } catch (error) { voiceInputFailure(error); }
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
