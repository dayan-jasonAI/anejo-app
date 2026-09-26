import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../../public/hub/owner/assets/ana-inbox.js',import.meta.url),'utf8');
function setup(responses=[]){
  const element=tag=>({tag,textContent:'',children:[],setAttribute(k,v){this[k]=v;},appendChild(e){this.children.push(e);},replaceChildren(){this.children=[];},addEventListener(k,f){this[k]=f;}});
  const root=element('root'),window={},calls=[];
  vm.runInNewContext(code,{window,document:{createElement:element},Date,encodeURIComponent,Hub:{api:async(...args)=>{calls.push(args);const response=responses.shift();if(response instanceof Error)throw response;return response;}}});
  const nodes=()=>{const all=[];const walk=n=>{all.push(n);n.children.forEach(walk);};walk(root);return all;};
  return {root,calls,nodes,text:()=>nodes().map(n=>n.textContent).join('\n'),ui:window.AnejoAnaInbox};
}
const data=()=>({ok:true,drafts_read_status:'available',escalations_read_status:'available',reply_attempt_history:'available',items:[{id:'thread&1',username:'<img onerror=bad>',kind:'dm',last_inbound:'Hello',drafts:[{body:'<script>raw draft</script>'}],reply_attempts:[{id:'receipt1',state:'unknown',created_at:1,error_code:'provider_outcome_unknown'}]}]});
test('Ana review renders literal drafts and receipt uncertainty; mounting and refreshing only reads',async()=>{
  const f=setup([data(),data()]);await f.ui.mount(f.root);
  assert.match(f.text(),/Delivery outcome unknown/);assert.match(f.text(),/<script>raw draft<\/script>/);
  assert.equal(f.nodes().find(n=>n.tag==='a').href,'/hub/comms.html#t=thread%261');
  await f.nodes().find(n=>n.tag==='button').click();
  assert.equal(f.calls.length,2);assert.ok(f.calls.every(args=>args.length===1&&args[0]==='/api/hub/owner/social-inbox'));
  assert.ok(f.nodes().every(n=>!Object.hasOwn(n,'innerHTML')));
});
test('unavailable and bounded snapshots never claim an empty queue or delivered reply',()=>{
  const f=setup();const d=data();d.drafts_read_status='unavailable';d.escalations_read_status='unavailable';d.reply_attempt_history='unavailable';d.items=[];
  f.ui.render(f.root,d);assert.match(f.text(),/does not mean no pending drafts/);assert.match(f.text(),/not complete history/);assert.match(f.text(),/Delivery cannot be verified/);assert.doesNotMatch(f.text(),/queue is clear/);
  f.ui.render(f.root,null);assert.match(f.text(),/Inbox unavailable/);
});
test('saved provider receipt is not displayed as proof of delivery or current running work',()=>{
  const f=setup();const d=data();d.items[0].reply_attempts=[{id:'sent1',state:'sent',completed_at:1,provider_message_id:'meta1'},{id:'pending1',state:'claimed',created_at:1}];
  f.ui.render(f.root,d);assert.match(f.text(),/recipient delivery or reading is not verified/);assert.match(f.text(),/pending or interrupted/);assert.match(f.text(),/Provider reference: meta1/);
});


test('only saved acknowledgments expose local recovery; one click sends no provider operation',async()=>{
 const f=setup([{reconciliation_only:true,sent:true}]),d=data();
 d.items[0].reply_attempts[0].has_acceptance_receipt=1;
 d.items[0].reply_attempts[0].message_id='out1';
 f.ui.render(f.root,d);
 const recover=f.nodes().find(n=>n.tag==='button');
 await recover.click();await recover.click();
 assert.equal(f.calls.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0][1])),{method:'POST',body:{op:'reconcile',thread_id:'thread&1',message_id:'out1',attempt_id:'receipt1'}});
 assert.match(f.text(),/Recipient delivery remains unverified; no reply was resent/);
 const missing=setup();missing.ui.render(missing.root,data());
 assert.equal(missing.nodes().filter(n=>n.tag==='button').length,0);
});
test('recovery failure cannot claim provider acceptance and mount rereads state',async()=>{
 const d=data();d.items[0].reply_attempts[0].has_acceptance_receipt=1;
 d.items[0].reply_attempts[0].message_id='out1';
 const f=setup([new Error('offline')]);f.ui.render(f.root,d);
 await f.nodes().find(n=>n.tag==='button').click();
 assert.match(f.text(),/Recovery could not be verified/);
 assert.doesNotMatch(f.text(),/Provider acceptance recorded locally/);
 const mounted=setup([d,{reconciliation_only:true,sent:true},data()]);await mounted.ui.mount(mounted.root);
 await mounted.nodes().find(n=>n.textContent==='Recover saved acknowledgment').click();
 assert.equal(mounted.calls.length,3);assert.equal(mounted.calls[2].length,1);
 assert.match(mounted.text(),/Delivery outcome unknown/);
});
test('resolved API errors and failed rereads cannot claim recovery',async()=>{
 const d=data();d.items[0].reply_attempts[0].has_acceptance_receipt=true;d.items[0].reply_attempts[0].message_id='out1';
 const f=setup([{ok:false,error:'network_error'}]);f.ui.render(f.root,d);
 await f.nodes().find(n=>n.tag==='button').click();
 assert.match(f.text(),/Recovery remains unverified/);
 const mounted=setup([d,{reconciliation_only:true,sent:true},{ok:false,error:'read_failed'}]);await mounted.ui.mount(mounted.root);
 await mounted.nodes().find(n=>n.textContent==='Recover saved acknowledgment').click();
 assert.match(mounted.text(),/Inbox unavailable/);
 assert.doesNotMatch(mounted.text(),/Provider acceptance recorded locally/);
});
