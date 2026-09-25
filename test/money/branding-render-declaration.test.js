import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const current=readFileSync(new URL('../../public/hub/owner/assets/marketing-branding.js',import.meta.url),'utf8');
const historical=readFileSync(new URL('../../docs/marketing/cajita-social-2026-09-17/revision-3/marketing-branding.source.js',import.meta.url),'utf8');
async function run(code,opts={},fontMode='loaded') {
 const operations=[],texts=[],timers=[];let index=0;
 function canvas(){const cid=index++,c={width:0,height:0};
 const state={font:'',getImageData:(_x,_y,w,h)=>({data:new Uint8ClampedArray(w*h*4).fill(25)}),measureText:word=>({width:word.length*Number(state.font.match(/([\d.]+)px/)?.[1]||10)*.55})};
 const context=new Proxy(state,{get(target,key){if(key in target)return target[key];return(...args)=>{const normalized=args.map(a=>a?.canvasId!==undefined?{canvas:a.canvasId}:a?.imageId?{image:a.imageId}:a);operations.push([cid,key,...normalized]);if(key==='fillText')texts.push({text:args[0],x:args[1],y:args[2],font:target.font});if(key==='createLinearGradient'||key==='createRadialGradient')return{addColorStop(...a){operations.push([cid,'colorStop',...a]);}};};},set(target,key,value){target[key]=value;operations.push([cid,'set',key,value]);return true;}});
 c.canvasId=cid;c.getContext=()=>context;c.toDataURL=(...args)=>{operations.push([cid,'export',...args]);return'data:image/jpeg;base64,test';};return c;}
 class Image{constructor(){this.width=this.naturalWidth=1080;this.height=this.naturalHeight=1080;}set src(value){this.imageId=value;if(value.includes('emblem')){this.width=this.naturalWidth=100;this.height=this.naturalHeight=95.5;}queueMicrotask(()=>this.onload());}}
 const fonts=fontMode==='unavailable'?undefined:{load:()=>fontMode==='timeout'?new Promise(()=>{}):fontMode==='failed'?Promise.reject(Error('offline')):Promise.resolve(fontMode==='empty'?[]:[{}])};
 const scope={Image,document:{fonts,createElement:canvas},setTimeout:cb=>{timers.push(cb);if(fontMode==='timeout')queueMicrotask(cb);return timers.length;},Uint8ClampedArray};vm.runInNewContext(code,scope);
 let report;const output=await scope.AnejoBranding.compose('/photo.jpg',{preset:'reposado-square',text:'Fresh Cuban bites',kicker:'your table',...opts,onLayout:r=>report=r});
 return{output,operations:JSON.parse(JSON.stringify(operations)),texts,report:report&&JSON.parse(JSON.stringify(report))};
}
test('declaration instrumentation preserves every Canvas draw and style operation for supported templates',async()=>{
 for(const preset of ['reposado-square','reposado-dense','reposado-portrait','reposado-wide','reposado-cajita']){
  const options={preset,text:preset==='reposado-dense'?'Cuban bites':'Fresh Cuban bites',kicker:''};
  const before=await run(historical,options),after=await run(current,options);
  assert.deepEqual(after.operations,before.operations,preset);assert.equal(after.output,before.output);
  assert.equal(after.report.renderDeclaration.supported,true);assert.equal(after.report.renderDeclaration.template_id,preset);
 }
});
test('captured words are actual uppercase kicker and wrapped fillText calls, not unused options',async()=>{
 const r=await run(current,{preset:'reposado',aspect:1,textRegion:{x:.05,y:.55,w:.3,h:.4},emblemRegion:{x:.8,y:.05,w:.1,h:.1},text:'Fresh Cuban bites for your celebration',kicker:'your table',accent:'UNUSED',footer:'ALSO UNUSED'});
 const d=r.report.renderDeclaration;assert.equal(d.source,'browser_declared');assert.equal(d.pixel_verification,'unverified');assert.equal(d.source_hash,'unavailable');assert.equal(d.output_hash,'unavailable');
 assert.equal(d.text_runs[0].text,'YOUR TABLE');assert.ok(d.text_runs.filter(t=>t.role==='headline').length>1);
 assert.deepEqual(d.text_runs.map(t=>[t.text,t.x,t.y,t.font_css]),r.texts.map(t=>[t.text,t.x,t.y,t.font]));
 assert.ok(!JSON.stringify(d).includes('UNUSED'));assert.equal(d.font_load.status,'load_resolved');assert.deepEqual(d.font_load.face_counts,[1,1]);assert.equal(d.font_load.exact_glyph_face,'unverified');
});
test('vertical run coordinates describe actual translate/rotate and font fallback remains uncertain',async()=>{
 const r=await run(current,{preset:'reposado-portrait',text:'Congrí',kicker:''},'unavailable'),d=r.report.renderDeclaration;
 assert.equal(d.transform.rotation_degrees,-90);assert.equal(d.text_runs[0].coordinate_space,'rotated_local');assert.equal(d.text_runs[0].x,0);assert.equal(d.font_load.status,'api_unavailable');assert.equal(d.font_load.exact_glyph_face,'unverified');
 const timed=await run(current,{kicker:''},'timeout');assert.equal(timed.report.renderDeclaration.font_load.status,'timed_out');
 for(const mode of ['failed','empty']){const out=await run(current,{kicker:''},mode);assert.equal(out.report.renderDeclaration.font_load.status,mode==='failed'?'load_failed':'load_resolved');if(mode==='empty')assert.deepEqual(out.report.renderDeclaration.font_load.face_counts,[0,0]);}
});
test('non-editorial renderer branches explicitly decline draw-time declaration coverage',async()=>{
 for(const preset of ['reposado','poster']){const result=await run(current,{preset,text:'Cuban bites',kicker:''});assert.equal(result.report.renderDeclaration.supported,false);assert.equal(result.report.renderDeclaration.reason,'draw_time_capture_not_implemented');}
});
