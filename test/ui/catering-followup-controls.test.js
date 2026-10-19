import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../../public/hub/owner/assets/catering-service.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../public/hub/owner/catering-service.html',import.meta.url),'utf8');
const lead={id:'ld_synthetic',name:'Synthetic Guest',email:'guest@example.test',phone:'+15555550100',event:{event_date:'2030-12-20',guests:35},notifications:[],created_at:1000,phase:'awaiting_deposit',quote_id:'cq_synthetic',state:'contacted',note:'Preserved internal call notes',next_followup_at:2000};
const preview={ok:true,eligible:true,review_hash:'review-hash-1',quote_id:'cq_synthetic',step:'review_quote',preview:{to:'guest@example.test',subject:'Your quote',html:'<p>Actual synthetic email</p><img src="https://anejocateringco.com/assets/img/email_emblem.png">',text:'Actual synthetic email',lang:'en',version:'v1'},history:[],response:null,next_action:{label:'Review and send the quote reminder',due_at:3000}};
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(handler){
  class Element {
    constructor(){this.textContent='';this.innerHTML='';this.srcdoc='';this.value='';this.checked=false;this.disabled=false;this.open=false;this.dataset={};this.children=new Map();this.listeners={};}
    set id(value){this._id=value;nodes.set(value,this);}
    get id(){return this._id;}
    setAttribute(key,value){(this.attributes ||= {})[key]=value;}
    replaceWith(){}
    querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Element());return this.children.get(selector);}
    addEventListener(type,fn){this.listeners[type]=fn;}
    showModal(){this.open=true;}
    close(){this.open=false;}
  }
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  const article=new Element();article.dataset.lead=lead.id;
  const form=article.querySelector('form');form.elements={state:{value:'contacted'},note:{value:lead.note},next:{value:'2030-12-01T09:00',dataset:{original:'2030-12-01T09:00'}}};
  const calls=[];let start;let timerId=0;const timers=new Map();
  const Hub={boot(){},esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),toast(){},api:async(url,options)=>{
    calls.push({url,options});
    if(url==='/api/hub/owner/catering-service'&&!options)return {ok:true,leads:[clone(lead)],overview:{scope:'Latest 100 catering inquiries',requests:10,quotes_sent:7,responses_recorded:4,deposits_paid:2,owner_marked_won:5},template:{version:'ack-v1',en:{html:'<p>English ack</p>'},es:{html:'<p>Spanish ack</p>'}},config:{ack_enabled:false}};
    if(handler)return handler(url,options,calls);
    if(!options)return clone(preview);
    return {ok:true,status:'accepted',receipt_id:'provider-synthetic'};
  }};
  const ctx=vm.createContext({Hub,Owner:{init:(_section,fn)=>{start=fn;}},document:{getElementById:get,querySelectorAll:()=>[article],createElement:()=>new Element()},setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),location:{href:''},Date,console});
  vm.runInContext(source,ctx);
  return {get,article,calls,start:()=>start(),open:()=>article.querySelector('[data-review-reminder]').onclick(),approve:()=>{get('reminder-reviewed').checked=true;get('reminder-reviewed').onchange();},send:()=>get('reminder-send').onclick(),loadPreview:()=>get('reminder-preview').listeners.load?.(),timeoutPreview:()=>{for(const fn of [...timers.values()])fn();},switchStep:step=>{get('reminder-step').value=step;return get('reminder-step').onchange();}};
}

test('opening quote reminder renders actual recipient and sandboxed email but never sends',async()=>{
  const f=fixture();await f.start();await f.open();
  assert.equal(f.calls.filter(c=>c.options?.method==='POST').length,0);
  assert.equal(f.get('reminder-recipient').textContent,'guest@example.test');
  assert.equal(f.get('reminder-subject').textContent,'Your quote');
  assert.match(f.get('reminder-preview').srcdoc,/Actual synthetic email/);
  assert.match(f.get('reminder-preview').srcdoc,/default-src 'none'/);
  assert.match(html,/id="reminder-preview"[^>]*sandbox=""/);
  assert.equal(f.get('reminder-send').disabled,true);
  await f.send();assert.equal(f.calls.filter(c=>c.options?.method==='POST').length,0);
  assert.equal(f.article.querySelector('form').elements.note.value,lead.note);
});

test('manual send requires checkbox, preserves reviewed hash, prevents double-click and reports acceptance accurately',async()=>{
  let release;const sent=new Promise(resolve=>{release=resolve;});
  const f=fixture((url,options)=>!options?clone(preview):sent);await f.start();await f.open();f.loadPreview();f.approve();
  assert.equal(f.get('reminder-send').disabled,false);
  const first=f.send();await f.send();
  const posts=f.calls.filter(c=>c.options?.method==='POST');assert.equal(posts.length,1);
  assert.equal(posts[0].options.body.op,'send');assert.equal(posts[0].options.body.review_hash,'review-hash-1');assert.equal(posts[0].options.body.reviewed,true);assert.equal(posts[0].options.body.step,'review_quote');
  release({ok:true,status:'accepted',receipt_id:'provider-1'});await first;
  assert.match(f.get('reminder-result').textContent,/Provider accepted/);
  assert.match(f.get('reminder-result').textContent,/delivery and reading unverified/);
  assert.match(f.get('reminder-result').textContent,/provider-1/);
  assert.equal(f.get('reminder-send').disabled,true);
});

test('switching reminder step invalidates review and only uses the new exact preview hash',async()=>{
  const f=fixture((url,options)=>{if(options)return {ok:true,status:'accepted'};return {...clone(preview),review_hash:url.includes('clarify_questions')?'review-hash-2':'review-hash-1'};});
  await f.start();await f.open();f.loadPreview();f.approve();await f.switchStep('clarify_questions');
  assert.equal(f.get('reminder-reviewed').checked,false);assert.equal(f.get('reminder-send').disabled,true);
  f.loadPreview();f.approve();await f.send();
  const sent=f.calls.find(c=>c.options?.body?.op==='send');assert.equal(sent.options.body.step,'clarify_questions');assert.equal(sent.options.body.review_hash,'review-hash-2');
});

test('ineligible or missing-recipient preview cannot be approved into a send',async()=>{
  for(const value of [{...preview,eligible:false,reason:'Prior reminder is still unknown.'},{...preview,preview:{...preview.preview,to:''}}]){
    const f=fixture(()=>clone(value));await f.start();await f.open();f.loadPreview();f.approve();await f.send();
    assert.equal(f.get('reminder-send').disabled,true);assert.equal(f.calls.filter(c=>c.options?.method==='POST').length,0);
  }
});

test('unknown, failed and suppressed outcomes remain distinct and never silently retry',async()=>{
  for(const status of ['unknown','failed','suppressed','pending']){
    const f=fixture((_url,options)=>options?{ok:false,status}:clone(preview));await f.start();await f.open();f.loadPreview();f.approve();await f.send();await f.send();
    const text=f.get('reminder-result').textContent;
    assert.match(text,new RegExp(({unknown:'unknown',failed:'failed',suppressed:'Suppressed',pending:'pending'})[status]));
    assert.ok(!text.includes('Provider accepted'));assert.equal(f.calls.filter(c=>c.options?.body?.op==='send').length,1);
  }
});

test('recording a customer response preserves call notes and posts no send operation',async()=>{
  const f=fixture();await f.start();await f.open();
  const host=f.article.querySelector('[data-response-content]');host.querySelector('[data-response-status]').value='changes_requested';host.querySelector('[data-response-note]').value='Asked to adjust the menu.';
  await host.querySelector('[data-save-response]').onclick();
  const posts=f.calls.filter(c=>c.options?.method==='POST');assert.equal(posts.length,1);assert.equal(posts[0].options.body.op,'update_response');assert.equal(posts[0].options.body.status,'changes_requested');assert.equal(posts[0].options.body.note,'Asked to adjust the menu.');
  assert.equal(f.article.querySelector('form').elements.note.value,lead.note);
  assert.match(f.article.querySelector('[data-response-summary]').textContent,/requested changes/);
});

test('history distinguishes provider receipt evidence from delivery and safely escapes error text',async()=>{
  const f=fixture(()=>({...clone(preview),history:[{step:'review_quote',status:'accepted',receipt_id:'provider-2',accepted_at:1000},{step:'clarify_questions',status:'unknown',last_error:'<script>unsafe</script>',created_at:2000}],response:{status:'call_requested',note:'Call after lunch'}}));
  await f.start();await f.open();const content=f.article.querySelector('[data-response-content]').innerHTML;
  assert.match(content,/2 reminder record\(s\) · 1 provider acceptance receipt\(s\)/);
  assert.match(content,/Provider receipt/);assert.match(content,/unknown — do not retry/);assert.ok(content.includes('&lt;script&gt;unsafe&lt;/script&gt;'));assert.ok(!content.includes('<script>unsafe'));
  assert.match(f.article.querySelector('[data-response-summary]').textContent,/requested a call/);
});


test('conversion overview states its scope and keeps owner-marked wins separate from paid deposits',async()=>{
  const f=fixture();await f.start();const content=f.get('funnel-overview').innerHTML;
  assert.match(content,/Latest 100 catering inquiries/);
  assert.match(content,/<b>2<\/b><span>Paid deposits/);
  assert.match(content,/<b>5<\/b><span>Owner marked won/);
  assert.match(content,/do not establish email opens or link clicks/);
});

test('network ambiguity after a manual send is labeled unknown and never retried by the UI',async()=>{
  const f=fixture((_url,options)=>{if(options)throw new Error('connection lost');return clone(preview);});
  await f.start();await f.open();f.loadPreview();f.approve();await f.send();await f.send();
  assert.match(f.get('reminder-result').textContent,/unknown — do not retry/);
  assert.equal(f.calls.filter(c=>c.options?.body?.op==='send').length,1);
});

test('existing call-task save retains unchanged follow-up time and never invokes reminder sending',async()=>{
  const f=fixture();await f.start();const form=f.article.querySelector('form');form.elements.note.value='Spoke with customer; owner call note.';
  await form.onsubmit({preventDefault(){},target:form});
  const post=f.calls.find(c=>c.options?.body?.op==='update_followup');assert.ok(post);assert.equal(post.options.body.note,'Spoke with customer; owner call note.');
  assert.ok(!Object.hasOwn(post.options.body,'next_followup_at'));
  assert.equal(f.calls.filter(c=>c.options?.body?.op==='send').length,0);
});


test('review checkbox cannot approve a preview before the current iframe load signal',async()=>{
  const f=fixture();await f.start();await f.open();
  assert.equal(f.get('reminder-reviewed').disabled,true);
  f.get('reminder-reviewed').checked=true;f.get('reminder-reviewed').onchange();await f.send();
  assert.equal(f.calls.filter(c=>c.options?.body?.op==='send').length,0);
  assert.equal(f.get('reminder-send').disabled,true);
  f.get('reminder-reviewed').checked=false;f.loadPreview();
  assert.equal(f.get('reminder-reviewed').disabled,false);
  f.approve();assert.equal(f.get('reminder-send').disabled,false);
});

test('stale iframe loads cannot approve a changed reminder step and timeout requires a fresh preview',async()=>{
  const f=fixture();await f.start();await f.open();const old=f.get('reminder-preview');
  await f.switchStep('clarify_questions');const current=f.get('reminder-preview');assert.notEqual(old,current);
  old.listeners.load();assert.equal(f.get('reminder-reviewed').disabled,true);
  f.timeoutPreview();assert.equal(f.get('reminder-preview-retry').hidden,false);
  assert.match(f.get('reminder-result').textContent,/could not be confirmed/);
  current.listeners.load();assert.equal(f.get('reminder-reviewed').disabled,true,'late load after timeout cannot silently approve');
  await f.get('reminder-preview-retry').onclick();assert.equal(f.get('reminder-preview-retry').hidden,true);
  assert.equal(f.get('reminder-reviewed').disabled,true);f.loadPreview();assert.equal(f.get('reminder-reviewed').disabled,false);
  f.approve();await f.send();const sent=f.calls.find(c=>c.options?.body?.op==='send');assert.equal(sent.options.body.step,'clarify_questions');
});

test('iframe load errors keep sending disabled even if approval is checked programmatically',async()=>{
  const f=fixture();await f.start();await f.open();f.get('reminder-preview').listeners.error();
  f.get('reminder-reviewed').checked=true;f.get('reminder-reviewed').onchange();await f.send();
  assert.equal(f.get('reminder-send').disabled,true);assert.equal(f.calls.filter(c=>c.options?.body?.op==='send').length,0);
  assert.match(f.get('reminder-result').textContent,/Sending stays disabled/);
});
