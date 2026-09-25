import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../public/hub/owner/assets/operator.js',import.meta.url),'utf8').split('/* operator.js —')[0];
const hash='a'.repeat(64),id='ocp_'+ 'b'.repeat(64);
const preview=()=>({id,request_id:'generation-key',state:'succeeded',proposal_sha256:hash,proposal:{title:'Exact reviewed campaign',objective:'Attributable catering inquiries',assumptions:['Demand unverified'],questions:['Capacity?']}});
const receipt=()=>({ok:true,promoted:true,brief_id:'tb_saved',promotion_id:'opm_saved',preview_id:id,proposal_sha256:hash,review_scope:'team_planning_only'});
function fixture(responses){
 function element(tag){return {tag,children:[],textContent:'',disabled:false,checked:false,appendChild(e){this.children.push(e);return e;},replaceChildren(){this.children=[];},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this[k]=fn;}};}
 const root=element('root'),calls=[];let ids=0;
 const window={},document={createElement:element,querySelectorAll:()=>[]};
 const fetch=async(url,opts={})=>{calls.push({url,opts});const r=responses.shift();if(r instanceof Error)throw r;assert.ok(r,'unexpected request');return {ok:r.status? r.status<400:true,status:r.status||200,json:async()=>r.body};};
 vm.runInNewContext(source,{window,document,fetch,URL,Date,crypto:{randomUUID:()=> 'request-'+(++ids)}});
 const all=()=>{const out=[];function walk(e){out.push(e);e.children.forEach(walk);}walk(root);return out;};
 return {calls,ids:()=>ids,all,button:name=>all().find(e=>e.tag==='button'&&e.textContent===name),ack:()=>all().find(e=>e.tag==='input'),text:()=>all().map(e=>e.textContent).join('\n'),async load(){window.AnejoOperatorPrivateUI({ui:{kind:'saved_ideas'}},root);await this.button('Load my saved campaign ideas').click();await this.button('Load saved strategy').click();}};
}
const initial=(p=preview())=>[{body:{ok:true,ideas:[{id:'idea',title:'Idea',topic:'Topic',status:'draft',created_at:1}]}},{body:{ok:true,previews:[p]}}];
test('exact saved proposal renders before explicit checked promotion; request is hash-bound',async()=>{
 const f=fixture([...initial(),{body:receipt()}]);await f.load();
 assert.match(f.text(),/Exact reviewed campaign/);assert.match(f.text(),/Capacity\?/);assert.match(f.text(),/does not publish, send or schedule/);
 const use=f.button('Use as team planning brief');assert.equal(use.disabled,true);await use.click();assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,0);
 f.ack().checked=true;f.ack().change();assert.equal(use.disabled,false);await use.click();
 const post=f.calls.find(c=>c.opts.method==='POST');assert.equal(post.url,'/api/hub/owner/operator-campaign-promote');assert.deepEqual(JSON.parse(post.opts.body),{request_id:'request-1',preview_id:id,expected_proposal_sha256:hash,acknowledge_open_questions:true});
 assert.match(f.text(),/brief tb_saved/);assert.match(f.text(),/not publication or that a planner has run/);assert.equal(use.disabled,true);
});
test('uncertain retry uses same UUID and false or mismatched receipt never claims success',async()=>{
 const f=fixture([...initial(),Error('network'),{body:{...receipt(),promoted:false}},{body:{...receipt(),proposal_sha256:'c'.repeat(64)}},{body:receipt()}]);await f.load();f.ack().checked=true;f.ack().change();
 const use=f.button('Use as team planning brief');
 for(let i=0;i<3;i++){await use.click();assert.match(f.text(),/Planning use not verified/);assert.doesNotMatch(f.text(),/Saved for team planning/);}
 await use.click();assert.equal(f.ids(),1);assert.equal(new Set(f.calls.filter(c=>c.opts.method==='POST').map(c=>JSON.parse(c.opts.body).request_id)).size,1);assert.match(f.text(),/Saved for team planning/);
});
test('stale authority blocks repeated use without silent override',async()=>{
 const f=fixture([...initial(),{status:409,body:{ok:false,error:'stale_preview_regenerate_required'}}]);await f.load();f.ack().checked=true;f.ack().change();const use=f.button('Use as team planning brief');await use.click();await use.click();assert.equal(use.disabled,true);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,1);assert.match(f.text(),/new current proposal must be reviewed/);
});
test('reload displays recorded promotion receipt without another write',async()=>{
 const p=preview();p.promotion=receipt();const f=fixture(initial(p));await f.load();assert.match(f.text(),/Saved for team planning/);assert.match(f.text(),/opm_saved/);assert.equal(f.calls.filter(c=>c.opts.method==='POST').length,0);assert.equal(f.button('Use as team planning brief'),undefined);assert.doesNotMatch(f.text(),/not active/);
});
test('missing version hash does not offer planning use',async()=>{
 const p=preview();delete p.proposal_sha256;const f=fixture(initial(p));await f.load();assert.match(f.text(),/proposal version could not be verified/);assert.equal(f.button('Use as team planning brief'),undefined);
});
