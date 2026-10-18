(function(){
  'use strict';
  var endpoint='/api/hub/owner/callbacks',Hub=window.Hub;
  function esc(x){return Hub.esc(String(x==null?'':x));}
  async function load(){
    var r=await Hub.api(endpoint),status=document.getElementById('status');
    if(!r||!r.ok){status.textContent=r&&r.error||'Could not load callback requests.';return;}
    document.getElementById('settings').elements.duration.value=r.settings&&r.settings.duration_minutes||'';
    document.getElementById('settings').elements.availability.value=r.settings&&r.settings.availability_note||'';
    status.textContent=r.requests.length+' preferred time request'+(r.requests.length===1?'':'s')+'. No automatic calendar bookings are confirmed.';
    var target=document.getElementById('requests');target.replaceChildren();
    r.requests.forEach(function(row){
      var card=document.createElement('article');card.className='callback-card';
      var when=new Date(row.requested_start_at).toLocaleString('en-US',{timeZone:'America/New_York',weekday:'long',month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
      var state=row.status==='requested'?'Awaiting confirmation':row.status==='canceled'?'Canceled':'Needs review';
      card.innerHTML='<span class="callback-state">'+esc(state)+'</span><h3>'+esc(when)+' · Eastern</h3><p>'+esc(row.customer_name)+' · Event '+esc(row.event_date||'not set')+'</p><div class="callback-actions"><a href="tel:'+esc(row.phone)+'">Call '+esc(row.phone)+'</a><a href="/hub/owner/catering.html">Open catering desk</a></div><form class="callback-form"><label>Request state<select name="state"><option value="requested">Awaiting confirmation</option><option value="needs_review">Needs review</option><option value="canceled">Canceled</option></select></label><label>Internal note<textarea name="note" rows="2">'+esc(row.owner_note||'')+'</textarea></label><button class="btn gold" type="submit">Save request</button></form>';
      var form=card.querySelector('form');form.elements.state.value=row.status;
      form.onsubmit=async function(e){e.preventDefault();var btn=form.querySelector('button');btn.disabled=true;var result=await Hub.api(endpoint,{method:'POST',body:{op:'update',id:row.id,status:form.elements.state.value,note:form.elements.note.value}});btn.disabled=false;Hub.toast(result&&result.ok?'Request updated':result&&result.error||'Could not save');if(result&&result.ok)load();};
      target.appendChild(card);
    });
  }
  document.getElementById('refresh').onclick=load;
  document.getElementById('settings').onsubmit=async function(e){e.preventDefault();var f=e.target,b=f.querySelector('button');b.disabled=true;var r=await Hub.api(endpoint,{method:'POST',body:{op:'settings',duration_minutes:f.elements.duration.value,availability_note:f.elements.availability.value}});b.disabled=false;Hub.toast(r&&r.ok?'Planning preferences saved; booking remains disconnected':r&&r.error||'Could not save');};
  window.Owner.init('catering',load);
})();
