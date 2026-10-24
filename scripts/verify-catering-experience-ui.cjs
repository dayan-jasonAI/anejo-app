/* Synthetic public/owner acceptance under production CSP. No external emails, payments or client data. */
/* global process, URL, document, innerWidth, console, setTimeout */
const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=process.cwd()+'/public',output=process.env.CATERING_EXPERIENCE_EVIDENCE||'/tmp/catering-experience-ui-evidence';fs.mkdirSync(output,{recursive:true});
const token='a'.repeat(64),calls=[],errors=[];let mode='post_delivery_review',failSave=false,unavailable=false,ownerClosedDelay=0;
const google='https://g.page/r/synthetic/review';
const quote={id:'cq_synthetic_experience',customer_name:'Synthetic Guest',customer_email:'guest@example.test',event_date:'2030-12-20',deposit_status:'paid',balance_status:'paid',guests:30,total_cents:33125,deposit_cents:16563,balance_cents:16562,quote_json:'{}'};
const messages=['pre_event_checkin','post_delivery_review'].map(kind=>({kind,status:'staged',review_hash:'synthetic_'+kind,recipient:'guest@example.test',subject:kind==='pre_event_checkin'?'Before your event':'Thank you for celebrating',html:'<html><body style="color:#17372a;background:#fffdf7"><img width="60" src="data:image/png;base64,'+fs.readFileSync(root+'/assets/img/favicon.png').toString('base64')+'"><h1>AÑEJO</h1><p>Synthetic event-care preview.</p></body></html>',text:'Synthetic event-care preview',feedback_url:'/catering-feedback?t='+token,send_eligible:kind==='pre_event_checkin',reason:kind==='post_delivery_review'?'Waiting for recorded delivery plus 60 minutes.':null,trigger:kind==='post_delivery_review'?'60 minutes after recorded delivery.':'Day before the event, fully paid.',approved_at:null}));
const response=()=>({ok:true,quote,messages,feedback:[],runtime:null});
const stub=`window.Hub={boot(){},esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},api:(u,o)=>fetch(u,{method:o?.method||'GET',headers:{'Content-Type':'application/json'},body:o?.body?JSON.stringify(o.body):undefined}).then(r=>r.json()),toast(){}};window.Owner={money:c=>'$'+(Number(c||0)/100).toFixed(2),get:u=>Hub.api(u),tile:(v,l)=>'<div>'+v+' '+l+'</div>',init:(_,fn)=>fn()};window.CateringI18n={label:x=>x,menu:x=>x};`;
const csp=fs.readFileSync(root+'/_headers','utf8').split('\n').find(line=>line.includes('Content-Security-Policy:')).split('Content-Security-Policy:')[1].trim();
const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Security-Policy',csp);const u=new URL(req.url,'http://'+req.headers.host),p=u.pathname;
 if(p==='/hub/assets/hub.js'){res.setHeader('Content-Type','text/javascript');return res.end(stub);}if(p==='/hub/owner/assets/owner.js'||p.endsWith('/operator.js')){res.setHeader('Content-Type','text/javascript');return res.end('');}
 if(p.startsWith('/api/')){
  res.setHeader('Content-Type','application/json');let body={};if(req.method==='POST'){let raw='';for await(const part of req)raw+=part;body=JSON.parse(raw);calls.push({path:p,body});}
  if(p==='/api/catering-feedback'){
   if(unavailable){res.writeHead(400);return res.end(JSON.stringify({ok:false,error:'Feedback link unavailable.'}));}
   if(req.method==='POST'&&failSave){res.writeHead(503);return res.end(JSON.stringify({ok:false,error:'Please try again shortly.'}));}
   return res.end(JSON.stringify({ok:true,kind:mode,prompt:mode==='pre_event_checkin'?'How has planning your celebration felt so far?':'How were the food and service?',google_review_url:mode==='post_delivery_review'?google:null,expires_at:Date.now()+100000,...(req.method==='POST'?{saved:true}:{})}));
  }
  if(p==='/api/hub/owner/catering-experience'){
   if(body.op==='stage'&&ownerClosedDelay)await new Promise(resolve=>setTimeout(resolve,ownerClosedDelay));
   if(body.op==='approve')messages.find(m=>m.kind===body.kind).approved_at=Date.now();
   if(body.op==='send')return res.end(JSON.stringify({ok:true,provider_accepted:true,receipt_id:'synthetic_receipt',delivery_verified:false}));
   return res.end(JSON.stringify(response()));
  }
  if(p.endsWith('/catering-deposit'))return res.end(JSON.stringify({ok:true,quotes:[quote],requests:[],changes:[]}));
  if(p.endsWith('/catering-quote-catalog'))return res.end(JSON.stringify({ok:true,items:[]}));
  if(p.endsWith('/catering-drafts'))return res.end(JSON.stringify({ok:true,drafts:[]}));
  return res.end('{}');
 }
 const f=path.join(root,p==='/catering-feedback'?'/catering-feedback.html':p);if(!f.startsWith(root)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(f));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,...(process.env.CATERING_BROWSER_CHANNEL?{channel:process.env.CATERING_BROWSER_CHANNEL}:{})});
 const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 await page.goto(base+'/catering-feedback?t='+token);await page.locator('#cf-form:not([hidden])').waitFor();await page.waitForFunction(()=>{const image=document.querySelector('.cf-brand img');return image.complete&&image.naturalWidth>0;});assert.equal(await page.locator('#cf-google').getAttribute('href'),google);
 await page.locator('#cf-submit').click();await page.getByText('Choose a feeling or a score so we know how it went.',{exact:true}).waitFor();assert.equal(calls.filter(c=>c.path==='/api/catering-feedback').length,0);
 await page.locator('#cf-moods label:has(input[value="sad"])').click();await page.locator('#cf-scores label:has(input[value="1"])').click();await page.locator('.cf-again label:has(input[value="false"])').click();await page.locator('#cf-comment').fill('Please improve the delivery communication.');
 failSave=true;await page.locator('#cf-submit').click();await page.getByText('Please try again shortly.',{exact:true}).waitFor();assert.equal(await page.locator('#cf-submit').isDisabled(),false);assert.equal(await page.locator('#cf-comment').inputValue(),'Please improve the delivery communication.');failSave=false;
 await page.locator('#cf-submit').click();await page.locator('#cf-thanks:not([hidden])').waitFor();assert.equal(await page.locator('#cf-google').getAttribute('href'),google);assert.deepEqual(calls.at(-1).body,{t:token,comment:'Please improve the delivery communication.',mood:'sad',rating:1,would_again:false});await page.screenshot({path:output+'/feedback-low-rating-mobile.png',fullPage:true});
 await page.reload();await page.locator('#cf-form:not([hidden])').waitFor();await page.locator('#cf-scores label:has(input[value="10"])').click();await page.locator('#cf-submit').click();await page.locator('#cf-thanks:not([hidden])').waitFor();assert.equal(await page.locator('#cf-google').getAttribute('href'),google);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 mode='pre_event_checkin';await page.reload();await page.locator('#cf-form:not([hidden])').waitFor();assert.equal(await page.locator('#cf-public-review').isHidden(),true);assert.equal(await page.locator('#cf-again-field').isHidden(),true);await page.getByText('Very excited',{exact:true}).click();await page.locator('#cf-comment').fill('All set for tomorrow, thank you.');await page.screenshot({path:output+'/pre-event-checkin-mobile.png',fullPage:true});await page.locator('#cf-submit').click();await page.locator('#cf-thanks:not([hidden])').waitFor();assert.deepEqual(calls.at(-1).body,{t:token,comment:'All set for tomorrow, thank you.',mood:'happy'});
 unavailable=true;await page.reload();await page.getByText('Feedback link unavailable.',{exact:true}).waitFor();assert.equal(await page.locator('#cf-form').isHidden(),true);unavailable=false;
 await page.goto(base+'/hub/owner/catering.html');await page.locator('[data-catering-experience]').waitFor();await page.locator('[data-catering-experience]').click();await page.locator('.q-experience-message input[type="checkbox"]:not([disabled])').first().waitFor();
 const first=page.locator('.q-experience-message[data-kind="pre_event_checkin"]'),post=page.locator('.q-experience-message[data-kind="post_delivery_review"]');assert.equal(await first.locator('[data-experience-send]').isDisabled(),true);assert.equal(await post.locator('[data-experience-send]').isDisabled(),true);
 await first.locator('iframe').waitFor();assert.equal(await first.frameLocator('iframe').locator('img').evaluate(i=>i.complete&&i.naturalWidth>0),true);
 await post.locator('.q-experience-consent input').nth(1).check();await post.locator('[data-experience-approve]').click();await page.getByText('This event’s future trigger is approved. This approval did not send an email.',{exact:true}).waitFor();assert.equal(calls.filter(c=>c.body.op==='send').length,0);assert.equal(calls.find(c=>c.body.op==='approve').body.kind,'post_delivery_review');await page.locator('#q-experience-dialog').screenshot({path:output+'/owner-event-care-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await first.locator('.q-experience-consent input').first().check();await first.locator('[data-experience-send]').click();await page.getByText(/The email provider accepted this message/).waitFor();assert.equal(calls.filter(c=>c.body.op==='send').length,1);assert.equal(await first.locator('[data-experience-send]').isDisabled(),true);
 await page.locator('#q-experience-close').click();ownerClosedDelay=200;await page.locator('[data-catering-experience]').click();await page.locator('#q-experience-close').click();await page.waitForTimeout(300);assert.equal(await page.locator('#q-experience-dialog').evaluate(node=>node.open),false);assert.equal(calls.filter(c=>c.body.op==='send').length,1);
 await page.setViewportSize({width:1440,height:1000});ownerClosedDelay=0;await page.locator('[data-catering-experience]').click();await page.locator('.q-experience-message input[type="checkbox"]:not([disabled])').first().waitFor();await page.locator('#q-experience-dialog').screenshot({path:output+'/owner-event-care-desktop.png'});assert.deepEqual(errors,[]);
 console.log(JSON.stringify({publicBrandImageDecoded:true,requiredFeelingOrScore:true,saveFailureRetainsInput:true,lowHighRatingSameGoogleLink:true,preEventBookingOnly:true,noGoogleReviewBeforeDelivery:true,ownerFullyPaidBookingAction:true,renderedOwnerEmailImageDecoded:true,explicitSeparateTriggerApproval:true,approveDoesNotSend:true,oneReviewedSendOnly:true,closedPreviewRaceIgnored:true,mobileNoOverflow:true,externalMessages:0,externalPaymentCalls:0,errors}));await browser.close();server.close();
})().catch(error=>{console.error(error);server.close();process.exit(1);});
