import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {validateDailyConfig,dailyDay} from '../../functions/_lib/daily_lunch.js';
import {DEFAULTS} from '../../functions/_lib/operating.js';
const draft=JSON.parse(readFileSync(new URL('../../docs/marketing/daily-lunch-week-one-2026-10-05/proposed-owner-config.json',import.meta.url),'utf8'));
test('dated Week 1 matches owner-confirmed meals and adds supplied Caesar image',()=>{
 const config=validateDailyConfig(draft.config);
 assert.equal(draft.version,1);
 assert.deepEqual(config.settings,{same_day_cutoff:'11:00',preorder_cutoff:'19:00'});
 assert.deepEqual(config.dates.filter(d=>d.date>='2026-10-05').map(d=>[d.date,d.product_id]),[
 ['2026-10-05','papa'],['2026-10-06','chicken_quesadillas'],['2026-10-07','chicken_caesar_wrap'],['2026-10-08','pechuguitas'],['2026-10-09','fried_rice']]);
 assert.equal(config.dates.filter(d=>d.date<'2026-10-05').length,4);
 const image=config.products.find(p=>p.id==='chicken_caesar_wrap').image_url;
 assert.ok(existsSync(new URL('../../public'+image,import.meta.url)));
});
test('tomorrow quesadillas enforce existing preorder cutoff and next-day same-day cutoff',()=>{
 const config=validateDailyConfig(draft.config);
 const before=dailyDay(config,'2026-10-06',DEFAULTS,new Date('2026-10-05T22:59:00Z'));
 assert.equal(before.product_id,'chicken_quesadillas');assert.equal(before.orderable,true);
 const after=dailyDay(config,'2026-10-06',DEFAULTS,new Date('2026-10-05T23:00:00Z'));
 assert.equal(after.reason,'preorder_cutoff');assert.equal(after.orderable,false);
 const tomorrow=dailyDay(config,'2026-10-06',DEFAULTS,new Date('2026-10-06T13:00:00Z'));
 assert.equal(tomorrow.orderable,true);assert.equal(tomorrow.free_delivery,false);
});
