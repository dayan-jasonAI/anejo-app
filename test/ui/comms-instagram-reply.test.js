import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../../public/hub/comms.html',import.meta.url),'utf8');
const source=page.match(/<script>\s*([\s\S]*?)<\/script>/)[1].replace('  // ---------- boot:','  window.testComms={showThread:showThread,loadMessages:loadMessages};\n  // ---------- boot:');
function fixture(responses){
 const elements=new Map(),calls=[],toasts=[],reviews=[];let ids=0;
 function el(id){if(!elements.has(id))elements.set(id,{id,style:{},classList:{toggle(){}},value:'',textContent:'',innerHTML:'',disabled:false,scrollHeight:0,scrollTop:0,clientHeight:0,addEventListener(k,fn){this[k]=fn;}});return elements.get(id);}
 const window={addEventListener(){},scrollTo(){},confirm(text){reviews.push(text);return true;}},document={getElementById:el,body:{scrollHeight:0}};
 const Hub={boot(){},me:()=>new Promise(()=>{}),esc:String,toast:t=>toasts.push(t),api:async(url,opts={})=>{calls.push({url,opts});const next=responses.shift();if(next instanceof Error)throw next;assert.ok(next,'Unexpected request '+url);return next;}};
 vm.runInNewContext(source,{window,document,Hub,location:{hash:'',origin:'https://example.test'},setInterval:()=>1,clearInterval(){},Date,encodeURIComponent,crypto:{randomUUID:()=> 'request-'+(++ids)}});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 return {el,calls,toasts,reviews,window,ids:()=>ids,settle,async load(tid='thread'){window.testComms.showThread(tid);await settle();},async click(id){await el(id).click.call(el(id));await settle();}};
}
const loaded=(overrides={})=>({ok:true,thread:{id:'thread',audience:'instagram',ref_type:'ig_media',can_sms:false,status:'open'},items:[],reply_attempt_status:'ok',reply_attempt_history:[],reply_attempt_unresolved:false,...overrides});
const sent={ok:true,sent:true,state:'sent',attempt_id:'ira_sent',provider_message_id:'ig_accepted'};
test('Instagram sends exact reviewed text with stable UUID and public destination',async()=>{
 const f=fixture([loaded(),sent,loaded({reply_attempt_history:[{...sent,message_id:'m'}]})]);await f.load();f.el('reply-body').value='Thanks!\nPlease DM your event date.';await f.click('reply-send');
 const post=f.calls.find(c=>c.opts.method==='POST');assert.deepEqual(JSON.parse(JSON.stringify(post.opts.body)),{thread_id:'thread',channel:'instagram',body:'Thanks!\nPlease DM your event date.',request_id:'request-1'});assert.match(f.reviews[0],/PUBLIC Instagram comment/);assert.match(f.reviews[0],/Thanks!\nPlease DM/);assert.match(f.toasts.join(' '),/provider acceptance recorded/);assert.doesNotMatch(f.toasts.join(' '),/Message sent/);assert.equal(f.el('ig-followup').hidden,false);
});
test('network uncertainty retries same UUID and frozen text, never creates another reply',async()=>{
 const f=fixture([loaded(),{_networkError:true,error:'Network'},sent,loaded({reply_attempt_history:[sent]})]);await f.load();f.el('reply-body').value='Exact reply';await f.click('reply-send');assert.equal(f.el('reply-body').disabled,true);f.el('reply-body').value='Changed after uncertainty';await f.click('reply-send');
 const posts=f.calls.filter(c=>c.opts.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].opts.body.request_id,posts[1].opts.body.request_id);assert.equal(posts[1].opts.body.body,'Exact reply');assert.equal(f.ids(),1);
});
test('pending/unknown all-history and unavailable receipts block new sends',async()=>{
 for(const d of [loaded({reply_attempt_unresolved:true,reply_attempt_history:[{state:'sent',attempt_id:'older'}]}),loaded({reply_attempt_status:'unavailable'}),loaded({reply_attempt_history:[{state:'unknown',attempt_id:'unknown'}],reply_attempt_unresolved:true})]){
  const f=fixture([d]);await f.load();f.el('reply-body').value='No send';await f.click('reply-send');assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,0);assert.equal(f.el('reply-send').disabled,true);assert.equal(f.el('ig-followup').hidden,true);
 }
});
test('known acceptance requires deliberate separately reviewed followup with parent ID',async()=>{
 const f=fixture([loaded({reply_attempt_history:[sent]}),{ok:false,state:'unknown',attempt_id:'next',error:'provider_outcome_unknown'}]);await f.load();assert.equal(f.el('reply-send').disabled,true);await f.click('ig-followup');f.el('reply-body').value='A separate follow-up';await f.click('reply-send');const post=f.calls.find(c=>c.opts.method==='POST');assert.equal(post.opts.body.after_attempt_id,'ira_sent');assert.equal(f.el('reply-send').disabled,true);assert.equal(f.el('ig-followup').hidden,true);
});
test('empty, overlong and trim-changing IG bodies are rejected before confirmation',async()=>{
 const f=fixture([loaded()]);await f.load();for(const body of ['', 'x'.repeat(1001),' leading','trailing ']){f.el('reply-body').value=body;await f.click('reply-send');}assert.equal(f.reviews.length,0);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,0);
});
test('cancelled review has no request or UUID and non-IG behavior stays unchanged',async()=>{
 const f=fixture([loaded()]);await f.load();f.window.confirm=()=>false;f.el('reply-body').value='Not approved';await f.click('reply-send');assert.equal(f.ids(),0);assert.equal(f.calls.length,1);
 const normal=loaded({thread:{id:'thread',audience:'staff',can_sms:true}});const g=fixture([normal,{ok:true},normal]);await g.load();g.el('reply-body').value=' Normal reply ';await g.click('reply-send');const body=g.calls.find(c=>c.opts.method==='POST').opts.body;assert.deepEqual(JSON.parse(JSON.stringify(body)),{thread_id:'thread',body:'Normal reply',channel:'in_app'});assert.equal(g.reviews.length,0);assert.ok(g.toasts.includes('Message sent'));
});
test('historical bubbles never turn provider receipt into delivery or read proof',async()=>{
 const f=fixture([loaded({items:[{id:'m',direction:'outbound',channel:'instagram',body:'Saved',created_at:1}],reply_attempt_history:[{...sent,message_id:'m'}]})]);await f.load();assert.match(f.el('bubbles').innerHTML,/Provider acceptance recorded; delivery\/read unverified/);
});
test('failed refresh pauses sends rather than trusting cached no-attempt state',async()=>{
 const f=fixture([loaded(),{ok:false,error:'unavailable'}]);await f.load();f.window.testComms.loadMessages('thread',false);await f.settle();f.el('reply-body').value='Blocked';await f.click('reply-send');assert.equal(f.el('reply-send').disabled,true);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,0);assert.match(f.el('ig-reply-status').textContent,/unavailable/);
});
test('newer accepted attempt invalidates a previously selected followup parent',async()=>{
 const f=fixture([loaded({reply_attempt_history:[sent]}),loaded({reply_attempt_history:[{...sent,attempt_id:'newer'}]})]);await f.load();await f.click('ig-followup');f.window.testComms.loadMessages('thread',false);await f.settle();assert.equal(f.el('reply-send').disabled,true);assert.equal(f.el('ig-followup').hidden,false);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,0);
});
