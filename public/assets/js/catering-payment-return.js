/* A checkout redirect cannot prove payment. Refresh only after the server's stored state changes. */
(function () {
  'use strict';
  var panel=document.getElementById('catering-payment-state');
  if(!panel||panel.dataset.awaitingConfirmation!=='true')return;
  var initial=panel.dataset.paymentState,attempts=0,lang=document.documentElement.lang==='es'||new URLSearchParams(window.location.search).get('lang')==='es'?'es':'en';
  var status=document.getElementById('catering-payment-progress');
  async function check(){
    if(document.visibilityState==='hidden'){setTimeout(check,5000);return;}
    attempts++;
    try{
      var response=await fetch(window.location.href,{cache:'no-store',credentials:'same-origin',headers:{Accept:'text/html'}});
      if(response.ok){var next=new DOMParser().parseFromString(await response.text(),'text/html').getElementById('catering-payment-state');
        if(next&&(next.dataset.paymentState!==initial||next.dataset.paymentRevision!==panel.dataset.paymentRevision)){
          var active=document.activeElement;
          if(active&&(active.matches('input,textarea,select')||active.isContentEditable)){if(status)status.textContent=lang==='es'?'El estado guardado cambió. Termine sus cambios y pulse Actualizar estado de pago.':'The recorded status changed. Finish your edits, then use Refresh payment status.';return;}
          window.location.reload();return;
        }
      }
    }catch(_error){/* A lost refresh never proves failure or authorizes another payment. */}
    if(attempts<6){setTimeout(check,5000);return;}
    if(status)status.textContent=lang==='es'?'La confirmación aún no ha cambiado. Use Actualizar estado de pago o revise su cuenta. Si Square emitió un recibo, no vuelva a pagar.':'The recorded confirmation has not changed yet. Use Refresh payment status or check your account. If Square issued a receipt, do not pay again.';
  }
  setTimeout(check,4000);
})();
