(function(){
'use strict';
const $=id=>document.getElementById(id);let menu=null,selected=null,busy=false,confirmedAddress=false,loadId=0;
const money=c=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c/100);
const dateLabel=d=>new Intl.DateTimeFormat('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
const timeLabel=t=>{const [h,m]=String(t).split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'p.m.':'a.m.');};
function el(tag,text,cls){const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;}
const reasons={past:'This lunch date has passed.',sold_out:'Sold out — thank you.',disabled:'Not serving this day.',not_scheduled:'Menu not yet announced.',same_day_cutoff:'Today’s order cutoff has passed.',preorder_cutoff:'The preorder cutoff has passed. Same-day ordering opens on the delivery date until the published cutoff, while quantities last.',closed:'Kitchen closed for this date.',no_delivery_day:'No delivery on this day.'};
function card(day,featured){const article=el('article',null,'meal'+(featured?' featured':''));
 if(day.image_url){const img=el('img');img.src=day.image_url;img.alt=day.name;img.loading=featured?'eager':'lazy';img.onerror=()=>img.replaceWith(el('div','AÑEJO · PHOTO COMING SOON','placeholder'));article.append(img);}else article.append(el('div','AÑEJO · PHOTO COMING SOON','placeholder'));
 const copy=el('div',null,'copy');copy.append(el('p',dateLabel(day.date),'eyebrow'),el('h3',day.name||'Our kitchen is planning'),el('p',day.description||'Check back for this day’s lunch.'));
 if(day.product_id)copy.append(el('p',money(menu.price_cents),'price'));
 copy.append(el('p',day.orderable?(day.free_delivery?'Preorder · delivery is on us.':'Order today · regular delivery fee applies.'):(reasons[day.reason]||'Ordering is unavailable for this date.'),'status'));
 if(day.orderable){const button=el('button',day.date===menu.today?'Order Today':'Preorder');button.type='button';button.onclick=()=>choose(day);copy.append(button);}article.append(copy);return article;}
function choose(day){selected=day;confirmedAddress=false;$('address-review').hidden=true;$('order').hidden=false;$('order-title').textContent=day.name+' — '+money(menu.price_cents);$('order-details').textContent=dateLabel(day.date)+' · Lunch delivery'+(menu.windows?' · '+timeLabel(menu.windows.lunch_start)+'–'+timeLabel(menu.windows.lunch_end):'');$('checkout-error').textContent='';estimate();$('order').scrollIntoView({behavior:'smooth',block:'start'});$('lunch-checkout').elements.qty.focus();}
function estimate(){if(!selected)return;const qty=Number($('lunch-checkout').elements.qty.value)||1;const fee=selected.free_delivery?0:menu.delivery_fee_cents;$('estimate').textContent=money(menu.price_cents*qty)+' meals + '+(fee===0?'free delivery':money(fee)+' delivery')+' before tax.';}
async function load(start){const requestId=++loadId;$('menu-error').textContent='';selected=null;$('order').hidden=true;
 try{const response=await fetch('/api/daily-lunch'+(start?'?start='+encodeURIComponent(start):''),{cache:'no-store'});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Daily lunch is temporarily unavailable.');if(requestId!==loadId)return;menu=data;
 const days=menu.days||[];$('week-meals').replaceChildren(...days.map(d=>card(d,false)));
 if(days.length)$('week').value=days[0].date;
 const feature=days.find(d=>d.date===menu.today&&d.orderable)||days.find(d=>d.date>menu.today&&d.product_id&&d.enabled)||days.find(d=>d.date===menu.today&&d.product_id)||days.find(d=>d.product_id);
 $('today-title').textContent=feature&&feature.date===menu.today?'TODAY’S LUNCH':feature&&feature.date===new Date(Date.parse(menu.today+'T12:00:00Z')+86400000).toISOString().slice(0,10)?'TOMORROW’S LUNCH':'FROM THIS WEEK’S KITCHEN';$('today-meal').replaceChildren(feature?card(feature,true):el('p','The next lunch menu is being prepared. Please check back.'));
 $('cutoff-copy').textContent='Order by '+timeLabel(menu.settings.preorder_cutoff)+' Eastern the day before for FREE delivery. Same-day orders close at '+timeLabel(menu.settings.same_day_cutoff)+' Eastern, while quantities last, with the regular delivery fee.';
 }catch(error){if(requestId!==loadId)return;$('menu-error').textContent=error.message;$('week-meals').replaceChildren();$('today-meal').textContent='We cannot confirm lunch availability right now.';}}
$('week').addEventListener('change',()=>load($('week').value));
const form=$('lunch-checkout');form.addEventListener('input',()=>{confirmedAddress=false;$('address-review').hidden=true;estimate();});
$('confirm-address').onclick=()=>{confirmedAddress=true;$('address-review').hidden=true;form.requestSubmit();};
form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!selected||!form.reportValidity())return;busy=true;$('pay').disabled=true;$('checkout-error').textContent='';
 const value=name=>form.elements[name].value.trim();const contact={first_name:value('first_name'),email:value('email'),phone:value('phone'),sms_consent:false,marketing_sms_consent:false};
 const payload={items:[{id:'daily_lunch_'+selected.product_id,qty:Number(value('qty'))}],daily_lunch:{date:selected.date},delivery:{date:selected.date,window:'lunch'},address:{street:value('street'),unit:value('unit'),city:value('city'),state:value('state'),zip:value('zip'),notes:value('notes')},contact};
 if(confirmedAddress)payload.address_confirmed=true;
 const query=new URLSearchParams(location.search);payload.attribution={src:'daily_lunch'};['utm_source','utm_medium','utm_campaign'].forEach(k=>{if(query.has(k))payload.attribution[k]=query.get(k);});
 try{const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();
 if(response.status===409&&data.needs_confirmation){$('address-review').hidden=false;$('address-review-text').textContent='We could not fully verify this address. Please check: '+[payload.address.street,payload.address.unit,payload.address.city,payload.address.state,payload.address.zip].filter(Boolean).join(', ')+'. Edit it above if needed.';return;}
 if(!response.ok||!data.url)throw Error(data.error||'Checkout could not be confirmed. Please review before trying again.');
 try{if(data.receipt_token)sessionStorage.setItem('anejo:receiptToken',data.receipt_token);else sessionStorage.removeItem('anejo:receiptToken');sessionStorage.setItem('anejo:pendingOrder',JSON.stringify({currency:'USD',items:1,email:contact.email,sms_consent:false}));}catch(_error){}
 location.href=data.url;
 }catch(error){$('checkout-error').textContent=error.message;}finally{busy=false;$('pay').disabled=false;}});
load();
})();
