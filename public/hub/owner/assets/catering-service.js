(function(){
  Hub.boot();
  var endpoint='/api/hub/owner/catering-service',esc=Hub.esc,data;
  var phases={new:'Needs first contact',contacted:'Contacted · follow-up planned',awaiting_deposit:'Quote sent · deposit pending',booked:'Deposit recorded · booked',lost:'Closed · not proceeding',owner_won:'Owner marked won · payment not verified'};
  function when(t){return t?new Date(t).toLocaleString(): 'Not recorded';}
  function card(l){
    var state=l.state||'open',receipt=l.notifications.map(function(n){return esc(n.channel==='hub'?'Owner Hub alert': 'Owner email')+': '+esc(n.status==='accepted'?'accepted — receipt recorded':n.status)+(n.last_error?' · '+esc(n.last_error):'');}).join('<br>');
    return '<article class="lead '+(l.followup_overdue?'overdue':'')+'" data-lead="'+esc(l.id)+'"><h3>'+esc(l.name)+'</h3><div class="lead-meta"><b>'+esc(phases[l.phase]||l.phase)+'</b><span>Received '+esc(when(l.created_at))+'</span><span>'+esc(l.event.event_date||'Date to confirm')+' · '+esc(String(l.event.guests||'—'))+' guests</span></div><p class="service-note">'+(l.followup_overdue?'Call or respond now.':'Next follow-up: '+esc(when(l.followup_due_at)))+'</p><div class="actions">'+(l.phone?'<a class="btn gold" href="tel:'+esc(l.phone)+'">Call '+esc(l.phone)+'</a>':'')+'<button class="btn ghost" type="button" data-conversation>Open messages</button><a class="btn ghost" href="/hub/owner/catering.html?lead='+encodeURIComponent(l.id)+'">Request &amp; quote</a></div><details><summary>Contact and delivery evidence</summary><p>'+esc(l.email||'No email')+'</p><div class="receipt">'+(receipt||'Owner notification evidence unavailable')+'<br>Customer acknowledgement: '+esc(l.acknowledgement_status||'not recorded')+(l.acknowledgement_error?' · '+esc(l.acknowledgement_error):'')+'<br>Provider acceptance does not establish that the recipient read the message.</div></details><form class="service-grid" style="margin-top:18px"><label>Status<select name="state">'+[['open','Needs contact'],['contacted','Contacted'],['won','Closed — owner marked won'],['lost','Closed — not proceeding']].map(function(o){return '<option value="'+o[0]+'"'+(state===o[0]?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select></label><label>Next follow-up<input name="next" type="datetime-local"></label><label class="wide">Call notes / next action<textarea name="note" rows="2">'+esc(l.note||'')+'</textarea></label><button type="submit" class="btn gold">Save follow-up</button></form></article>';
  }
  async function load(){
    var r=await Hub.api(endpoint);if(!r?.ok){document.getElementById('status').textContent=r?.error||'Could not load follow-up records.';return;}
    data=r;var leads=r.leads||[];leads.sort(function(a,b){return Number(b.followup_overdue)-Number(a.followup_overdue)||b.created_at-a.created_at;});
    document.getElementById('status').textContent=leads.filter(function(l){return l.followup_overdue;}).length+' follow-ups due · refreshed '+new Date().toLocaleTimeString();
    document.getElementById('leads').innerHTML=leads.length?leads.map(card).join(''):'<div class="card">No catering inquiries yet.</div>';
    document.getElementById('preview-en').srcdoc=r.template.en.html;document.getElementById('preview-es').srcdoc=r.template.es.html;
    document.getElementById('ack-state').textContent=r.config.ack_enabled?'Enabled for requests received after '+when(r.config.activated_at):'Disabled — awaiting your template review.';
    document.querySelectorAll('[data-lead]').forEach(function(article){var id=article.dataset.lead;
      article.querySelector('[data-conversation]').onclick=async function(){this.disabled=true;var result=await Hub.api(endpoint,{method:'POST',body:{op:'open_conversation',lead_id:id}});if(result?.ok)location.href=result.url;else{this.disabled=false;Hub.toast(result?.error||'Could not open messages');}};
      article.querySelector('form').onsubmit=async function(e){e.preventDefault();var f=e.target,btn=f.querySelector('button');btn.disabled=true;var r=await Hub.api(endpoint,{method:'POST',body:{op:'update_followup',lead_id:id,state:f.elements.state.value,note:f.elements.note.value,next_followup_at:f.elements.next.value?new Date(f.elements.next.value).getTime():null}});btn.disabled=false;if(r?.ok){Hub.toast('Follow-up recorded');load();}else Hub.toast(r?.error||'Could not save');};
    });
  }
  async function configure(enabled){
    if(enabled&&!document.getElementById('reviewed').checked){document.getElementById('ack-result').textContent='Review both previews and check the approval box first.';return;}
    var r=await Hub.api(endpoint,{method:'POST',body:{op:'configure_ack',enabled:enabled,reviewed_template_version:data?.template.version}});
    document.getElementById('ack-result').textContent=r?.ok?r.scope:r?.error||'Could not save';if(r?.ok)load();
  }
  document.getElementById('refresh').onclick=load;document.getElementById('enable').onclick=function(){configure(true);};document.getElementById('disable').onclick=function(){configure(false);};
  Owner.init('catering',load);
})();
