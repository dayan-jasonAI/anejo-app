import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,webcrypto} from 'node:crypto';
import vm from 'node:vm';
const page=readFileSync(new URL('../../public/hub/owner/marketing.html',import.meta.url),'utf8');
const start=page.indexOf("    Array.prototype.forEach.call(document.querySelectorAll('.brand-preview')");
const end=page.indexOf('\n  }\n',start);
const block=page.slice(start,end);
function element(){return{disabled:false,events:{},addEventListener(name,fn){this.events[name]=fn;},click(){this.events.click();}};}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,1));}assert.fail('Expected UI state did not settle');}
function setup({composeFails=false,normalizationFails=false,wrongHash=false,selectedKey='marketing-library/source.jpg',recoveryReply=null,responses=[{ok:true,attached:true}]}={}){
 const preview=element(),use=element(),discard=element(),calls=[],toasts=[],revoked=[],composed=[],created=[];
 const key=selectedKey,source=new Blob([new Uint8Array([255,216,255,1,2,3,4,217])],{type:'image/jpeg'});
 const option={value:'media-original',getAttribute:name=>name==='data-key'?key:null};
 const resultBox={innerHTML:'',querySelector:selector=>selector==='.brand-use'?use:discard};
 const fields={'.brand-slide':{options:[option],selectedIndex:0},'.brand-pos':{value:'auto'},'.brand-text':{value:'Actual title'},'.brand-result':resultBox};
 for(const [field,value] of Object.entries({kicker:'Cuban food',accent:'',footer:'',preset:'reposado-square',layout:'auto',mark:'emblem',finish:'tint'}))fields['.brand-'+field]={value};
 const panel={getAttribute:()=> 'post-original',querySelector:selector=>fields[selector]};preview.closest=()=>panel;
 let loads=0,uuidCalls=0;
 const context={btoa,document:{querySelectorAll:selector=>selector==='.brand-preview'?[preview]:[]},window:{AnejoBranding:{rendererVersion:'test-renderer'},AnejoPhotoNormalize:{normalize:async bytes=>{if(normalizationFails)throw Error('normalization failed');return {dataUrl:'data:image/png;base64,normalized-snapshot',receipt:{original_sha256:wrongHash?'wrong':createHash('sha256').update(bytes).digest('hex'),status:'processed',source:'browser_declared',derivative_sha256:'normalized-hash'}};}}},crypto:{subtle:webcrypto.subtle,randomUUID:()=>{uuidCalls++;return'00000000-0000-4000-8000-000000000001';}},URL:{createObjectURL:blob=>{created.push(blob);return'blob:private-source';},revokeObjectURL:url=>revoked.push(url)},fetch:async(...args)=>{calls.push({kind:'fetch',args});return{ok:true,blob:async()=>source};},compositeBranding:async(url,options)=>{composed.push({url,options});options.onLayout({preset:'reposado',renderDeclaration:{source:'browser_declared',text_runs:[{text:'Actual title'}]}});if(composeFails)throw Error('composition failed');return'data:image/jpeg;base64,/9j/AA==';},Hub:{toast:message=>toasts.push(message),api:async(path,options)=>{if(path.startsWith('/api/hub/owner/marketing-original-source?')){calls.push({kind:'recovery',path});return recoveryReply;}calls.push({kind:'post',path,options});const result=responses.shift();if(result instanceof Error)throw result;return result;}},load:()=>loads++,Uint8Array};
 vm.runInNewContext(block,context);
 return{preview,use,discard,calls,toasts,revoked,composed,created,source,resultBox,loads:()=>loads,uuids:()=>uuidCalls,posts:()=>calls.filter(c=>c.kind==='post')};
}
test('preview binds original Blob hash and normalized derivative receipt; only explicit Use saves',async()=>{
 const h=setup();h.preview.click();await until(()=>!!h.use.events.click);
 assert.equal(h.posts().length,0);assert.equal(h.created.length,0);assert.equal(h.composed[0].url,'data:image/png;base64,normalized-snapshot');assert.deepEqual(h.revoked,[]);
 assert.equal(h.calls.filter(c=>c.kind==='fetch').length,1);assert.equal(h.calls[0].args[0],'/api/hub/media/marketing-library/source.jpg');
 h.use.click();await until(()=>h.loads()===1);const body=h.posts()[0].options.body;
 assert.equal(h.posts()[0].path,'/api/hub/owner/marketing-branded-save');assert.equal(body.post_id,'post-original');assert.equal(body.media_id,'media-original');assert.equal(body.source_key,'marketing-library/source.jpg');assert.equal(body.source_sha256,createHash('sha256').update(new Uint8Array(await h.source.arrayBuffer())).digest('hex'));
 assert.equal(body.declaration.options.normalization.original_sha256,body.source_sha256);assert.equal(body.declaration.options.normalization.derivative_sha256,'normalized-hash');assert.equal(body.declaration.options.normalization.source,'browser_declared');
 assert.equal(body.request_id,'00000000-0000-4000-8000-000000000001');assert.equal(body.declaration.options.onLayout,undefined);assert.equal(body.declaration.layout.renderDeclaration.text_runs[0].text,'Actual title');assert.equal(body.declaration.renderer_version,'test-renderer');assert.equal(h.loads(),1);
});
test('network failure retries the same preview UUID and never claims a saved attachment early',async()=>{
 const h=setup({responses:[Error('offline'),{ok:true,attached:true}]});h.preview.click();await until(()=>!!h.use.events.click);
 h.use.click();await until(()=>!h.use.disabled);assert.equal(h.loads(),0);assert.ok(!h.toasts.some(s=>s.includes('saved as draft')));
 h.use.click();await until(()=>h.loads()===1);assert.equal(h.posts().length,2);assert.equal(h.posts()[0].options.body.request_id,h.posts()[1].options.body.request_id);assert.equal(h.uuids(),1);
});
test('stored but unattached response stays an error and preserves retry identity',async()=>{
 const h=setup({responses:[{ok:true,attached:false},{ok:true,attached:true}]});h.preview.click();await until(()=>!!h.use.events.click);
 h.use.click();await until(()=>!h.use.disabled);assert.equal(h.loads(),0);assert.match(h.toasts.at(-1),/Could not attach/);assert.ok(!h.toasts.some(s=>s.includes('saved as draft')));
 h.use.click();await until(()=>h.loads()===1);assert.equal(h.posts()[0].options.body.request_id,h.posts()[1].options.body.request_id);
});
test('composition rejection never offers or saves a broken preview',async()=>{
 const h=setup({composeFails:true});h.preview.click();await until(()=>!h.preview.disabled);
 assert.deepEqual(h.revoked,[]);assert.equal(h.posts().length,0);assert.equal(h.use.events.click,undefined);assert.equal(h.loads(),0);assert.match(h.toasts.at(-1),/composition failed/);
});
test('Discard performs no save',async()=>{
 const h=setup();h.preview.click();await until(()=>!!h.discard.events.click);h.discard.click();assert.equal(h.resultBox.innerHTML,'');assert.equal(h.posts().length,0);assert.equal(h.loads(),0);
});

test('preview transport remains allowed by deployed image CSP',()=>{const headers=readFileSync(new URL('../../public/_headers',import.meta.url),'utf8');assert.match(headers,/img-src[^;]*data:/);assert.doesNotMatch(block,/createObjectURL/);});

for(const options of [{normalizationFails:true},{wrongHash:true}])test('normalization failure or original-hash mismatch prevents preview/save '+JSON.stringify(options),async()=>{const h=setup(options);h.preview.click();await until(()=>!h.preview.disabled);assert.equal(h.posts().length,0);assert.equal(h.composed.length,0);assert.equal(h.use.events.click,undefined);});

test('recorded editorial photo previews preserved source and binds current selection only on explicit Use',async()=>{const hash=createHash('sha256').update(new Uint8Array([255,216,255,1,2,3,4,217])).digest('hex'),recovery={current_key:'studio/render-receipts/old.jpg',current_sha256:'a'.repeat(64),depth:2};const h=setup({selectedKey:recovery.current_key,recoveryReply:{ok:true,source_key:'marketing-library/preserved.jpg',source_sha256:hash,recovery}});h.preview.click();await until(()=>!!h.use.events.click);assert.equal(h.calls.filter(c=>c.kind==='recovery').length,1);assert.equal(h.calls.find(c=>c.kind==='fetch').args[0],'/api/hub/media/marketing-library/preserved.jpg');assert.match(h.resultBox.innerHTML,/before recorded editorial overlays/);assert.equal(h.posts().length,0);h.use.click();await until(()=>h.loads()===1);const b=h.posts()[0].options.body;assert.equal(b.source_key,'marketing-library/preserved.jpg');assert.deepEqual(b.declaration.options.original_source_recovery,recovery);});
for(const mode of ['unavailable','changed'])test('preserved-source '+mode+' blocks composition and save',async()=>{const h=setup({selectedKey:'studio/render-receipts/old.jpg',recoveryReply:mode==='unavailable'?{ok:false}:{ok:true,source_key:'marketing-library/preserved.jpg',source_sha256:'b'.repeat(64),recovery:{current_key:'studio/render-receipts/old.jpg',current_sha256:'a'.repeat(64),depth:1}}});h.preview.click();await until(()=>!h.preview.disabled);assert.equal(h.composed.length,0);assert.equal(h.posts().length,0);assert.equal(h.use.events.click,undefined);});
