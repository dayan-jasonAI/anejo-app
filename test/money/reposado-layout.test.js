import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../../public/hub/owner/marketing.html',import.meta.url),'utf8');
const code=readFileSync(new URL('../../public/hub/owner/assets/marketing-branding.js',import.meta.url),'utf8');
function renderer(){const scope={};vm.createContext(scope);vm.runInContext(code,scope);return scope.AnejoBranding;}
function context(){return {font:'',measureText(text){return {width:text.length*Number(this.font.match(/([\d.]+)px/)?.[1]||10)*0.6};}};}
test('headline fitting preserves every word or explicitly rejects overflow',()=>{
 const r=renderer(),ctx=context();
 for(const text of ['Croquetas','Your occasion, your Cajita.','Cajitas, trays, or both?']){
  const result=r.fitHeadline(ctx,text,800,88,42);
  assert.equal(Array.from(result.lines).join(' '),text);assert.ok(result.lines.length<=2);
 }
 assert.throws(()=>r.fitHeadline(ctx,'A'.repeat(100),100,44,42),/Shorten the headline/);
 assert.throws(()=>r.fitHeadline(ctx,'one two three four five six seven eight nine ten',100,44,42),/Shorten the headline/);
});
test('adaptive inks choose dark on light backgrounds and parchment on dark',()=>{
 const r=renderer();assert.equal(r.pickTitleInk({lum:0.95,busy:0}).css,'#0A180C');
 assert.equal(r.pickTitleInk({lum:0.01,busy:0}).css,'#E8E2CA');
});
test('production UI offers the full-frame preset and preserves source dimensions',()=>{
 assert.match(html,/<option value="reposado">Reposado — full-frame photograph/);
 const compose=code.slice(code.indexOf('function compositeBranding'));
 assert.match(compose,/canvas.width = photo.naturalWidth \|\| photo.width/);
 assert.match(compose,/canvas.height = photo.naturalHeight \|\| photo.height/);
 assert.match(compose,/ctx.drawImage\(photo, 0, 0, canvas.width, canvas.height\)/);
 assert.match(compose,/fullFrame && blockH > H \* 0.24/);
 assert.match(compose,/opts.preset === 'reposado' \? 'emblem'/);
});
