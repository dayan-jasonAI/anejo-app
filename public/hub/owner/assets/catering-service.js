/* global Hub, Owner */
(function(){
  Hub.boot();
  var endpoint='/api/hub/owner/catering-service',esc=Hub.esc,data;
  var reminderEndpoint='/api/hub/owner/catering-quote-followup',review=null,previewSequence=0,sending=false,activeArticle=null,previewTimer=null;
  var stepLabels={review_quote:'Review quote · first reminder',clarify_questions:'Clarify questions · second reminder',final_checkin:'Final check-in · third reminder'};
  var responseLabels={awaiting_reply:'Awaiting customer reply',replied:'Customer replied',call_requested:'Customer requested a call',changes_requested:'Customer requested changes',declined:'Customer declined'};
  var phases={new:'Needs first contact',contacted:'Contacted · follow-up planned',awaiting_deposit:'Quote sent · deposit pending',booked:'Deposit recorded · booked',lost:'Closed · not proceeding',owner_won:'Owner marked won · payment not verified'};
  function when(t){return t?new Date(t).toLocaleString((window.AnejoLang && window.AnejoLang.get() === 'es' ? 'es-US' : 'en-US')): 'Not recorded';}
  function localValue(t){if(!t)return '';var d=new Date(t);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
  function card(l){
    var state=l.state||'open',receipt=l.notifications.map(function(n){return esc(n.channel==='hub'?'Owner Hub alert': 'Owner email')+': '+esc(n.status==='accepted'?'accepted — receipt recorded':n.status)+(n.last_error?' · '+esc(n.last_error):'');}).join('<br>');
    var origin=[l.utm_source,l.utm_medium,l.utm_campaign,l.src,l.referrer].filter(Boolean).join(' · ')||'Not recorded — do not infer a source';
    var entry=l.event&&l.event.journey&&l.event.journey.entry_path;
    return '<article class="lead '+(l.followup_overdue?'overdue':'')+'" data-lead="'+esc(l.id)+'"><h3>'+esc(l.name)+'</h3><div class="lead-meta"><b>'+esc(phases[l.phase]||l.phase)+'</b><span>Received '+esc(when(l.created_at))+'</span><span>'+esc(l.event.event_date||'Date to confirm')+' · '+esc(String(l.event.guests||'—'))+' guests</span></div><p class="service-note">'+(l.followup_overdue?'Call or respond now.':'Next follow-up: '+esc(when(l.followup_due_at)))+'</p><p class="service-note">Source: '+esc(origin)+(entry?' · Submitted entry page: '+esc(entry):' · Browsing path not recorded')+'</p><div class="actions">'+(l.phone?'<a class="btn gold" href="tel:'+esc(l.phone)+'">Call '+esc(l.phone)+'</a>':'')+(l.quote_sms_at?'<button class="btn ghost" type="button" data-sync="'+esc(l.quote_id)+'">Sync quote text receipt</button>':'')+'<button class="btn ghost" type="button" data-conversation>Open messages</button><a class="btn ghost" href="/hub/owner/catering.html?lead='+encodeURIComponent(l.id)+'">Request &amp; quote</a></div><details><summary>Contact and delivery evidence</summary><p>'+esc(l.email||'No email')+'</p><div class="receipt">'+(receipt||'Owner notification evidence unavailable')+'<br>Customer acknowledgement: '+esc(l.acknowledgement_status||'not recorded')+(l.acknowledgement_error?' · '+esc(l.acknowledgement_error):'')+'<br>Provider acceptance does not establish that the recipient read the message.</div></details>'+customerPanel(l)+'<form class="service-grid" style="margin-top:18px"><label>Internal call-task status<select name="state">'+[['open','Needs contact'],['contacted','Contacted'],['won','Closed — owner marked won'],['lost','Closed — not proceeding']].map(function(o){return '<option value="'+o[0]+'"'+(state===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label><label>Next follow-up<input name="next" type="datetime-local" value="'+esc(localValue(l.next_followup_at))+'" data-original="'+esc(localValue(l.next_followup_at))+'"></label><label class="wide">Call notes / next action<textarea name="note" rows="2">'+esc(l.note||'')+'</textarea></label><button type="submit" class="btn gold">Save follow-up</button></form></article>';
  }
  function reminderStatus(status){
    return ({accepted:'Provider accepted — delivery and reading unverified',unknown:'Send outcome unknown — do not retry',suppressed:'Suppressed — no reminder sent',failed:'Provider failed — acceptance not recorded',pending:'Send pending — do not retry'})[status] || 'Outcome not verified';
  }
  function customerPanel(l){
    var known=responseLabels[l.response_status]||(l.customer_response&&responseLabels[l.customer_response.status]);
    return '<section class="customer-followup" aria-label="Customer response and quote reminder"><h4>Customer response &amp; quote reminder</h4><p class="response-status" data-response-summary>'+esc(known||'Response details not loaded')+'</p>'+(l.followup_action_label?'<p class="service-note"><b>Next action:</b> '+esc(l.followup_action_label)+'</p>':'')+(l.quote_reminder_status?'<p class="service-note">Latest reminder: '+esc(reminderStatus(l.quote_reminder_status))+(l.last_reminder_accepted_at?' · '+esc(when(l.last_reminder_accepted_at)):'')+'</p>':'')+'<p class="service-note">Separate from your call-task status. Recording a call attempt does not mean the customer replied.</p><div class="actions"><button class="btn gold" type="button" data-review-reminder'+(!l.quote_id?' disabled':'')+'>Review / send quote reminder</button></div>'+(!l.quote_id?'<p class="service-note">Create and send a quote before reviewing a quote reminder.</p>':'')+'<details data-response-details><summary>Customer response &amp; reminder history</summary><div data-response-content><p class="service-note">Open to retrieve current evidence. Opening never sends a message.</p></div></details><p class="service-note">Suggested checkpoints: 24 hours, 72 hours and 7 days after the quote. These are owner actions; this panel does not schedule automatic customer emails.</p></section>';
  }
  function renderCustomerState(article,result){
    var host=article.querySelector('[data-response-content]'),summary=article.querySelector('[data-response-summary]');
    if(!result?.ok){host.innerHTML='<p class="receipt">'+esc(result?.error||'Could not retrieve response evidence. No message was sent.')+'</p>';return;}
    var response=result.response,history=Array.isArray(result.history)?result.history:[],status=response&&responseLabels[response.status];
    summary.textContent=status||'Customer response not recorded';
    var accepted=history.filter(function(h){return h.status==='accepted';}).length;
    host.innerHTML='<p class="service-note"><b>Next action:</b> '+esc(result.next_action?.label||result.reason||'Review the lead and choose your next action.')+(result.next_action?.due_at?' · '+esc(when(result.next_action.due_at)):'')+'</p><p class="receipt">'+history.length+' reminder record(s) · '+accepted+' provider acceptance receipt(s). Delivery and reading are not established.</p>'+(!result.eligible&&result.reason?'<p class="service-note">Reminder availability: '+esc(result.reason)+'</p>':'')+'<ol class="reminder-history">'+(history.length?history.map(function(h){return '<li><strong>'+esc(stepLabels[h.step]||'Quote reminder')+'</strong><br>'+esc(reminderStatus(h.status))+'</strong><br>'+esc(when(h.accepted_at||h.created_at))+(h.receipt_id?'<br>Provider receipt: <span translate="no">'+esc(h.receipt_id)+'</span>':'')+(h.last_error?'<br>'+esc(h.last_error):'')+'</li>';}).join(''):'<li>No reminder send evidence recorded.</li>')+'</ol><label class="response-label">Customer response · owner recorded<select data-response-status><option value=""'+(!status?' selected':'')+'>Choose a response status</option>'+Object.keys(responseLabels).map(function(key){return '<option value="'+key+'"'+(response?.status===key?' selected':'')+'>'+esc(responseLabels[key])+'</option>';}).join('')+'</select></label><label class="response-label">Private response notes<textarea data-response-note maxlength="1200" rows="3">'+esc(response?.note||'')+'</textarea></label><p class="service-note">These notes are internal. Saving does not send a message, book a call or record payment.</p><button type="button" class="btn ghost" data-save-response>Save customer response</button><p data-response-result role="status" aria-live="polite"></p>';
    host.querySelector('[data-save-response]').onclick=async function(){
      if(this.disabled)return;
      var button=this,choice=host.querySelector('[data-response-status]').value,resultEl=host.querySelector('[data-response-result]');
      if(!responseLabels[choice]){resultEl.textContent='Choose a customer response status first.';return;}
      button.disabled=true;resultEl.textContent='Saving customer response…';
      var saved;
      try{saved=await Hub.api(reminderEndpoint,{method:'POST',body:{op:'update_response',lead_id:article.dataset.lead,status:choice,note:host.querySelector('[data-response-note]').value}});}catch(_error){saved={error:'Could not confirm the response update. Refresh its evidence before retrying.'};}
      button.disabled=false;
      resultEl.textContent=saved?.ok?'Customer response saved. No message was sent.':saved?.error||'Could not save customer response.';
      if(saved?.ok)summary.textContent=responseLabels[choice];
    };
  }
  async function retrieveCustomerState(article,step){
    var result;
    try{result=await Hub.api(reminderEndpoint+'?lead_id='+encodeURIComponent(article.dataset.lead)+(step?'&step='+encodeURIComponent(step):''));}catch(_error){result={error:'Could not retrieve current response evidence.'};}
    renderCustomerState(article,result);return result;
  }
  function securePreview(html){
    return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https://anejocateringco.com data:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; object-src \'none\'"></head><body>'+String(html||'')+'</body></html>';
  }
  function updateSendPermission(){var ready=review&&review.preview_loaded===true&&!review.preview_failed;document.getElementById('reminder-send').disabled=sending||!ready||!document.getElementById('reminder-reviewed').checked;document.getElementById('reminder-reviewed').disabled=sending||!ready;document.getElementById('reminder-step').disabled=sending;}
  function clearPreviewTimer(){if(previewTimer!==null){clearTimeout(previewTimer);previewTimer=null;}}
  async function openReminder(article,step){
    if(sending){Hub.toast('A reminder request is in progress. Wait for its recorded outcome.');return;}
    var sequence=++previewSequence,dialog=document.getElementById('reminder-dialog');
    activeArticle=article;step=stepLabels[step]?step:'review_quote';document.getElementById('reminder-step').value=step;
    clearPreviewTimer();review=null;document.getElementById('reminder-reviewed').checked=false;document.getElementById('reminder-preview-retry').hidden=true;updateSendPermission();
    document.getElementById('reminder-recipient').textContent='Loading recipient…';document.getElementById('reminder-subject').textContent='';
    document.getElementById('reminder-preview').srcdoc=securePreview('');document.getElementById('reminder-text').textContent='';
    document.getElementById('reminder-result').textContent='Retrieving the current quote reminder. No message has been sent.';
    if(!dialog.open)dialog.showModal();
    var result=await retrieveCustomerState(article,step);if(sequence!==previewSequence)return;
    if(!result?.ok||!result.eligible||!result.preview||!result.review_hash){document.getElementById('reminder-result').textContent=result?.reason||result?.error||'This reminder cannot be sent right now.';return;}
    document.getElementById('reminder-recipient').textContent=result.preview.to||'Recipient unavailable';
    document.getElementById('reminder-subject').textContent=result.preview.subject||'';
    document.getElementById('reminder-text').textContent=result.preview.text||'';
    if(!result.preview.to||!result.preview.html){document.getElementById('reminder-result').textContent='Recipient or rendered preview is missing. Sending is disabled.';return;}
    review={lead_id:article.dataset.lead,review_hash:result.review_hash,quote_id:result.quote_id,step:step,article:article,preview_loaded:false,preview_failed:false,preview_sequence:sequence};
    var frame=document.createElement('iframe');frame.id='reminder-preview';frame.title='Actual quote reminder email preview';frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');
    function currentFrame(){return sequence===previewSequence&&review&&review.preview_sequence===sequence&&document.getElementById('reminder-preview')===frame;}
    function failedPreview(){
      if(!currentFrame()||review.preview_loaded)return;
      clearPreviewTimer();review.preview_failed=true;document.getElementById('reminder-reviewed').checked=false;updateSendPermission();document.getElementById('reminder-preview-retry').hidden=false;
      document.getElementById('reminder-result').textContent='The rendered email preview could not be confirmed. Sending stays disabled. Plain text is available above; use Retry email preview to review the HTML before approving.';
    }
    // A new frame per token prevents an older srcdoc/about:blank load from approving this step.
    // Attach listeners before assigning srcdoc and inserting the frame.
    frame.addEventListener('load',function(){
      if(!currentFrame()||review.preview_failed)return;
      clearPreviewTimer();review.preview_loaded=true;document.getElementById('reminder-reviewed').checked=false;updateSendPermission();document.getElementById('reminder-result').textContent='Email preview loaded. Review the actual recipient, subject and rendered email, then check the approval box for one manual send.';
    });
    frame.addEventListener('error',failedPreview);
    document.getElementById('reminder-result').textContent='Loading the actual email preview. Approval stays disabled until this preview finishes loading.';
    frame.srcdoc=securePreview(result.preview.html);document.getElementById('reminder-preview').replaceWith(frame);
    previewTimer=setTimeout(failedPreview,12000);updateSendPermission();
  }
  async function sendReminder(){
    if(sending||!review||!review.preview_loaded||review.preview_failed||!document.getElementById('reminder-reviewed').checked)return;
    var approved=review;sending=true;updateSendPermission();
    document.getElementById('reminder-result').textContent='Submitting this reviewed reminder once…';
    var result;
    try{result=await Hub.api(reminderEndpoint,{method:'POST',body:{op:'send',lead_id:approved.lead_id,review_hash:approved.review_hash,reviewed:true,step:approved.step}});}catch(_error){result={status:'unknown'};}
    sending=false;review=null;document.getElementById('reminder-reviewed').checked=false;updateSendPermission();
    var status=result?.status||(result?._networkError?'unknown':null);
    document.getElementById('reminder-result').textContent=(status?reminderStatus(status):result?.error||'Send outcome not verified. Refresh history before taking another action.')+(result?.receipt_id?' · Provider receipt: '+result.receipt_id:'')+(result?.replayed?' · Existing outcome returned; no second send.':'')+(result?.error?' · '+result.error:'');
    await retrieveCustomerState(approved.article);
  }
  function renderOverview(overview){
    var host=document.getElementById('funnel-overview');
    if(!overview){host.textContent='Conversion summary unavailable — current evidence not loaded.';return;}
    var fields=[['requests','Inquiries'],['quotes_sent','Quotes sent'],['responses_recorded','Responses recorded'],['deposits_paid','Paid deposits'],['owner_marked_won','Owner marked won']];
    host.innerHTML='<p class="service-note">'+esc(overview.scope||'Summary scope not recorded')+'</p><div class="funnel-grid">'+fields.map(function(field){var n=overview[field[0]];return '<div class="funnel-count"><b>'+esc(typeof n==='number'&&Number.isFinite(n)?String(n):'—')+'</b><span>'+esc(field[1])+'</span></div>';}).join('')+'</div><p class="service-note">Responses are owner-recorded. Owner-marked wins are separate from verified paid deposits. These counts do not establish email opens or link clicks.</p>';
  }
  async function load(){
    var r=await Hub.api(endpoint);if(!r?.ok){document.getElementById('status').textContent=r?.error||'Could not load follow-up records.';return;}
    data=r;renderOverview(r.overview);var leads=r.leads||[];leads.sort(function(a,b){return Number(b.followup_overdue)-Number(a.followup_overdue)||b.created_at-a.created_at;});
    document.getElementById('status').textContent=leads.filter(function(l){return l.followup_overdue;}).length+' follow-ups due · refreshed '+new Date().toLocaleTimeString((window.AnejoLang && window.AnejoLang.get() === 'es' ? 'es-US' : 'en-US'));
    document.getElementById('leads').innerHTML=leads.length?leads.map(card).join(''):'<div class="card">No catering inquiries yet.</div>';
    document.getElementById('preview-en').srcdoc=r.template.en.html;document.getElementById('preview-es').srcdoc=r.template.es.html;
    document.getElementById('ack-state').textContent=r.config.ack_enabled?'Enabled for requests received after '+when(r.config.activated_at):'Disabled — awaiting your template review.';
    document.querySelectorAll('[data-lead]').forEach(function(article){var id=article.dataset.lead;
      var sync=article.querySelector('[data-sync]');if(sync)sync.onclick=async function(){this.disabled=true;var result=await Hub.api('/api/hub/owner/catering-messages-sync',{method:'POST',body:{quote_id:this.dataset.sync}});this.disabled=false;Hub.toast(result?.ok?'Actual provider text synced — no new message sent':result?.error||(result?._status?'Receipt lookup unavailable (HTTP '+result._status+'). No new text was sent.':'Could not verify text receipt. No new text was sent.'));};
      article.querySelector('[data-conversation]').onclick=async function(){this.disabled=true;var result=await Hub.api(endpoint,{method:'POST',body:{op:'open_conversation',lead_id:id}});if(result?.ok)location.href=result.url;else{this.disabled=false;Hub.toast(result?.error||'Could not open messages');}};
      article.querySelector('[data-review-reminder]').onclick=function(){return openReminder(article);};
      var details=article.querySelector('[data-response-details]');details.addEventListener('toggle',function(){if(details.open&&!details.dataset.loaded){details.dataset.loaded='true';retrieveCustomerState(article);}});
      article.querySelector('form').onsubmit=async function(e){e.preventDefault();var f=e.target,btn=f.querySelector('button');btn.disabled=true;var payload={op:'update_followup',lead_id:id,state:f.elements.state.value,note:f.elements.note.value};if(f.elements.next.value!==f.elements.next.dataset.original)payload.next_followup_at=f.elements.next.value?new Date(f.elements.next.value).getTime():null;var r=await Hub.api(endpoint,{method:'POST',body:payload});btn.disabled=false;if(r?.ok){Hub.toast('Follow-up recorded');load();}else Hub.toast(r?.error||'Could not save');};
    });
  }
  async function configure(enabled){
    if(enabled&&!document.getElementById('reviewed').checked){document.getElementById('ack-result').textContent='Review both previews and check the approval box first.';return;}
    var r=await Hub.api(endpoint,{method:'POST',body:{op:'configure_ack',enabled:enabled,reviewed_template_version:data?.template.version}});
    document.getElementById('ack-result').textContent=r?.ok?r.scope:r?.error||'Could not save';if(r?.ok)load();
  }
  document.getElementById('reminder-reviewed').onchange=updateSendPermission;
  document.getElementById('reminder-preview-retry').onclick=function(){if(activeArticle)return openReminder(activeArticle,document.getElementById('reminder-step').value);};
  document.getElementById('reminder-step').onchange=function(){if(activeArticle)return openReminder(activeArticle,this.value);};
  document.getElementById('reminder-send').onclick=sendReminder;
  document.getElementById('reminder-close').onclick=function(){++previewSequence;clearPreviewTimer();review=null;document.getElementById('reminder-dialog').close();updateSendPermission();};
  document.getElementById('reminder-dialog').addEventListener('cancel',function(){++previewSequence;clearPreviewTimer();review=null;updateSendPermission();});
  document.getElementById('refresh').onclick=load;document.getElementById('enable').onclick=function(){configure(true);};document.getElementById('disable').onclick=function(){configure(false);};
  Owner.init('catering',load);
})();
