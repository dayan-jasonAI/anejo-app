import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {ownerEnv} from '../helpers/sqlite-d1.js';import {buildSpine,renderSpine,leadIntelFeedback,leadReply} from '../../functions/_lib/team_lead.js';
function seed(env,id,{status='done',by='lead',body='Recorded answer '+id,missing=false,at=1,sources='["https://example.test/source"]'}={}){
 if(!missing)env.DB.sqlite.prepare('INSERT INTO market_intel(id,kind,title,body,sources_json,created_at) VALUES(?,?,?,?,?,?)').run(id,'adhoc','Question title',body,sources,at);
 env.DB.sqlite.prepare('INSERT INTO intel_requests(id,question,status,requested_by,answer_intel_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('rq_'+id,'Lead question '+id,status,by,id,at,at);
}
test('actual spine includes completed linked Lead answers only with explicitly unverified source snapshot',async()=>{
 const env=ownerEnv();seed(env,'good');seed(env,'pending',{status:'pending'});seed(env,'missing',{missing:true});seed(env,'unrelated',{by:'owner'});
 const spine=await buildSpine(env),text=renderSpine(spine);assert.match(text,/Recorded answer good/);assert.doesNotMatch(text,/Recorded answer pending|Recorded answer unrelated/);
 assert.deepEqual(spine.input_components.intel.source_ids,['good']);assert.ok(spine.input_components.intel.documents.some(d=>d.id==='rq_good'));assert.match(text,/not independently verified facts/);assert.match(text,/reported_sources/);assert.equal(spine.coverage.intel.read_status,'ok');
 assert.equal(spine.intel.receipt.rendered_sha256,createHash('sha256').update(spine.intel.text).digest('hex'));assert.equal(spine.intel.receipt.supplied_chars,spine.intel.text.length);
});
test('reader failure is unavailable rather than empty; no citation identifiers supplied',async()=>{
 const env=ownerEnv(),prepare=env.DB.prepare;env.DB.prepare=sql=>{if(sql.includes('FROM intel_requests r JOIN'))throw Error('db down');return prepare(sql);};const r=await leadIntelFeedback(env);assert.equal(r.receipt.read_status,'unavailable');assert.deepEqual(r.receipt.source_ids,[]);assert.match(r.text,/Read status: unavailable/);
});
test('oversized or malformed answers are omitted entirely, limits and receipt only describe supplied documents',async()=>{
 const env=ownerEnv();seed(env,'oversized',{body:'x'.repeat(4001),at:20});seed(env,'bad_sources',{sources:'not json',at:19});for(let i=0;i<5;i++)seed(env,'valid'+i,{at:i});
 const r=await leadIntelFeedback(env);assert.equal(r.receipt.truncated,true);assert.equal(r.receipt.selection_may_be_limited,true);assert.equal(r.receipt.selection_limit,5);assert.ok(r.receipt.source_ids.length===3);assert.ok(!r.receipt.source_ids.includes('oversized'));assert.doesNotMatch(r.text,/x{100}|not json/);assert.ok(r.receipt.supplied_chars<7000);
});
test('total prompt budget omits whole answer records rather than partial quote authority',async()=>{
 const env=ownerEnv();for(let i=0;i<5;i++)seed(env,'large'+i,{body:('answer'+i+' ').repeat(300),at:i});const r=await leadIntelFeedback(env);assert.equal(r.receipt.truncated,true);assert.ok(r.receipt.source_ids.length<5);assert.ok(r.text.length<7000);for(const id of r.receipt.source_ids)assert.ok(r.text.includes(id));
});
test('actual leadReply transmits and receipts same intel snapshot despite changes during mocked inference',async t=>{
 const env=ownerEnv({ANTHROPIC_API_KEY:'test-only'});seed(env,'initial');let sent;const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async(url,init)=>{sent=JSON.parse(init.body);seed(env,'later',{at:99});env.DB.exec("UPDATE market_intel SET body='Changed after request' WHERE id='initial'");return new Response(JSON.stringify({content:[{text:'Proposed direction.'}],usage:{input_tokens:1,output_tokens:1}}),{status:200});};
 const r=await leadReply(env,{message:'Use the answer to my question.'});assert.equal(r.ok,true);assert.deepEqual(r.input_context.supplied_intel_ids,['initial']);assert.match(sent.system,/Recorded answer initial/);assert.doesNotMatch(sent.system,/Changed after request|Recorded answer later/);
 const receipt=env.DB.one('SELECT * FROM inference_receipts WHERE id=?',r.input_receipt.receipt_id),components=JSON.parse(receipt.components_json);assert.deepEqual(components.intel.source_ids,['initial']);assert.equal(components.intel.rendered_sha256,r.input_context.components.intel.rendered_sha256);assert.match(sent.system,/REPORTED INTELLIGENCE FEEDBACK/);
});
test('valid maximum owner answer is included whole and malformed source/row data is omitted safely',async()=>{
 const env=ownerEnv();seed(env,'owner_max',{body:'a'.repeat(4000)});const r=await leadIntelFeedback(env);assert.deepEqual(r.receipt.source_ids,['owner_max']);assert.ok(r.text.includes('a'.repeat(4000)));assert.equal(r.receipt.truncated,false);
 const prepare=env.DB.prepare;env.DB.prepare=sql=>sql.includes('FROM intel_requests r JOIN')?{all:async()=>({results:[null,{question:null},{request_id:'x',intel_id:'y',question:'q',title:'t',body:'b',kind:'adhoc',sources_json:'[{}]',created_at:1,answered_at:1}]})}:prepare(sql);
 const bad=await leadIntelFeedback(env);assert.deepEqual(bad.receipt.source_ids,[]);assert.equal(bad.receipt.truncated,true);
});
