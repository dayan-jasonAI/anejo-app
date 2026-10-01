/* Read the daily catalogue without implying every meal is available every day. */
(function(){
'use strict';let data=null,failed=false;
const el=(tag,text)=>{const x=document.createElement(tag);if(text)x.textContent=text;return x;};
window.renderTenDollarDaily=function(root){
 root.replaceChildren();root.append(el('h2',L('The $10 lunch collection','La colección de almuerzos de $10')),el('p',L('Lunch for you. Lunch for your whole team. One featured meal each day; order up to 50 to one address.','Almuerzo para ti y para todo tu equipo. Un plato especial cada día; pide hasta 50 a una dirección.')));
 if(!data){root.append(el('p',failed?L('Daily availability could not be confirmed. Try the Daily Lunch tab.','No pudimos confirmar la disponibilidad. Consulta Almuerzo diario.'):L('Loading the lunch collection…','Cargando la colección…')));return;}
 const grid=el('div');grid.className='shop-grid';
 for(const product of data.products||[]){
 const card=el('article');card.className='shop-card';if(product.image_url){const image=el('img');image.src=product.image_url;image.alt=product.name;image.loading='lazy';card.append(image);}
 const body=el('div');body.className='shop-card-body';body.append(el('h3',product.name),el('p',product.description),el('strong','$10'));
 const day=data.days.find(d=>d.product_id===product.id&&d.orderable);
 body.append(el('p',day?L('Available for ','Disponible para ')+new Date(day.date+'T12:00:00Z').toLocaleDateString(L('en-US','es-US'),{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'}):L('No upcoming purchase date currently available.','Actualmente no hay una fecha disponible para comprar.')));
 const corporate=el('a',L('Order for your team · minimum 20 →','Pide para tu equipo · mínimo 20 →'));corporate.href='/order?category=corporate&product='+encodeURIComponent(product.id);corporate.className='customize';body.append(corporate);
 const action=el('a',day?L('Choose quantity & order →','Elige cantidad y pide →'):L('Ask about corporate catering →','Consulta catering corporativo →'));action.className='customize';action.href=day?'/order?category=daily&date='+encodeURIComponent(day.date):'/catering?occasion=corporate';body.append(action);card.append(body);grid.append(card);
 }
 root.append(grid,el('h2',L('More from the $10 menu','Más del menú de $10')));
};
fetch('/api/daily-lunch',{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok||!b.ok)throw Error();data=b;}).catch(()=>{failed=true;}).finally(()=>{const root=document.getElementById('tenDailyMeals');if(root)window.renderTenDollarDaily(root);});
})();
