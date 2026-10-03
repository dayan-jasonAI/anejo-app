// Local integration only: real workerd D1/R2 bindings, migrated table definitions,
// direct fixtures and the pinned renderer. Authentication/routes/deployment are not tested.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Miniflare,convertV4MiniflareOptions}=require('../../node_modules/miniflare');
const bytes=name=>new Uint8Array(fs.readFileSync(path.join(__dirname,name)));
const options={templateId:'reposado-cajita',title:'Your Cajita.',kicker:'AÑEJO CATERING'};

async function setup(t){
 const {ownerEnv}=await import('../../test/helpers/sqlite-d1.js');
 const {initialize}=await import('./core.mjs');
 const {renderEditorial}=await import('./editorial.mjs');
 const {sha256}=await import('../../functions/_lib/marketing_render_receipt.js');
 const {createRenderJobStore}=await import('./render-jobs.mjs');
 const {consumePrivateRender,renderOptionsHash}=await import('./render-consumer.mjs');
 await initialize(bytes('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
 const fixture=ownerEnv();
 let schema;
 try{schema=['staff','inference_receipts','social_posts','social_post_media'].map(name=>fixture.DB.one('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=?',name).sql+';').join('\n');}
 finally{fixture.DB.sqlite.close();}
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'private-consumer-integration',script:'export default {fetch(){return new Response("local-only")}}',modules:true,compatibilityDate:'2026-05-01',d1Databases:{DB:'consumer-integration-local'},r2Buckets:{MEDIA:'consumer-integration-local'}}],cf:false,host:'127.0.0.1',port:0}));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB'),media=await mf.getR2Bucket('MEDIA');
 await db.exec(schema.replace(/--[^\n]*/g,'').replace(/\n/g,' '));
 await db.exec(fs.readFileSync(path.join(__dirname,'render-jobs.sql'),'utf8').replace(/^--.*$/gm,'').replace(/\n/g,' '));
 const at=Date.now(),source=bytes('assets/source.jpg'),sourceKey='marketing-library/local-integration.jpg';
 await db.prepare("INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES('local-owner','Local fixture','fixture@example.invalid','owner',1,?,?)").bind(at,at).run();
 await db.prepare("INSERT INTO social_posts(id,public_token,status,created_at,updated_at,audit_score,audit_status,scheduled_at,original_caption_hash,original_design_snapshot) VALUES('local-post','local-post-token','draft',?,?,7,'pass',?,'old-caption','old-design')").bind(at,at,at+100000).run();
 await db.prepare("INSERT INTO social_post_media(id,post_id,media_key,public_token,created_at) VALUES('local-slide','local-post',?,'local-slide-token',?)").bind(sourceKey,at).run();
 await media.put(sourceKey,source,{httpMetadata:{contentType:'image/jpeg'},customMetadata:{ai_enhanced:'false'}});
 const store=createRenderJobStore(db),descriptor={sourceKey,sourceSha256:await sha256(source),postId:'local-post',postRevision:at,mediaId:'local-slide',rendererVersion:'local-resvg-consumer-v1',templateId:options.templateId,optionsHash:await renderOptionsHash(options)};
 const enqueued=await store.enqueue({actorId:'local-owner',requestId:'local-consumer-integration',descriptor,now:at});
 let renders=0;
 const render=async({source,options})=>{renders++;return renderEditorial({source,emblem:bytes('assets/emblem.png'),font:bytes('assets/AnejoEditorialSerif-SemiBold.ttf'),kickerFont:bytes('assets/AnejoEditorialSans-Medium.ttf'),...options});};
 const input={db,media,actorId:'local-owner',rendererVersion:descriptor.rendererVersion,options,render,now:Date.now,leaseMs:10000};
 const outbound=[];
 t.mock.method(globalThis,'fetch',async url=>{outbound.push(String(url));throw Error('Outbound forbidden');});
 t.after(()=>assert.deepEqual(outbound,[]));
 return {db,media,source,sourceKey,store,enqueued,input,consumePrivateRender,sha256,renders:()=>renders};
}

test('local workerd D1/R2 complete pinned render, private readback and atomic attachment',{timeout:20000},async t=>{
 const f=await setup(t),result=await f.consumePrivateRender(f.input);
 assert.equal(result.state,'attached');assert.equal(result.publicationApproved,false);assert.equal(result.humanReviewRequired,true);assert.equal(result.resourceReadiness,'unverified');
 assert.equal(f.renders(),1);
 const source=await f.media.get(f.sourceKey);assert.deepEqual(new Uint8Array(await source.arrayBuffer()),f.source);assert.equal(source.customMetadata.ai_enhanced,'false');
 const output=await f.media.get(result.receipt.outputKey),outputBytes=new Uint8Array(await output.arrayBuffer());
 assert.equal(await f.sha256(outputBytes),result.receipt.sha256);assert.equal(outputBytes.length,result.receipt.outputBytes);assert.equal(output.customMetadata.render_job_id,f.enqueued.job.id);
 const post=await f.db.prepare("SELECT * FROM social_posts WHERE id='local-post'").first();
 assert.equal(post.status,'draft');for(const key of ['scheduled_at','audit_score','audit_status','original_caption_hash','original_design_snapshot'])assert.equal(post[key],null);
 const slide=await f.db.prepare("SELECT * FROM social_post_media WHERE id='local-slide'").first();assert.equal(slide.media_key,result.receipt.outputKey);
 assert.equal((await f.store.get({actorId:'local-owner',jobId:f.enqueued.job.id})).status,'rendered');
 assert.equal((await f.consumePrivateRender(f.input)).state,'no_job');assert.equal(f.renders(),1);
});

test('local workerd D1/R2 delayed unclaimed expiry preserves draft and source attachment',{timeout:20000},async t=>{
 const f=await setup(t),batch=f.db.batch.bind(f.db);
 const wrapped={prepare:f.db.prepare.bind(f.db),batch:async statements=>{
  await f.db.prepare('UPDATE prototype_render_jobs SET lease_until=? WHERE id=?').bind(Date.now()+30,f.enqueued.job.id).run();
  await new Promise(resolve=>setTimeout(resolve,80));
  return batch(statements);
 }};
 const result=await f.consumePrivateRender({...f.input,db:wrapped});
 assert.equal(result.state,'commit_unknown');assert.equal(result.attached,'unverified');assert.equal(f.renders(),1);
 const slide=await f.db.prepare("SELECT media_key FROM social_post_media WHERE id='local-slide'").first();assert.equal(slide.media_key,f.sourceKey);
 const post=await f.db.prepare("SELECT * FROM social_posts WHERE id='local-post'").first();assert.equal(post.updated_at,f.enqueued.job.descriptor.postRevision);assert.equal(post.audit_score,7);assert.equal(post.original_caption_hash,'old-caption');assert.ok(post.scheduled_at);
 assert.equal((await f.db.prepare('SELECT count(*) AS n FROM prototype_render_guards').first()).n,0);
 assert.equal((await f.store.get({actorId:'local-owner',jobId:f.enqueued.job.id})).status,'rendering');
 assert.ok(await f.media.get(result.outputKey)); // Private, unattached orphan is retained.
 const original=await f.media.get(f.sourceKey);assert.deepEqual(new Uint8Array(await original.arrayBuffer()),f.source);
});
