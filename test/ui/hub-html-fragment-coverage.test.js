import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {evaluateReport,invariantReason,scanHTMLCopy} from '../../scripts/hub-html-copy-policy.mjs';
import {readFileSync} from 'node:fs';
function translations(){const dict={},patterns=[];vm.runInNewContext(readFileSync(new URL('../../public/hub/assets/hub-i18n-coverage.js',import.meta.url),'utf8'),{window:{AnejoI18n:{extend:d=>Object.assign(dict,d),extendPatterns:p=>patterns.push(...p)}}});return {dict,patterns};}
function tr(value){const {dict,patterns}=translations();if(Object.hasOwn(dict,value))return dict[value];for(const p of patterns){const names=[];const source=p.en.split(/(\{[a-zA-Z][a-zA-Z0-9_]*\})/g).map(s=>s[0]==='{'?(names.push(s.slice(1,-1)),'(.+?)'):s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('');const m=value.match(new RegExp('^'+source+'$'));if(m)return p.es.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,(_,name)=>m[names.indexOf(name)+1]);}return value;}
test('populated catering follow-up labels and evidence wording have faithful Spanish pairs',()=>{const {dict}=translations();for(const s of ['Save follow-up','Inquiries','Quotes sent','Responses recorded','Paid deposits','Owner marked won','Latest 100 catering inquiries','Needs first contact','Contact and delivery evidence','Customer response & quote reminder','Response details not loaded','Open messages','Internal call-task status','Call notes / next action','Provider acceptance does not establish that the recipient read the message.'])assert.ok(dict[s]&&dict[s]!==s,s);assert.match(dict['Responses are owner-recorded. Owner-marked wins are separate from verified paid deposits. These counts do not establish email opens or link clicks.'],/no demuestran/);});
test('composed metadata keeps date, customer-origin values, amounts and receipt IDs exact',()=>{assert.equal(tr('Received 2026-10-28 08:12'),'Recibido el 2026-10-28 08:12');assert.match(tr('Source: Sample Campaign · Submitted entry page: /catering?src=sample'),/^Origen: Sample Campaign · .+: \/catering\?src=sample$/);assert.equal(tr('Approve $37.25'),'Aprobar $37.25');assert.equal(tr('Deposit paid · 2026-10-28'),'Depósito pagado · 2026-10-28');assert.equal(tr('Sample Customer'),'Sample Customer');assert.equal(tr('person@example.test'),'person@example.test');});
test('account, finance, inventory and sales live controls are covered without promising automatic outcomes',()=>{const {dict}=translations();for(const s of ['PROGRAM AT A GLANCE','Changing the email re-links their orders, points and founding benefit to the new address.','Both safeties always apply.','Log this call','Finished-item target','Cost source and exact calculation','not approved for production'])assert.ok(dict[s]&&dict[s]!==s,s);});

test('HTML source extraction joins interpolation and records controls, choices and local language pairs without execution',()=>{
 const fixture=fileURLToPath(new URL('../fixtures/hub-html-copy-source.html',import.meta.url));
 const result=JSON.parse(execFileSync(process.execPath,['scripts/hub-spanish-html-fragments.cjs'],{cwd:new URL('../../',import.meta.url),input:JSON.stringify([fixture]),maxBuffer:1024*1024}));
 assert.deepEqual(result.errors,[]);
 assert.ok(result.fragments.some(r=>r.value.includes('New {value} action')&&r.value.includes('Actual receipt recorded')));
 assert.ok(result.fragments.some(r=>r.value.includes('No actual receipt')));
 assert.ok(result.fragments.some(r=>r.value.includes('placeholder="Novel input hint"')));
 assert.ok(result.labels.some(r=>r.value==='An unregistered dropdown choice'));
 assert.ok(result.labels.some(r=>r.value==='A novel follow-up phase'));
 assert.ok(result.labels.some(r=>r.value==='open'));
 assert.ok(!result.labels.some(r=>r.value==='another-dom-id'),'DOM-id arrays are not UI choice labels');
 assert.ok(result.pairs.some(r=>r.en.includes('Review the')&&r.es.includes('Revisa la')));
});

test('every shipped kitchen and driver safety-checklist instruction has a Spanish display pair',()=>{
 const sql=readFileSync(new URL('../../migrations/0040_checklist_seeds.sql',import.meta.url),'utf8');
 const {dict}=translations();let lists=0,items=0;
 for(const match of sql.matchAll(/\('chk_[^']+', '([^']+)', '[^']+', '[^']+', '((?:[^']|'')*)'/g)){
  lists++;assert.ok(dict[match[1]],match[1]);
  for(const item of JSON.parse(match[2].replaceAll("''","'"))){items++;assert.ok(dict[item.label]&&dict[item.label]!==item.label,item.label);}
 }
 assert.equal(lists,7);assert.equal(items,36);
});

test('strict HTML guard rejects new UI prose instead of accepting a source baseline',()=>{
 const report={source_files:1,parse_errors:[],candidates:[{text:'New unmapped action',occurrences:[{file:'public/hub/example.html',kind:'fragment_visible',line:1}]},{text:'New unmapped receipt warning',occurrences:[{file:'public/hub/example.html',kind:'message_label',line:2}]}]};
 const result=evaluateReport(report);assert.equal(result.ok,false);assert.equal(result.unmapped.length,2);
 assert.equal(invariantReason('Refund requires a new confirmation'),null);
 assert.equal(invariantReason('{amount} unregistered English action'),null);
 assert.ok(invariantReason('{asset} · SHA-256 {digest}'));
 assert.ok(invariantReason('18oz · 112%'));
});
test('all classified authored Hub HTML, choice labels and toast messages have deterministic translations',()=>{
 const result=scanHTMLCopy();assert.deepEqual(result.parse_errors,[]);assert.deepEqual(result.unmapped,[],JSON.stringify(result.unmapped,null,2));assert.equal(result.ok,true);
 assert.ok(result.source_files>=124);assert.ok(result.preserved.every(row=>row.reason&&!/waiver|baseline/i.test(row.reason)));
});
