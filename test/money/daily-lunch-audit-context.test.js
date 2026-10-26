import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv} from '../helpers/sqlite-d1.js';
import {loadDailyLunchAuditContext} from '../../functions/_lib/daily_lunch_audit_context.js';
import {auditDraft} from '../../functions/_lib/governance.js';
import {auditSavedDraft,SOCIAL_AUDIT_CURRENT} from '../../functions/_lib/social_audit.js';
import {VERSION} from '../../functions/_lib/visual_audit_rubric.js';
import {auditAuthorityReferences} from '../../functions/_lib/audit_authority_refs.js';

const config=()=>({products:[{id:'caesar_wrap',name:'Chicken Caesar Wrap',description:'Chicken strips, romaine, Parmesan and Caesar dressing in a flour tortilla, served with golden fries.',image_url:'/assets/img/daily-lunch/caesar-wrap.png'},{id:'pechuguitas',name:'Pollito Empanizado',description:'Breaded chicken with fries.',image_url:null},{id:'ropa_vieja',name:'Ropa Vieja',description:'Shredded beef with congrí and plantains.',image_url:null}],weekdays:[],settings:{same_day_cutoff:'00:00',preorder_cutoff:'22:00'},dates:[{date:'2026-10-28',product_id:'caesar_wrap',enabled:true,sold_out:false},{date:'2026-10-29',product_id:'pechuguitas',enabled:true,sold_out:false},{date:'2026-10-30',product_id:'ropa_vieja',enabled:true,sold_out:false}]});
function fixture(){const env=ownerEnv();env.DB.sqlite.prepare('UPDATE daily_lunch_config SET config_json=?,version=4,updated_at=123 WHERE id=1').run(JSON.stringify(config()));return env;}
test('validated daily authority exposes recorded dates, ingredients, distinct current cutoff and exact source receipt',async()=>{
 const env=fixture();try{const result=await loadDailyLunchAuditContext(env);assert.equal(result.price_cents,1000);assert.deepEqual(result.receipt,{source:'d1_daily_lunch_config',status:'ok',version:4,updated_at:123,scheduled_dates:3});
 for(const text of ['2026-10-28: Chicken Caesar Wrap','2026-10-29: Pollito Empanizado','2026-10-30: Ropa Vieja','22:00 (10:00 p.m.)','America/New_York','Same-day daily lunch ordering is disabled','romaine, Parmesan','free delivery to one address'])assert.ok(result.text.includes(text),text);
 const refs=auditAuthorityReferences({menuText:result.text});assert.ok(refs.some(r=>r.quote.includes('22:00')));assert.ok(refs.some(r=>r.quote.includes('2026-10-28')));
 }finally{env.DB.sqlite.close();}
});
test('disabled/sold-out rows and weekday templates do not become announced available dates',async()=>{
 const env=fixture();try{const c=config();c.dates[0].enabled=false;c.dates[1].sold_out=true;c.weekdays=[{dow:1,product_id:'caesar_wrap',enabled:true}];env.DB.sqlite.prepare('UPDATE daily_lunch_config SET config_json=?').run(JSON.stringify(c));const r=await loadDailyLunchAuditContext(env);assert.equal(r.receipt.scheduled_dates,1);assert.ok(!r.text.includes('2026-10-28:'));assert.ok(!r.text.includes('2026-10-29:'));assert.ok(r.text.includes('2026-10-30:'));}finally{env.DB.sqlite.close();}
});
test('invalid/missing configuration fails into unavailable authority without invented offer facts',async()=>{
 for(const value of ['{"products":[]}',null]){const env=fixture();try{if(value===null)env.DB.exec('DELETE FROM daily_lunch_config');else env.DB.sqlite.prepare('UPDATE daily_lunch_config SET config_json=?').run(value);const r=await loadDailyLunchAuditContext(env);assert.equal(r.receipt.status,'unavailable');assert.equal(r.price_cents,null);assert.ok(!r.text.includes('$10'));}finally{env.DB.sqlite.close();}}
});
test('actual audit prompt and deterministic pricing use daily authority while retaining unknown-price rejection',async()=>{
 const env=fixture();const real=globalThis.fetch;const requests=[];env.ANTHROPIC_API_KEY='test-key';
 env.DB.exec("INSERT INTO menu_items(id,kind,name,description,price_cents,active,sort,created_at,updated_at) VALUES('test','plate','Regular plate','regular',1900,1,1,1,1)");
 globalThis.fetch=async(_url,init)=>{requests.push(JSON.parse(init.body));return Response.json({stop_reason:'end_turn',usage:{input_tokens:1,output_tokens:1},content:[{text:JSON.stringify({brand_score:100,flags:[],verdict:'pass'})}]});};
 try{const a=await auditDraft(env,{caption:'Chicken Caesar Wrap on October 28, $10. Order and pay by 10 p.m. Eastern the day before delivery. anejocateringco.com/order?category=daily'});assert.ok(!a.flags.some(f=>/not on the live menu/.test(f.detail)));assert.ok(requests[0].system.includes('22:00 (10:00 p.m.)'));assert.ok(requests[0].system.includes('2026-10-28: Chicken Caesar Wrap'));assert.ok(!requests[0].system.includes('must NEVER be stated as a fixed fact'));assert.ok(requests[0].system.includes('Do not substitute standard-order cutoffs'));
 const b=await auditDraft(env,{caption:'Lunch $10.01'});assert.ok(b.flags.some(f=>/10.01.*not on the live menu/.test(f.detail)));
 }finally{globalThis.fetch=real;env.DB.sqlite.close();}
});
const fakeAudit=async()=>({brand_score:100,flags:[],verdict:'pass',rubric_version:VERSION,score_meaning:'test fixture only'});
function post(env){env.DB.exec("INSERT INTO social_posts(id,status,caption,public_token,created_at,updated_at) VALUES('p','draft','Caption','token',1,1)");env.DB.exec("INSERT INTO social_post_media(id,post_id,seq,media_key,public_token,created_at) VALUES('m','p',0,'marketing-library/test.jpg','media-token',1)");env.MEDIA={get:async()=>({size:4,arrayBuffer:async()=>new Uint8Array([255,216,255,217]).buffer})};}
for(const mutation of ['json','version','remove','ops'])test('saved audit becomes stale and in-flight write refuses '+mutation+' source change',async()=>{
 const env=fixture();post(env);try{assert.equal((await auditSavedDraft(env,'p','Caption',fakeAudit)).ok,true);assert.equal(env.DB.one('SELECT '+SOCIAL_AUDIT_CURRENT+" AS current FROM social_posts WHERE id='p'").current,1);
 const mutate=()=>{if(mutation==='json'){const c=config();c.settings.preorder_cutoff='21:00';env.DB.sqlite.prepare('UPDATE daily_lunch_config SET config_json=?').run(JSON.stringify(c));}else if(mutation==='version')env.DB.exec('UPDATE daily_lunch_config SET version=version+1');else if(mutation==='remove')env.DB.exec('DELETE FROM daily_lunch_config');else env.DB.exec("INSERT INTO app_settings(key,value,updated_at) VALUES('ops.closed_dates','2026-10-28',321) ON CONFLICT(key) DO UPDATE SET value='2026-10-28',updated_at=321");};
 const response=await auditSavedDraft(env,'p','Caption',async()=>{mutate();return fakeAudit();});assert.equal(response.status,409);assert.equal(env.DB.one('SELECT '+SOCIAL_AUDIT_CURRENT+" AS current FROM social_posts WHERE id='p'").current,0);
 }finally{env.DB.sqlite.close();}
});

test('visual audit receives dated lunch authority and retains unavailable response instead of fabricating acceptance',async()=>{
 const env=fixture();env.ANTHROPIC_API_KEY='test-key';const original=globalThis.fetch;let body;
 globalThis.fetch=async(_url,init)=>{body=JSON.parse(init.body);return Response.json({stop_reason:'end_turn',content:[{text:'{}'}]});};
 try{const r=await auditDraft(env,{caption:'Chicken Caesar Wrap October 28, $10. Other dates: Pollito October 29 and Ropa Vieja October 30.',images:[{data:'test fixture only'}]});
 assert.ok(body.system.includes('2026-10-28: Chicken Caesar Wrap'));assert.ok(body.system.includes('22:00 (10:00 p.m.)'));assert.ok(body.system.includes('does not assert that every listed dish is pictured'));assert.equal(r.verdict,'flag');assert.equal(r.brand_score,null);assert.equal(r.input_coverage.daily_lunch.source,'d1_daily_lunch_config');assert.equal(r.input_coverage.daily_lunch.version,4);
 }finally{globalThis.fetch=original;env.DB.sqlite.close();}
});
