import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { loadMarketingOutcomes, renderMarketingOutcomes } from '../../functions/_lib/marketing_outcomes.js';
const now=1800000000000;
function fixture(){
 const DB=makeSqliteD1();
 for(const id of ['a','b']) DB.sqlite.prepare('INSERT INTO tracked_links (id,code,label,dest_url,utm_campaign,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id,id,id,'/catering','summer',1,1);
 return {DB};
}
function order(env,id,status,campaign='summer',created=now){env.DB.sqlite.prepare('INSERT INTO orders (id,status,utm_campaign,created_at,updated_at,total_estimate_cents) VALUES (?,?,?,?,?,?)').run(id,status,campaign,created,created,999999);}
function lead(env,id,kind='catering',campaign='summer'){env.DB.sqlite.prepare('INSERT INTO leads (id,kind,utm_campaign,created_at) VALUES (?,?,?,?)').run(id,kind,campaign,now);}
test('campaign outcomes deduplicate shared link campaigns and exclude unpaid, canceled, old and future records',async()=>{
 const env=fixture();for(const status of ['paid','prep','ready','fulfilled','pending','canceled'])order(env,status,status);
 order(env,'old','paid','summer',now-61*86400000);order(env,'future','paid','summer',now+1);
 order(env,'untracked','paid',null);lead(env,'quote');lead(env,'tasting','tasting');lead(env,'untrackedquote','catering','other');
 const out=await loadMarketingOutcomes(env,{now});
 assert.deepEqual(out.totals,{paidOrders:5,quoteRequests:2});assert.deepEqual(out.matched,{paidOrders:4,quoteRequests:1});
 assert.deepEqual(out.campaigns,[{campaign:'summer',paidOrders:4,quoteRequests:1,comparison:'descriptive_only'}]);
 assert.equal(out.revenue,null);assert.equal(out.roas,null);assert.equal(out.quoteBookings,null);
 assert.match(renderMarketingOutcomes(out),/Requests are not bookings/);
 assert.match(renderMarketingOutcomes(out),/No causal winner/);
});
test('small samples keep observed counts but comparisons explicitly unknown',async()=>{
 const env=fixture();order(env,'one','paid');const out=await loadMarketingOutcomes(env,{now});
 assert.equal(out.campaigns[0].comparison,'unknown_insufficient_sample');
 assert.match(renderMarketingOutcomes(out),/insufficient sample/);
});
test('empty successful query is observed zero, missing schema and database are unknown',async()=>{
 const env=fixture();const empty=await loadMarketingOutcomes(env,{now});assert.equal(empty.status,'observed');assert.equal(empty.totals.paidOrders,0);
 env.DB.exec('DROP TABLE tracked_links');const failed=await loadMarketingOutcomes(env,{now});assert.equal(failed.status,'unknown');assert.equal(failed.totals,undefined);
 assert.equal((await loadMarketingOutcomes({}, {now})).status,'unknown');assert.match(renderMarketingOutcomes(failed),/unknown/);
});

test('retrospective includes outcome evidence in the bounded analyst prompt',async()=>{
 const {buildRetrospective,renderRetrospective,RETRO_BUDGET}=await import('../../functions/_lib/retrospective.js');
 const env=fixture();order(env,'recent','paid','summer',Date.now());
 const retro=await buildRetrospective(env);
 assert.equal(retro.outcomes.matched.paidOrders,1);
 const prompt=renderRetrospective(retro);assert.ok(prompt.length<=RETRO_BUDGET);
 assert.match(prompt,/Sales outcomes: last 60 days/);assert.match(prompt,/1\/1 orders/);assert.match(prompt,/ROAS.*unknown/);
});
