/* Owner-reviewed event care: preparing a preview is separate from approving a trigger or send. */
(function(){
  'use strict';
  var endpoint='/api/hub/owner/catering-experience',dialog=null,sequence=0,current=null,busy=false;
  var labels={pre_event_checkin:'Before the event · service check-in',post_delivery_review:'After delivery · honest feedback'};
  function el(tag,text,className){var node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node;}
  function byId(id){return document.getElementById(id);}
  function ensure(){
    if(dialog)return;
    dialog=el('dialog',null,'q-collection-dialog q-experience-dialog');dialog.id='q-experience-dialog';dialog.setAttribute('aria-labelledby','q-experience-title');
    var top=el('div',null,'q-collection-top'),title=el('h2','Event care & follow-up');title.id='q-experience-title';top.appendChild(title);
    var close=el('button','Close','btn ghost');close.type='button';close.id='q-experience-close';close.onclick=function(){if(busy)return;sequence++;current=null;dialog.close();};top.appendChild(close);dialog.appendChild(top);
    dialog.appendChild(el('p','Review the actual branded emails below. Staging sends nothing. Approve each future trigger separately, or explicitly send an eligible message once.'));
    var context=el('p');context.id='q-experience-context';dialog.appendChild(context);
    var status=el('p');status.id='q-experience-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');dialog.appendChild(status);
    var messages=el('div');messages.id='q-experience-messages';dialog.appendChild(messages);
    var feedback=el('section');feedback.id='q-experience-feedback';dialog.appendChild(feedback);
    var refresh=el('button','Refresh saved status','btn ghost');refresh.id='q-experience-refresh';refresh.type='button';refresh.onclick=function(){if(current&&!busy)open(current.quoteId,true);};dialog.appendChild(refresh);
    dialog.addEventListener('cancel',function(event){if(busy){event.preventDefault();return;}sequence++;current=null;});document.body.appendChild(dialog);
  }
  function permissions(){
    if(!current)return;byId('q-experience-close').disabled=busy;byId('q-experience-refresh').disabled=busy;
    current.cards.forEach(function(card){
      var ready=card.loaded&&card.message.review_hash&&!card.locked;
      card.review.disabled=busy||!ready;card.send.disabled=busy||!ready||!card.review.checked||!card.message.send_eligible;
      card.futureReview.disabled=busy||!ready||Boolean(card.message.approved_at);card.approve.disabled=busy||!ready||!card.futureReview.checked||Boolean(card.message.approved_at);
    });
  }
  function recordText(message){
    return 'Saved state: '+String(message.status||'unverified')+(message.approved_at?' · Future trigger approved '+new Date(message.approved_at).toLocaleString():' · Future trigger not approved')+(message.receipt_id?' · Provider receipt: '+message.receipt_id:'')+(message.status==='accepted'?'. Provider acceptance is recorded; delivery and reading are not established.':'');
  }
  function addPreview(card,host,seq){
    var iframe=el('iframe');iframe.title='Actual branded Añejo '+labels[card.message.kind]+' email';iframe.setAttribute('sandbox','');iframe.referrerPolicy='no-referrer';host.appendChild(iframe);
    var textDetails=el('details'),summary=el('summary','Plain-text email'),text=el('pre',card.message.text||'');textDetails.appendChild(summary);textDetails.appendChild(text);host.appendChild(textDetails);
    var finished=false,timer=setTimeout(function(){finish(false);},15000);
    function finish(ok){if(finished)return;finished=true;clearTimeout(timer);if(seq!==sequence||!current)return;card.loaded=ok;card.previewState.textContent=ok?'Rendered email loaded. Review it before enabling a trigger or sending.':'The preview could not load. Approval and sending remain disabled.';permissions();}
    iframe.addEventListener('load',function(){finish(true);},{once:true});iframe.addEventListener('error',function(){finish(false);},{once:true});
    iframe.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'; font-src https: data:; base-uri \'none\'; form-action \'none\'">'+card.message.html;
  }
  function render(result,seq){
    var quote=result.quote||{},host=byId('q-experience-messages');host.textContent='';
    byId('q-experience-context').textContent=(quote.customer_name||'Saved catering booking')+' · '+(quote.event_date||'Event date not recorded')+' · '+(quote.customer_email||'Recipient shown on each email below');
    current.cards=[];
    (result.messages||[]).forEach(function(message){
      if(!labels[message.kind])return;
      var section=el('section',null,'q-experience-message');section.dataset.kind=message.kind;
      section.appendChild(el('h3',labels[message.kind]));section.appendChild(el('p','To: '+(message.recipient||'No saved recipient')));section.appendChild(el('p','Subject: '+(message.subject||'Preview not available')));
      section.appendChild(el('p',recordText(message),'row-sub'));
      if(message.trigger)section.appendChild(el('p','Approved timing: '+message.trigger,'row-sub'));
      if(message.reason)section.appendChild(el('p',message.reason,'q-editor-status'));
      var card={message:message,loaded:false,locked:['accepted','sending','unknown','suppressed'].includes(message.status)};
      card.previewState=el('p','Loading the rendered email…','row-sub');card.previewState.setAttribute('role','status');section.appendChild(card.previewState);
      var preview=el('div',null,'q-experience-preview');section.appendChild(preview);
      var label=el('label',null,'q-experience-consent');card.review=el('input');card.review.type='checkbox';card.review.disabled=true;label.appendChild(card.review);label.appendChild(document.createTextNode(' I reviewed the recipient, subject and full rendered email and approve this one send.'));section.appendChild(label);
      card.send=el('button','Send this reviewed email once','btn gold');card.send.type='button';card.send.disabled=true;card.send.dataset.experienceSend=message.kind;section.appendChild(card.send);
      var future=el('label',null,'q-experience-consent');card.futureReview=el('input');card.futureReview.type='checkbox';card.futureReview.disabled=true;future.appendChild(card.futureReview);future.appendChild(document.createTextNode(message.kind==='post_delivery_review'?' I approve this email to be sent once after this event is recorded as delivered.':' I approve this email to be sent once when this event’s pre-event check-in is due.'));section.appendChild(future);
      card.approve=el('button',message.approved_at?'Future trigger already approved':'Enable this future trigger for this event','btn ghost');card.approve.type='button';card.approve.disabled=true;card.approve.dataset.experienceApprove=message.kind;section.appendChild(card.approve);
      card.out=el('p');card.out.setAttribute('role','status');card.out.setAttribute('aria-live','polite');section.appendChild(card.out);
      card.review.onchange=permissions;card.futureReview.onchange=permissions;card.send.onclick=function(){act(card,'send');};card.approve.onclick=function(){act(card,'approve');};
      current.cards.push(card);host.appendChild(section);
      if(message.html&&message.review_hash&&message.recipient)addPreview(card,preview,seq);else card.previewState.textContent='A complete saved preview is required. Nothing can send from this card.';
    });
    if(!current.cards.length)host.appendChild(el('p','No message previews are available for this booking.'));
    var feedback=byId('q-experience-feedback');feedback.textContent='';feedback.appendChild(el('h3','Feedback saved with this event'));
    if(!(result.feedback||[]).length)feedback.appendChild(el('p','No feedback has been recorded yet.','row-sub'));
    (result.feedback||[]).forEach(function(row){var record=el('article',null,'q-experience-response');record.appendChild(el('p',(labels[row.kind]||'Event feedback')+(row.created_at?' · '+new Date(row.created_at).toLocaleString():'')));record.appendChild(el('p',[row.mood||'',row.rating!=null?row.rating+'/10':'',row.would_again===true||row.would_again===1?'Would choose Añejo again':row.would_again===false||row.would_again===0?'Would not choose Añejo again':''].filter(Boolean).join(' · ')));if(row.comment)record.appendChild(el('p',row.comment));feedback.appendChild(record);});
    var runtime=result.runtime;
    feedback.appendChild(el('p',runtime?.last_success?'Scheduler last recorded success: '+new Date(runtime.last_success).toLocaleString()+'. This timestamp does not prove a future send.':'No scheduler success has been recorded for these service follow-ups.','row-sub'));
    if(runtime?.last_error)feedback.appendChild(el('p','Latest scheduler error: '+runtime.last_error,'row-sub'));
    permissions();
  }
  async function open(quoteId,refreshOnly){
    ensure();if(busy)return;var seq=++sequence;current={quoteId:quoteId,cards:[]};byId('q-experience-messages').textContent='';byId('q-experience-feedback').textContent='';byId('q-experience-context').textContent='';byId('q-experience-status').textContent=refreshOnly?'Reading saved event-care status…':'Staging event-care email previews. Nothing is being sent…';if(!dialog.open)dialog.showModal();permissions();
    try{var result=refreshOnly?await Hub.api(endpoint+'?quote_id='+encodeURIComponent(quoteId)):await Hub.api(endpoint,{method:'POST',body:{op:'stage',quote_id:quoteId}});if(seq!==sequence)return;if(!result?.ok)throw Error(result?.error||'The event-care previews could not be loaded.');render(result,seq);byId('q-experience-status').textContent='These are saved previews and statuses. Opening this screen did not send an email.';}
    catch(error){if(seq===sequence)byId('q-experience-status').textContent=error.message+' Nothing was sent by opening this screen.';}
  }
  async function act(card,op){
    if(busy||!current||!card.loaded||card.locked)return;if(op==='send'&&(!card.review.checked||!card.message.send_eligible))return;if(op==='approve'&&(!card.futureReview.checked||card.message.approved_at))return;
    var seq=sequence,snapshot=current;busy=true;permissions();card.out.textContent=op==='send'?'Sending this reviewed email once…':'Saving the reviewed future-trigger approval…';
    try{var result=await Hub.api(endpoint,{method:'POST',body:{op:op,quote_id:snapshot.quoteId,kind:card.message.kind,review_hash:card.message.review_hash,reviewed:true,...(op==='approve'?{enable:true}:{})}});if(seq!==sequence)return;
      if(op==='send'){
        card.locked=true;card.review.checked=false;card.out.textContent=result?.ok&&result.provider_accepted?'The email provider accepted this message'+(result.receipt_id?' · receipt '+result.receipt_id:'')+'. Delivery and reading are not verified.':(result?.error||'The send outcome is unverified.')+' Sending stays locked. Refresh the saved receipt before any further action.';
      }else{
        var saved=(result?.messages||[]).find(function(message){return message.kind===card.message.kind;});if(!result?.ok||!saved?.approved_at)throw Error(result?.error||'Saved approval could not be verified. Refresh to inspect its status.');card.message=saved;card.approve.textContent='Future trigger approved';card.out.textContent='This event’s future trigger is approved. This approval did not send an email.';
      }
    }catch(error){if(seq!==sequence)return;if(op==='send'){card.locked=true;card.out.textContent='The send outcome is unverified. Sending stays locked; refresh the saved receipt.';}else card.out.textContent=error.message;}
    finally{busy=false;if(seq===sequence)permissions();}
  }
  window.CateringLifecycle={open:open};
})();
