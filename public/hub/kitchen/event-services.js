(function(){
 'use strict';
 var endpoint='/api/hub/kitchen/event-services',sequence=0;
 function el(tag,text){var n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
 function button(text,fn){var b=el('button',text);b.type='button';b.className='btn ghost';b.onclick=fn;return b;}
 function field(host,text,type,value){var l=el('label',text),i=el('input');i.type=type;i.value=value||'';l.appendChild(i);host.appendChild(l);return i;}
 function section(host,title){var d=el('details'),s=el('summary',title);d.appendChild(s);host.appendChild(d);return d;}
 function local(t){if(!t)return '';var date=new Date(t);return new Date(date-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
 async function load(opts){
  var seq=++sequence,qid=opts.quoteId,host=document.getElementById('event-services');if(!host)return;host.hidden=false;host.classList.add('ev-services');
  var state=el('p','Loading event services…');state.setAttribute('role','status');host.replaceChildren(state);
  try{
   var r=await Hub.api(endpoint+'?quote_id='+encodeURIComponent(qid));if(seq!==sequence)return;if(!r?.ok)throw Error(r?.error||'Event services unavailable.');host.replaceChildren();
   async function save(b,btn){btn.disabled=true;state.textContent='Saving…';try{var result=await Hub.api(endpoint,{method:'POST',body:{...b,quote_id:qid}});if(!result?.ok)throw Error(result?.error||'Not saved.');await load(opts);}catch(e){state.textContent=e.message;btn.disabled=false;}}
   var c=section(host,'Kitchen reservation'),cv=r.calendar||{},booking=cv.reservation;
   c.appendChild(el('p',booking?'Hours: '+new Date(booking.start_at).toLocaleString()+' – '+new Date(booking.end_at).toLocaleTimeString()+' · '+booking.status.replaceAll('_',' '):'No kitchen hours reserved.'));
   if(booking?.error)c.appendChild(el('p',booking.error));if(cv.reason)c.appendChild(el('p',cv.reason));
   var times=el('div');times.className='es-fields';c.appendChild(times);var start=field(times,'Start · your local time','datetime-local',local(booking?.start_at)),end=field(times,'Finish · your local time','datetime-local',local(booking?.end_at));
   if(!booking||['draft','needs_review'].includes(booking.status)){
    var draft=button('Save proposed hours',function(){save({op:'save_hours',start_at:Date.parse(start.value),end_at:Date.parse(end.value),expected_version:booking?.version||0},draft);});c.appendChild(draft);
   }
   if(r.owner&&booking?.status==='draft'){
    var approve=button('Approve & reserve kitchen',function(){save({op:'approve_hours',expected_version:booking.version},approve);});approve.disabled=!cv.ready;c.appendChild(approve);
   }
   if(booking?.provider_verified_at)c.appendChild(el('small','Calendar readback saved '+new Date(booking.provider_verified_at).toLocaleString()));
   if(r.owner){var config=section(c,'⋯ Calendar destination');config.appendChild(el('p','Use the calendar where the kitchen accepts reservations. A personal reminder does not reserve kitchen space.'));var target=field(config,'Kitchen calendar ID','text',cv.settings?.calendar_id);var dest=button('Confirm reservation destination',function(){save({op:'calendar_destination',calendar_id:target.value.trim(),confirm_destination:true},dest);});config.appendChild(dest);}
   var labels=section(host,'Labels & table signs'),ld=r.labels;
   labels.appendChild(el('p',ld?(ld.stale?'Menu changed · regenerate labels':ld.approved_at?'Owner-reviewed · ready to print':'Draft ready · review layouts'):'Generate matching bands, rounds and standing signs from this event’s menu.'));
   var form=el('div');form.className='es-fields';labels.appendChild(form);var theme=el('select');Object.entries(r.themes||{}).forEach(function(pair){var option=el('option',pair[1].name);option.value=pair[0];theme.appendChild(option);});theme.value=ld?.theme||'signature';var tl=el('label','Style');tl.appendChild(theme);form.appendChild(tl);var title=field(form,'Celebration wording','text',ld?.snapshot?.title||'');title.maxLength=80;
   var generate=button(ld?'Update label draft':'Generate label draft',function(){save({op:'draft_labels',theme:theme.value,title:title.value,expected_version:ld?.version||0},generate);});labels.appendChild(generate);
   var seen={};
   if(ld&&!ld.stale){['bands','rounds','tents'].forEach(function(format){var a=el('a',format==='bands'?'11 × 17 belly bands':format==='rounds'?'3-inch Avery rounds':'Standing table signs');a.href=endpoint+'?quote_id='+encodeURIComponent(qid)+'&format='+format;a.target='_blank';a.rel='noopener';a.className='btn ghost';a.onclick=function(){seen[format]=true;};labels.appendChild(a);});if(r.owner&&!ld.approved_at){var reviewed=field(labels,' I reviewed all three current layouts','checkbox');var accept=button('Approve label layouts',function(){if(!reviewed.checked||!seen.bands||!seen.rounds||!seen.tents){state.textContent='Open and review all three layouts, then confirm the checkbox.';return;}save({op:'approve_labels',expected_version:ld.version,reviewed:true},accept);});labels.appendChild(accept);}}
   if(r.owner){var messages=section(host,'Client communication'),m=r.communications;messages.appendChild(el('p',m.settings?.enabled?'Delivery updates enabled for future recorded driver actions.':'Delivery update templates await owner review.'));
    (m.messages||[]).forEach(function(x){messages.appendChild(el('p',x.kind.replaceAll('_',' ')+' · '+x.channel+' · '+(x.carrier_status||x.email_status||x.status)+(x.error?' · '+x.error:'')));});
    var sync=button('Check email delivery receipts',async function(){sync.disabled=true;try{var checked=await Hub.api(endpoint+'?quote_id='+encodeURIComponent(qid)+'&receipts=1');if(!checked?.ok)throw Error(checked?.error||'Receipt check unavailable.');await load(opts);}catch(e){state.textContent=e.message;sync.disabled=false;}});messages.appendChild(sync);
    var preview=section(messages,'Review English / Spanish templates'),loaded=0;
    (m.previews||[]).forEach(function(p){var item=section(preview,p.lang.toUpperCase()+' · '+p.kind.replaceAll('_',' '));item.appendChild(el('p',p.subject));var frame=el('iframe');frame.title=p.lang+' '+p.kind+' branded email preview';frame.sandbox='';frame.referrerPolicy='no-referrer';frame.onload=function(){loaded++;};frame.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'+p.html;item.appendChild(frame);item.appendChild(el('p','SMS: '+p.sms));});
    var review=field(preview,' I reviewed all four branded emails and corresponding SMS messages','checkbox');var activate=button(m.settings?.enabled?'Save reviewed templates':'Enable future delivery updates',function(){if(!review.checked||loaded!==m.previews.length){state.textContent='Review the loaded previews and SMS text before enabling.';return;}save({op:'communications',enable:true,reviewed:true,template_version:m.template_version},activate);});preview.appendChild(activate);
    if(m.settings?.enabled){var stop=button('Pause delivery updates',function(){save({op:'communications',enable:false,reviewed:true,template_version:m.template_version},stop);});preview.appendChild(stop);}
   }
   state.textContent='';host.appendChild(state);
  }catch(e){if(seq===sequence)state.textContent=e.message;}
 }
 var css=document.createElement('style');css.textContent='.ev-services>details{border:1px solid var(--line);background:white;border-radius:16px;margin:12px 0;padding:18px}.ev-services summary{cursor:pointer;font-weight:650;min-height:32px}.ev-services p{font-size:14px;line-height:1.5;color:var(--muted)}.ev-services details details{margin:16px 0}.ev-services .btn{margin:8px 8px 0 0;min-height:44px}.es-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:16px 0}.ev-services label{display:block;font-size:13px;color:var(--green);margin:10px 0}.ev-services input:not([type=checkbox]),.ev-services select{display:block;width:100%;font:inherit;font-size:16px;border:1px solid var(--line);border-radius:10px;padding:12px;margin-top:6px}.ev-services iframe{display:block;width:100%;height:420px;border:1px solid var(--line);border-radius:12px}.ev-services input[type=checkbox]{width:22px;height:22px;vertical-align:middle;margin-right:8px}.ev-services :focus-visible{outline:3px solid var(--gold);outline-offset:3px}';document.head.appendChild(css);
 window.EventServices={load:load};
})();
