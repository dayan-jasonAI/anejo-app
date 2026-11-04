/* global process, console, URL, Request, Response, document, window, innerWidth, __dirname, __filename, Buffer */
/* Local synthetic browser acceptance. Serves canonical public assets; all fixtures use synthetic IDs/names. */
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../..');
const reportDir=process.env.ANEJO_DELIVERY_AUDIT_OUT||'/tmp/delivery-recovery-browser';fs.mkdirSync(reportDir,{recursive:true});
const now=Date.now(),serviceDate='2026-10-31',routeId='route_synth_owner_oct31',orderId='order_synth_owner_oct31',driverRouteId='route_synth_driver_oct31',driverOrderId='order_synth_driver_oct31';
const seenApis=[],externalBlocked=[],pageErrors=[],served=new Map(),resolutionPosts=[],driverRoutePosts=[];
let env,handlers={},server,browser,context,page;
const fileHashes=new Map();
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const assertNoOverflow=async(p,label)=>assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,label+' horizontal overflow at 375px');
function mime(file){return ({'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'})[path.extname(file)]||'application/octet-stream';}
function addStaff(id,name,email,role,token){
 const t=now;env.DB.sqlite.prepare('INSERT INTO staff(id,name,email,role,active,phone,created_at,updated_at) VALUES(?,?,?,?,1,?,?,?)').run(id,name,email,role,'+15550000009',t,t);
 env.SESSIONS.store.set('session:'+token,JSON.stringify({type:'staff',role,uid:id,email,la:t,created:t}));
}
function seed(){
 addStaff('stf_driver_browser','Synthetic Driver','driver-browser@test.example','driver','tok-driver-browser');
 env.DB.sqlite.prepare('INSERT INTO orders(id,customer_name,customer_email,items,delivery_date,delivery_window,total_estimate_cents,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run(orderId,'Synthetic Guest','guest-browser@test.example','[]',serviceDate,'lunch',9876,'delivery_failed',now,now);
 env.DB.sqlite.prepare("INSERT INTO routes(id,driver_id,route_date,stop_count,status,offer_status,offered_at,dispatch_mode,created_at,updated_at,pay_cents,total_miles_est) VALUES(?,?,?,1,'assigned','pending',?,'manual',?,?,2450,4.2)")
  .run(routeId,'stf_driver_browser',serviceDate,now-120000,now-3600000,now-3600000);
 env.DB.sqlite.prepare("INSERT INTO route_stops(id,route_id,order_id,seq,label,status,created_at,updated_at) VALUES('stop_synth_browser',?,?,1,'Synthetic Guest — lunch','pending',?,?)")
  .run(routeId,orderId,now-3600000,now-3600000);
 env.DB.sqlite.prepare('INSERT INTO orders(id,customer_name,customer_email,items,delivery_date,delivery_window,total_estimate_cents,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
  .run(driverOrderId,'Synthetic Driver Guest','driver-guest@test.example','[]',serviceDate,'lunch',5432,'paid',now,now);
 env.DB.sqlite.prepare("INSERT INTO routes(id,driver_id,route_date,stop_count,status,offer_status,offered_at,dispatch_mode,created_at,updated_at,pay_cents,total_miles_est) VALUES(?,?,?,1,'assigned','pending',?,'manual',?,?,1800,3.1)")
  .run(driverRouteId,'stf_driver_browser',serviceDate,now-300000,now-7200000,now-7200000);
 env.DB.sqlite.prepare("INSERT INTO route_stops(id,route_id,order_id,seq,label,status,created_at,updated_at) VALUES('stop_synth_driver',?,?,1,'Synthetic Driver Guest — lunch','pending',?,?)")
  .run(driverRouteId,driverOrderId,now-7200000,now-7200000);
}
function reqFor(req,body){return new Request('https://anejo.test'+req.url,{method:req.method,headers:{cookie:req.headers.cookie||'',...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
async function responseFrom(handler,request){return handler({request,env});}
async function api(req,res,url){
 seenApis.push({path:url.pathname,method:req.method});
 let raw='';for await(const c of req)raw+=c;let body=null;try{if(raw)body=JSON.parse(raw);}catch{/* Optional cleanup / invalid JSON fallback. */}
 try{
  let response;
  if(url.pathname==='/api/me')response=await responseFrom(handlers.me,reqFor(req));
  else if(url.pathname==='/api/hub/owner/routes'&&req.method==='GET')response=await responseFrom(handlers.ownerRoutesGet,reqFor(req));
  else if(url.pathname==='/api/hub/owner/deliveries/today')response=await responseFrom(handlers.ownerToday,reqFor(req));
  else if(url.pathname==='/api/hub/owner/delivery-resolution'){
   if(req.method==='POST')resolutionPosts.push(body);
   response=await handlers.deliveryResolution({request:reqFor(req,body),env});
  }
  else if(url.pathname==='/api/hub/driver/route'){
   if(req.method==='POST')driverRoutePosts.push(body);
   response=await (req.method==='POST'?handlers.driverRoutePost:handlers.driverRouteGet)({request:reqFor(req,body),env});
  }
  else if(url.pathname==='/api/hub/driver/pickup')response=await (req.method==='POST'?handlers.pickupPost:handlers.pickupGet)({request:reqFor(req,body),env});
  else {
   // Display/auth convenience only. Owner resolution and driver route GET/POST use actual APIs above.
   let value={ok:true};
   if(url.pathname==='/api/hub/training/status')value={ok:true,prompt:false};
   else if(url.pathname==='/api/hub/owner/ready-orders')value={ok:true,total:0,awaiting_driver:0,items:[]};
   else if(url.pathname==='/api/hub/owner/pay-config')value={ok:true,config:{base_cents:0,per_stop_cents:0,per_mile_cents:0,min_cents:0}};
   else if(url.pathname==='/api/hub/owner/dispatch-config')value={ok:true,config:{enabled:false}};
   else if(url.pathname==='/api/hub/driver/clock-in')value={ok:true,already_open:false,shift:null};
   else if(url.pathname==='/api/hub/driver/schedule')value={ok:true,shifts:[]};
   else if(url.pathname==='/api/hub/track')value={ok:true};
   response=new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
  }
  res.statusCode=response.status;for(const[k,v]of response.headers)res.setHeader(k,v);res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.statusCode=500;res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:false,error:String(error.stack||error)}));}
}
server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/api/'))return void api(req,res,url);
 try{
  const base=path.resolve(root,'public'),file=path.resolve(base,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end('missing');}
  const bytes=fs.readFileSync(file),hash=sha(bytes);if(!served.has(file))served.set(file,new Set());served.get(file).add(hash);fileHashes.set(file,hash);
  res.setHeader('Content-Type',mime(file));res.setHeader('Cache-Control','no-store');res.end(bytes);
 }catch(error){res.statusCode=500;res.end(String(error));}
});
async function waitFor(p,sel,timeout=12000){await p.locator(sel).waitFor({timeout});}
async function main(){
 const {ownerEnv}=await import(pathToFileURL(path.join(root,'test/helpers/sqlite-d1.js')).href);
 const [{onRequestGet:me},ownerRoutes,{onRequestGet:ownerToday},resolution,driverRoute,pickup]=await Promise.all([
  import(pathToFileURL(path.join(root,'functions/api/me.js')).href),
  import(pathToFileURL(path.join(root,'functions/api/hub/owner/routes.js')).href),
  import(pathToFileURL(path.join(root,'functions/api/hub/owner/deliveries/today.js')).href),
  import(pathToFileURL(path.join(root,'functions/api/hub/owner/delivery-resolution.js')).href),
  import(pathToFileURL(path.join(root,'functions/api/hub/driver/route.js')).href),
  import(pathToFileURL(path.join(root,'functions/api/hub/driver/pickup.js')).href)
 ]);
 env=ownerEnv();seed();handlers={me,ownerRoutesGet:ownerRoutes.onRequestGet,ownerToday,deliveryResolution:resolution.onRequest,driverRouteGet:driverRoute.onRequestGet,driverRoutePost:driverRoute.onRequestPost,pickupGet:pickup.onRequestGet,pickupPost:pickup.onRequestPost};
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({...(process.env.ANEJO_BROWSER_CHANNEL==='chromium'?{}:{channel:process.env.ANEJO_BROWSER_CHANNEL||'chrome'}),headless:true});context=await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();externalBlocked.push(route.request().url());return route.abort();});
 await context.addCookies([{name:'anejo_sess',value:'tok-owner',url:base}]);
 page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>pageErrors.push(e.message));
 const evidence={screenshots:[],assertions:[],source_hashes:{},limitation:[]};
 // Actual owner deliveries page, selected historical date; owner routes/today and resolution APIs use SQLite handlers.
 await page.goto(base+'/hub/owner/deliveries.html?date='+serviceDate);
 await waitFor(page,'#rexisting [data-route-id="'+routeId+'"]');
 assert.equal(await page.locator('#rdate').inputValue(),serviceDate,'selected historical date loads');
 assert.equal(await page.locator('#rexisting [data-route-id="'+routeId+'"]').count(),1);
 const before={order:env.DB.one('SELECT status,total_estimate_cents FROM orders WHERE id=?',orderId),route:env.DB.one('SELECT status,offer_status,pay_cents FROM routes WHERE id=?',routeId),audits:env.DB.one("SELECT count(*) n FROM activity_log WHERE event='delivery.owner_confirmed'").n};
 // Cancel from the overflow menu: only the actual GET preview may occur, no POST or D1 mutation.
 await page.locator('#rexisting [data-route-id="'+routeId+'"] .delivery-actions summary').click();
 await page.getByRole('button',{name:/Confirm delivered/}).click();
 await waitFor(page,'dialog.delivery-resolution');await page.getByRole('button',{name:/Cancel/}).click();await page.locator('#rexisting [data-route-id="'+routeId+'"] .delivery-actions').evaluate(el=>{el.open=false;});
 assert.equal(resolutionPosts.length,0,'cancel makes no delivery-resolution POST');assert.deepEqual(env.DB.one('SELECT status,total_estimate_cents FROM orders WHERE id=?',orderId),before.order);assert.equal(env.DB.one("SELECT count(*) n FROM activity_log WHERE event='delivery.owner_confirmed'").n,before.audits);
 evidence.assertions.push('overflow menu opens owner resolution dialog; cancel performs no write');
 // Required reason + owner attestation block submission.
 await page.locator('#rexisting [data-route-id="'+routeId+'"] .delivery-actions summary').click();
 await page.getByRole('button',{name:/Confirm delivered/}).click();await waitFor(page,'dialog.delivery-resolution');
 const postCount=resolutionPosts.length;await page.locator('#dr-save').click();
 assert.equal(await page.locator('#dr-reason').evaluate(el=>el.validity.valid),false,'empty reason is invalid');
 assert.equal(await page.locator('#dr-confirm').evaluate(el=>el.validity.valid),false,'attestation is required');
 assert.equal(resolutionPosts.length,postCount,'invalid form submits no POST');
 assert.equal(await page.locator('#dr-occurred').inputValue(),'','exact delivery time begins unknown');
 // Dirty fields survive language toggling; labels and the live select options should translate both ways.
 await page.locator('#dr-reason').fill('Synthetic owner verified at handoff');
 await page.locator('#dr-time').selectOption('yes');
 await page.evaluate(()=>window.AnejoLang.set('es'));await page.waitForFunction(()=>window.AnejoLang.get()==='es');
 assert.equal(await page.locator('#dr-reason').inputValue(),'Synthetic owner verified at handoff');assert.equal(await page.locator('#dr-time').inputValue(),'yes');assert.equal(await page.locator('#dr-occurred').inputValue(),'');
 const spanishOptions=await page.locator('#dr-time option').allTextContents();assert.match(spanishOptions.join(' '),/No lo sé|Desconocido|No sé/);assert.match(spanishOptions.join(' '),/Sí, a tiempo/);
 assert.match(await page.locator('dialog #dr-title').innerText(),/Confirmar entrega realizada/);
 assert.match(await page.locator('dialog').innerText(),/Motivo \/ qué ocurrió/);
 await page.locator('#dr-confirm').check();
 await page.screenshot({path:path.join(reportDir,'owner-resolution-es-375.png'),fullPage:true});evidence.screenshots.push(path.join(reportDir,'owner-resolution-es-375.png'));
 await page.evaluate(()=>window.AnejoLang.set('en'));await page.waitForFunction(()=>window.AnejoLang.get()==='en');
 assert.equal(await page.locator('#dr-reason').inputValue(),'Synthetic owner verified at handoff');assert.equal(await page.locator('#dr-time').inputValue(),'yes');assert.equal(await page.locator('#dr-occurred').inputValue(),'');
 assert.match((await page.locator('#dr-time option').allTextContents()).join(' '),/Unknown/);assert.match((await page.locator('#dr-time option').allTextContents()).join(' '),/Yes, on time/);
 assert.match(await page.locator('dialog').innerText(),/Reason \/ what happened/);
 await assertNoOverflow(page,'Owner dialog');
 await page.locator('#dr-save').click();
 await page.waitForFunction(()=>document.querySelector('dialog.delivery-resolution')?.open===false,null,{timeout:12000});
 assert.equal(resolutionPosts.length,1,'single confirmed POST');
 assert.equal(resolutionPosts[0].route_id,routeId);assert.equal(resolutionPosts[0].on_time,true);assert.equal(resolutionPosts[0].occurred_at,null);assert.equal(resolutionPosts[0].reason,'Synthetic owner verified at handoff');assert.equal(resolutionPosts[0].confirmed,true);
 await page.waitForFunction(id=>document.querySelector('#rexisting [data-route-id="'+id+'"]')===null,routeId);
 assert.equal(await page.locator('#rdate').inputValue(),serviceDate,'selected date is preserved after refresh');
 assert.equal(env.DB.one('SELECT status FROM orders WHERE id=?',orderId).status,'fulfilled');assert.equal(env.DB.one('SELECT status FROM routes WHERE id=?',routeId).status,'completed');
 const audit=env.DB.one("SELECT actor_id,actor_role,properties FROM activity_log WHERE event='delivery.owner_confirmed'");assert.equal(audit.actor_id,'stf_owner');assert.equal(audit.actor_role,'owner');const props=JSON.parse(audit.properties);assert.equal(props.occurred_at,null);assert.equal(props.on_time,true);assert.equal(props.reason,'Synthetic owner verified at handoff');
 await page.locator('#show-route-history').check();await waitFor(page,'#rexisting [data-route-id="'+routeId+'"] details summary');
 await page.locator('#rexisting [data-route-id="'+routeId+'"] details summary').click();
 assert.match(await page.locator('#rexisting [data-route-id="'+routeId+'"]').innerText(),/Synthetic owner verified at handoff/);
 await page.screenshot({path:path.join(reportDir,'owner-resolution-history-en-375.png'),fullPage:true});evidence.screenshots.push(path.join(reportDir,'owner-resolution-history-en-375.png'));
 evidence.assertions.push('required reason/attestation prevent submit; blank exact time and selected on-time survive language changes and POST as null/true');
 evidence.assertions.push('actual API fulfills synthetic order, completes route, stores owner audit, removes active card and history toggle exposes reason');
 // Driver home at real current date: Oct 31 manual offer persists and deep-link is explicit.
 await context.clearCookies();await context.addCookies([{name:'anejo_sess',value:'tok-driver-browser',url:base}]);
 const driver=await context.newPage();driver.setDefaultTimeout(10000);driver.on('pageerror',e=>pageErrors.push(e.message));
 await driver.goto(base+'/hub/driver/index.html');
 await driver.getByText('Assignment awaiting your response',{exact:true}).waitFor({timeout:12000});
 const banner=driver.locator('#driver-offers a[href*="route_id="]');assert.equal(await banner.count(),1);assert.match(await banner.getAttribute('href'),new RegExp('route_id='+driverRouteId));
 await assertNoOverflow(driver,'Driver home');
 await banner.click();await driver.waitForURL(new RegExp('/hub/driver/route.html\\?route_id='+driverRouteId));
 await driver.getByRole('button',{name:/Accept order/}).waitFor();
 await driver.getByRole('button',{name:/Accept order/}).click();
 await driver.waitForFunction(()=>!document.querySelector('#offer-accept')&&/assigned/.test(document.querySelector('#route-head')?.innerText||''),null,{timeout:12000});
 assert.equal(await driver.locator('#offer-accept').count(),0,'accepted offer exits the pending state in the driver UI');
 const accepted=env.DB.one('SELECT driver_id,route_date,offer_status FROM routes WHERE id=?',driverRouteId);assert.equal(accepted.driver_id,'stf_driver_browser');assert.equal(accepted.route_date,serviceDate);assert.equal(accepted.offer_status,'accepted');
 const acceptCall=driverRoutePosts.find(x=>x&&x.action==='accept');assert.deepEqual(acceptCall,{action:'accept',route_id:driverRouteId},'driver UI accepts the selected historical route id');
 await driver.screenshot({path:path.join(reportDir,'driver-historical-route-accepted-375.png'),fullPage:true});evidence.screenshots.push(path.join(reportDir,'driver-historical-route-accepted-375.png'));
 evidence.assertions.push('current-date driver home shows Oct 31 pending offer; deep-link preserves route_id and actual driver API accepts same route');
 evidence.assertions.push('shift probe is stubbed read-only; no clock-in action or provider callback');
 await assertNoOverflow(driver,'Driver route');
 assert.deepEqual(pageErrors,[],'no browser pageerrors');assert.deepEqual(externalBlocked,[],'no external requests attempted');
 assert.equal(env.DB.one('SELECT total_estimate_cents FROM orders WHERE id=?',orderId).total_estimate_cents,9876,'order payment amount unchanged');
 assert.equal(env.DB.one('SELECT pay_cents FROM routes WHERE id=?',routeId).pay_cents,2450,'driver pay amount unchanged');
 const required=['public/hub/owner/deliveries.html','public/hub/owner/assets/delivery-resolution.js','public/hub/owner/assets/readiness.js','public/hub/owner/assets/owner.js','public/hub/driver/index.html','public/hub/driver/route.html','public/hub/assets/hub.js','public/hub/driver/assets/driver.js','public/assets/js/i18n.js','public/assets/js/public-i18n-coverage.js','public/hub/assets/hub-i18n.js','public/hub/assets/hub-i18n-coverage.js'];
 for(const rel of required)assert(served.has(path.join(root,rel)),'actual canonical asset served: '+rel);
 const drift=[...served].filter(([file,versions])=>versions.size!==1||!versions.has(sha(fs.readFileSync(file)))).map(([file])=>path.relative(root,file));assert.deepEqual(drift,[],'source changed during browser run; rerun on stable checkout');
 for(const rel of required)evidence.source_hashes[rel]=sha(fs.readFileSync(path.join(root,rel)));
 for(const rel of ['functions/api/me.js','functions/api/hub/owner/routes.js','functions/api/hub/owner/deliveries/today.js','functions/api/hub/owner/delivery-resolution.js','functions/_lib/owner_delivery_resolution.js','functions/api/hub/driver/route.js','functions/api/hub/driver/pickup.js'])evidence.source_hashes[rel]=sha(fs.readFileSync(path.join(root,rel)));
 evidence.test_source_hash=sha(fs.readFileSync(__filename));
 evidence.status='local_synthetic_pass';evidence.external_requests_blocked=externalBlocked;evidence.page_errors=pageErrors;evidence.api_calls=seenApis;evidence.resolution_posts=resolutionPosts;evidence.driver_route_posts=driverRoutePosts;evidence.note='Local Chrome only; actual assets and selected backend handlers with synthetic SQLite; convenience/session/training/clock/schedule APIs stubbed; no deployment or live behavior verified.';
 fs.writeFileSync(path.join(reportDir,'browser-validation.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({status:evidence.status,assertions:evidence.assertions.length,screenshots:evidence.screenshots,report:path.join(reportDir,'browser-validation.json')}));
 await driver.close();
}
main().catch(async error=>{
 const result={status:'local_synthetic_failed',failure:String(error.stack||error),external_requests_blocked:externalBlocked,page_errors:pageErrors,api_calls:seenApis,resolution_posts:resolutionPosts,driver_route_posts:driverRoutePosts,source_versions:Object.fromEntries([...served].map(([file,versions])=>[path.relative(root,file),[...versions]]))};
 try{fs.writeFileSync(path.join(reportDir,'browser-validation.json'),JSON.stringify(result,null,2));if(page)await page.screenshot({path:path.join(reportDir,'failure.png'),fullPage:true}).catch(()=>{});}catch{/* Optional cleanup / invalid JSON fallback. */}
 console.error(error);process.exitCode=1;
}).finally(async()=>{try{if(context)await context.close();if(browser)await browser.close();}catch{/* Optional cleanup / invalid JSON fallback. */}try{if(env?.DB?.sqlite)env.DB.sqlite.close();}catch{/* Optional cleanup / invalid JSON fallback. */}if(server){server.close();server.closeAllConnections();}});
