import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ownerEnv,OWNER_COOKIE} from '../../test/helpers/sqlite-d1.js';
import {onRequestPost as library} from '../../functions/api/hub/owner/marketing-library.js';
import {onRequestPost as social} from '../../functions/api/hub/owner/social.js';
import {sha256} from '../../functions/_lib/marketing_render_receipt.js';
import {initialize} from './core.mjs';
import {renderEditorial} from './editorial.mjs';
import {createRenderJobStore} from './render-jobs.mjs';
import {consumePrivateRender,renderOptionsHash} from './render-consumer.mjs';
import {captureSourceVersion} from './source-versions.mjs';
const bytes=name=>new Uint8Array(readFileSync(new URL(name,import.meta.url)));
const original=bytes('assets/source.jpg');
const options={templateId:'reposado-cajita',title:'Your Cajita.',kicker:'AÑEJO CATERING'};
await initialize(bytes('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
function storage(){const objects=new Map();return {objects,async put(key,value,opts={}){if(opts.onlyIf?.etagDoesNotMatch==='*'&&objects.has(key))return null;objects.set(key,{bytes:new Uint8Array(value).slice(),metadata:{...opts.customMetadata},httpMetadata:opts.httpMetadata||{}});return {key};},async get(key){const v=objects.get(key);return v?{size:v.bytes.length,customMetadata:{...v.metadata},httpMetadata:v.httpMetadata,body:new ReadableStream({start(c){c.enqueue(v.bytes.slice());c.close();}}),arrayBuffer:async()=>v.bytes.slice().buffer}:null;}};}
async function handler(fn,env,url,body){const response=await fn({env,request:new Request('https://anejo.test'+url,{method:'POST',headers:{cookie:OWNER_COOKIE,'content-type':'application/json'},body:JSON.stringify(body)})});assert.equal(response.status,200);return response.json();}
async function setup(t){
 const outbound=[];t.mock.method(globalThis,'fetch',async url=>{outbound.push(String(url));throw Error('Outbound forbidden');});t.after(()=>assert.deepEqual(outbound,[]));
 const media=storage(),env=ownerEnv({MEDIA:media});t.after(()=>env.DB.sqlite.close());
 env.DB.sqlite.exec(readFileSync(new URL('render-jobs.sql',import.meta.url),'utf8'));
 env.DB.sqlite.exec(readFileSync(new URL('draft-revisions.sql',import.meta.url),'utf8'));
 env.DB.sqlite.exec(readFileSync(new URL('source-versions.sql',import.meta.url),'utf8'));
 const uploaded=await handler(library,env,'/api/hub/owner/marketing-library',{name:'Local consumer fixture',data_url:'data:image/jpeg;base64,'+Buffer.from(original).toString('base64')});
 const sourceKey=uploaded.photo.media_key;
 const draft=await handler(social,env,'/api/hub/owner/social',{op:'draft',caption:options.title,media_key:sourceKey});
 env.DB.sqlite.prepare(`UPDATE social_posts SET updated_at=100,audit_score=7,audit_status='pass',scheduled_at=200,original_caption_hash='old-caption',original_design_snapshot='old-design' WHERE id=?`).run(draft.id);
 const slide=env.DB.one('SELECT * FROM social_post_media WHERE post_id=?',draft.id);
 const store=createRenderJobStore(env.DB),descriptor={sourceKey,sourceSha256:await sha256(original),postId:draft.id,postRevision:env.DB.one('SELECT revision FROM prototype_draft_versions WHERE post_id=?',draft.id).revision,mediaId:slide.id,rendererVersion:'local-resvg-consumer-v1',templateId:options.templateId,optionsHash:await renderOptionsHash(options)};
 const captured=await captureSourceVersion({db:env.DB,media,actorId:'stf_owner',requestId:'capture-1',descriptor:{postId:descriptor.postId,mediaId:descriptor.mediaId,postRevision:descriptor.postRevision,sourceKey,sourceSha256:descriptor.sourceSha256},now:Date.now()});
 descriptor.sourceVersionId=captured.version.id;descriptor.sourceMetadataSha256=captured.version.metadataSha256;
 const enqueued=await store.enqueue({actorId:'stf_owner',requestId:'private-test-1',descriptor,now:Date.now()});
 let renderCount=0;
 const render=async({source,options})=>{renderCount++;return renderEditorial({source,emblem:bytes('assets/emblem.png'),font:bytes('assets/AnejoEditorialSerif-SemiBold.ttf'),kickerFont:bytes('assets/AnejoEditorialSans-Medium.ttf'),...options});};
 const input={db:env.DB,media,actorId:'stf_owner',rendererVersion:descriptor.rendererVersion,options,render,now:Date.now,leaseMs:10000};
 return {env,media,store,descriptor,enqueued,input,sourceKey,slide,draft,captured,renderCount:()=>renderCount};
}
function unchanged(f){assert.equal(f.env.DB.one('SELECT media_key FROM social_post_media WHERE id=?',f.slide.id).media_key,f.sourceKey);const p=f.env.DB.one('SELECT * FROM social_posts WHERE id=?',f.draft.id);assert.equal(p.audit_score,7);assert.equal(p.original_caption_hash,'old-caption');}
test('actual source/render/output readback attaches only a draft and resets old evidence',async t=>{
 const f=await setup(t),trust=f.env.DB.rows('SELECT * FROM trust_ledger');
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'attached');assert.equal(result.publicationApproved,false);assert.equal(result.humanReviewRequired,true);assert.equal(result.resourceReadiness,'unverified');
 assert.equal(f.renderCount(),1);assert.deepEqual(f.media.objects.get(f.sourceKey).bytes,original);
 const p=f.env.DB.one('SELECT * FROM social_posts WHERE id=?',f.draft.id);for(const key of ['audit_score','audit_status','scheduled_at','original_caption_hash','original_design_snapshot'])assert.equal(p[key],null);
 assert.equal(p.status,'draft');assert.equal(f.env.DB.one('SELECT media_key FROM social_post_media WHERE id=?',f.slide.id).media_key,result.receipt.outputKey);
 assert.equal(await sha256(f.media.objects.get(result.receipt.outputKey).bytes),result.receipt.sha256);
 assert.equal((await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id})).status,'rendered');
 assert.equal((await consumePrivateRender(f.input)).state,'no_job');assert.equal(f.renderCount(),1);assert.deepEqual(f.env.DB.rows('SELECT * FROM trust_ledger'),trust);
});
test('renderer/options binding changes reject before rendering',async t=>{const f=await setup(t);const result=await consumePrivateRender({...f.input,options:{...options,title:'Changed'}});assert.equal(result.state,'failed');assert.equal(result.errorCode,'render_binding_changed');assert.equal(f.renderCount(),0);unchanged(f);});
for(const kind of ['bytes','metadata'])test('captured source '+kind+' tampering after render prevents attachment',async t=>{
 const f=await setup(t),render=f.input.render;f.input.render=async args=>{const out=await render(args);const source=f.media.objects.get(f.captured.version.versionKey);if(kind==='bytes')source.bytes[50]^=1;else source.metadata.provenance_basis='changed';return out;};
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'failed');assert.equal(result.errorCode,'source_version_readback_changed');unchanged(f);
});
test('post revision changes and staff revocation are fenced in the final transaction',async t=>{
 const f=await setup(t),render=f.input.render;f.input.render=async args=>{const out=await render(args);f.env.DB.sqlite.prepare('UPDATE social_posts SET updated_at=102 WHERE id=?').run(f.draft.id);return out;};
 assert.equal((await consumePrivateRender(f.input)).state,'failed');unchanged(f);assert.equal(f.env.DB.one('SELECT count(*) n FROM prototype_render_guards').n,0);
});
test('revoked staff cannot attach a completed artifact',async t=>{const f=await setup(t),render=f.input.render;f.input.render=async args=>{const out=await render(args);f.env.DB.sqlite.exec("UPDATE staff SET active=0 WHERE id='stf_owner'");return out;};assert.equal((await consumePrivateRender(f.input)).state,'failed');unchanged(f);});
test('expired worker cannot attach after another worker claims the same job',async t=>{
 const f=await setup(t),render=f.input.render;let successor;
 f.input.render=async args=>{const out=await render(args);f.env.DB.sqlite.prepare('UPDATE prototype_render_jobs SET lease_until=? WHERE id=?').run(Date.now()-1,f.enqueued.job.id);successor=await f.store.claim({actorId:'stf_owner',now:Date.now(),leaseMs:10000});return out;};
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'commit_unknown');unchanged(f);
 const current=await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id});assert.equal(current.leaseToken,successor.leaseToken);assert.equal(current.status,'rendering');assert.ok(!result.outputKey.includes(successor.leaseToken));
});
for(const table of ['social_posts','prototype_render_jobs'])test('zero-row '+table+' mutation rolls back earlier media changes',async t=>{
 const f=await setup(t);f.env.DB.sqlite.exec(`CREATE TRIGGER reject_update BEFORE UPDATE ON ${table} ${table==='prototype_render_jobs'?"WHEN NEW.status='rendered'":''} BEGIN SELECT RAISE(IGNORE); END;`);
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'failed');unchanged(f);assert.equal(f.env.DB.one('SELECT count(*) n FROM prototype_render_guards').n,0);
});
test('lost batch acknowledgement recovers the saved attachment without rerendering',async t=>{
 const f=await setup(t),batch=f.env.DB.batch.bind(f.env.DB);let calls=0;
 f.env.DB.batch=async statements=>{calls++;await batch(statements);throw Error('simulated_ack_loss');};
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'attached');assert.equal(result.recoveredCommit,true);assert.equal(calls,1);assert.equal(f.renderCount(),1);assert.equal((await consumePrivateRender(f.input)).state,'no_job');
});
test('unavailable recovery reports unknown rather than a false failure or another attach',async t=>{
 const f=await setup(t),batch=f.env.DB.batch.bind(f.env.DB);let calls=0;f.env.DB.batch=async statements=>{calls++;await batch(statements);f.media.get=async()=>{throw Error('read unavailable');};throw Error('simulated_ack_loss');};
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'commit_unknown');assert.equal(result.attached,'unverified');assert.equal(calls,1);assert.equal(f.renderCount(),1);assert.equal((await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id})).status,'rendered');
});

test('lease expires while batch is queued without a successor and attachment rolls back',async t=>{
 const f=await setup(t),batch=f.env.DB.batch.bind(f.env.DB);
 f.env.DB.batch=async statements=>{
  f.env.DB.sqlite.prepare('UPDATE prototype_render_jobs SET lease_until=? WHERE id=?').run(Date.now()+20,f.enqueued.job.id);
  await new Promise(resolve=>setTimeout(resolve,50));
  return batch(statements);
 };
 const result=await consumePrivateRender(f.input);
 assert.equal(result.state,'commit_unknown');unchanged(f);
 assert.equal(f.env.DB.one('SELECT count(*) n FROM prototype_render_guards').n,0);
 assert.equal((await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id})).status,'rendering');
});

test('same-timestamp caption edits reject attachment through the actual editing handler',async t=>{
 const f=await setup(t),render=f.input.render;
 f.input.render=async args=>{const out=await render(args);
  await handler(social,f.env,'/api/hub/owner/social',{op:'edit',id:f.draft.id,caption:'Changed while rendering'});
  f.env.DB.sqlite.prepare('UPDATE social_posts SET updated_at=100 WHERE id=?').run(f.draft.id);return out;};
 assert.equal((await consumePrivateRender(f.input)).state,'failed');
 assert.equal(f.env.DB.one('SELECT media_key FROM social_post_media WHERE id=?',f.slide.id).media_key,f.sourceKey);
 assert.equal(f.env.DB.one('SELECT caption FROM social_posts WHERE id=?',f.draft.id).caption,'Changed while rendering');
});

test('slide edits without timestamp updates fence the pending consumer',async t=>{
 const f=await setup(t),render=f.input.render;
 f.input.render=async args=>{const out=await render(args);f.env.DB.sqlite.prepare('UPDATE social_post_media SET seq=seq+1 WHERE id=?').run(f.slide.id);return out;};
 assert.equal((await consumePrivateRender(f.input)).state,'failed');unchanged(f);
});
test('draft version tombstone survives deleting and recreating the same post id',async t=>{
 const f=await setup(t),read=()=>f.env.DB.one('SELECT revision FROM prototype_draft_versions WHERE post_id=?',f.draft.id).revision;
 const before=read();f.env.DB.sqlite.prepare('DELETE FROM social_post_media WHERE post_id=?').run(f.draft.id);f.env.DB.sqlite.prepare('DELETE FROM social_posts WHERE id=?').run(f.draft.id);assert.ok(read()>before);
 const deleted=read();f.env.DB.sqlite.prepare("INSERT INTO social_posts(id,public_token,status,created_at,updated_at) VALUES(?,?,'draft',100,100)").run(f.draft.id,'replacement');
 assert.ok(read()>deleted);assert.ok(read()>f.descriptor.postRevision);
});
test('revision overflow aborts the modifying statement',async t=>{
 const f=await setup(t);f.env.DB.sqlite.prepare('UPDATE prototype_draft_versions SET revision=9007199254740991 WHERE post_id=?').run(f.draft.id);
 assert.throws(()=>f.env.DB.sqlite.prepare("UPDATE social_posts SET caption='overflow' WHERE id=?").run(f.draft.id));
 assert.notEqual(f.env.DB.one('SELECT caption FROM social_posts WHERE id=?',f.draft.id).caption,'overflow');
});
test('edit during output recovery readback cannot be reported as verified attachment',async t=>{
 const f=await setup(t),get=f.media.get.bind(f.media);let reads=0;
 f.media.get=async key=>{const value=await get(key);if(key.startsWith('studio/local-render/') && ++reads===2)f.env.DB.sqlite.prepare("UPDATE social_posts SET caption='Edited during readback' WHERE id=?").run(f.draft.id);return value;};
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'commit_unknown');assert.equal(result.attached,'unverified');
 assert.equal(f.env.DB.one('SELECT caption FROM social_posts WHERE id=?',f.draft.id).caption,'Edited during readback');
});

test('original replaced after capture cannot change the pixels passed to the renderer',async t=>{
 const f=await setup(t),render=f.input.render;f.media.objects.get(f.sourceKey).bytes[50]^=1;
 f.input.render=async args=>{assert.deepEqual(args.source,original);return render(args);};
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'attached');
 assert.equal(f.media.objects.get(result.receipt.outputKey).metadata.source_version_id,f.captured.version.id);
 assert.deepEqual(f.media.objects.get(f.captured.version.versionKey).bytes,original);
});

test('source version removed while attachment waits causes transaction rollback',async t=>{
 const f=await setup(t),batch=f.env.DB.batch.bind(f.env.DB);
 f.env.DB.batch=async statements=>{f.env.DB.sqlite.prepare('DELETE FROM prototype_source_versions WHERE id=?').run(f.captured.version.id);return batch(statements);};
 assert.equal((await consumePrivateRender(f.input)).state,'failed');unchanged(f);
});
test('source version disappearing during recovery leaves attachment unverified',async t=>{
 const f=await setup(t),get=f.media.get.bind(f.media);let reads=0;
 f.media.get=async key=>{const value=await get(key);if(key.startsWith('studio/local-render/') && ++reads===2)f.env.DB.sqlite.prepare('DELETE FROM prototype_source_versions WHERE id=?').run(f.captured.version.id);return value;};
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'commit_unknown');assert.equal(result.attached,'unverified');
});

test('output readback bounds actual stream bytes rather than trusting declared size',async t=>{
 const f=await setup(t),get=f.media.get.bind(f.media);let usedArrayBuffer=false;
 f.media.get=async key=>{
  const value=await get(key);if(!key.startsWith('studio/local-render/')||!value)return value;
  return {...value,size:1,body:new ReadableStream({start(c){c.enqueue(new Uint8Array(5*1024*1024+1));c.close();}}),arrayBuffer:async()=>{usedArrayBuffer=true;throw Error('unbounded read forbidden');}};
 };
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'failed');assert.equal(usedArrayBuffer,false);unchanged(f);
});
test('over-fragmented output readback fails before attachment without waiting for cancellation',async t=>{
 const f=await setup(t),get=f.media.get.bind(f.media);
 f.media.get=async key=>{
  const value=await get(key);if(!key.startsWith('studio/local-render/')||!value)return value;
  return {...value,body:new ReadableStream({pull(c){c.enqueue(new Uint8Array());},cancel(){return new Promise(()=>{});}})};
 };
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'failed');unchanged(f);
});

for(const field of ['ai_enhanced','source_version_id','source_version_key','source_metadata_sha256'])test('recovery rejects altered output '+field+' provenance despite unchanged pixels and job tags',async t=>{
 const f=await setup(t),get=f.media.get.bind(f.media);let reads=0;
 f.media.get=async key=>{
  if(key.startsWith('studio/local-render/')&&++reads>=2)f.media.objects.get(key).metadata[field]='tampered';
  return get(key);
 };
 const result=await consumePrivateRender(f.input);assert.equal(result.state,'commit_unknown');assert.equal(result.attached,'unverified');
 assert.equal((await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id})).status,'rendered');
});

test('explicit job consumer never consumes an older actor job with other options',async t=>{
 const f=await setup(t);
 const chosenOptions={...options,title:'Made to share.'};
 const chosen=await f.store.enqueue({actorId:'stf_owner',requestId:'chosen-second',descriptor:{...f.descriptor,optionsHash:await renderOptionsHash(chosenOptions)},now:Date.now()+1});
 const result=await consumePrivateRender({...f.input,jobId:chosen.job.id,options:chosenOptions});
 assert.equal(result.state,'attached');assert.equal(result.jobId,chosen.job.id);assert.equal(f.renderCount(),1);
 const older=await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id});assert.equal(older.status,'queued');assert.equal(older.attempts,0);
});
test('unknown explicit job leaves actor queue and draft untouched',async t=>{
 const f=await setup(t);assert.equal((await consumePrivateRender({...f.input,jobId:'unknown-job'})).state,'no_job');
 assert.equal(f.renderCount(),0);unchanged(f);assert.equal((await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id})).attempts,0);
});

test('expired execution deadline dispatches no claim or storage work',async t=>{
 const f=await setup(t);let reads=0;f.media.get=async()=>{reads++;throw Error('must not read');};
 const result=await consumePrivateRender({...f.input,deadline:{expiresAt:Date.now()-1}});
 assert.equal(result.state,'deadline_expired');assert.equal(reads,0);assert.equal(f.renderCount(),0);unchanged(f);
 assert.equal((await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id})).attempts,0);
});
for(const phase of ['source','render','put','output'])test('deadline expiring during '+phase+' prevents subsequent consumer stages',async t=>{
 const f=await setup(t),expiresAt=Date.now()+10000;let clock=Date.now(),reads=0,writes=0;
 const get=f.media.get.bind(f.media),put=f.media.put.bind(f.media),render=f.input.render;
 f.media.get=async key=>{reads++;const saved=await get(key);if(phase==='source'&&key===f.captured.version.versionKey||phase==='output'&&key.startsWith('studio/local-render/'))clock=expiresAt;return saved;};
 f.media.put=async(...args)=>{writes++;const saved=await put(...args);if(phase==='put')clock=expiresAt;return saved;};
 f.input.render=async args=>{const saved=await render(args);if(phase==='render')clock=expiresAt;return saved;};
 const result=await consumePrivateRender({...f.input,now:()=>clock,deadline:{expiresAt}});
 assert.equal(result.state,'deadline_expired');assert.equal(result.attached,'unverified');unchanged(f);
 assert.equal(f.renderCount(),phase==='source'?0:1);assert.equal(writes,['put','output'].includes(phase)?1:0);
 assert.equal(reads,phase==='output'?2:1);
 assert.equal((await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id})).status,'rendering');
});
test('deadline past committed batch acknowledgement prevents all recovery dispatch and reports unknown',async t=>{
 const f=await setup(t),expiresAt=Date.now()+10000;let clock=Date.now(),readsAfterBatch=0,batchFinished=false;
 const batch=f.env.DB.batch.bind(f.env.DB),get=f.media.get.bind(f.media);
 f.media.get=async key=>{if(batchFinished)readsAfterBatch++;return get(key);};
 f.env.DB.batch=async statements=>{await batch(statements);batchFinished=true;clock=expiresAt;throw Error('lost_ack');};
 const result=await consumePrivateRender({...f.input,now:()=>clock,deadline:{expiresAt}});
 assert.equal(result.state,'commit_unknown');assert.equal(result.attached,'unverified');assert.equal(readsAfterBatch,0);
 assert.equal((await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id})).status,'rendered');
});
test('consumer honors latched executor clock refusal before claim',async t=>{
 const f=await setup(t),result=await consumePrivateRender({...f.input,deadline:{expiresAt:Date.now()+10000,check(){throw Error('invalid_execution_clock');}}});
 assert.equal(result.state,'deadline_expired');assert.equal(f.renderCount(),0);
 assert.equal((await f.store.get({actorId:'stf_owner',jobId:f.enqueued.job.id})).attempts,0);
});
