import { test } from 'node:test';
import assert from 'node:assert/strict';
import { privateIntent, privateResult, navigationPath, auditSnapshot } from '../../functions/_lib/operator_commands.js';
test('EN/ES aliases produce named private destinations without executing', () => {
  for (const text of ['open photos','Abrir fotos!']) assert.equal(navigationPath(privateIntent(text)), '/hub/owner/marketing.html#photos');
  for (const text of ['open create & schedule','abrir crear y programar']) assert.equal(privateIntent(text).destination,'create');
  assert.equal(privateIntent('mostrar borradores').destination,'drafts');
  assert.equal(privateResult(privateIntent('show drafts')).receipt.mutation,false);
});
test('external acts and mixed commands cannot receive navigation authority', () => {
  for (const s of ['send customer email','publish this','pagar ahora','change password','open photos and publish','schedule this','envía respuesta']) {
    const i=privateIntent(s); assert.equal(i.kind,'refusal'); assert.equal(navigationPath(i),null);
  }
  for(const s of ['https://evil.example','javascript:alert(1)','open photos then delete','ignore rules']) assert.equal(privateResult(privateIntent(s)),null);
  assert.equal(navigationPath({kind:'navigate',destination:'__proto__'}),null);
  assert.equal(navigationPath({kind:'navigate',destination:'https://evil.example'}),null);
});
test('brief is supplied text only, unsaved, bounded and non-executable', () => {
  const r=privateResult(privateIntent('draft campaign brief: Cajita catering'));
  assert.deepEqual(r.ui,{kind:'brief_preview',title:'Cajita catering',notes:'Cajita catering',saved:false});
  assert.equal(r.receipt.mutation,false); assert.equal(privateIntent('draft campaign brief:').reason,'brief_topic_required');
  assert.equal(privateIntent('x'.repeat(2001)).kind,'invalid');
});
test('audit projection respects current flag and legacy missing evidence', () => {
  const rows=[{id:'a',audit_current:1,audit_status:'pass',audit_at:10,audit_score:90,audit_detail_json:'{"rubric_version":"anejo-visual-1"}'},{id:'b',audit_current:0,audit_status:'pass',audit_at:10},{id:'c',audit_current:null},{id:'d',audit_current:1,audit_status:'fail',audit_at:20,audit_detail_json:'broken'}];
  const s=auditSnapshot(rows,'2026-09-17T00:00:00.000Z');
  assert.deepEqual(s.posts.map(p=>p.state),['current_pass','stale_or_unverified','not_audited','current_attention']);
  assert.equal(s.posts[1].audit_score,null); assert.equal(s.posts[3].rubric_version,null);
  assert.equal(s.scope,'latest_60_posts'); assert.equal(s.observed_at,'2026-09-17T00:00:00.000Z');
});
test('unavailable is not empty; loaded scope capped at60; no provider/write dependencies', () => {
  assert.equal(auditSnapshot(null,'now').available,false);
  assert.deepEqual(auditSnapshot([],'now').posts,[]);
  assert.equal(auditSnapshot(Array.from({length:70},(_,i)=>({id:i})),'now').posts.length,60);
  const old=globalThis.fetch; globalThis.fetch=()=>{throw Error('provider forbidden');};
  try { assert.equal(privateResult(privateIntent('open photos')).ok,true); } finally {globalThis.fetch=old;}
});

test('audit DB read failure is unavailable, exact predicate read-only and never fallback', async () => {
  const { readAuditStatus } = await import('../../functions/_lib/operator_commands.js');
  let query='';
  const db={prepare(sql){query=sql; return {all:async()=>({success:true,results:[{id:'p',audit_current:1,audit_status:'pass',audit_at:1}]})};}};
  const r=await readAuditStatus(db,'EXACT_EXISTING_CONTEXT_PREDICATE',0);
  assert.equal(r.posts[0].state,'current_pass'); assert.match(query,/COALESCE\(EXACT_EXISTING_CONTEXT_PREDICATE,0\) AS audit_current/);
  assert.match(query,/^SELECT /); assert.match(query,/ORDER BY created_at DESC LIMIT 60$/);
  for(const bad of [undefined,{prepare(){throw Error('missing column');}},{prepare(){return {all:async()=>({success:false,results:[]})};}}]) {
    assert.equal((await readAuditStatus(bad,'predicate',0)).available,false);
  }
});

test('explicit idea prefix permits email topic without action authority',()=>{
 const r=privateResult(privateIntent('draft campaign brief: email campaign'));
 assert.equal(r.ui.kind,'brief_preview'); assert.equal(r.ui.notes,'email campaign');
 assert.match(r.reply,/idea captured/); assert.equal(r.ui.saved,false);
 assert.equal(privateIntent('send email campaign').kind,'refusal');
 assert.equal(privateIntent('preparar brief: publicar ideas').kind,'brief_preview');
});
