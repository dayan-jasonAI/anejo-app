/* Owner-only assignment desk; no dispatch, notification or payroll calls. */
(function(){
 'use strict';
 var state=null,quoteId=null,busy=false,pending=null,changed=null,generation=0,actorId=null,canEdit=false,refreshQueued=false;
 var es=false;try{es=localStorage.getItem('anejo:lang')==='es';}catch(ignore){}
 var text=function(en,sp){return es?sp:en;};
 var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
 var key=function(){if(!actorId)throw new Error(text('Could not verify assignment account. Refresh before saving.','No se pudo verificar la cuenta. Actualiza antes de guardar.'));return 'anejo-catering-assignment:'+actorId+':'+quoteId;};
 function store(){if(pending)sessionStorage.setItem(key(),JSON.stringify(pending));else sessionStorage.removeItem(key());}
 function render(message){
  var el=document.getElementById('driver-assignment-panel');if(!el)return;
  var h='<h3>'+text('Catering driver','Chofer de catering')+'</h3><p class="row-sub">'+text('Assignments appear in the driver Hub. No alert or customer message is sent; driver pay is not calculated here.','Las asignaciones aparecen en el Hub del chofer. No se envían avisos ni mensajes al cliente; aquí no se calcula el pago del chofer.')+'</p>';
  if(message)h+='<p role="status" class="gap">'+esc(message)+'</p>';
  if(!state){el.innerHTML=h;return;}
  var a=state.assignment,e=state.execution;
  var activeAssignment=a&&['assigned','accepted'].includes(a.status);
  var assignedDriver=a&&(state.drivers||[]).find(function(d){return d.id===a.driver_id;});
  if(state.blockers&&state.blockers.length)h+='<ul class="gap">'+state.blockers.map(function(b){return '<li>'+esc(b)+'</li>';}).join('')+'</ul>';
  if(a)h+='<p>'+esc(a.driver_name||(assignedDriver&&assignedDriver.name)||a.driver_id)+' · '+esc(a.status)+'</p>';
  if(pending)h+='<button class="btn" id="assignment-retry"'+(busy?' disabled':'')+'>'+text('Resolve previous save','Resolver guardado anterior')+'</button>';
  else if((activeAssignment||!(state.blockers&&state.blockers.length))&&e&&e.delivery_mode==='staff_driver'&&['planned','preparing','ready'].includes(e.status)){
   if(!a||!['assigned','accepted'].includes(a.status))h+='<form id="assignment-form"><label for="assignment-driver">'+text('Driver','Chofer')+'</label><select id="assignment-driver" required><option value="">'+text('Choose a driver','Selecciona un chofer')+'</option>'+(state.drivers||[]).map(function(d){return '<option value="'+esc(d.id)+'">'+esc(d.name)+(d.available?'':' · '+text('availability unconfirmed','disponibilidad sin confirmar'))+'</option>';}).join('')+'</select><button class="btn" type="submit"'+(busy?' disabled':'')+'>'+text('Assign in Hub','Asignar en el Hub')+'</button></form>';
   else h+='<form id="assignment-release"><label for="assignment-reason">'+text('Reason to release this assignment','Motivo para liberar esta asignación')+'</label><input id="assignment-reason" required maxlength="1000"><button class="btn ghost" type="submit"'+(busy?' disabled':'')+'>'+text('Release assignment','Liberar asignación')+'</button></form>';
  }else if(!a)h+='<p>'+text('Choose Staff driver in the execution plan to assign a driver.','Elige Chofer del equipo en el plan para asignar un chofer.')+'</p>';
  h+='<button class="btn ghost" id="assignment-refresh"'+(busy?' disabled':'')+'>'+text('Refresh assignment','Actualizar asignación')+'</button>';
  el.innerHTML=h;
  var n=document.getElementById('assignment-refresh');if(n)n.onclick=function(){load(quoteId,true,changed);};
  n=document.getElementById('assignment-retry');if(n)n.onclick=function(){save(null);};
  n=document.getElementById('assignment-form');if(n)n.onsubmit=function(ev){ev.preventDefault();var d=document.getElementById('assignment-driver').value;if(d)save({op:'assign',quote_id:quoteId,driver_id:d,expected_version:0,expected_execution_version:e.version});};
  n=document.getElementById('assignment-release');if(n)n.onsubmit=function(ev){ev.preventDefault();var note=document.getElementById('assignment-reason').value.trim();if(note)save({op:'release',assignment_id:a.id,expected_version:a.version,expected_execution_version:e.version,note:note});};
 }
 async function save(body){
  if(busy||!canEdit)return;
  var token=generation,notify=null;
  try{
   if(!pending){if(!body)return;var candidate=Object.assign({},body,{idempotency_key:crypto.randomUUID()});sessionStorage.setItem(key(),JSON.stringify(candidate));pending=candidate;}
   else store(); // Refuse mutation if a durable retry identity cannot be retained.
  }catch(error){render(text('Could not persist this save in session storage. No request sent.','No se pudo guardar la solicitud. No se envió.')+' '+error.message);return;}
  busy=true;render(text('Saving…','Guardando…'));
  try{
   var r=await Hub.api('/api/hub/owner/catering-assignment',{method:'POST',body:pending});
   if(token!==generation||!canEdit)return;
   var status=r&&(r._status||r.status);
   if(r&&r.ok){sessionStorage.removeItem(key());pending=null;state=r;render(text('Saved. No notification sent.','Guardado. No se envió ningún aviso.'));notify=changed;}
   else if(status>=400&&status<500){sessionStorage.removeItem(key());pending=null;state=null;render(r.error||text('Rejected. Refresh before continuing.','Rechazado. Actualiza antes de continuar.'));refreshQueued=true;}
   else render(text('Save outcome unknown. Resolve the same save before continuing.','Resultado sin confirmar. Resuelve el mismo guardado antes de continuar.'));
  }catch(ignore){if(token===generation&&canEdit)render(text('Connection interrupted. Resolve the previous save.','Conexión interrumpida. Resuelve el guardado anterior.'));}
  finally{
   if(token===generation){busy=false;var buttons=document.querySelectorAll('#driver-assignment-panel button');Array.prototype.forEach.call(buttons,function(b){b.disabled=false;});
    var refresh=refreshQueued;refreshQueued=false;
    if(notify)notify();else if(refresh)load(quoteId,canEdit,changed);
   }
  }
 }
 async function load(id,canWrite,onChanged){
  var el=document.getElementById('driver-assignment-panel');if(!el)return;
  if(busy&&canWrite&&canEdit&&id===quoteId){changed=onChanged;refreshQueued=true;return;}
  var token=++generation;canEdit=!!canWrite;el.hidden=!canEdit;busy=false;refreshQueued=false;
  quoteId=id;changed=onChanged;state=null;pending=null;actorId=null;
  if(!canEdit){el.innerHTML='';return;}
  render(text('Loading assignment…','Cargando asignación…'));
  try{
   var r=await Hub.api('/api/hub/owner/catering-assignment?quote_id='+encodeURIComponent(id));
   if(token!==generation||!canEdit)return;
   if(!r||!r.ok||!r.actor_id){render(text('Could not verify assignment or account. Refresh the event.','No se pudo verificar la asignación o cuenta. Actualiza el evento.'));return;}
   actorId=r.actor_id;state=r;
   try{pending=JSON.parse(sessionStorage.getItem(key())||'null');}catch(error){state=null;render(text('Could not read pending save from session storage. No changes are allowed.','No se pudo leer la solicitud guardada. No se permiten cambios.'));return;}
   render('');
  }catch(ignore){if(token===generation&&canEdit){state=null;render(text('Could not verify assignment.','No se pudo verificar la asignación.'));}}
 }
 window.CateringAssignment={load:load};
})();
