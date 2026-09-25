import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../public/hub/sw.js',import.meta.url),'utf8');
function worker(network,{cached='old shell',offline='offline shell'}={}){
 const handlers={},writes=[],requests=[];
 const caches={open:async()=>({put:async(req,res)=>writes.push([req.url,res])}),match:async key=>key==='/hub/offline.html'?offline:cached};
 vm.runInNewContext(source,{URL,Response,self:{location:{origin:'https://anejocateringco.com'},addEventListener:(type,fn)=>handlers[type]=fn},caches,fetch:async(req,opts)=>{requests.push({req,opts});return network(req,opts);}});
 return {writes,requests,async fetch(path,mode='navigate',method='GET'){let pending;handlers.fetch({request:{url:'https://anejocateringco.com'+path,mode,method},respondWith(p){pending=p;}});const result=await pending;await Promise.resolve();return result;}};
}
const response=(extra={})=>({ok:true,status:200,type:'basic',redirected:false,clone(){return this;},...extra});
test('natural extensionless and html Hub reloads revalidate HTTP cache and replace offline shell',async()=>{
 for(const path of ['/hub/owner/marketing','/hub/owner/marketing.html']){
 const fresh=response();const sw=worker((_req,opts)=>opts?.cache==='no-cache'?fresh:'stale HTTP shell');
 assert.equal(await sw.fetch(path),fresh);assert.equal(sw.requests[0].opts.cache,'no-cache');assert.equal(sw.writes.length,1);
 }
});
test('offline navigation retains cached page and missing page uses offline shell',async()=>{
 const offline=()=>{throw new Error('offline');};assert.equal(await worker(offline).fetch('/hub/owner/marketing'),'old shell');assert.equal(await worker(offline,{cached:null}).fetch('/hub/owner/marketing'),'offline shell');
});
test('auth redirects and HTTP authorization errors are returned, never cached or replaced by old page',async()=>{
 for(const res of [response({redirected:true}),response({ok:false,status:401}),response({ok:false,status:403})]){const sw=worker(()=>res);assert.equal(await sw.fetch('/hub/owner/marketing'),res);assert.equal(sw.writes.length,0);}
});
test('API auth navigations and unrelated pages stay browser native; API data is never cached',async()=>{
 const sw=worker(()=>response());assert.equal(await sw.fetch('/api/auth/verify'),undefined);assert.equal(await sw.fetch('/cajita'),undefined);assert.equal(sw.requests.length,0);
 await sw.fetch('/api/hub/owner/social','cors');assert.equal(sw.requests.length,1);assert.equal(sw.writes.length,0);
 const offline=worker(()=>{throw new Error('offline');});assert.equal((await offline.fetch('/api/hub/owner/social','cors')).status,503);assert.equal(offline.writes.length,0);
});
test('deployed header policy revalidates Hub extensionless documents and worker without covering API',()=>{
 const headers=readFileSync(new URL('../../public/_headers',import.meta.url),'utf8');
 assert.match(headers,/\/hub\n {2}Cache-Control: no-cache/);assert.match(headers,/\/hub\/\*\n {2}Cache-Control: no-cache/);
 assert.ok(!headers.includes('/api/*\n {2}Cache-Control: no-cache'));
});

test('Hub code revalidates online and cannot serve a stale cache winner, including version queries',async()=>{
 for(const path of ['/hub/owner/assets/operator.js?v=private-strategy-7','/hub/assets/hub.js','/hub/assets/hub.css']){
  const fresh=response();const sw=worker((_req,opts)=>opts?.cache==='no-cache'?fresh:'old browser response');
  assert.equal(await sw.fetch(path,'cors'),fresh);assert.equal(sw.writes.length,1);
 }
});
test('Hub code uses offline fallback only on transport failure and does not mask HTTP errors',async()=>{
 const path='/hub/owner/assets/operator.js?v=private-strategy-7';
 assert.equal(await worker(()=>{throw Error('offline');}).fetch(path,'cors'),'old shell');
 const unavailable=await worker(()=>{throw Error('offline');},{cached:null}).fetch(path,'cors');
 assert.equal(unavailable.status,503);assert.match(await unavailable.text(),/unavailable offline/);
 for(const res of [response({redirected:true}),response({ok:false,status:403}),response({ok:false,status:404})]){
  const sw=worker(()=>res);assert.equal(await sw.fetch(path,'cors'),res);assert.equal(sw.writes.length,0);
 }
});
