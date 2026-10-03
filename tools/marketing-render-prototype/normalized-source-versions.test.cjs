/* global Buffer */
// Local D1/R2 contract tests; no route or deployed bindings.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {Miniflare,convertV4MiniflareOptions}=require('../../node_modules/miniflare');
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;};
function chunk(type,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4);out.set(data,8);out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);return out;}
function png(width,height){const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header.set([8,6,0,0,0],8);const raw=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++){for(let x=0;x<width;x++){const at=y*(width*4+1)+1+x*4;raw.set([185,86,45,255],at);}}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('sRGB',Buffer.from([1])),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
async function setup(t){
 const {ownerEnv}=await import('../../test/helpers/sqlite-d1.js'),receiptLib=await import('../../functions/_lib/marketing_render_receipt.js');
 const api=await import('./normalized-source-versions.mjs'),sourceApi=await import('./source-versions.mjs'),{readWorkerSourceMetadata}=await import('./worker-source-metadata.mjs'),{dimensions}=await import('./core.mjs');
 const fixture=ownerEnv();let baseSchema;try{baseSchema=['staff','inference_receipts','social_posts','social_post_media'].map(name=>fixture.DB.one("SELECT sql FROM sqlite_master WHERE type='table' AND name=?",name).sql+';').join('\n');}finally{fixture.DB.sqlite.close();}
 const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'normalized-source-local',script:'export default {fetch(){return new Response("local-only")}}',modules:true,compatibilityDate:'2026-05-01',d1Databases:{DB:'normalized-source-local'},r2Buckets:{MEDIA:'normalized-source-local'}}],cf:false,host:'127.0.0.1',port:0}));t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB'),media=await mf.getR2Bucket('MEDIA'),clean=s=>s.replace(/--[^\n]*/g,'').replace(/\n/g,' ');
 await db.exec(clean(baseSchema));for(const file of ['draft-revisions.sql','source-versions.sql','normalized-source-schema.sql'])await db.exec(clean(fs.readFileSync(path.join(__dirname,file),'utf8')));
 const now=Date.now();await db.prepare("INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES('owner','Local','owner@example.invalid','owner',1,?,?)").bind(now,now).run();
 await db.prepare("INSERT INTO social_posts(id,public_token,status,created_at,updated_at) VALUES('post','post-token','draft',?,?)").bind(now,now).run();
 const sourceKey='marketing-library/normalized-fixture.jpg',sharp=require('./node_modules/sharp'),source=new Uint8Array(await sharp({create:{width:40,height:20,channels:3,background:'#b9562d'}}).jpeg().toBuffer()),meta={ai_enhanced:'false',fixture:'normalized'};
 await media.put(sourceKey,source,{httpMetadata:{contentType:'image/jpeg'},customMetadata:meta});
 await db.prepare("INSERT INTO social_post_media(id,post_id,media_key,public_token,created_at) VALUES('slide','post',?,'slide-token',?)").bind(sourceKey,now).run();
 const descriptor={postId:'post',mediaId:'slide',postRevision:(await db.prepare("SELECT revision FROM prototype_draft_versions WHERE post_id='post'").first()).revision,sourceKey,sourceSha256:await receiptLib.sha256(source)};
 const inputSource={db,media,actorId:'owner',requestId:'original-capture',descriptor,now},captured=await sourceApi.captureSourceVersion(inputSource),sourceVersionId=captured.version.id;
 const output=png(40,20),normalizer=async bytes=>{
  const metadata=await readWorkerSourceMetadata(bytes),shape=dimensions(bytes),digest=await receiptLib.sha256(output),profileSha=metadata.profile?await receiptLib.sha256(metadata.profile):null;
  return {bytes:output,receipt:{schema:'anejo-worker-source-normalization-v1',runtime:'local-worker-prototype',normalizerVersion:'resvg-lcms-rgba-1',kernelVersion:'lcms-wasm-1.0.5-rgb-kernel-1',originalSha256:descriptor.sourceSha256,derivativeSha256:digest,sourceProfileSha256:profileSha,sourceColorStatus:metadata.colorStatus,outputColor:'declared_srgb',conversionPerformed:Boolean(metadata.profile),originalOrientation:metadata.orientation,originalWidth:shape.width,originalHeight:shape.height,width:40,height:20,resized:false,resizePolicy:'inside-2000x2000-no-enlargement-bilinear-premultiplied-alpha',bytes:output.length,format:'png',visualReviewRequired:true,resourceReadiness:'unverified'}};
 };
 const input={db,media,actorId:'owner',sourceVersionId,normalizerVersion:'resvg-lcms-rgba-1',normalize:normalizer,now};
 const rows=()=>db.prepare('SELECT * FROM prototype_normalized_source_versions').all(),wrapMedia=overrides=>({get:media.get.bind(media),put:media.put.bind(media),...overrides});
 return {...api,db,media,sourceApi,sourceKey,source,meta,descriptor,sourceVersionId,sourceVersion:captured.version,output,input,rows,wrapMedia,hash:receiptLib.sha256,readWorkerSourceMetadata};
}
const rejects=(promise,code)=>assert.rejects(promise,e=>e.code===code);

test('actual D1/R2 capture persists create-only PNG and confirmed read revalidates exact bytes',{timeout:20000},async t=>{
 const f=await setup(t),first=await f.captureNormalizedSource(f.input),version=first.version;
 assert.equal(first.state,'confirmed');assert.equal(first.replayed,false);assert.match(version.derivativeKey,/^marketing-normalized-versions\/[0-9a-f-]+\.png$/);assert.equal(version.sourceVersionId,f.sourceVersionId);
 assert.equal(version.originalSha256,f.sourceVersion.sourceSha256);assert.equal(version.derivativeSha256,await f.hash(f.output));assert.equal(version.receiptSha256,await f.hash(new TextEncoder().encode(version.receiptJson)));
 const saved=await f.media.get(version.derivativeKey);assert.deepEqual(Buffer.from(await saved.arrayBuffer()),f.output);assert.equal(saved.httpMetadata.contentType,'image/png');assert.deepEqual(saved.customMetadata,JSON.parse(version.derivativeMetadataJson));
 const replay=await f.captureNormalizedSource(f.input);assert.equal(replay.replayed,true);assert.equal(replay.version.id,version.id);assert.deepEqual(Buffer.from(replay.bytes),f.output);assert.equal((await f.rows()).results.length,1);
 const read=await f.readConfirmedNormalizedSource({db:f.db,media:f.media,actorId:'owner',versionId:version.id});assert.deepEqual(Buffer.from(read.bytes),f.output);
 assert.deepEqual(new Uint8Array(await (await f.media.get(f.sourceVersion.versionKey)).arrayBuffer()),f.source);
});

test('wrong hash, version or non sRGB derivative receipt is refused before registration',{timeout:20000},async t=>{
 for(const [mutate,code] of [[r=>({...r,derivativeSha256:'0'.repeat(64)}),'normalizer_receipt_binding_invalid'],[r=>({...r,kernelVersion:'unapproved-kernel'}),'normalizer_version_mismatch'],[r=>({...r,outputColor:'assumed_srgb'}),'normalizer_receipt_binding_invalid']]){
  const f=await setup(t),normalize=async bytes=>{const result=await f.input.normalize(bytes);return {...result,receipt:mutate(result.receipt)};};
  await rejects(f.captureNormalizedSource({...f.input,normalize} ),code);assert.equal((await f.rows()).results.length,0);
 }
});

test('tampered derivative bytes or metadata fail confirmed readback',{timeout:20000},async t=>{
 const f=await setup(t),result=await f.captureNormalizedSource(f.input),bad=f.output.slice();bad[60]^=1;
 await f.media.put(result.version.derivativeKey,bad,{httpMetadata:{contentType:'image/png'},customMetadata:JSON.parse(result.version.derivativeMetadataJson)});
 await rejects(f.readConfirmedNormalizedSource({db:f.db,media:f.media,actorId:'owner',versionId:result.version.id}),'normalized_derivative_readback_changed');
});

test('original source row or bytes changing after private put leaves pending orphan',{timeout:20000},async t=>{
 const f=await setup(t);let key;
 const media=f.wrapMedia({put:async(k,b,o)=>{key=k;const result=await f.media.put(k,b,o);if(k.startsWith('marketing-normalized-versions/')){const changed=f.source.slice();changed[50]^=1;await f.media.put(f.sourceVersion.versionKey,changed,{httpMetadata:{contentType:'image/jpeg'},customMetadata:{source_version_id:f.sourceVersion.id,source_sha256:f.sourceVersion.sourceSha256,source_metadata_sha256:f.sourceVersion.metadataSha256}});}return result;}});
 await rejects(f.captureNormalizedSource({...f.input,media}),'normalized_source_capture_unverified');assert.ok(await f.media.get(key));assert.equal((await f.rows()).results[0].state,'pending');
});

test('changed draft revision prevents confirmation and preserves pending artifact',{timeout:20000},async t=>{
 const f=await setup(t),media=f.wrapMedia({put:async(k,b,o)=>{const result=await f.media.put(k,b,o);if(k.startsWith('marketing-normalized-versions/'))await f.db.prepare("UPDATE social_posts SET caption='changed' WHERE id='post'").run();return result;}});
 await rejects(f.captureNormalizedSource({...f.input,media}),'normalized_source_target_changed');assert.equal((await f.rows()).results[0].state,'pending');
});

test('confirmed reads survive draft revision changes, while capture replay remains target-fenced',{timeout:20000},async t=>{
 const f=await setup(t),result=await f.captureNormalizedSource(f.input);await f.db.prepare("UPDATE social_posts SET caption='attached render' WHERE id='post'").run();
 const read=await f.readConfirmedNormalizedSource({db:f.db,media:f.media,actorId:'owner',versionId:result.version.id});assert.deepEqual(Buffer.from(read.bytes),f.output);
 await rejects(f.captureNormalizedSource(f.input),'normalized_source_target_changed');
});

test('deactivated actor is refused on confirmed artifact read',{timeout:20000},async t=>{
 const f=await setup(t),result=await f.captureNormalizedSource(f.input);await f.db.prepare("UPDATE staff SET active=0 WHERE id='owner'").run();
 await rejects(f.readConfirmedNormalizedSource({db:f.db,media:f.media,actorId:'owner',versionId:result.version.id}),'normalized_actor_ineligible');
});

test('deadline before first read dispatches no normalized work',{timeout:20000},async t=>{
 const f=await setup(t);let gets=0;const deadline={expiresAt:Date.now()-1,check(){throw Error('execution_deadline_exceeded');}};
 await assert.rejects(f.captureNormalizedSource({...f.input,media:f.wrapMedia({get:async key=>{gets++;return f.media.get(key);}}),deadline}),/execution_deadline_exceeded/);assert.equal(gets,0);assert.equal((await f.rows()).results.length,0);
});
