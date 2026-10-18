const esc = value => String(value || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function customerQuoteEditor(token,lang='en') {
 const es=lang==='es';
 return `<link rel="stylesheet" href="/assets/css/quote-self-service.css">
<section class="qedit" id="quote-editor" data-token="${esc(token)}" data-lang="${es?'es':'en'}" aria-labelledby="qe-title">
<p class="qe-eyebrow">AÑEJO · ${es?'A TU MANERA':'YOUR CELEBRATION, YOUR WAY'}</p>
<h1 id="qe-title">${es?'Hazlo tuyo.':'Make it yours.'}</h1>
<p>${es?'Ajusta cantidades y añade platos. Revisa el nuevo total antes de guardar; guardar no cobra tu tarjeta.':'Adjust quantities and add dishes. Review your new total before saving; saving does not charge your card.'}</p>
<p class="qe-notice">${es?'Solo entrega a domicilio. El cargo depende de la distancia y el tamaño del pedido. Cualquier cargo aún no incluido requiere confirmación.':'Delivery only. The fee depends on distance and order size. Any delivery fee not already itemized still needs confirmation.'}</p>
<div id="qe-guest-wrap" hidden><label for="qe-guests">${es?'Invitados del evento':'Event guest count'}</label><input id="qe-guests" type="number" min="1" max="10000" step="1"><p><small>${es?'El número de invitados no cambia automáticamente las cantidades de platos. Ajusta cada cantidad abajo.':'Guest count does not automatically scale dish quantities. Adjust each dish below.'}</small></p></div>
<div id="qe-lines"><p role="status">${es?'Cargando tu menú…':'Loading your menu…'}</p></div>
<div id="qe-additions"></div>
<div id="qe-actions" hidden><button id="qe-preview" type="button">${es?'Revisar cambios':'Review changes'}</button></div>
<div id="qe-review" hidden></div><p id="qe-status" role="status" aria-live="polite"></p>
<details class="qe-call"><summary>${es?'Prefiero una llamada':'Prefer a call?'}</summary>
<p>${es?'Elige tu horario preferido. Recibirás confirmación antes de considerar la cita reservada.':'Choose a preferred time. Your appointment is not booked until you receive confirmation.'}</p>
<form id="qe-call-form"><label for="qe-call-time">${es?'Fecha y hora preferidas — hora del Este':'Preferred date and time — Eastern time'}</label><input id="qe-call-time" type="datetime-local" required>
<label for="qe-call-phone">${es?'Teléfono (opcional; si no, usamos el de tu cotización)':'Phone (optional; otherwise we use your quote’s number)'}</label><input id="qe-call-phone" type="tel" autocomplete="tel">
<button type="submit">${es?'Solicitar horario':'Request this time'}</button><p id="qe-call-status" role="status" aria-live="polite"></p></form></details>
</section><script src="/assets/js/catering-quote-edit.js" defer></script>`;
}
