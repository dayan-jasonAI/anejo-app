/* global Buffer, __dirname, Response, console */
// Actual local workerd compiled-WASM proof; no production endpoint or outbound requests.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {build}=require('../../node_modules/esbuild');
const {Miniflare,convertV4MiniflareOptions}=require('../../node_modules/miniflare');
const sharp=require('./node_modules/sharp');
function stripICC(png){let at=8,parts=[png.subarray(0,8)];while(at<png.length){const n=png.readUInt32BE(at),end=at+n+12;if(png.subarray(at+4,at+8).toString()!=='iCCP')parts.push(png.subarray(at,end));at=end;}return Buffer.concat(parts);}
test('compiled color engine performs P3 to sRGB in actual local workerd without fetching code',async()=>{
 const output=fs.mkdtempSync(path.join(os.tmpdir(),'anejo-color-kernel-workerd-'));
 fs.copyFileSync(path.join(__dirname,'node_modules/lcms-wasm/dist/lcms.wasm'),path.join(output,'color.wasm'));
 const code=`import module from './color.wasm';import {createColorKernel} from './color-kernel.mjs';let ready;export default {async fetch(request){if(new URL(request.url).hostname!=='localhost')return new Response('',{status:403});try{ready??=createColorKernel(module);const kernel=await ready,data=await request.json(),before=kernel.observation(),rgb=kernel.transform(new Uint8Array(data.rgb),new Uint8Array(data.profile));return Response.json({rgb:Array.from(rgb),before,after:kernel.observation(),runtime:'local-workerd-only'});}catch(error){return Response.json({error:error.message},{status:422});}}};`;
 await build({stdin:{contents:code,resolveDir:__dirname,sourcefile:'color-proof-worker.mjs'},outfile:path.join(output,'worker.mjs'),bundle:true,format:'esm',platform:'browser',define:{process:'undefined'},minifySyntax:true,plugins:[require('./color-loader-build.cjs').compiledColorLoaderPlugin()],external:['./color.wasm','module']});
 const outbound=[],mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'color-kernel-local',modulesRoot:output,modules:[{type:'ESModule',path:path.join(output,'worker.mjs')},{type:'CompiledWasm',path:path.join(output,'color.wasm')}],compatibilityDate:'2026-05-01',outboundService(request){outbound.push(request.url);return new Response('',{status:403});}}],cf:false}));
 try{
  const patches=Buffer.from([190,80,45,45,155,80,40,90,180,120,120,120,230,210,170,20,30,20]),png=await sharp(patches,{raw:{width:6,height:1,channels:3}}).withIccProfile('p3').png().toBuffer(),profile=(await sharp(png).metadata()).icc,rgb=await sharp(stripICC(png)).raw().toBuffer(),expected=await sharp(png).withIccProfile('srgb').raw().toBuffer();
  const dispatch=data=>mf.dispatchFetch('http://localhost/color-proof',{method:'POST',body:JSON.stringify(data),headers:{'content-type':'application/json'}}),data={rgb:Array.from(rgb),profile:Array.from(profile)};
  let allocated;
  for(let n=0;n<8;n++){const response=await dispatch(data);assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.notDeepEqual(result.rgb,data.rgb);for(let i=0;i<rgb.length;i++)assert.ok(Math.abs(result.rgb[i]-expected[i])<=2);assert.equal(result.after.poisoned,false);allocated??=result.after.wasmLinearBytes;assert.equal(result.after.wasmLinearBytes,allocated);}
  const bad=data.profile.slice();bad[36]=0;assert.equal((await dispatch({...data,profile:bad})).status,422);assert.equal((await dispatch(data)).status,200);assert.deepEqual(outbound,[]);
  console.log(JSON.stringify({scope:'local-workerd-color-kernel',iterations:9,malformedRefusals:1,wasmLinearBytes:allocated,outboundRequests:outbound,limitations:'RGB pixel batches only; image decoding, ICC extraction, resize/orientation, derivative/provenance persistence and deployed resources remain unverified.'}));
 }finally{await mf.dispose();}
});
