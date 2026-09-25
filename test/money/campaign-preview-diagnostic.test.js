import {test} from 'node:test';
import assert from 'node:assert/strict';
import {campaignProposalDiagnostic as diagnostic,parseCampaignPreview as parse,validateCampaignProposal} from '../../functions/_lib/team_lead.js';
const valid=()=>({title:'Title',objective:'Objective',audience:'Audience',angle:'Angle',cadence:'Cadence',success_metric:'Metric',channels:['instagram'],product_ids:['known'],assets:[],assumptions:[],questions:[]});
test('valid schema keeps boolean compatibility; diagnostics are absent',()=>{assert.equal(diagnostic(valid(),['known']),null);assert.equal(validateCampaignProposal(valid(),['known']),true);});
test('diagnostics distinguish exact known invalid field/type/length/count/membership',()=>{
 const cases=[['title',null,'string_required'],['title',' ','empty_string'],['title','x'.repeat(201),'string_too_long'],['assets',{},'array_required'],['assets',[{}],'item_string_required'],['assets',[''],'empty_item'],['assets',['x'.repeat(401)],'item_too_long'],['assets',['same','same'],'duplicate_item'],['assets',Array(11).fill('x'),'too_many_items'],['channels',[],'empty_channels'],['channels',['email'],'unsupported_channel'],['product_ids',['private-unknown-id'],'unavailable_product_id']];
 for(const [field,value,code] of cases){const p=valid();p[field]=value;const d=diagnostic(p,['known']);assert.equal(d.field,field);assert.equal(d.code,code);assert.equal(validateCampaignProposal(p,['known']),false);assert.doesNotMatch(JSON.stringify(d),/private-unknown-id/);}
 const missing=valid();delete missing.angle;assert.equal(diagnostic(missing,['known']).code,'missing_field');assert.equal(diagnostic({...valid(),'sensitive-unknown-key':'private text'},['known']).code,'unexpected_field');assert.doesNotMatch(JSON.stringify(diagnostic({...valid(),'sensitive-unknown-key':'private text'},['known'])),/sensitive|private text/);
});
test('shape and JSON failures are distinct without raw output or repair',()=>{
 for(const [blocks,code] of [[null,'content_array_required'],[[],'single_content_block_required'],[[{type:'tool_use'}],'text_block_required'],[[{type:'text',text:42}],'text_string_required'],[[{type:'text',text:'x'.repeat(16001)}],'text_too_long']])assert.equal(parse(blocks,[]).preview_diagnostic.code,code);
 const result=parse([{type:'text',text:'```json\n{"private":"data"}\n```'}],[]);assert.deepEqual(result,{ok:false,preview_diagnostic:{stage:'json',code:'invalid_json'}});
 assert.equal(parse([{type:'text',text:JSON.stringify(valid())}],['known']).ok,true);
});
