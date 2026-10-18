import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { anaDailyLunchContext, anaCustomerContext, draftReply } from '../../functions/_lib/ana_social.js';
import { onRequestPost as chat } from '../../functions/api/chat.js';

function configure(DB) {
  const config = {products:[{id:'papa',name:'Papa Añejo',description:'Loaded potato.'},{id:'quesadilla',name:'Chicken quesadillas',description:'Chicken and cheese.'}],settings:{same_day_cutoff:'14:00',preorder_cutoff:'19:00'},weekdays:[{dow:1,product_id:'quesadilla',enabled:true}],dates:[{date:'2026-10-19',product_id:'papa',enabled:true,sold_out:false},{date:'2026-10-20',product_id:'quesadilla',enabled:true,sold_out:true}]};
  const save = () => DB.sqlite.prepare('UPDATE daily_lunch_config SET config_json=?,version=version+1 WHERE id=1').run(JSON.stringify(config));
  save(); return {config,save};
}
const facts = s => JSON.parse(s.slice(s.indexOf('{')));
test('Ana daily lunch reads exact scheduled dates, live cutoffs and checkout availability without weekday invention', async t => {
  const DB=makeSqliteD1();t.after(()=>DB.sqlite.close());const {config,save}=configure(DB);
  const first=await anaDailyLunchContext({DB},new Date('2026-10-19T17:30:00Z'));
  assert.match(first,/order\?category=daily/);assert.match(first,/One featured meal/);assert.doesNotMatch(first,/DGP|8\.50|11:00 ordering/);
  const parsed=facts(first);assert.equal(parsed.price_usd,10);assert.equal(parsed.same_day_cutoff_eastern,'14:00');
  assert.equal(parsed.days[0].meal,'Papa Añejo');assert.equal(parsed.days[0].orderable,true);assert.equal(parsed.days[1].reason,'sold_out');assert.equal(parsed.days[7].reason,'not_scheduled');
  config.settings.same_day_cutoff='13:00';save();
  const second=facts(await anaDailyLunchContext({DB},new Date('2026-10-19T17:30:00Z')));
  assert.equal(second.same_day_cutoff_eastern,'13:00');assert.equal(second.days[0].reason,'same_day_cutoff');assert.equal(second.days[0].orderable,false);
});
test('unreadable daily lunch data explicitly forbids guessing rather than falling back to historical cutoffs', async () => {
  const block=await anaDailyLunchContext({DB:{prepare(){throw Error('offline');}}});
  assert.match(block,/could not be verified/);assert.match(block,/Do not guess/);assert.doesNotMatch(block,/14:00|11:00|Papa/);
});
test('website and Instagram prompts both carry live daily lunch facts and reread owner changes', async t => {
  const DB=makeSqliteD1();t.after(()=>DB.sqlite.close());const {config,save}=configure(DB);const env={DB,ANTHROPIC_API_KEY:'fixture'};
  const prior=globalThis.fetch;t.after(()=>globalThis.fetch=prior);const prompts=[];
  globalThis.fetch=async (url,init)=>{assert.equal(String(url),'https://api.anthropic.com/v1/messages');prompts.push(JSON.parse(init.body).system);return new Response(JSON.stringify({content:[{text:'Fixture answer.'}],usage:{input_tokens:1,output_tokens:1}}));};
  const request=()=>new Request('https://example.test/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'¿Cómo pido almuerzo diario?'}]})});
  assert.equal((await chat({request:request(),env})).status,200);assert.equal((await draftReply(env,{text:'Daily lunch?'})).ok,true);
  for(const p of prompts){assert.match(p,/LIVE DAILY LUNCH/);assert.match(p,/"price_usd":10/);assert.match(p,/"same_day_cutoff_eastern":"14:00"/);assert.match(p,/order\?category=daily/);}
  config.settings.same_day_cutoff='13:15';save();assert.match(await anaCustomerContext(env,'daily lunch'),/"same_day_cutoff_eastern":"13:15"/);
});
