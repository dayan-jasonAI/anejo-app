import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const cateringI18n=readFileSync(new URL('../../public/hub/assets/catering-i18n.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../public/hub/owner/catering.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('Hub.boot'));
const quote={id:'cq_synthetic',source_lead_id:'ld_synthetic',customer_name:'Synthetic Guest',customer_email:'guest@example.test',customer_phone:'',event_date:'2030-12-20',guests:35,lang:'en',deposit_status:'unpaid',total_cents:10000,updated_at:1000,quote_json:JSON.stringify({lead_id:'ld_synthetic',lines:[{name:'Synthetic tray',qty:'35',cents:9000,product_id:'catering_example-10'}],delivery_fee_cents:1000})};
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(handler){
  const nodes=new Map(),calls=[],toasts=[],confirms=[];
  const decode=s=>String(s).replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
  class Element{
    constructor(){this.value='';this.innerHTML='';this.textContent='';this.disabled=false;this.checked=false;this.hidden=false;this.listeners={};this.children={};this.attributes={};this.dataset={};this.selectedOptions=[];}
    addEventListener(type,fn){this.listeners[type]=fn;}
    getAttribute(key){return this.attributes[key]||'';}
    setAttribute(key,value){this.attributes[key]=value;}
    showModal(){this.open=true;}
    close(){this.open=false;}
    scrollIntoView(){}
    focus(){}
    select(){}
    insertAdjacentHTML(_position,markup){this.innerHTML+=markup;}
    querySelector(selector){if(!this.children[selector])this.children[selector]=new Element();return this.children[selector];}
    querySelectorAll(){return [];} 
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  get('q-recommendation-packs').value='1';
  function rows(){return [...get('q-lines').innerHTML.matchAll(/<div class="q-line"([\s\S]*?)<\/div>/g)].map(match=>{
    const row=new Element();row.attributes['data-metadata']=decode(match[1].match(/data-metadata="([^"]*)"/)?.[1]||'{}');const values={};
    for(const key of ['name','qty','price','reason']){values['.q-l-'+key]=new Element();values['.q-l-'+key].value=decode(match[1].match(new RegExp('class="q-l-'+key+'"[^>]*value="([^"]*)"'))?.[1]||'');}
    values['.q-l-override']=new Element();values['.q-l-override'].checked=/<input class="q-l-override"[^>]* checked/.test(match[1]);values['.q-line-rate']=new Element();for(const key of ['rate-cents','rate-qty'])row.attributes['data-'+key]=match[1].match(new RegExp('data-'+key+'="([^"]*)"'))?.[1]||'';row.querySelector=selector=>values[selector];return row;
  });}
  const document={addEventListener(){},getElementById:get,querySelectorAll:selector=>selector==='#q-lines .q-line'?rows():selector.split(',').filter(x=>/^#q-[\w-]+$/.test(x)).map(x=>get(x.slice(1)))};
  const Hub={boot(){},esc:value=>String(value??'').replace(/[&"<]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;'}[c])),toast:text=>toasts.push(text),api:async(_url,options)=>{calls.push(options.body);if(handler)return handler(options.body);if(options.body.op==='revision_status')return {ok:true};if(options.body.op==='preview')return {ok:true,total_cents:10000,deposit_cents:5000,balance_cents:5000,deposit_pct:.5};if(options.body.op==='render')return {ok:true,subject:'Synthetic quote',html:'<p>Synthetic quote preview</p>'};return {ok:true,quote_id:'cq_synthetic_replacement',deposit_cents:5000};}};
  const window={addEventListener(){},location:{search:''},confirm:message=>{confirms.push(message);return true;}};
  const ctx=vm.createContext({Hub,Owner:{get:async()=>({ok:false}),money:c=>'$'+(Number(c||0)/100).toFixed(2),init(){}},window,document,URLSearchParams,console,setTimeout,clearTimeout,crypto:{randomUUID}});
  const hooked=script.replace("Owner.init('catering', render);", "loadRecommendations=function(){};window.testQuote={attachDraft:attachDraft,recoverDraft:recoverDraft,markEditorDirty:markEditorDirty,guardEditorSwitch:guardEditorSwitch,catalogLine:catalogLine,lineRowHtml:lineRowHtml,updateLinePricing:updateLinePricing,saveDraft:saveDraft,fillDraftPayload:fillDraftPayload,reviewSavedQuote:reviewSavedQuote,mountEmailPreview:mountEmailPreview,quoteCard:quoteCard,showSend:showSend,checkCheckoutStatus:checkCheckoutStatus,quoteListHtml:quoteListHtml,body:body,deliveryFee:deliveryFee,deliverySummary:deliverySummary,beginRevision:beginRevision,associatedQuotes:associatedQuotes,wireRequests:wireRequests,wireForm:wireForm,showExistingChoice:showExistingChoice,retire:reviewDuplicateRetirement,formHtml:formHtml,setQuotes:function(q){quoteCache=q;},setLead:function(id){leadId=id;}};");
  // Exercise the same source-leaf renderer as the real page rather than a label-only mock.
  vm.runInContext(cateringI18n,ctx);
  vm.runInContext(hooked,ctx);const api=window.testQuote;
  return {preview:async()=>{const pending=get('q-preview').listeners.click.call(get('q-preview'));await new Promise(resolve=>setImmediate(resolve));get('q-mail').querySelector('iframe').listeners.load?.();await pending;},get,calls,toasts,confirms,api,Element,tick:()=>new Promise(resolve=>setImmediate(resolve)),click:id=>get(id).listeners.click?.call(get(id)),wire:()=>api.wireForm()};
}

test('opening a lead with one active quote uses existing revision controls instead of creating a duplicate',async()=>{
  const f=fixture();f.api.setQuotes([clone(quote)]);const btn=new f.Element();btn.attributes['data-prefill']=JSON.stringify({lead_id:'ld_synthetic',existing_quote_ids:['cq_synthetic']});
  f.api.wireRequests({querySelectorAll:()=>[btn]});btn.listeners.click();await f.tick();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].op,'revision_status');assert.equal(f.calls[0].quote_id,'cq_synthetic');
  assert.match(f.get('q-create').textContent,/Save changes/);assert.equal(f.get('q-delivery-fee').value,'10.00');
  assert.equal(f.api.body().quote_id,'cq_synthetic');assert.equal(f.api.body().lines[0].product_id,'catering_example-10');
});

test('ambiguous active quotes require explicit selection and never mint another checkout',async()=>{
  const f=fixture(),second={...clone(quote),id:'cq_synthetic_other',total_cents:12500};f.api.setQuotes([clone(quote),second]);
  const matches=f.api.associatedQuotes({id:'ld_synthetic',email:quote.customer_email,event_date:quote.event_date});assert.equal(matches.length,2);
  f.api.showExistingChoice(matches,'ld_synthetic');assert.equal(f.get('q-create').disabled,true);assert.equal(f.calls.length,0);
  f.get('q-open-existing').onclick();assert.equal(f.calls.length,0);
  f.get('q-existing-select').value=second.id;f.get('q-open-existing').onclick();await f.tick();
  assert.equal(f.calls[0].op,'revision_status');assert.equal(f.calls[0].quote_id,second.id);
});

test('manual delivery stays separate from food, distinguishes unconfirmed and free, rejects malformed amounts',async()=>{
  const f=fixture();await f.api.beginRevision(clone(quote));
  assert.equal(f.api.body().lines[0].cents,9000);assert.equal(f.api.body().delivery_fee_cents,1000);
  assert.match(f.get('q-delivery-summary').textContent,/Food \$90.00 \+ delivery \/ setup \$10.00 = quote total \$100.00/);
  f.get('q-delivery-fee').value='';assert.equal(f.api.body().delivery_fee_cents,null);
  f.get('q-delivery-fee').value='0';assert.equal(f.api.body().delivery_fee_cents,0);
  for(const invalid of ['-1','abc','3.001']){f.get('q-delivery-fee').value=invalid;assert.ok(Number.isNaN(f.api.deliveryFee()));}
});

test('preview and Save changes use one revision with delivery and never send customer communication',async()=>{
  const f=fixture();f.wire();await f.api.beginRevision(clone(quote));
  f.get('q-delivery-fee').value='15.00';f.click('q-create');await f.tick();
  assert.equal(f.calls.filter(x=>x.op==='revise').length,0,'unreviewed changes cannot be saved');
  await f.preview();assert.ok(f.calls.filter(x=>['preview','render'].includes(x.op)).every(x=>x.delivery_fee_cents===1500));
  const saving=f.click('q-create');await f.tick();assert.equal(f.get('q-action-confirm').open,true);assert.equal(f.calls.filter(x=>x.op==='revise').length,0);f.get('q-action-approve').onclick();await saving;await f.tick();const saved=f.calls.find(x=>x.op==='revise');assert.ok(saved);assert.equal(saved.quote_id,'cq_synthetic');assert.equal(saved.delivery_fee_cents,1500);assert.equal(saved.lines[0].cents,9000);
  assert.equal(f.calls.filter(x=>x.op==='create'||x.op==='send').length,0);assert.match(f.get('q-revision-status').textContent,/Changes saved/);
});

test('paid quotes stay read-only and same-email different-event requests are not falsely merged',async()=>{
  const f=fixture();await f.api.beginRevision({...clone(quote),deposit_status:'paid'});assert.equal(f.calls.length,0);assert.equal(f.get('q-create').disabled,true);
  f.api.setQuotes([clone(quote)]);assert.equal(f.api.associatedQuotes({id:'ld_other',email:quote.customer_email,event_date:'2030-12-21'}).length,0);
});

test('duplicate retirement requires exact retained quote, explicit review and timestamp-bound operation',async()=>{
  const f=fixture();const kept={...clone(quote),id:'cq_synthetic_keep',total_cents:12500,updated_at:2000};f.api.setQuotes([clone(quote),kept]);
  f.api.retire(clone(quote));f.get('q-retire-now').onclick.call(f.get('q-retire-now'));assert.equal(f.calls.length,0);
  f.get('q-retain-quote').value=kept.id;f.get('q-retain-quote').onchange();assert.equal(f.get('q-retire-reviewed').checked,false);
  f.get('q-retire-reviewed').checked=true;f.get('q-retire-reviewed').onchange();
  const pending=f.get('q-retire-now').onclick.call(f.get('q-retire-now'));await f.tick();assert.equal(f.get('q-action-confirm').open,true);assert.match(f.get('q-action-message').textContent,/KEEP: cq_synthetic_keep/);assert.equal(f.calls.length,0);f.get('q-action-approve').onclick();await pending;await f.tick();
  const retired=f.calls.find(x=>x.op==='retire_duplicate');assert.ok(retired);assert.equal(retired.quote_id,'cq_synthetic');assert.equal(retired.replacement_quote_id,kept.id);assert.equal(retired.expected_updated_at,1000);assert.equal(retired.expected_replacement_updated_at,2000);assert.equal(retired.reviewed,true);
  assert.equal(f.calls.filter(x=>x.op==='create'||x.op==='send').length,0);
});


test('unavailable existing-quote lookup blocks starting another checkout from the request',async()=>{
  const f=fixture(),button=new f.Element();button.attributes['data-prefill']=JSON.stringify({lead_id:'ld_synthetic',quote_lookup_unavailable:true});
  f.api.wireRequests({querySelectorAll:()=>[button]});await button.listeners.click();
  assert.equal(f.get('q-create').disabled,true);assert.equal(f.calls.length,0);assert.match(f.get('q-revision-status').textContent,/lookup is unavailable/);
});

test('server duplicate guard retains owner draft and routes it into a chosen revision without replaying create',async()=>{
  const f=fixture(body=>body.op==='create'?{ok:false,requires_revision:true,existing_quote_id:'cq_synthetic',error:'Use existing revision'}:body.op==='render'?{ok:true,subject:'Synthetic quote',html:'<p>Synthetic</p>'}:{ok:true});
  f.api.setQuotes([clone(quote)]);f.wire();f.get('q-name').value='Synthetic Guest';f.get('q-email').value=quote.customer_email;f.get('q-date').value=quote.event_date;f.get('q-guests').value='35';f.get('q-total').value='120.00';f.get('q-delivery-fee').value='15.00';
  await f.preview();const creating=f.click('q-create');await f.tick();f.get('q-action-approve').onclick();await creating;await f.tick();assert.equal(f.get('q-create').disabled,true);
  f.get('q-existing-select').value='cq_synthetic';f.get('q-open-existing').onclick();await f.tick();
  const revised=f.api.body();assert.equal(revised.quote_id,'cq_synthetic');assert.equal(revised.total_cents,13500);assert.equal(revised.delivery_fee_cents,1500);
  assert.equal(f.calls.filter(x=>x.op==='create').length,1);assert.equal(f.calls.filter(x=>x.op==='send').length,0);
});


test('in-page revision confirmation can be cancelled and repeated clicks cannot bypass it',async()=>{
  const f=fixture();f.wire();await f.api.beginRevision(clone(quote));await f.preview();
  const pending=f.click('q-create');await f.tick();assert.equal(f.get('q-action-confirm').open,true);assert.match(f.get('q-action-message').textContent,/No email or text is sent/);
  await f.click('q-create');assert.equal(f.calls.filter(x=>x.op==='revise').length,0);
  f.get('q-action-cancel').onclick();await pending;assert.equal(f.calls.filter(x=>x.op==='revise').length,0);assert.equal(f.get('q-action-confirm').open,false);
  const confirmed=f.click('q-create');await f.tick();f.get('q-action-approve').onclick();await confirmed;await f.tick();
  assert.equal(f.calls.filter(x=>x.op==='revise').length,1);assert.equal(f.calls.filter(x=>x.op==='send').length,0);
  assert.equal(f.confirms.length,0,'revision flow never calls native window.confirm');
});


test('Check payment status makes only a read-only status request and retains clear provider evidence',async()=>{
  const f=fixture(()=>({ok:true,source:{quote_id:'cq_synthetic',local_status:'unpaid',provider_verified:true,order_state:'DRAFT',tender_count:0,payments:[]},retained:{quote_id:'cq_synthetic_keep',local_status:'unpaid',provider_verified:false,order_state:'UNKNOWN',payments:[{id:'synthetic_payment',status:'UNKNOWN'}],error:'Payment lookup unavailable'}}));
  const button=f.get('check-button');await f.api.checkCheckoutStatus('cq_synthetic',button);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].op,'checkout_status');assert.equal(f.calls[0].quote_id,'cq_synthetic');assert.equal(button.disabled,false);
  const evidence=f.get('q-payment-status-cq_synthetic').textContent;assert.match(evidence,/Square order state: DRAFT/);assert.match(evidence,/Recorded tenders: 0/);assert.match(evidence,/Retained replacement/);assert.match(evidence,/synthetic_payment: UNKNOWN/);assert.match(evidence,/Order state alone does not establish payment/);
});

test('payment lookup failure stays visible without changing quotes or sending messages',async()=>{
  const f=fixture(()=>({ok:false,error:'Provider lookup unavailable'}));await f.api.checkCheckoutStatus('cq_synthetic',f.get('button'));
  assert.match(f.get('q-payment-status-cq_synthetic').textContent,/could not be verified.*Provider lookup unavailable/);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].op,'checkout_status');
});

test('void quote history remains available but is collapsed separately from active offers',()=>{
  const f=fixture();const markup=f.api.quoteListHtml([clone(quote),{...clone(quote),id:'cq_retired_synthetic',deposit_status:'void'}]);
  assert.match(markup,/<details class="q-retired-history"><summary>Previous \/ retired quotes \(1\)/);
  assert.ok(!markup.includes('<details class="q-retired-history" open'));
  assert.ok(markup.indexOf('id="quote-cq_synthetic"')<markup.indexOf('q-retired-history'));
  assert.ok(markup.indexOf('id="quote-cq_retired_synthetic"')>markup.indexOf('q-retired-history'));
});


test('sending requires explicit in-page confirmation and cancel sends nothing',async()=>{
  const f=fixture(body=>body.op==='send'?{ok:true,delivery:{email:{sent:true}}}:{ok:false});
  f.get('q-email').value='guest@example.test';f.api.showSend({quote_id:'cq_synthetic',review_hash:'synthetic_review'});f.get('q-send-reviewed').checked=true;f.get('q-send-reviewed').onchange.call(f.get('q-send-reviewed'));
  const cancelled=f.click('q-send-now');await f.tick();assert.equal(f.get('q-action-confirm').open,true);assert.equal(f.calls.length,0);assert.match(f.get('q-action-message').textContent,/guest@example.test/);f.get('q-action-cancel').onclick();await cancelled;assert.equal(f.calls.length,0);assert.equal(f.get('q-send-now').disabled,false);
  const sending=f.click('q-send-now');await f.tick();assert.equal(f.calls.length,0);f.get('q-action-approve').onclick();await sending;await f.tick();assert.equal(f.calls.filter(x=>x.op==='send').length,1);assert.equal(f.calls.find(x=>x.op==='send').reviewed,true);assert.equal(f.calls.find(x=>x.op==='send').review_hash,'synthetic_review');assert.equal(f.calls.find(x=>x.op==='send').sms,false);assert.equal(f.confirms.length,0);
});


test('owner GET delivery fee is shown and editing preserves the exact five item lines and grand total',async()=>{
  const f=fixture(),lines=[6000,7000,8000,5000,4625].map((cents,i)=>({name:'Synthetic dish '+i,qty:'35',cents,product_id:'synthetic_'+i}));
  const liveShape={...clone(quote),delivery_fee_cents:2500,total_cents:33125,quote_json:JSON.stringify({lines})};
  assert.match(f.api.quoteCard(liveShape),/Delivery \/ setup: \$25.00 · confirmed/);
  await f.api.beginRevision(liveShape);assert.equal(f.get('q-delivery-fee').value,'25.00');
  const body=f.api.body();assert.equal(body.lines.length,5);assert.equal(body.lines.reduce((n,l)=>n+l.cents,0),30625);assert.equal(body.delivery_fee_cents,2500);assert.equal(body.total_cents,undefined);assert.deepEqual(clone(body.lines.map(l=>l.product_id)),lines.map(l=>l.product_id));
});

test('safe GET fee without item lines remains confirmed and blocks a fabricated package revision',async()=>{
  const f=fixture(),safe={...clone(quote),delivery_fee_cents:2500,total_cents:33125};delete safe.quote_json;
  assert.match(f.api.quoteCard(safe),/Delivery \/ setup: \$25.00 · confirmed/);
  await f.api.beginRevision(safe);assert.equal(f.get('q-delivery-fee').value,'25.00');assert.equal(f.get('q-create').disabled,true);assert.equal(f.get('q-preview').disabled,true);assert.equal(f.get('q-lines').innerHTML,'');assert.match(f.get('q-revision-status').textContent,/itemized menu is unavailable/);assert.equal(f.calls.filter(b=>b.op==='revise'||b.op==='send').length,0);
});

test('explicit fee null or zero on safe GET takes precedence over stale JSON',()=>{
  const f=fixture();assert.match(f.api.quoteCard({...clone(quote),delivery_fee_cents:null}),/Delivery \/ setup: unconfirmed/);assert.match(f.api.quoteCard({...clone(quote),delivery_fee_cents:0}),/Delivery \/ setup: \$0.00 · confirmed/);
});

test('catalog line records exact SKU and published unit price without changing an existing agreed line',()=>{
 const f=fixture(),item={id:'catering_synthetic_pack',name_en:'Synthetic pack',name_es:'Paquete',unit_cents:3500,image:'/synthetic.webp'};
 const line=f.api.catalogLine(item,2);assert.equal(line.price,'70.00');assert.equal(line.qty,'2');assert.equal(line.metadata.product_id,item.id);assert.equal(line.metadata.pricing_mode,'catalog');assert.equal(line.metadata.unit_cents,3500);
 const historical=f.api.lineRowHtml({name:'Agreed dish',qty:'35',price:'46.25',metadata:{product_id:'synthetic'}});assert.match(historical,/data-rate-cents="4625" data-rate-qty="35"/);assert.match(historical,/value="46.25" readonly/);
});

test('quantity scales the agreed rate and explicit custom override preserves the negotiated total',()=>{
 const f=fixture(),row=new f.Element(),qty=new f.Element(),price=new f.Element(),override=new f.Element(),label=new f.Element();row.attributes['data-rate-cents']='4625';row.attributes['data-rate-qty']='35';qty.value='40';row.querySelector=s=>({'.q-l-qty':qty,'.q-l-price':price,'.q-l-override':override,'.q-line-rate':label}[s]);
 f.api.updateLinePricing(row,false);assert.equal(price.value,'52.86');assert.equal(price.readOnly,true);override.checked=true;price.value='49.00';qty.value='50';f.api.updateLinePricing(row,false);assert.equal(price.value,'49.00');assert.equal(price.readOnly,false);assert.match(label.textContent,/Manual total/);
});

test('draft save is separate from checkout and a conflict retains current form contents',async()=>{
 let saving=true;const f=fixture(b=>b.op==='save'?(saving?{ok:true,draft:{id:b.id,version:1,state:'draft',payload:b.payload}}:{ok:false,error:'Version conflict'}):{ok:true});f.get('q-name').value='Synthetic incomplete event';f.get('q-note').value='Keep me';
 await f.api.saveDraft();assert.equal(f.calls.length,1);assert.equal(f.calls[0].op,'save');assert.equal(f.calls[0].expected_version,0);assert.equal(f.calls[0].payload.customer_name,'Synthetic incomplete event');assert.match(f.get('q-draft-status').textContent,/No checkout created/);
 saving=false;f.get('q-note').value='New unsaved edits';await f.api.saveDraft();assert.equal(f.get('q-note').value,'New unsaved edits');assert.match(f.get('q-draft-status').textContent,/Version conflict/);assert.equal(f.calls.filter(b=>['create','revise','send'].includes(b.op)).length,0);
});

test('dirty editor requires explicit discard and cancellation preserves it',async()=>{
 const f=fixture();f.api.markEditorDirty();const pending=f.api.guardEditorSwitch();await f.tick();assert.equal(f.get('q-action-confirm').open,true);f.get('q-action-cancel').onclick();assert.equal(await pending,false);assert.equal(f.calls.length,0);
});

test('saved quote approval remains unavailable until its current iframe actually loads',async()=>{
 const f=fixture(b=>b.op==='render_saved'?{ok:true,review_hash:'review_current',customer_email:'saved@example.test',subject:'Saved quote',html:'<p>Saved</p>'}:{ok:true});
 const pending=f.api.reviewSavedQuote('cq_synthetic');await f.tick();assert.equal(f.get('q-sent').innerHTML,'');f.get('q-saved-review').querySelector('iframe').listeners.load();await pending;assert.match(f.get('q-sent').innerHTML,/saved@example.test/);assert.equal(f.get('q-send-now').disabled,true);f.get('q-send-reviewed').checked=true;f.get('q-send-reviewed').onchange.call(f.get('q-send-reviewed'));assert.equal(f.get('q-send-now').disabled,false);assert.equal(f.calls.filter(b=>b.op==='send').length,0);
});

test('stale saved-email iframe cannot enable sending for another selected quote',async()=>{
 const f=fixture(b=>({ok:true,review_hash:b.quote_id,customer_email:'saved@example.test',html:'<p>Saved</p>'}));const first=f.api.reviewSavedQuote('cq_first');await f.tick();const frame=f.get('q-saved-review').querySelector('iframe'),oldLoad=frame.listeners.load;const second=f.api.reviewSavedQuote('cq_second');await f.tick();oldLoad();await first;assert.equal(f.get('q-sent').innerHTML,'');frame.listeners.load();await second;assert.match(f.get('q-sent').innerHTML,/Send reviewed quote/);assert.equal(f.calls.filter(b=>b.op==='send').length,0);
});

test('editing during a preview request prevents its stale response from authorizing checkout',async()=>{
 let resolveRender;const f=fixture(b=>b.op==='render'?new Promise(r=>{resolveRender=r;}):{ok:true,total_cents:10000,deposit_cents:5000,balance_cents:5000});f.wire();await f.api.beginRevision(clone(quote));const pending=f.click('q-preview');await f.tick();f.get('q-note').value='Changed while rendering';f.api.markEditorDirty();resolveRender({ok:true,html:'<p>Stale</p>'});await pending;f.click('q-create');await f.tick();assert.equal(f.calls.filter(b=>b.op==='revise').length,0);assert.match(f.toasts.at(-1),/Read the updated email preview/);assert.equal(f.get('q-preview').disabled,false);
});

test('reopening an earlier catalog quote uses its agreed amount rather than current published pricing',async()=>{
 const f=fixture(),q={...clone(quote),quote_json:JSON.stringify({lines:[{name:'Synthetic historic pack',qty:'3',cents:10000,product_id:'historic_pack',unit_cents:3500,pricing_mode:'catalog'}]})};await f.api.beginRevision(q);const line=f.api.body().lines[0];assert.equal(line.cents,10000);assert.equal(line.pricing_mode,'quoted');assert.match(f.get('q-lines').innerHTML,/data-rate-cents="10000" data-rate-qty="3"/);
});

test('a draft save with a lost acknowledgement retries the same UUID without minting a checkout',async()=>{
 let attempts=0;const f=fixture(b=>{if(b.op==='save'){attempts++;if(attempts===1)throw Error('Network interrupted');return {ok:true,draft:{id:b.id,version:1,state:'draft'}};}return {ok:true};});f.get('q-name').value='Synthetic unfinished event';await f.api.saveDraft();assert.match(f.get('q-draft-status').textContent,/Network interrupted/);await f.api.saveDraft();assert.equal(f.calls.length,2);assert.equal(f.calls[0].id,f.calls[1].id);assert.equal(f.calls[1].expected_version,0);assert.equal(f.get('q-save-draft').disabled,false);
});

test('saved-email frame failure keeps all send controls unavailable',async()=>{
 const f=fixture(()=>({ok:true,review_hash:'review',html:'<p>Email</p>'}));const pending=f.api.reviewSavedQuote('cq_synthetic');await f.tick();f.get('q-saved-review').querySelector('iframe').listeners.error();await pending;assert.equal(f.get('q-sent').innerHTML,'');assert.match(f.get('q-saved-review').textContent,/Cannot approve this email/);assert.equal(f.calls.filter(b=>b.op==='send').length,0);
});

test('unknown email outcome stays locked against a blind retry',async()=>{
 const f=fixture(()=>({ok:false,status:'unknown',error:'Provider outcome unknown'}));f.api.showSend({quote_id:'cq_synthetic',review_hash:'review',customer_email:'synthetic@example.test',customer_phone:''});f.get('q-send-reviewed').checked=true;f.get('q-send-reviewed').onchange.call(f.get('q-send-reviewed'));const pending=f.click('q-send-now');await f.tick();f.get('q-action-approve').onclick();await pending;await f.tick();assert.equal(f.get('q-send-now').disabled,true);f.get('q-send-reviewed').checked=false;f.get('q-send-reviewed').onchange.call(f.get('q-send-reviewed'));f.get('q-send-reviewed').checked=true;f.get('q-send-reviewed').onchange.call(f.get('q-send-reviewed'));assert.equal(f.get('q-send-now').disabled,true);await f.click('q-send-now');assert.equal(f.calls.filter(b=>b.op==='send').length,1);
});

test('checkout preview response alone cannot approve a revision before iframe load',async()=>{
 const f=fixture();f.wire();await f.api.beginRevision(clone(quote));const previewing=f.click('q-preview');await f.tick();await f.click('q-create');assert.equal(f.get('q-action-confirm').open,undefined);assert.equal(f.calls.filter(b=>b.op==='revise').length,0);f.get('q-mail').querySelector('iframe').listeners.load();await previewing;const pending=f.click('q-create');await f.tick();assert.equal(f.get('q-action-confirm').open,true);f.get('q-action-cancel').onclick();await pending;assert.equal(f.calls.filter(b=>b.op==='revise').length,0);
});

test('accepted replay receipt is recognized and locked without claiming customer delivery',async()=>{
 const f=fixture(()=>({ok:true,replayed:true,receipt:{state:'accepted',email:{provider_accepted:true,receipt_id:'synthetic_receipt'},sms:{provider_accepted:false},delivery_verified:false}}));f.api.showSend({quote_id:'cq_synthetic',review_hash:'review',customer_email:'guest@example.test',customer_phone:''});f.get('q-send-reviewed').checked=true;f.get('q-send-reviewed').onchange.call(f.get('q-send-reviewed'));const pending=f.click('q-send-now');await f.tick();f.get('q-action-approve').onclick();await pending;await f.tick();assert.equal(f.get('q-send-now').disabled,true);assert.match(f.get('q-send-status').textContent,/Email accepted/);assert.match(f.get('q-send-status').textContent,/delivery is not verified/);assert.doesNotMatch(f.get('q-send-now').textContent,/Try again/);
});

test('unknown replay preserves known accepted email evidence while blocking retry',async()=>{
 const f=fixture(()=>({ok:true,replayed:true,receipt:{state:'unknown',email:{provider_accepted:true},sms:{provider_accepted:false}}}));f.api.showSend({quote_id:'cq_synthetic',review_hash:'review',customer_email:'guest@example.test',customer_phone:''});f.get('q-send-reviewed').checked=true;f.get('q-send-reviewed').onchange.call(f.get('q-send-reviewed'));const pending=f.click('q-send-now');await f.tick();f.get('q-action-approve').onclick();await pending;await f.tick();assert.equal(f.get('q-send-now').disabled,true);assert.match(f.get('q-send-status').textContent,/Email accepted/);assert.match(f.get('q-send-status').textContent,/Remaining outcomes are unverified/);
});

test('preparing one draft locks its save controls but opening a fresh draft enables saving again',async()=>{
 const f=fixture(b=>b.op==='save'?{ok:true,draft:{id:b.id,version:1,state:'draft'}}:b.op==='attach'?{ok:true,draft:{id:b.id,version:2,state:'prepared',quote_id:'cq_prepared'}}:{ok:true});f.get('q-name').value='Synthetic first draft';await f.api.saveDraft();await f.api.attachDraft('cq_prepared');assert.equal(f.get('q-save-draft').disabled,true);assert.equal(f.get('q-recover-draft').disabled,true);
 f.api.fillDraftPayload({customer_name:'Synthetic second draft',note:'Unfinished',lines:[]});assert.equal(f.get('q-save-draft').disabled,false);assert.equal(f.get('q-recover-draft').disabled,false);assert.equal(f.get('q-name').value,'Synthetic second draft');
 await f.api.beginRevision(clone(quote));assert.equal(f.get('q-save-draft').disabled,false);assert.equal(f.get('q-recover-draft').disabled,false);
});

test('the production source-leaf helper is exercised without translating customer text',()=>{
 const f=fixture();const markup=f.api.quoteCard({...clone(quote),customer_name:'English <Guest> & "source"'});
 assert.match(markup,/<span translate="no" data-catering-source>English &lt;Guest&gt; &amp; &quot;source&quot;<\/span>/);
 assert.match(markup,/Delivery \/ setup:/,'UI labels remain outside protected customer source leaves');
 assert.equal(f.calls.length,0);
});
