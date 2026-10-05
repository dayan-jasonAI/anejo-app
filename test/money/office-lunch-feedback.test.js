import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {onRequestPost,onRequestGet} from '../../functions/api/contract/feedback.js';
import {validateFeedback} from '../../functions/_lib/lunch_feedback.js';
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE contract_sites(id TEXT,name TEXT,account_id TEXT,intake_token TEXT,active INTEGER);CREATE TABLE contract_accounts(id TEXT,status TEXT);CREATE TABLE contract_intake_devices(id TEXT,site_id TEXT,revoked INTEGER);CREATE TABLE contract_orders(id TEXT,site_id TEXT,service_date TEXT,item_name TEXT,headcount INTEGER,order_id TEXT);CREATE TABLE deliveries(id TEXT,order_id TEXT,status TEXT,completed_at INTEGER);
 INSERT INTO contract_sites VALUES('site','Sample office','account','sample-token',1);INSERT INTO contract_accounts VALUES('account','active');INSERT INTO contract_intake_devices VALUES('device','site',0);INSERT INTO contract_orders VALUES('order','site','2026-01-01','Potato',2,'kitchen-order'),('other','other-site','2026-01-01','Other meal',2,'other-kitchen'),('future','site','2099-01-01','Future meal',2,'future-kitchen');`);
 db.exec("INSERT INTO deliveries VALUES('delivery','kitchen-order','completed',1);");
 db.exec(readFileSync(new URL('../../migrations/0143_office_lunch_feedback.sql',import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('../../migrations/0144_lunch_survey_reminders.sql',import.meta.url),'utf8'));
 const DB={prepare(sql){return{bind(...args){const q=db.prepare(sql);return{first:async()=>q.get(...args)||null,all:async()=>({results:q.all(...args)}),run:async()=>({meta:{changes:q.run(...args).changes}})};}};}};
 return{db,env:{DB}};
}
const valid={t:'sample-token',response_id:'12345678-1234-1234-1234-123456789abc',order_id:'order',rating:8,mood:null,eat_again:'yes',suggestion:'More wraps'};
function req(body=valid,cookie='aintake_site=device'){return new Request('https://example.com/api/contract/feedback',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:'https://example.com'},body:JSON.stringify(body)});}
test('reject malformed scores and mixed modes without inventing a score',()=>{for(const changes of [{rating:'8'},{rating:0},{rating:11},{rating:8.5},{rating:8,mood:'happy'},{rating:null,mood:'other'},{suggestion:'x'.repeat(501)},{eat_again:'maybe'}])assert.equal(validateFeedback({...valid,...changes}),null);assert.equal(validateFeedback({...valid,rating:null,mood:'happy'}).rating,null);});
test('device verification is required even with office token',async()=>{const {db,env}=fixture();assert.equal((await onRequestPost({request:req(valid,''),env})).status,403);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contract_lunch_feedback').get().n,0);});
test('responses save separately, retry is idempotent and changed retry refused',async()=>{const {db,env}=fixture();const first=await onRequestPost({request:req(),env});assert.equal(first.status,200);assert.equal((await first.json()).ok,true);assert.equal((await (await onRequestPost({request:req(),env})).json()).duplicate,true);assert.equal((await onRequestPost({request:req({...valid,rating:2}),env})).status,409);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contract_lunch_feedback').get().n,1);});
test('mood stays separate and capacity caps responses at ordered meals',async()=>{const {db,env}=fixture();await onRequestPost({request:req(),env});const second={...valid,response_id:'22345678-1234-1234-1234-123456789abc',rating:null,mood:'sad',eat_again:'unanswered'};assert.equal((await onRequestPost({request:req(second),env})).status,200);assert.equal(db.prepare('SELECT AVG(rating) AS average FROM contract_lunch_feedback').get().average,8);assert.equal((await onRequestPost({request:req({...second,response_id:'32345678-1234-1234-1234-123456789abc'}),env})).status,409);});
test('foreign-office and future orders cannot receive ratings',async()=>{const {env}=fixture();for(const order_id of ['other','future'])assert.equal((await onRequestPost({request:req({...valid,order_id}),env})).status,404);});
test('cross-origin post refused',async()=>{const {env}=fixture();const request=req();request.headers.set('Origin','https://other.com');assert.equal((await onRequestPost({request,env})).status,403);});
test('office list hides other offices and future meals',async()=>{const {env}=fixture();const request=new Request('https://example.com/api/contract/feedback?t=sample-token',{headers:{Cookie:'aintake_site=device'}});const r=await onRequestGet({request,env});assert.equal(r.status,200);assert.deepEqual((await r.json()).orders.map(x=>x.id),['order']);});

test('undelivered lunch cannot accept a rating',async()=>{const {db,env}=fixture();db.exec("UPDATE deliveries SET status='pending'");assert.equal((await onRequestPost({request:req(),env})).status,404);});
test('feedback stores actual delivery linkage',async()=>{const {db,env}=fixture();await onRequestPost({request:req(),env});assert.equal(db.prepare('SELECT delivery_id FROM contract_lunch_feedback').get().delivery_id,'delivery');});

test('SMS capability permits feedback without cookie only for the delivered meal',async()=>{const {db,env}=fixture();const token='b'.repeat(64),ts=Date.now();db.prepare("INSERT INTO contract_survey_reminders(id,contract_order_id,site_id,delivery_id,completed_at,due_at,to_number,link_token,status,created_at,updated_at) VALUES('reminder','order','site','delivery',?,?,?,?,'sent',?,?)").run(ts,ts,'+15615550100',token,ts,ts);const r=await onRequestGet({env,request:new Request('https://example.com/api/contract/feedback?r='+token)});assert.deepEqual((await r.json()).orders.map(x=>x.id),['order']);assert.equal((await onRequestPost({env,request:req({...valid,t:'',r:token},'')})).status,200);assert.equal((await onRequestPost({env,request:req({...valid,t:'',r:token,order_id:'other'},'')})).status,403);});
