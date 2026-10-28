import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../public/hub/assets/reading-edition.js',import.meta.url),'utf8');
function fixture(locale='es'){const ctx={window:{AnejoLang:{get:()=>locale}},document:{head:{appendChild(){}},createElement:()=>({})}};vm.runInNewContext(source,ctx);return ctx.window.AnejoReadingEdition;}
test('language query appends only a read locale to source URL',()=>{const r=fixture();assert.equal(r.query('/get?id=x'),'/get?id=x&lang=es');assert.equal(r.query('/list'),'/list?lang=es');assert.equal(fixture('en').query('/list'),'/list?lang=en');});
for(const status of ['stale','unavailable'])test(`${status} never displays stale translated prose`,()=>{const r=fixture(),html=r.html({status,locale:'es',body:'MUST NOT DISPLAY',ingredients:['SECRET'],steps:['SECRET']});assert.doesNotMatch(html,/MUST NOT DISPLAY|SECRET/);assert.match(html,/versión de lectura/);assert.match(html,/no cambia la aprobación/);});
test('missing/wrong-locale edition fails closed',()=>{const r=fixture();assert.match(r.html(),/No hay una versión/);assert.doesNotMatch(r.html({status:'current',locale:'en',body:'UNBOUND'}),/UNBOUND/);});
test('current edition renders escaped independent read-only text and ordered steps without mutation',()=>{const r=fixture(),d={status:'current',locale:'es',title:'<script>x</script>',body:'Método\nactual',ingredients:[{quantity:2,unit:'oz',item:'Arroz'}],steps:['Medir','Cocinar']},before=JSON.stringify(d),html=r.html(d);assert.match(html,/&lt;script&gt;/);assert.match(html,/<ol><li>Medir/);assert.match(html,/2 · oz · Arroz/);assert.match(html,/translate="no"/);assert.doesNotMatch(html,/<input|<textarea|<form|<script>/);assert.equal(JSON.stringify(d),before);});
test('request gate rejects out-of-order and abandoned reads',()=>{const r=fixture(),g=r.gate(),a=g.next(),b=g.next();assert.equal(g.current(a),false);assert.equal(g.current(b),true);g.next();assert.equal(g.current(b),false);});
test('all helper interface messages are authored in both languages',()=>{for(const key of ['current','loading','stale','unavailable','failed','source','unchanged','ingredients','steps']){assert.notEqual(fixture().text(key),fixture('en').text(key));}});
