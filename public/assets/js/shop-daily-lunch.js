/* Daily lunch shares the existing order sidebar and checkout. One dated meal per order. */
(function(){
'use strict';let menu=null,error='',chosenDate=new URLSearchParams(location.search).get('date')||'';
const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const dateText=date=>new Date(date+'T12:00:00Z').toLocaleDateString(L('en-US','es-US'),{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'});
const status=day=>day.orderable?(day.free_delivery?L('Preorder · FREE delivery','Preordena · envío GRATIS'):L('Today’s lunch · regular delivery fee','Almuerzo de hoy · tarifa de entrega regular')):({sold_out:L('Sold out','Agotado'),same_day_cutoff:L('Today’s order cutoff has passed.','Ya pasó el cierre de pedidos de hoy.'),preorder_cutoff:L('The preorder cutoff has passed.','Ya pasó el cierre de preórdenes.'),past:L('This date has passed.','Esta fecha ya pasó.')})[day.reason]||L('Unavailable for this date.','No disponible para esta fecha.');
window.renderDailyCategory=function(){
 $('categoryNote').textContent=L('One featured lunch each day. $10 per meal. Choose your delivery date.','Un almuerzo especial cada día. $10 por comida. Elige tu fecha de entrega.');
 const root=$('catalog');root.replaceChildren();
 if(!menu){root.append(node('p',error||L('Loading the daily menu…','Cargando el menú diario…')));return;}
 const days=menu.days.filter(d=>d.product_id&&d.enabled&&d.date>=menu.today);
 const heading=node('div');heading.className='daily-shop-offer';heading.append(node('strong',L('Your everyday table. Just $10.','Tu mesa de cada día. Solo $10.')),node('p',L('Preorder by '+menu.settings.preorder_cutoff+' Eastern the day before for free delivery. Same-day orders close at '+menu.settings.same_day_cutoff+' Eastern, while quantities last.','Preordena antes de las '+menu.settings.preorder_cutoff+' (hora del Este) del día anterior con envío gratis. Pedidos del mismo día hasta las '+menu.settings.same_day_cutoff+', mientras duren.')));root.append(heading);
 if(!days.length){root.append(node('p',L('The next daily lunch has not been scheduled yet. Explore our other menu categories.','El próximo almuerzo diario aún no está programado. Explora las otras categorías.')));return;}
 if(!days.some(d=>d.date===chosenDate))chosenDate=(days.find(d=>d.date===menu.today)||days.find(d=>d.orderable)||days[0]).date;
 const label=node('label',L('Lunch date','Fecha del almuerzo')),select=node('select');select.id='daily-shop-date';days.forEach(d=>{const option=node('option',dateText(d.date));option.value=d.date;select.append(option);});select.value=chosenDate;select.onchange=()=>{chosenDate=select.value;renderDailyCategory();};label.append(select);root.append(label);
 const day=days.find(d=>d.date===chosenDate),article=node('article');article.className='shop-card daily-shop-card';
 if(day.image_url){const image=node('img');image.src=day.image_url;image.alt=day.name;article.append(image);}
 const copy=node('div');copy.className='shop-card-body';copy.append(node('p',dateText(day.date)),node('h2',day.name),node('p',day.description),node('strong','$10'),node('p',status(day)));
 const quantity=node('label',L('Meals','Comidas')),input=node('input');input.type='number';input.min='1';input.max='20';input.value='1';input.setAttribute('aria-label',L('Daily lunch quantity','Cantidad de almuerzos'));quantity.append(input);copy.append(quantity);
 const button=node('button',L('Add lunch to order','Agregar almuerzo al pedido'));button.className='customize';button.disabled=!day.orderable;button.onclick=()=>{
  const qty=Number(input.value);if(!Number.isInteger(qty)||qty<1||qty>20){input.focus();return;}
  if((bowls.length||Object.keys(addons).length||dailySelection&&dailySelection.day.date!==day.date)&&!confirm(L('Daily lunches use one date per order. Replace your current order with this lunch?','Los almuerzos usan una fecha por pedido. ¿Reemplazar tu pedido actual con este almuerzo?')))return;
  bowls.splice(0);Object.keys(addons).forEach(k=>delete addons[k]);dailySelection={day,qty,fee:day.free_delivery?0:menu.delivery_fee_cents};rewardsRedeemPts=0;appliedPromo=null;resetAddressConfirmation();renderCart();shopReview();
 };copy.append(button);article.append(copy);root.append(article);
};
window.clearDailyForOther=function(){if(!dailySelection)return true;if(!confirm(L('Replace your daily lunch order with these menu items?','¿Reemplazar tu almuerzo diario por estos productos?')))return false;dailySelection=null;resetAddressConfirmation();return true;};
window.setDailyFulfillment=function(active){
 document.querySelector('.modeseg').hidden=active;$('schedFields').hidden=active;$('availBanner').hidden=active;
};
window.renderDailyCart=function(){
 const {day,qty,fee}=dailySelection;setDailyFulfillment(true);const lines=$('cartLines');lines.replaceChildren();
 const line=node('div');line.className='cart-line';line.append(node('strong',day.name+' × '+qty),node('span',money(qty*10)));lines.append(line,node('p',dateText(day.date)+' · '+L('Lunch delivery','Entrega de almuerzo')+' '+menu.windows.lunch_start+'–'+menu.windows.lunch_end));
 const remove=node('button',L('Remove','Quitar'));remove.className='ci-rm';remove.onclick=()=>{dailySelection=null;resetAddressConfirmation();applyMode();};lines.append(remove);
 lastSubtotalCents=qty*1000;rewardsRedeemPts=0;const delivery=rewardsFreeDeliv?0:fee/100;
 $('cartSubtotal').textContent=money(qty*10);$('cartFee').textContent=delivery?money(delivery):L('Free','Gratis');$('cartTax').textContent=money(qty*10*TAX_PCT/100);$('cartGrand').textContent=money(qty*10*(1+TAX_PCT/100)+delivery);
 ['subRow','feeRow','taxRow','cartTotalRow'].forEach(id=>$(id).style.display='flex');$('taxNote').style.display='block';$('minNote').style.display='none';['rewardsRow','promoRow','promoBox'].forEach(id=>$(id).style.display='none');$('checkoutBtn').disabled=!day.orderable;
 window.AnejoShopMeasurement?.update([{item_id:'daily_lunch_'+day.product_id,price:10,quantity:qty}]);
};
async function load(){try{const r=await fetch('/api/daily-lunch',{cache:'no-store'}),data=await r.json();if(!r.ok||!data.ok)throw Error();menu=data;}catch{error=L('Daily lunch availability could not be confirmed. Please refresh to try again.','No pudimos confirmar la disponibilidad. Actualiza para intentar de nuevo.');}if(selectedCategory==='daily')renderCatalog();}
load();
})();
