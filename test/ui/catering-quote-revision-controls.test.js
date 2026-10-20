import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../../public/hub/owner/catering.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).find(x=>x.includes('Hub.boot'));
const quote={id:'cq_synthetic',source_lead_id:'ld_synthetic',customer_name:'Synthetic Guest',customer_email:'guest@example.test',customer_phone:'',event_date:'2030-12-20',guests:35,lang:'en',deposit_status:'unpaid',total_cents:10000,updated_at:1000,quote_json:JSON.stringify({lead_id:'ld_synthetic',lines:[{name:'Synthetic tray',qty:'35',cents:9000,product_id:'catering_example-10'}],delivery_fee_cents:1000})};
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(handler){
  const nodes=new Map(),calls=[],toasts=[],confirms=[];
  const decode=s=>String(s).replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&amp;/g,'&');
  class Element{
    constructor(){this.value='';this.innerHTML='';this.textContent='';this.disabled=false;this.checked=false;this.hidden=false;this.listeners={};this.attributes={};this.dataset={};this.selectedOptions=[];}
    addEventListener(type,fn){this.listeners[type]=fn;}
    getAttribute(key){return this.attributes[key]||'';}
    setAttribute(key,value){this.attributes[key]=value;}
    showModal(){this.open=true;}
    close(){this.open=false;}
    scrollIntoView(){}
    focus(){}
    select(){}
    insertAdjacentHTML(_position,markup){this.innerHTML+=markup;}
    querySelector(){return new Element();}
  }
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  get('q-recommendation-packs').value='1';
  function rows(){return [...get('q-lines').innerHTML.matchAll(/<div class="q-line"([\s\S]*?)<\/div>/g)].map(match=>{
    const row=new Element();row.attributes['data-metadata']=decode(match[1].match(/data-metadata="([^"]*)"/)?.[1]||'{}');const values={};
    for(const key of ['name','qty','price']){values['.q-l-'+key]=new Element();values['.q-l-'+key].value=decode(match[1].match(new RegExp('class="q-l-'+key+'"[^>]*value="([^"]*)"'))?.[1]||'');}
    row.querySelector=selector=>values[selector];return row;
  });}
  const document={getElementById:get,querySelectorAll:selector=>selector==='#q-lines .q-line'?rows():selector.split(',').filter(x=>/^#q-[\w-]+$/.test(x)).map(x=>get(x.slice(1)))};
  const Hub={boot(){},esc:value=>String(value??'').replace(/[&"<]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;'}[c])),toast:text=>toasts.push(text),api:async(_url,options)=>{calls.push(options.body);if(handler)return handler(options.body);if(options.body.op==='revision_status')return {ok:true};if(options.body.op==='preview')return {ok:true,total_cents:10000,deposit_cents:5000,balance_cents:5000,deposit_pct:.5};if(options.body.op==='render')return {ok:true,subject:'Synthetic quote',html:'<p>Synthetic quote preview</p>'};return {ok:true,quote_id:'cq_synthetic_replacement',deposit_cents:5000};}};
  const window={CateringI18n:{label:x=>x},location:{search:''},confirm:message=>{confirms.push(message);return true;}};
  const ctx=vm.createContext({Hub,Owner:{get:async()=>({ok:false}),money:c=>'$'+(Number(c||0)/100).toFixed(2),init(){}},window,document,URLSearchParams,console});
  const hooked=script.replace("Owner.init('catering', render);", "loadRecommendations=function(){};window.testQuote={showSend:showSend,checkCheckoutStatus:checkCheckoutStatus,quoteListHtml:quoteListHtml,body:body,deliveryFee:deliveryFee,deliverySummary:deliverySummary,beginRevision:beginRevision,associatedQuotes:associatedQuotes,wireRequests:wireRequests,wireForm:wireForm,showExistingChoice:showExistingChoice,retire:reviewDuplicateRetirement,formHtml:formHtml,setQuotes:function(q){quoteCache=q;},setLead:function(id){leadId=id;}};");
  vm.runInContext(hooked,ctx);const api=window.testQuote;
  return {get,calls,toasts,confirms,api,Element,tick:()=>new Promise(resolve=>setImmediate(resolve)),click:id=>get(id).listeners.click?.call(get(id)),wire:()=>api.wireForm()};
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
  f.click('q-preview');await f.tick();assert.ok(f.calls.filter(x=>['preview','render'].includes(x.op)).every(x=>x.delivery_fee_cents===1500));
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


test('unavailable existing-quote lookup blocks starting another checkout from the request',()=>{
  const f=fixture(),button=new f.Element();button.attributes['data-prefill']=JSON.stringify({lead_id:'ld_synthetic',quote_lookup_unavailable:true});
  f.api.wireRequests({querySelectorAll:()=>[button]});button.listeners.click();
  assert.equal(f.get('q-create').disabled,true);assert.equal(f.calls.length,0);assert.match(f.get('q-revision-status').textContent,/lookup is unavailable/);
});

test('server duplicate guard retains owner draft and routes it into a chosen revision without replaying create',async()=>{
  const f=fixture(body=>body.op==='create'?{ok:false,requires_revision:true,existing_quote_id:'cq_synthetic',error:'Use existing revision'}:{ok:true});
  f.api.setQuotes([clone(quote)]);f.wire();f.get('q-name').value='Synthetic Guest';f.get('q-email').value=quote.customer_email;f.get('q-date').value=quote.event_date;f.get('q-guests').value='35';f.get('q-total').value='120.00';f.get('q-delivery-fee').value='15.00';
  f.click('q-create');await f.tick();assert.equal(f.get('q-create').disabled,true);
  f.get('q-existing-select').value='cq_synthetic';f.get('q-open-existing').onclick();await f.tick();
  const revised=f.api.body();assert.equal(revised.quote_id,'cq_synthetic');assert.equal(revised.total_cents,13500);assert.equal(revised.delivery_fee_cents,1500);
  assert.equal(f.calls.filter(x=>x.op==='create').length,1);assert.equal(f.calls.filter(x=>x.op==='send').length,0);
});


test('in-page revision confirmation can be cancelled and repeated clicks cannot bypass it',async()=>{
  const f=fixture();f.wire();await f.api.beginRevision(clone(quote));f.click('q-preview');await f.tick();
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
  f.get('q-email').value='guest@example.test';f.api.showSend({quote_id:'cq_synthetic'});
  const cancelled=f.click('q-send-now');await f.tick();assert.equal(f.get('q-action-confirm').open,true);assert.equal(f.calls.length,0);assert.match(f.get('q-action-message').textContent,/guest@example.test/);f.get('q-action-cancel').onclick();await cancelled;assert.equal(f.calls.length,0);assert.equal(f.get('q-send-now').disabled,false);
  const sending=f.click('q-send-now');await f.tick();assert.equal(f.calls.length,0);f.get('q-action-approve').onclick();await sending;await f.tick();assert.equal(f.calls.filter(x=>x.op==='send').length,1);assert.equal(f.calls.find(x=>x.op==='send').sms,false);assert.equal(f.confirms.length,0);
});
