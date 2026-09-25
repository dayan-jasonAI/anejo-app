import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderCampaignDirection} from '../../functions/_lib/campaign_direction.js';
import {readFileSync} from 'node:fs';
const proposal={title:'Catering',objective:'x'.repeat(180),audience:'Local hosts',angle:'Premium presentation',cadence:'Weekly proposal',success_metric:'Qualified inquiries',product_ids:['catering-lechon'],assumptions:['Audience interest is proposed, not measured.'],questions:['Confirm event availability.'],channels:['instagram'],assets:['Full-frame tray photo required.']};
const brief={...proposal,channels:JSON.stringify(proposal.channels),assets_json:JSON.stringify(proposal.assets),id:'tb1',status:'draft',promotion_id:'p1',review_scope:'team_planning_only',promotion_proposal_json:JSON.stringify(proposal)};
test('reviewed planning direction preserves complete objective, assumptions and unresolved questions',()=>{
 const text=renderCampaignDirection(brief);assert.ok(text.includes(brief.objective));for(const field of ['product_ids','assumptions','questions','channels','assets'])for(const value of proposal[field])assert.ok(text.includes(value));assert.match(text,/No approval to publish, schedule, send/);assert.match(text,/UNVERIFIED ASSUMPTIONS/);assert.match(text,/OPEN QUESTIONS/);assert.match(text,/Proposed assets \(not existing assets\)/);
});
test('invalid promotion evidence cannot silently become ordinary governing direction',()=>{
 for(const changed of [{promotion_proposal_json:'bad'},{review_scope:'publish'},{promotion_proposal_json:'{}'}]){const text=renderCampaignDirection({...brief,...changed});assert.match(text,/do not use this brief/);assert.ok(!text.includes(brief.objective));}
});
test('both existing engines use the same preserved direction renderer',()=>{
 for(const file of ['team_lead.js','automations.js']){const source=readFileSync(new URL('../../functions/_lib/'+file,import.meta.url),'utf8');assert.match(source,/briefs.map\(renderCampaignDirection\)/);assert.match(source,/LEFT JOIN operator_campaign_promotions/);assert.match(source,/promotion_proposal_json/);}
});

test('edited promoted fields cannot inherit the original owner review',()=>{for(const change of [{objective:'Changed after review'},{channels:'["website"]'},{assets_json:'[]'}])assert.match(renderCampaignDirection({...brief,...change}),/REVIEWED PROPOSAL CHANGED/);});
