/* Read the daily catalogue without implying every meal is available every day. */
(function(){
'use strict';let data=null,failed=false;
const el=(tag,text)=>{const x=document.createElement(tag);if(text)x.textContent=text;return x;};
window.renderTenDollarDaily=function(root){
 root.replaceChildren();root.append(el('h2',L('The $10 meal collection','La colección de comidas de $10')),el('p',L('Lunch for you. Lunch for your whole team. One featured meal each day; order up to 50 to one address.','Almuerzo para ti y para todo tu equipo. Un plato especial cada día; pide hasta 50 a una dirección.')));
 if(!data){root.append(el('p',failed?L('Daily availability could not be confirmed. Try the Daily Lunch tab.','No pudimos confirmar la disponibilidad. Consulta Almuerzo diario.'):L('Loading the lunch collection…','Cargando la colección…')));return;}
 const grid=el('div');grid.className='shop-grid';
 for(const product of data.products||[]){
 const card=el('article');card.className='shop-card';if(product.image_url){const image=el('img');image.src=product.image_url;image.alt=product.name;image.loading='lazy';card.append(image);}
 const body=el('div');body.className='shop-card-body';body.append(el('h3',product.name),el('p',product.description),el('strong','$10'));
 const day=data.days.find(d=>d.product_id===product.id&&d.orderable);
 body.append(el('p',day?L('Available for ','Disponible para ')+new Date(day.date+'T12:00:00Z').toLocaleDateString(L('en-US','es-US'),{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'}):L('No featured daily-lunch date currently available.','Actualmente no hay una fecha de almuerzo diario destacada.')));
 const corporate=el('a',L('Order for your team · minimum 20 →','Pide para tu equipo · mínimo 20 →'));corporate.href='#tenTeamMeals';corporate.className='customize';body.append(corporate);
 const action=el('a',day?L('Choose quantity & order →','Elige cantidad y pide →'):L('Ask about corporate catering →','Consulta catering corporativo →'));action.className='customize';action.href=day?'/order?category=daily&date='+encodeURIComponent(day.date):'/catering?occasion=corporate';body.append(action);card.append(body);grid.append(card);
 }
 root.append(grid);const rotation=el('section');rotation.className='meal-rotation';rotation.append(el('h2',L('Our four-week $10 meal rotation','Nuestra rotación de comidas de $10 de cuatro semanas')),el('p',L('Explore the collection. Ordering dates and availability are shown in Daily Meal; an unscheduled meal is not available for immediate purchase.','Explora la colección. Las fechas y disponibilidad aparecen en Comida diaria; un plato sin fecha no está disponible para compra inmediata.')));root.append(rotation);fetch('/assets/data/daily-meal-rotation.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{for(let week=1;week<=4;week++){rotation.append(el('h3',L('Week ','Semana ')+week));const list=el('ul');for(const meal of data.meals.filter(m=>m.week===week))list.append(el('li',L(meal.day,({Monday:'Lunes',Tuesday:'Martes',Wednesday:'Miércoles',Thursday:'Jueves',Friday:'Viernes'})[meal.day])+' · '+meal.name));rotation.append(list)}}).catch(()=>rotation.append(el('p',L('The rotation is temporarily unavailable.','La rotación no está disponible temporalmente.'))));root.append(el('h2',L('More from the $10 menu','Más del menú de $10')));
};
fetch('/api/daily-lunch',{cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok||!b.ok)throw Error();data=b;}).catch(()=>{failed=true;}).finally(()=>{const root=document.getElementById('tenDailyMeals');if(root)window.renderTenDollarDaily(root);});
})();
