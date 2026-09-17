import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code = readFileSync(new URL('../../public/hub/owner/assets/marketing-photo-polish.js', import.meta.url), 'utf8');
function harness({width=100,height=50,result={ok:true,photo:{media_key:'copy.jpg'}},imageError=false}={}) {
  const calls=[],operations=[],pixels=new Uint8ClampedArray([40,80,120,255]);
  const canvas={getContext:()=>({fillRect(){operations.push('fill');},drawImage(){operations.push('draw');},getImageData(){return {data:pixels};},putImageData(){operations.push('put');}}),toDataURL:(type)=>{assert.equal(type,'image/jpeg');return 'data:image/jpeg;base64,/9j/';}};
  const ctx={window:{},Image:class{constructor(){this.naturalWidth=width;this.naturalHeight=height;}set src(v){this.url=v;queueMicrotask(()=>imageError?this.onerror():this.onload());}},document:{createElement:()=>canvas},Hub:{api:async(path,opts)=>{calls.push({path,opts});return result;}},setTimeout,clearTimeout};
  vm.runInNewContext(code,ctx);return{api:ctx.window.MarketingPhotoPolish,calls,operations,canvas};
}
test('neutral polish deterministically preserves channel ordering, alpha, and distinct pixel positions',()=>{
 const h=harness();const input=new Uint8ClampedArray([40,80,120,255,200,150,100,255]);
 h.api.transformPixels(input,'natural');assert.deepEqual(Array.from(input),[40,81,123,255,206,154,102,255]);
});
test('bright is stronger than natural; warm balances red and blue without replacing content',()=>{
 const h=harness();function pixel(preset){return Array.from(h.api.transformPixels(new Uint8ClampedArray([100,100,100,255]),preset));}
 const n=pixel('natural'),b=pixel('bright'),w=pixel('warm');assert.ok(b[0]>n[0]);assert.equal(n[0],n[1]);assert.ok(w[0]>w[1]);assert.ok(w[1]>w[2]);
});
test('clipping stays bounded and transparency has deterministic white backing',()=>{
 const h=harness();const p=new Uint8ClampedArray([0,0,0,255,255,255,255,255,0,0,0,0]);h.api.transformPixels(p,'bright');
 assert.deepEqual(Array.from(p),[0,0,0,255,255,255,255,255,255,255,255,0]);assert.throws(()=>h.api.transformPixels(p,'invented'));
});
test('create keeps dimensions under cap and writes one derived private library copy',async()=>{
 const h=harness();const photo={media_key:'marketing-library/original.png',url:'/private/photo',name:'Birthday.png',folder:'Party'};
 const output=await h.api.create(photo,'warm');assert.equal(output.media_key,'copy.jpg');assert.equal(h.canvas.width,100);assert.equal(h.canvas.height,50);
 assert.deepEqual(h.operations,['fill','draw','put']);assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'/api/hub/owner/marketing-library');
 const body=h.calls[0].opts.body;assert.equal(body.polish.source_key,photo.media_key);assert.equal(body.polish.preset,'warm');assert.equal(body.folder,'Party');assert.equal(body.tags.length,0);assert.equal(photo.media_key,'marketing-library/original.png');
});
test('large source scales proportionally to 4096 without crop; failures never claim a saved copy',async()=>{
 const h=harness({width:8000,height:4000});await h.api.create({media_key:'a',url:'/a'},'natural');assert.equal(h.canvas.width,4096);assert.equal(h.canvas.height,2048);
 const bad=harness({imageError:true});await assert.rejects(bad.api.create({media_key:'a',url:'/a'},'bright'),/Could not load/);assert.equal(bad.calls.length,0);
 await assert.rejects(harness({result:{error:'Storage failed'}}).api.create({media_key:'a',url:'/a'},'natural'),/Storage failed/);
});
