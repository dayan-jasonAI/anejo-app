import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {onRequestPost,onRequestGet} from '../../functions/api/cajita-label-preview.js';
const endpoint='https://anejocateringco.com/api/cajita-label-preview';
const input={theme:'ivory',title:'Office lunch',lines:['Hawaiian roll','Empanada','Croqueta']};
const post=(body,headers={})=>onRequestPost({request:new Request(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)}),env:new Proxy({},{get(){throw Error('No provider or storage access permitted');}})});
test('public label layout preview uses fixed safe destinations and no account, quote, provider or storage access',async()=>{
 const r=await post(input);assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/no-store/);assert.match(r.headers.get('Content-Security-Policy'),/default-src 'none'/);const d=await r.json();assert.equal(d.ok,true);assert.equal(d.preview_only,true);assert.equal(d.approved,false);assert.equal(d.custom_artwork_included,false);assert.match(d.html,/Office lunch/);assert.equal((d.html.match(/<article class="band/g)||[]).length,3);assert.match(d.html,/DRAFT/);assert.doesNotMatch(d.html,/<script|mailto:|customer_email/);assert.equal((await onRequestGet()).status,405);
});
test('preview rejects cross-origin, oversized, malformed and unrecognized input without reflecting unsafe URLs',async()=>{
 assert.equal((await post(input,{Origin:'https://evil.example'})).status,403);assert.equal((await post(input,{'Content-Type':'text/plain'})).status,415);assert.equal((await post('x'.repeat(4097))).status,413);
 for(const body of [null,[],{}, {...input,theme:'custom'},{...input,title:'x'.repeat(49)},{...input,lines:[]},{...input,lines:['x'.repeat(81)]},{...input,lines:['a','b','c','d']},{...input,approved:true},{...input,website:'javascript:bad'},{...input,google_review_url:'https://evil.example'},{...input,image:'https://evil.example/x.png'},{...input,lines:['a\n<script>']},'{bad'])assert.equal((await post(body)).status,400);
});
test('all three template families escape user wording and cannot include custom executable artwork',async()=>{
 for(const theme of ['ivory','blush','signature']){const r=await post({theme,title:'<script>x</script>',lines:['<img src=x onerror=bad>']});assert.equal(r.status,200);const d=await r.json();assert.match(d.html,/&lt;script&gt;x&lt;\/script&gt;/);assert.match(d.html,/&lt;img src=x onerror=bad&gt;/);assert.doesNotMatch(d.html,/<script>|<img src=x/);}
});
test('Atelier preview preserves current request and keeps uploaded-artwork and final approval limitations visible',()=>{
 const page=readFileSync(new URL('../../public/cajita-builder.html',import.meta.url),'utf8'),js=readFileSync(new URL('../../src/cajita/builder.js',import.meta.url),'utf8');assert.match(page,/id="preview-bands"/);assert.match(page,/sandbox="" referrerpolicy="no-referrer"/);assert.match(js,/fetch\("\/api\/cajita-label-preview"/);assert.match(js,/v\.personalization\.labelText/);assert.match(js,/not uploaded artwork or final print approval/);assert.match(js,/no los diseños cargados ni una aprobación final/);assert.match(js,/JSON\.stringify\(bandPreviewInput\(\)\) !== snapshot/);assert.match(js,/bandPreviewController\?\.abort/);
});
