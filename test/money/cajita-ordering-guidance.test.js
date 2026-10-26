// The Oct26 Cajita clarification changes inquiry guidance, not unclassified checkout gates.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CAJITA_NOTICE_HOURS,CAJITA_ORDERING_POLICY_VERSION,CAJITA_ORDERING_GUIDANCE,CATERING_ORDERING_GUIDANCE} from '../../functions/_lib/cajita-policy.js';
import {onRequestGet as catalog} from '../../functions/api/catering-catalog.js';
import {onRequestPost as estimate} from '../../functions/api/catering-estimate.js';
import {validateCateringNotice,CATERING_NOTICE_HOURS} from '../../functions/_lib/catering-notice.js';
import {anaSystemPrompt} from '../../functions/_lib/ana_social.js';
import {buildSpine} from '../../functions/_lib/team_lead.js';
import {CRITERIA,VERSION} from '../../functions/_lib/visual_audit_rubric.js';
import {SOCIAL_AUDIT_CURRENT} from '../../functions/_lib/social_audit.js';
import {BRAND_CONTEXT} from '../../functions/_lib/brand_context.js';
import {BRAND_BRIEF} from '../../functions/_lib/brand_brief.js';
import {TERMS} from '../../functions/_lib/catering_terms.js';

const items=JSON.parse(readFileSync(new URL('../../docs/menu-2026-09/catalog.json',import.meta.url)));
const env={DB:{prepare(sql){return{bind(){return this;},async all(){return{results:sql.includes('menu_items')?items:[]};},async first(){return null;}};}}};

test('catalog and estimate expose Cajita48 separately while generic printing stays72 and custom food stays quoted',async()=>{
 const get=await catalog({env,request:new Request('https://example.com/api/catering-catalog')});
 const mixed=await estimate({env,request:new Request('https://example.com/api/catering-estimate',{method:'POST',body:JSON.stringify({products:[{id:'lechon',quantity:1},{id:'cajita-custom',quantity:20,notes:'Halloween theme'}],cajita_notice_hours:1,custom_printing_notice_hours:1,needs_review:false})})});
 assert.equal(get.status,200);assert.equal(mixed.status,200);
 for(const response of [get,mixed]){const data=await response.json();assert.equal(data.cajita_notice_hours,48);assert.equal(data.cajita_notice_policy_version,CAJITA_ORDERING_POLICY_VERSION);assert.equal(data.minimum_notice_hours,48);assert.equal(data.custom_printing_notice_hours,72);if(data.unpriced){assert.ok(data.unpriced.some(i=>i.id==='cajita-custom'));assert.ok(data.items.every(i=>!i.id.includes('cajita')));}}
});
test('Cajita guidance does not let a caller flag shorten generic custom printing or the refund window',()=>{
 assert.equal(CAJITA_NOTICE_HOURS,48);assert.equal(CATERING_NOTICE_HOURS.customPrinting,72);assert.equal(TERMS.deposit_refundable_hours,72);
 const eventAt=Date.parse('2026-11-02T17:00:00Z');
 const args={eventDate:'2026-11-02',eventTime:'12:00',customPrinting:true,now:eventAt-48*3600000,service:'cajita',cajita:true,cajita_notice_hours:48};
 const blocked=validateCateringNotice(args);assert.equal(blocked.ok,false);assert.equal(blocked.minHours,72);
 assert.equal(validateCateringNotice({...args,now:eventAt-72*3600000}).ok,true);
 assert.equal(validateCateringNotice({...args,customPrinting:false}).ok,true);
});
test('Ana and Team Lead carry the exact Cajita48 exception with quantity-based review, not a fixed price or capacity promise',async()=>{
 const menu={items:[],bowls:{},nonBowls:{},modifiers:{}};
 const prompt=anaSystemPrompt(menu,'');const spine=await buildSpine(env);
 for(const value of [prompt,spine.surfaces.ordering]){assert.ok(value.includes(CATERING_ORDERING_GUIDANCE));assert.match(value,/quantity-based quote/);assert.match(value,/Other bespoke custom-printed catering requires at least 72 hours/);}
 assert.doesNotMatch(CAJITA_ORDERING_GUIDANCE,/\$|unlimited|guaranteed|72/);
});
test('compiled brand fallbacks preserve the explicit current Cajita exception from the maintained source',()=>{
 const doc=readFileSync(new URL('../../docs/brand-standards-brief.md',import.meta.url),'utf8');
 for(const value of [doc,BRAND_CONTEXT,BRAND_BRIEF])assert.ok(value.includes(CATERING_ORDERING_GUIDANCE));
});
test('new audit version contains the scoped rule and makes previous audit receipts stale',()=>{
 assert.equal(VERSION,'anejo-visual-19');assert.ok(CRITERIA.find(c=>c.id==='claims').rule.includes(CATERING_ORDERING_GUIDANCE));
 assert.ok(SOCIAL_AUDIT_CURRENT.includes("='anejo-visual-19'"));assert.equal(SOCIAL_AUDIT_CURRENT.includes("='anejo-visual-18'"),false);
});
