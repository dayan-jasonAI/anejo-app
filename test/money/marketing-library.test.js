import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestGet, onRequestPost } from '../../functions/api/hub/owner/marketing-library.js';
import { onRequestGet as getMedia } from '../../functions/api/hub/media/[[path]].js';
const jpeg = () => { const b = Buffer.alloc(110); b.set([255,216,255]); b.set([255,217],108); return b; };
const body = () => ({ name: 'Original photo', folder: 'Catering', tags: ['food'], data_url: 'data:image/jpeg;base64,' + jpeg().toString('base64') });
const req = b => new Request('https://anejo.test/api/hub/owner/marketing-library', { method: b ? 'POST' : 'GET', headers: { Cookie: OWNER_COOKIE }, ...(b ? { body: JSON.stringify(b) } : {}) });
test('original bytes and metadata are saved without altering the photo or publishing', async () => {
 const env=ownerEnv(); let saved;
 env.MEDIA={put:async(...args)=>{saved=args;}};
 const r=await onRequestPost({env,request:req(body())}); const out=await r.json();
 assert.equal(r.status,200); assert.match(saved[0],/^marketing-library\/\d{4}-\d{2}\/.*_photo.jpg$/);
 assert.deepEqual(Buffer.from(saved[1]),jpeg()); assert.equal(saved[2].customMetadata.folder,'Catering');
 assert.equal(out.photo.content_type,'image/jpeg'); assert.equal(out.photo.bytes,110);
});
test('format spoof, oversized payload and invalid metadata never write', async () => {
 const env=ownerEnv(); let writes=0; env.MEDIA={put:async()=>writes++};
 for(const b of [{...body(),data_url:'data:image/jpeg;base64,'+Buffer.alloc(110).toString('base64')},{...body(),name:''},{...body(),data_url:'data:image/jpeg;base64,'+'A'.repeat(7*1024*1024)}]) {
 assert.ok((await onRequestPost({env,request:req(b)})).status>=400);
 }
 assert.equal(writes,0);
});
test('pagination requests only the dedicated library namespace and returns safe metadata', async () => {
 const env=ownerEnv(); let options;
 env.MEDIA={list:async o=>{options=o;return {objects:[{key:'studio/private.jpg'},{key:'marketing-library/x_photo.jpg',size:110,customMetadata:{name:'Food',tags:'["cuban"]'}}],truncated:true,cursor:'next'};}};
 const request=new Request(req().url+'?limit=200&cursor=page',{headers:{Cookie:OWNER_COOKIE}});
 const out=await(await onRequestGet({env,request})).json();
 assert.equal(options.prefix,'marketing-library/');assert.equal(options.limit,100);assert.equal(options.cursor,'page');
 assert.equal(out.photos.length,1);assert.equal(out.cursor,'next');assert.deepEqual(out.photos[0].tags,['cuban']);
});
test('kitchen cannot list upload or fetch library photos, marketing can', async()=>{
 const env=ownerEnv();let reads=0;
 env.MEDIA={list:async()=>({objects:[]}),get:async()=>{reads++;return {body:'photo',httpMetadata:{contentType:'image/jpeg'}};}};
 env.DB.sqlite.prepare("UPDATE staff SET role='kitchen' WHERE id='stf_owner'").run();
 assert.equal((await onRequestGet({env,request:req()})).status,403);
 assert.equal((await onRequestPost({env,request:req(body())})).status,403);
 assert.equal((await getMedia({env,request:req(),params:{path:['marketing-library','x.jpg']}})).status,404);assert.equal(reads,0);
 env.DB.sqlite.prepare("UPDATE staff SET role='marketing' WHERE id='stf_owner'").run();
 assert.equal((await onRequestGet({env,request:req()})).status,200);
 assert.equal((await getMedia({env,request:req(),params:{path:['marketing-library','x.jpg']}})).status,200);
});
test('PNG and WebP originals retain format and bytes',async()=>{
 for(const kind of ['png','webp']){
 const bytes=Buffer.alloc(110);if(kind==='png')bytes.set([137,80,78,71,13,10,26,10]);else{bytes.write('RIFF');bytes.write('WEBP',8);}
 const env=ownerEnv();let saved;env.MEDIA={put:async(...a)=>{saved=a;}};
 const out=await(await onRequestPost({env,request:req({...body(),data_url:'data:image/'+kind+';base64,'+bytes.toString('base64')})})).json();
 assert.equal(out.photo.content_type,'image/'+kind);assert.deepEqual(Buffer.from(saved[1]),bytes);
 }
});
test('photographic polish stores verified original lineage without claiming AI or provider validation',async()=>{
 const env=ownerEnv();let saved;const source='marketing-library/2026-09/original_photo.jpg';
 env.MEDIA={get:async k=>{assert.equal(k,source);return {customMetadata:{name:'Original'}};},put:async(...args)=>{saved=args;},list:async()=>({objects:[{key:saved[0],size:110,customMetadata:saved[2].customMetadata}]})};
 const r=await onRequestPost({env,request:req({...body(),polish:{source_key:source,preset:'natural'}})});assert.equal(r.status,200);
 const out=await r.json();assert.notEqual(out.photo.media_key,source);assert.equal(out.photo.enhancement_method,'photographic');assert.equal(out.photo.ai_enhanced,false);assert.equal(out.photo.source_key,source);
 const listed=await(await onRequestGet({env,request:req()})).json();assert.equal(listed.photos[0].enhancement_method,'photographic');assert.equal(saved[2].customMetadata.ai_enhanced,'false');
});
test('polish refuses missing private or derived source and forged metadata without writes',async()=>{
 const env=ownerEnv();let writes=0;let meta={};env.MEDIA={get:async()=>({customMetadata:meta}),put:async()=>writes++};
 const valid={source_key:'marketing-library/original.jpg',preset:'warm'};
 for(const polish of [{...valid,source_key:'kitchen/private.jpg'},{...valid,preset:'invent'},{...valid,provider:'fake'}])assert.equal((await onRequestPost({env,request:req({...body(),polish})})).status,400);
 for(const m of [{ai_enhanced:'true'},{source_key:'marketing-library/other.jpg'},{enhancement_method:'photographic'}]){meta=m;assert.equal((await onRequestPost({env,request:req({...body(),polish:valid})})).status,409);}
 env.MEDIA.get=async()=>null;assert.equal((await onRequestPost({env,request:req({...body(),polish:valid})})).status,404);
 for(const field of ['ai_enhanced','source_key','provider','enhancement_method'])assert.equal((await onRequestPost({env,request:req({...body(),[field]:'forged'})})).status,400);
 assert.equal(writes,0);
});
