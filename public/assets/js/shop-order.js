/* Family customization selects existing server-priced SKUs. No client-side price overrides. */
let shopAutoOpened=false;
let shopGroups=[],shopDraft={},shopActive=null,shopEditing=false;
const shopName=g=>L(g.name,g.nameEs||g.name);
function shopPhoto(i){return '/assets/img/'+(i.img||(isBowl(i.id)?'bowl_'+i.id+'.jpg':''));}
function shopEnabled(i){return i.available!==false && (!isBowl(i.id)|| !(mode==='ondemand'&&avail&&remainingFor(i.id)<=0));}
window.renderShopCatalog=function(){
 const all=CATALOG.flatMap(g=>g.items);shopGroups=AnejoShop.group(all);const query=($('shopSearch')?.value||'').toLowerCase();
 const cat=selectedCategory==='traditional'?'meals':selectedCategory==='all'?'meals':selectedCategory;
 $('shopCategories').innerHTML=AnejoShop.sections.map(([k,en,es])=>`<button class="${cat===k?'active':''}" onclick="selectCategory('${k}')" aria-pressed="${cat===k}">${L(en,es)}</button>`).join('');
 $('categoryNote').textContent=cat==='catering'?L('Choose a tray size inside Customize. Catering is delivered on your selected date.','Elige el tamaño en Personalizar. Entregamos el catering en la fecha que selecciones.'):L('Choose a favorite, make it yours, then review your order.','Elige tu favorito, personalízalo y revisa tu pedido.');
 const chosen=shopGroups.filter(g=>(query||g.category===cat)&&(!query||[g.name,g.nameEs,...g.variants.map(i=>i.name)].join(' ').toLowerCase().includes(query))).sort((a,b)=>{const rank=k=>k==='combo-traditional-meal'?0:k==='ropa-vieja-meal'?1:2;return rank(a.key)-rank(b.key)});
 $('catalog').innerHTML='<div class="shop-grid">'+chosen.map(g=>{const on=g.variants.filter(shopEnabled),first=on[0]||g.variants[0],min=Math.min(...g.variants.map(i=>i.price));const bowl=isBowl(first.id);const desc=bowl?L(first.desc,first.descEs):g.variants.length>1?L('Choose your flavor, size and quantity.','Elige sabor, tamaño y cantidad.'):L(first.desc,first.descEs);const action=bowl?`openCz('${esc(first.id)}')`:`openShop('${esc(g.key)}')`;return `<article class="shop-card"><img src="${escHtml(shopPhoto(first))}" alt="${escHtml(shopName(g))}" loading="lazy"><div class="shop-card-body"><h2>${escHtml(shopName(g))}</h2><p>${escHtml(desc)}</p><div class="shop-card-bottom"><strong>${g.variants.length>1?L('From ','Desde '):''}${money(min)}</strong><button class="customize" ${on.length?'':'disabled'} onclick="${action}">${on.length?L('Customize','Personalizar'):L('Unavailable','No disponible')}</button></div></div></article>`}).join('')+(cat==='catering'?`<article class="shop-card"><img src="/assets/img/menu-launch/cajitas-collection.webp" alt="La Cajita" loading="lazy"><div class="shop-card-body"><h2>La Cajita</h2><p>${L('Personalized boxes for your gathering. Final price by quote.','Cajitas personalizadas para tu evento. Precio final por cotización.')}</p><a class="customize" href="/cajita-builder">${L('Design & request quote','Diseñar y solicitar cotización')}</a></div></article>`:'')+'</div>'+(chosen.length?'':`<p>${L('No matching items. Try another search or category.','No hay resultados. Prueba otra búsqueda o categoría.')}</p>`);
 renderShopSuggestions();
 const deepLink=new URLSearchParams(location.search).get('product');if(deepLink&&!shopAutoOpened&&shopGroups.some(g=>g.key===deepLink)){shopAutoOpened=true;setTimeout(()=>{const g=shopGroups.find(g=>g.key===deepLink);if(g&&isBowl(g.variants[0].id))openCz(g.variants[0].id);else openShop(deepLink)},50);}
};
function openShop(key,edit=false){
 shopActive=shopGroups.find(g=>g.key===key);if(!shopActive)return;shopEditing=edit;shopDraft={};
 const valid=shopActive.variants.filter(shopEnabled);if(!valid.length)return;
 if(edit)shopActive.variants.forEach(i=>{if(addons[i.id])shopDraft[i.id]=addons[i.id]});else shopDraft[valid[0].id]=Math.min(1,shopMax(valid[0].id)-(addons[valid[0].id]||0));
 $('shopModalTitle').textContent=shopName(shopActive);$('shopModalImage').src=shopPhoto(valid[0]);$('shopModalImage').alt=shopName(shopActive);
 const formats=[...new Map(shopActive.variants.map(i=>[i.format,L(i.format,i.formatEs)])).entries()];
 $('shopFormat').innerHTML=formats.map(([value,label])=>`<option value="${escHtml(value)}">${escHtml(label)}</option>`).join('');$('shopFormat').value=(shopActive.variants.find(i=>shopDraft[i.id])||valid[0]).format;
 $('shopScheduled').textContent=shopActive.variants.some(i=>/^(traditional_|catering_)/.test(i.id))?L('Prepared for scheduled delivery. Adding this item selects scheduled delivery for your order.','Preparado para entrega programada. Al agregarlo, tu pedido pasa a entrega programada.'):'';
 renderShopChoices();$('shopDialog').showModal();
}
function renderShopChoices(){
 if(!shopActive)return;const format=$('shopFormat').value;const photoItem=shopActive.variants.find(i=>i.format===format);if(photoItem){$('shopModalImage').src=shopPhoto(photoItem);$('shopModalImage').alt=shopName(shopActive)+' · '+L(photoItem.format,photoItem.formatEs);}
 $('shopChoices').innerHTML=shopActive.variants.filter(i=>i.format===format).map(i=>`<div class="shop-choice"><div><strong>${escHtml(shopActive.variants.length>1?L(i.flavor,i.flavorEs):shopName(shopActive))}</strong><p>${escHtml(L(i.desc,i.descEs))}</p><b>${money(i.price)}</b>${shopEnabled(i)?'':`<small>${L('Unavailable','No disponible')}</small>`}</div><div class="stepper"><button aria-label="${escHtml(L('Remove one ','Quitar uno ')+i.flavor)}" onclick="shopChange('${esc(i.id)}',-1)">−</button><span>${shopDraft[i.id]||0}</span><button aria-label="${escHtml(L('Add one ','Agregar uno ')+i.flavor)}" ${shopEnabled(i)?'':'disabled'} onclick="shopChange('${esc(i.id)}',1)">+</button></div></div>`).join('');
 const total=shopActive.variants.reduce((s,i)=>s+Math.round(i.price*100)*(shopDraft[i.id]||0),0);$('shopApply').textContent=L(shopEditing?'Save changes':'Add to order',shopEditing?'Guardar cambios':'Agregar al pedido')+' · '+money(total/100);$('shopApply').disabled=!total&&!shopEditing;
}
function shopMax(id){return /^(traditional_|catering_)/.test(id)?5000:20;}
function shopChange(id,d){if(d>0&&!shopEnabled(PRICE[id]))return;shopDraft[id]=Math.max(0,Math.min(shopMax(id)-(shopEditing?0:(addons[id]||0)),(shopDraft[id]||0)+d));renderShopChoices();if(d>0&&PRICE[id])$('shopModalImage').src=shopPhoto(PRICE[id]);}
function applyShop(){
 if(!shopActive)return;
 for(const i of shopActive.variants){const count=shopDraft[i.id]||0;if(count&&!shopEnabled(i)){renderShopChoices();return;}}
 if(shopEditing)shopActive.variants.forEach(i=>delete addons[i.id]);
 for(const i of shopActive.variants){const count=shopDraft[i.id]||0;if(count)addons[i.id]=Math.min(shopMax(i.id),(addons[i.id]||0)+count);}
 const schedule=shopActive.variants.some(i=>shopDraft[i.id]&&/^(traditional_|catering_)/.test(i.id));$('shopDialog').close();shopActive=null;if(schedule)setMode('scheduled');renderCatalog();renderCart();
 $('shopToast').textContent=L('Your order has been updated.','Tu pedido se ha actualizado.');setTimeout(()=>{$('shopToast').textContent=''},2500);
}
function editShopItem(id){const g=shopGroups.find(g=>g.variants.some(i=>i.id===id));if(g)openShop(g.key,true);}
function renderShopSuggestions(){
 const el=$('shopSuggestions');if(!el)return;const hasOrder=bowls.length||Object.keys(addons).length;
 if(!hasOrder){el.innerHTML='';return;}
 const desired=bowls.length?['croquetas','empanadas','fit-drinks','tres-leches-fresa']:['tres-leches-fresa','fit-drinks','dip-signature'];
 const list=desired.map(k=>shopGroups.find(g=>g.key===k)).filter(g=>g&&g.variants.some(shopEnabled)&&!g.variants.some(i=>addons[i.id])).slice(0,3);
 el.innerHTML=list.length?`<h4>${L('Complete your meal','Completa tu comida')}</h4><p>${L('A little something on the side?','¿Algo más para acompañar?')}</p><div class="shop-suggestions">`+list.map(g=>{const i=g.variants.find(shopEnabled);return `<button onclick="openShop('${esc(g.key)}')"><img src="${escHtml(shopPhoto(i))}" alt=""><span>${escHtml(shopName(g))}<small>${L('From ','Desde ')+money(Math.min(...g.variants.filter(shopEnabled).map(x=>x.price)))}</small></span><b>+</b></button>`}).join('')+'</div>':'';
}
function shopReview(){const details=$('checkoutDetails');details.open=true;document.querySelector('.cart').scrollIntoView({behavior:'smooth',block:'start'});}
$('shopDialog').addEventListener('click',e=>{if(e.target===$('shopDialog'))$('shopDialog').close()});
$('shopSearch').addEventListener('input',renderCatalog);
$('shopFormat').addEventListener('change',renderShopChoices);
document.addEventListener('anejo:langchange',()=>{renderCatalog();if(shopActive)renderShopChoices()});
const shopOriginalCart=renderCart;renderCart=function(){shopOriginalCart();renderShopSuggestions();const count=bowls.reduce((s,b)=>s+(b.qty||1),0)+Object.values(addons).reduce((s,n)=>s+n,0);$('shopCartBar').hidden=!count;$('shopCartBar').textContent=L('View order','Ver pedido')+' · '+count+' · '+($('cartSubtotal').textContent||'$0.00');};
renderCatalog();renderCart();
