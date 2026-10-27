/* global URL, console, process, __dirname, Buffer, document, innerWidth, window, AnejoLang, AnejoI18n, AnejoOperatorPlaybooks */
/* global AnejoI18n, AnejoLang, document */
/* Owned synthetic UI only: no client sessions, live database or provider calls. */
const { chromium } = require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('public'); let providerCalls=0;
const fixture=(spanish=false)=>`<!doctype html><html lang="${spanish?'es':'en'}"><head><meta charset="utf-8"><title>Menu</title></head><body data-i18n-local-only><h1>${spanish?'Menú':'Menu'}</h1><div id="dynamic"></div><input id="submit" type="submit" value="Save"><textarea id="draft">Private customer draft</textarea><p translate="no">Customer original message</p><select><option>Birthday</option></select><script src="/assets/js/i18n.js"></script><script src="/assets/js/i18n.js"></script></body></html>`;
const server=http.createServer((req,res)=>{let u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/')){providerCalls++;res.writeHead(500);return res.end('{}');}if(u.pathname==='/hub/fixture'||u.pathname==='/es/fixture'){res.setHeader('content-type','text/html');return res.end(fixture(u.pathname.startsWith('/es')));}let file=path.join(root,u.pathname);if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('content-type','text/javascript; charset=utf-8');res.end(fs.readFileSync(file));});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r)); const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});try{
 const url='http://127.0.0.1:'+server.address().port;
 await page.goto(url+'/hub/fixture');
 await page.evaluate(()=>{AnejoI18n.extend({'Save':'Guardar','Birthday':'Cumpleaños','Loaded records':'Registros cargados','Open details':'Abrir detalles'});AnejoI18n.extendPatterns([{en:'{count} guests',es:'{count} invitados'},{en:'Paid ({amount})?',es:'¿Pagado ({amount})?'}]);AnejoLang.set('es');});
 assert.equal(await page.locator('h1').innerText(),'Menú');assert.equal(await page.locator('#submit').inputValue(),'Guardar');
 await page.evaluate(()=>{document.querySelector('#dynamic').innerHTML='<p>Loaded records</p><button aria-label="Open details" title="Open details">30 guests</button><span>Paid ($12.50)?</span>';});
 await page.getByText('Registros cargados',{exact:true}).waitFor();assert.equal(await page.locator('#dynamic button').innerText(),'30 invitados');assert.equal(await page.locator('#dynamic button').getAttribute('title'),'Abrir detalles');assert.equal(await page.locator('#dynamic span').innerText(),'¿Pagado ($12.50)?');
 await page.evaluate(()=>{document.querySelector('#dynamic button').textContent='45 guests';document.querySelector('#dynamic button').setAttribute('aria-label','Save');});
 await page.getByText('45 invitados',{exact:true}).waitFor();assert.equal(await page.locator('#dynamic button').getAttribute('aria-label'),'Guardar');
 await page.evaluate(()=>AnejoLang.set('en'));assert.equal(await page.locator('#dynamic button').innerText(),'45 guests');assert.equal(await page.locator('#submit').inputValue(),'Save');assert.equal(await page.locator('#draft').inputValue(),'Private customer draft');assert.equal(await page.locator('option').getAttribute('value'),'Birthday');
 await page.evaluate(()=>{AnejoLang.set('es');document.querySelector('#dynamic').appendChild(document.createTextNode('Unlisted private client record'));});await page.waitForTimeout(120);assert.equal(providerCalls,0);
 await page.goto(url+'/es/fixture');await page.evaluate(()=>AnejoLang.set('en'));assert.equal(await page.locator('h1').innerText(),'Menu');await page.evaluate(()=>AnejoLang.set('es'));assert.equal(await page.locator('h1').innerText(),'Menú');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,dynamicText:true,attributes:true,submitLabels:true,sourceSpanishRoundTrip:true,privateTextProtected:true,providerCalls,errors}));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
