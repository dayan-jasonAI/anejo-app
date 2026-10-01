import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestPost} from '../../functions/api/hub/owner/social-upload.js';
import {MAX_BODY,MAX_JPEG} from '../../functions/_lib/marketing_render_receipt.js';
const JPEG=readFileSync(new URL('../../tools/marketing-render-prototype/assets/source.jpg',import.meta.url));
const data=bytes=>'data:image/jpeg;base64,'+Buffer.from(bytes).toString('base64');
function fixture(){const writes=[];const env=ownerEnv({MEDIA:{put:async(...args)=>writes.push(args)}});return {env,writes};}
const request=(body,headers={})=>new Request('https://example.test/api/hub/owner/social-upload',{method:'POST',headers:{Cookie:OWNER_COOKIE,'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
async function reject(env,writes,req,status){const before=env.DB.one('SELECT total_changes() n').n;const r=await onRequestPost({env,request:req});assert.equal(r.status,status,await r.clone().text());assert.equal(writes.length,0);assert.equal(env.DB.one('SELECT total_changes() n').n,before);return r.json();}
// Preserve the real image payload; pad using legal JPEG comment segments, not fake SOF bytes.
function paddedJPEG(size){let remaining=size-JPEG.length;const chunks=[JPEG.subarray(0,2)];while(remaining){let n=Math.min(remaining,65537);if(remaining-n>0&&remaining-n<4)n-=4;assert.ok(n>=4);const segment=Buffer.alloc(n);segment[0]=255;segment[1]=254;segment.writeUInt16BE(n-2,2);chunks.push(segment);remaining-=n;}chunks.push(JPEG.subarray(2));return Buffer.concat(chunks);}
test('actual JPEG stores once with safe role suffix and JPEG metadata',async(t)=>{
 const network=t.mock.method(globalThis,'fetch',async()=>{throw Error('No external calls');});const {env,writes}=fixture();const r=await onRequestPost({env,request:request({data_url:data(JPEG),role:'../../Photo!'})});assert.equal(r.status,200);const body=await r.json();assert.equal(body.bytes,JPEG.length);assert.match(body.media_key,/^studio\/\d{4}-\d{2}\/up_[^/]+_photo\.jpg$/);assert.equal(writes.length,1);assert.deepEqual(Buffer.from(writes[0][1]),JPEG);assert.equal(writes[0][2].httpMetadata.contentType,'image/jpeg');assert.equal(network.mock.callCount(),0);
});
test('5MiB decoded boundary accepted; one byte above rejected before atob',async(t)=>{
 const {env,writes}=fixture();const max=paddedJPEG(MAX_JPEG);const accepted=await onRequestPost({env,request:request({data_url:data(max)})});assert.equal(accepted.status,200);assert.equal(writes[0][1].length,MAX_JPEG);
 const second=fixture();const atobSpy=t.mock.method(globalThis,'atob',()=>{throw Error('Must reject before decode');});await reject(second.env,second.writes,request({data_url:data(paddedJPEG(MAX_JPEG+1))}),413);assert.equal(atobSpy.mock.callCount(),0);
});
test('oversized streamedJSON ignores lying content-length and cancels input',async()=>{
 const {env,writes}=fixture();let cancelled=false;let chunks=0;
 const stream=new ReadableStream({pull(controller){chunks++;controller.enqueue(new Uint8Array(65536));},cancel(){cancelled=true;}});
 const req=new Request('https://example.test/api/hub/owner/social-upload',{method:'POST',headers:{Cookie:OWNER_COOKIE,'Content-Type':'application/json','Content-Length':'1'},body:stream,duplex:'half'});
 await reject(env,writes,req,413);assert.equal(cancelled,true);assert.ok(chunks<=Math.ceil(MAX_BODY/65536)+2);
});
test('authentication runs before body access; forbiddenrole does not consume body',async()=>{
 for(const [cookie,status] of [['',401],['anejo_sess=tok-kitchen',403]]){
  const {env,writes}=fixture();let reads=0;const req={headers:new Headers({Cookie:cookie,'Content-Type':'application/json'}),get body(){reads++;throw Error('Must not read body');}};
  await reject(env,writes,req,status);assert.equal(reads,0);
 }
});
test('contenttype/JSON/base64/role failures have precise statuses and no writes',async()=>{
 for(const [body,headers,status] of [[{data_url:data(JPEG)},{'Content-Type':'text/plain'},415],['{',{},400],[{data_url:'data:image/jpeg;base64,!!!!'}, {},400],[{data_url:'data:image/jpeg;base64,Zm9v\n'}, {},400],[{data_url:'data:image/jpeg;base64,Zh=='}, {},400],[{data_url:data(JPEG),role:'a'.repeat(81)}, {},400],[{data_url:data(JPEG),role:{}},{},400]]){const {env,writes}=fixture();await reject(env,writes,request(body,headers),status);}
});
test('magic withoutcompleteJPEGdimensions fails; HEIC gets accurate exportguidance',async()=>{
 const badHeader=Buffer.alloc(200);badHeader.set([255,216,255]);
 for(const bytes of [badHeader,JPEG.subarray(0,JPEG.length-2)]){const {env,writes}=fixture();const r=await reject(env,writes,request({data_url:data(bytes)}),400);assert.match(r.error,/header|dimensions/);}
 const heic=Buffer.alloc(200);heic.write('ftypheic',4);const {env,writes}=fixture();const r=await reject(env,writes,request({data_url:data(heic)}),400);assert.match(r.error,/HEIC photo/);assert.match(r.error,/Export or convert/);assert.doesNotMatch(r.error,/Copy Photo|screenshot/);
});

test('JPEG structural dimension limits rejectzero and oversizedwidth before storage',async()=>{
 for(const width of [0,8193]){
  const bytes=Buffer.from(JPEG);let offset=2,found=false;
  while(offset+4<bytes.length){assert.equal(bytes[offset],255);const marker=bytes[offset+1];if(marker===218)break;const length=bytes.readUInt16BE(offset+2);if([192,193,194].includes(marker)){bytes.writeUInt16BE(width,offset+7);found=true;break;}offset+=length+2;}
  assert.equal(found,true);const {env,writes}=fixture();await reject(env,writes,request({data_url:data(bytes)}),400);
 }
});
