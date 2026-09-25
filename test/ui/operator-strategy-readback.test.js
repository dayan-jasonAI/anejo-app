import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../public/hub/owner/assets/operator.js',import.meta.url),'utf8').split('/* operator.js —')[0];
function fixture(responses){
 function element(tag){return {tag,children:[],textContent:'',disabled:false,appendChild(e){this.children.push(e);return e;},replaceChildren(){this.children=[];},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this[k]=fn;}};}
 const root=element('root'),calls=[];let ids=0;
 const document={createElement:element,querySelectorAll:()=>[]},window={};
 const fetch=async(url,opts={})=>{calls.push({url,opts});const next=await responses.shift();if(next instanceof Error)throw next;assert.ok(next,'Unexpected request');return {ok:next.http!==false,status:next.status||200,json:async()=>next.body};};
 vm.runInNewContext(source,{window,document,fetch,URL,Date,crypto:{randomUUID(){ids++;return 'request-'+ids;}}});
 const all=()=>{const out=[];function walk(e){out.push(e);e.children.forEach(walk);}walk(root);return out;};
 return {emptyPreflight(){responses.unshift({body:{ok:true,previews:[]}});},calls,all,ids:()=>ids,render:r=>window.AnejoOperatorPrivateUI(r,root),button:label=>all().find(e=>e.tag==='button'&&e.textContent===label),text:()=>all().map(e=>e.textContent).join('\n')};
}
const ideas={ok:true,ideas:[{id:'obi_test',title:'Idea',topic:'Catering campaign',status:'draft',created_at:1}]};
const success={ok:true,saved:true,preview:{id:'ocp_test',request_id:'request-1',state:'succeeded',model:'fixture-model',proposal:{title:'A proposed campaign',objective:'Introduce catering',unknowns:['Confirm event capacity']},source_receipts:{inference_receipt:{receipt_id:'inf_test',persisted:true},input_context:{components:{brand:{read_status:'ok',supplied_chars:123},training:{read_status:'partial',truncated:true}}}}}};
async function loaded(f){f.render({ui:{kind:'saved_ideas'}});assert.equal(f.calls.length,0);await f.button('Load my saved campaign ideas').click();}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const terminal=(state='succeeded',id='request-1')=>({body:{ok:state==='succeeded',preview:{...success.preview,id:'preview-'+id,request_id:id,state,error:state==='failed'?'invalid_preview_response':undefined}}});
test('same-request GET remains available while POST pending; generating and read errors never repost',async()=>{
 const pending=deferred();const f=fixture([{body:ideas},pending.promise,{body:{ok:true,preview:{state:'generating',request_id:'request-1'}}},{http:false,status:503,body:{ok:false,error:'read_unavailable'}},{http:false,status:404,body:{ok:false,error:'not_found'}},terminal()]);await loaded(f);f.emptyPreflight();const work=f.button('Generate proposed strategy').click();await tick();
 assert.equal(f.button('Check this request now').disabled,false);assert.equal(f.button('Load saved strategy').disabled,true);
 await f.button('Check this request now').click();assert.match(f.text(),/in progress or awaiting/);assert.equal(f.button('Check saved status').disabled,true);
 await f.button('Check this request now').click();assert.match(f.text(),/read_unavailable/);await f.button('Check this request now').click();assert.match(f.text(),/not_found/);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,1);
 await f.button('Check this request now').click();assert.match(f.text(),/Saved proposed strategy/);assert.equal(f.button('Load saved strategy').disabled,false);
 pending.resolve({body:{ok:true,preview:{state:'generating',request_id:'request-1'}}});await work;assert.match(f.text(),/Saved proposed strategy/);assert.doesNotMatch(f.text(),/in progress or awaiting/);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,1);
});
test('terminal failed read permits explicit new request and late old transport cannot overwrite it',async()=>{
 const pending=deferred();const f=fixture([{body:ideas},pending.promise,terminal('failed'),terminal('succeeded','request-2')]);await loaded(f);f.emptyPreflight();const work=f.button('Generate proposed strategy').click();await tick();await f.button('Check this request now').click();assert.match(f.text(),/No completed proposal was saved/);assert.ok(f.button('Generate a new proposal'));
 await f.button('Generate a new proposal').click();assert.match(f.text(),/preview-request-2/);pending.resolve(terminal('failed'));await work;assert.match(f.text(),/preview-request-2/);assert.doesNotMatch(f.text(),/No completed proposal was saved/);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,2);assert.equal(f.ids(),2);
});
test('unknown terminal failure cannot offer another generation while original response pending',async()=>{
 const pending=deferred();const failed=terminal('failed');failed.body.preview.outcome_unknown=true;
 const f=fixture([{body:ideas},pending.promise,failed]);await loaded(f);f.emptyPreflight();const work=f.button('Generate proposed strategy').click();await tick();await f.button('Check this request now').click();assert.match(f.text(),/outcome is uncertain/);assert.equal(f.button('Generate a new proposal'),undefined);pending.resolve(terminal());await work;assert.match(f.text(),/outcome is uncertain/);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,1);
});
test('wrong request readback does not unlock generation or replace pending outcome',async()=>{
 const pending=deferred();const f=fixture([{body:ideas},pending.promise,terminal('succeeded','wrong-request')]);await loaded(f);f.emptyPreflight();const work=f.button('Generate proposed strategy').click();await tick();await f.button('Check this request now').click();assert.match(f.text(),/identity or state was not verified/);assert.equal(f.button('Generate proposed strategy').disabled,true);pending.resolve(terminal());await work;assert.match(f.text(),/Saved proposed strategy/);
});
