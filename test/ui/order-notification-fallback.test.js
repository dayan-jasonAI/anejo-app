import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../public/order/confirmed.html',import.meta.url),'utf8');
const start=source.indexOf('  function fallbackHtml(){');
const end=source.indexOf('  function showFallback(',start);
assert.ok(start>=0&&end>start);
for(const language of ['en','es'])test(`missing order contact never promises notifications (${language})`,()=>{
 const ctx={email:'',smsConsent:true,L:(en,es)=>language==='es'?es:en};
 vm.runInNewContext(source.slice(start,end),ctx);
 const rendered=ctx.fallbackHtml();
 assert.match(rendered,/href="\/client\/dashboard"/);
 assert.match(rendered,language==='es'?/No podemos confirmar/:/cannot be confirmed/);
 assert.doesNotMatch(rendered,/we'll (?:text|email)|te (?:avisaremos|enviaremos)/);
});
