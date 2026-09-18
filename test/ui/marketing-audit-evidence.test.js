import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');
const start = source.indexOf('  function auditBadge(p) {');
const end = source.indexOf('\n  // PROVENANCE', start);
const context = { esc: value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;') };
vm.runInNewContext(source.slice(start,end), context);
const render = p => context.auditBadge(p);
const row = { audit_at: 123, audit_current: 1, audit_status: 'pass', audit_score: 100, audit_flags: '[]', audit_detail_json: JSON.stringify({rubric_version:'anejo-visual-1',observations:[{criterion_id:'readability',status:'met',explanation:'Text is visible.',rule_quote:'Keep wording visible.',slides:[1]}],suggestions:['Try a shorter headline.']}) };
test('current requirements display evidence and optional suggestions without implying publishing permission', () => {
 const html = render(row);
 assert.match(html,/Requirements met: 1\/1/); assert.match(html,/Optional refinements/); assert.match(html,/Slides: 1/);
 assert.match(html,/An audit is not permission to publish/); assert.doesNotMatch(html,/Score 100/);
});
test('stale or missing source binding cannot display a current pass', () => {
 for(const current of [0,null,undefined]) { const html = render({...row,audit_current:current}); assert.match(html,/outdated — re-audit required/); assert.match(html,/historical result/); assert.doesNotMatch(html,/class="audit pass"/); }
});
test('unavailable audit stays unavailable even if stale cached score says pass', () => {
 const html=render({...row,audit_flags:JSON.stringify([{type:'audit_unavailable',detail:'Provider unavailable'}])});
 assert.match(html,/Brand Auditor · unavailable/); assert.doesNotMatch(html,/class="audit pass"/);
});
test('model-supplied evidence and suggestions are escaped', () => {
 const html=render({...row,audit_detail_json:JSON.stringify({rubric_version:'anejo-visual-1',observations:[{criterion_id:'<script>',status:'<img>',explanation:'<svg onload=x>',rule_quote:'<img>',caption_quote:'<iframe>',slides:['<script>']}],suggestions:['<img onerror=x>']})});
 assert.doesNotMatch(html,/<script>|<img|<svg|<iframe/); assert.match(html,/&lt;svg/);
});
test('legacy score and never audited are distinct', () => {
 assert.match(render({...row,audit_detail_json:null,audit_current:0}),/Legacy score/);
 assert.match(render({}),/not scored yet/);
});
test('rejected diagnostic is escaped and distinguished from a verified design defect', () => {
 const html=render({...row,audit_score:null,audit_flags:JSON.stringify([{type:'audit_unavailable',detail:'Unknown criterion'}]),audit_detail_json:JSON.stringify({rubric_version:'anejo-visual-2',audit_diagnostic:{criterion_id:'branding',explanation:'<img onerror=x>',quote:'<script>'}})});
 assert.match(html,/Why this audit needs review/);
 assert.match(html,/rejected auditor observation, not a verified defect/);
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<script>|<img|class="audit pass"/);
});
