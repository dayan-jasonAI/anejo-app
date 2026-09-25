import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../public/hub/owner/assets/operator.js',import.meta.url),'utf8').split('/* operator.js —')[0];
function fixture(responses){
 function element(tag){return {tag,children:[],textContent:'',disabled:false,appendChild(e){this.children.push(e);return e;},replaceChildren(){this.children=[];},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this[k]=fn;}};}
 const root=element('root'),calls=[];let ids=0;
 const document={createElement:element,querySelectorAll:()=>[]},window={};
 const fetch=async(url,opts={})=>{calls.push({url,opts});const next=responses.shift();if(next instanceof Error)throw next;assert.ok(next,'Unexpected request');return {ok:next.http!==false,status:next.status||200,json:async()=>next.body};};
 vm.runInNewContext(source,{window,document,fetch,URL,Date,crypto:{randomUUID(){ids++;return 'request-'+ids;}}});
 const all=()=>{const out=[];function walk(e){out.push(e);e.children.forEach(walk);}walk(root);return out;};
 return {emptyPreflight(){responses.unshift({body:{ok:true,previews:[]}});},calls,all,ids:()=>ids,render:r=>window.AnejoOperatorPrivateUI(r,root),button:label=>all().find(e=>e.tag==='button'&&e.textContent===label),text:()=>all().map(e=>e.textContent).join('\n')};
}
const ideas={ok:true,ideas:[{id:'obi_test',title:'Idea',topic:'Catering campaign',status:'draft',created_at:1}]};
const success={ok:true,saved:true,preview:{id:'ocp_test',request_id:'request-1',state:'succeeded',model:'fixture-model',proposal:{title:'A proposed campaign',objective:'Introduce catering',unknowns:['Confirm event capacity']},source_receipts:{inference_receipt:{receipt_id:'inf_test',persisted:true},input_context:{components:{brand:{read_status:'ok',supplied_chars:123},training:{read_status:'partial',truncated:true}}}}}};
async function loaded(f){f.render({ui:{kind:'saved_ideas'}});assert.equal(f.calls.length,0);await f.button('Load my saved campaign ideas').click();}
test('generation requires explicit click and displays actual saved private proposal and evidence',async()=>{
 const f=fixture([{body:ideas},{body:success}]);await loaded(f);assert.equal(f.calls.length,1);f.emptyPreflight();await f.button('Generate proposed strategy').click();
 assert.deepEqual(JSON.parse(f.calls.find(c=>c.opts.method==='POST').opts.body),{request_id:'request-1',idea_id:'obi_test'});assert.match(f.text(),/Introduce catering/);assert.match(f.text(),/Confirm event capacity/);assert.match(f.text(),/not active/);assert.match(f.text(),/inf_test/);assert.match(f.text(),/training: partial · truncated/);
 assert.equal(f.all().filter(e=>e.tag==='button').some(e=>/publish|activate|schedule/i.test(e.textContent)),false);
});
test('network uncertainty checks same request without a second generation or completion claim',async()=>{
 const f=fixture([{body:ideas},Error('Network failed'),{body:{ok:true,preview:{state:'generating',request_id:'request-1'}}}]);await loaded(f);f.emptyPreflight();await f.button('Generate proposed strategy').click();assert.match(f.text(),/Outcome not verified/);await f.button('Check saved status').click();
 assert.equal(f.ids(),1);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,1);assert.match(f.calls[3].url,/request_id=request-1/);assert.match(f.text(),/in progress or awaiting/);assert.doesNotMatch(f.text(),/Saved proposed strategy/);
});
test('saved strategy reload works without generation and renders text safely',async()=>{
 const s=structuredClone(success);s.preview.proposal.title='<script>unsafe</script>';
 const f=fixture([{body:ideas},{body:{ok:true,previews:[s.preview]}}]);await loaded(f);await f.button('Load saved strategy').click();assert.match(f.text(),/<script>unsafe<\/script>/);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,0);assert.match(f.calls[1].url,/idea_id=obi_test/);
});
test('terminal uncertain generation stays uncompleted and cannot blindly regenerate',async()=>{
 const f=fixture([{body:ideas},{body:{ok:false,preview:{state:'failed',outcome_unknown:true,error:'result_unavailable',request_id:'request-1'}}}]);await loaded(f);f.emptyPreflight();await f.button('Generate proposed strategy').click();assert.match(f.text(),/outcome is uncertain/);assert.match(f.text(),/result_unavailable/);assert.equal(f.button('Generate proposed strategy').disabled,true);assert.doesNotMatch(f.text(),/Saved proposed strategy/);
});
test('immediately saved idea gains explicit generate controls without auto generation',async()=>{
 const f=fixture([{body:{ok:true,saved:true,brief:{id:'obi_test',status:'draft',created_at:1}}}]);f.render({ui:{kind:'brief_preview',saved:false,title:'Idea',notes:'Topic'}});await f.button('Save private draft idea').click();assert.ok(f.button('Generate proposed strategy'));assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,'/api/hub/owner/operator-brief');
});
test('request never received can retry original UUID after definitive404, without duplicate key',async()=>{
 const f=fixture([{body:ideas},Error('Network failed'),{http:false,status:404,body:{ok:false,error:'preview_not_found'}},{body:success}]);await loaded(f);f.emptyPreflight();await f.button('Generate proposed strategy').click();await f.button('Check saved status').click();
 const posts=f.calls.filter(c=>c.opts.method==='POST').map(c=>JSON.parse(c.opts.body));assert.equal(posts.length,2);assert.equal(posts[0].request_id,posts[1].request_id);assert.equal(f.ids(),1);assert.match(f.text(),/Saved proposed strategy/);
});
test('status read failure never resubmits generation',async()=>{
 const f=fixture([{body:ideas},Error('Network failed'),{http:false,status:503,body:{ok:false,error:'database_unavailable'}}]);await loaded(f);f.emptyPreflight();await f.button('Generate proposed strategy').click();await f.button('Check saved status').click();assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,1);assert.match(f.text(),/database_unavailable/);
});
test('fresh card generate reuses saved latest outcome without creating another request',async()=>{
 for(const preview of [success.preview,{state:'generating',request_id:'existing-key',outcome_unknown:true}]){
 const f=fixture([{body:ideas},{body:{ok:true,previews:[preview]}}]);await loaded(f);await f.button('Generate proposed strategy').click();assert.equal(f.ids(),0);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,0);assert.match(f.calls[1].url,/idea_id=obi_test/);
 }
});
