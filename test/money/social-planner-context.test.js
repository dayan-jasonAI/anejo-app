import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAutomation } from '../../functions/_lib/automations.js';
import { makeKV } from '../helpers/d1.js';
function harness() {
 const provenance=[]; const receipts=[]; const links=[]; const scheduled=[];
 const state={rules:[{id:'supplied',text:'Retained owner instruction',updated_at:3},{id:'blank',text:'  ',updated_at:2},{id:'oversized',text:'x'.repeat(20000),updated_at:1}],briefs:[{id:'brief-a',title:'First supplied brief',status:'draft'},{id:'brief-b',title:'Second supplied brief',status:'draft'}]};
 const db={prepare(sql){let args=[];const stmt={bind(...a){args=a;return stmt;},async first(){if(/SUM\(cost_microdollars\)/.test(sql))return {c:0};if(/COUNT\(\*\) n FROM social_posts/.test(sql))return {n:0};return null;},async all(){
 if(/FROM menu_items/.test(sql))return {results:state.menu || [{id:'vida',kind:'bowl',name:'VIDA',price_cents:1999,availability:'available',active:1}]};
 if(/FROM trust_ledger/.test(sql))return {results:[{category:'menu'}]};
 if(/FROM training_rules/.test(sql) && state.trainingUnavailable)throw new Error('unavailable');
 if(/FROM training_rules/.test(sql))return {results:state.rules};
 if(/FROM team_briefs/.test(sql))return {results:state.briefs};
 return {results:[]};},async run(){if(/INSERT INTO inference_receipts/.test(sql)){if(state.failReceipt)throw new Error('receipt unavailable');receipts.push(args);}
 if(/SET inference_receipt_id/.test(sql))links.push(args);
 if(/SET status='scheduled'/.test(sql))scheduled.push(args);
 if(/INSERT INTO post_provenance/.test(sql)){const cols=sql.match(/post_provenance \(([^)]+)\)/)[1].split(',');provenance.push(Object.fromEntries(cols.map((c,i)=>[c,args[i]])));}return {meta:{changes:1}};}};return stmt;}};
 return {state,provenance,receipts,links,scheduled,env:{DB:db,SESSIONS:makeKV({'cfg:social_cadence':JSON.stringify({feed_per_week:1})}),ANTHROPIC_API_KEY:'test-key'}};
}
for(const selected of ['brief-a','new-brief',null]) test(`planner attributes only retained pre-inference context, selection ${selected}`,async()=>{
 const h=harness();const original=globalThis.fetch;let prompt='';
 globalThis.fetch=async(url,init)=>{
 const body=JSON.parse(init.body);
 if(!String(body.system).includes('You are the content writer'))throw new Error('mock audit unavailable');
 prompt=body.messages[0].content;
 h.state.rules=[{id:'new-rule',text:'Added during inference',updated_at:4}];
 h.state.briefs=[{id:'new-brief',title:'Added during inference',status:'draft'}];
 return new Response(JSON.stringify({content:[{text:JSON.stringify([{caption:'A bowl made with care.',image_brief:'Bowl of food',category:'menu',brief_id:selected,day_offset:0,hour:12}])}],usage:{input_tokens:10,output_tokens:10}}));
 };
 try{
 await runAutomation(h.env,'social_plan',{date:'2026-08-03'});
 assert.match(prompt,/Retained owner instruction/);assert.match(prompt,/\[brief_id: brief-a\]/);assert.ok(!prompt.includes('x'.repeat(20000)));
 assert.equal(h.provenance.length,1);
 assert.deepEqual(JSON.parse(h.provenance[0].rule_ids),['supplied']);
 assert.equal(h.provenance[0].brief_id,selected==='brief-a'?'brief-a':null);
 }finally{globalThis.fetch=original;}
});
for(const failReceipt of [false,true]) test(`catering-only planner records exact supplied request; receipt failure=${failReceipt} blocks auto trust`,async()=>{
 const h=harness();h.state.failReceipt=failReceipt;h.state.trainingUnavailable=true;
 h.state.menu=[{id:'catering_cajita',kind:'addon',name:'Cajita',price_cents:1800,availability:'available',active:1},{id:'traditional_lechon',kind:'addon',name:'Lechon',price_cents:2000,availability:'available',active:1},{id:'unrelated',kind:'addon',name:'Not an offering',price_cents:100,availability:'available',active:1}];
 const original=globalThis.fetch;let bodyText;
 globalThis.fetch=async(url,init)=>{
 const body=JSON.parse(init.body);if(!String(body.system).includes('You are the content writer'))throw new Error('mock audit unavailable');bodyText=init.body;
 return new Response(JSON.stringify({content:[{text:JSON.stringify([{caption:'Plan your catered gathering.',image_brief:'Catering tray',category:'menu',day_offset:0,hour:12}])}]}));};
 try{
 const out=await runAutomation(h.env,'social_plan',{date:'2026-08-03'});
 assert.ok(bodyText,'catering alone reaches inference');assert.match(bodyText,/\[catering_cajita\] Cajita/);assert.match(bodyText,/traditional_lechon/);assert.ok(!bodyText.includes('Not an offering'));
 assert.ok(!bodyText.includes('reason to act NOW'));assert.ok(!bodyText.includes('a save means'));
 assert.equal(h.provenance.length,1);assert.equal(h.provenance[0].rule_ids,undefined,'unavailable is not known empty');
 if(!failReceipt){assert.equal(h.receipts.length,1);assert.equal(h.receipts[0][3],bodyText);assert.equal(h.links[0][0],h.receipts[0][0]);const components=JSON.parse(h.receipts[0][5]);assert.equal(components.training.reads.rules,'unavailable');assert.ok(components.brand.rendered_sha256);}
 else{assert.equal(h.links.length,0);assert.equal(h.scheduled.length,0);assert.ok(out);}
 }finally{globalThis.fetch=original;}
});
