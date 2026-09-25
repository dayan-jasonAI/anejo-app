import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../public/hub/owner/assets/operator.js',import.meta.url),'utf8').split('/* operator.js —')[0];
function fixture(pathname='/hub/owner/marketing.html',isDirty=false,confirm=true) {
 const children=[],calls=[]; const root={appendChild(e){children.push(e);}};
 const document={createElement(){return {children:[],appendChild(e){this.children.push(e);},addEventListener(name,fn){this[name]=fn;}};},querySelectorAll(){return [];}};
 const location={pathname,origin:'https://local.test',hash:'',assign(p){calls.push(['assign',p]);}};
 const window={AnejoOperatorHasUnsavedChanges:()=>isDirty,confirm(){calls.push(['confirm']);return confirm;}};
 vm.runInNewContext(source,{window,document,location,URL,Date});
 return {children,calls,location,render:r=>window.AnejoOperatorPrivateUI(r,root)};
}
test('navigation waits for click and same-page hash leaves composer DOM intact',()=>{
 const f=fixture(undefined,true,false);f.render({ui:{kind:'navigate',destination:'drafts'}});
 assert.equal(f.location.hash,'');assert.deepEqual(f.calls,[]);f.children[0].click();
 assert.equal(f.location.hash,'#create?filter=drafts');assert.deepEqual(f.calls,[]);
});
test('cross-page dirty cancellation prevents location change; clean needs no confirmation',()=>{
 const f=fixture('/hub/owner/index.html',true,false);f.render({ui:{kind:'navigate',destination:'photos'}});f.children[0].click();assert.deepEqual(f.calls,[['confirm']]);
 const clean=fixture('/hub/owner/index.html');clean.render({ui:{kind:'navigate',destination:'photos'}});clean.children[0].click();assert.deepEqual(clean.calls,[['assign','/hub/owner/marketing.html#photos']]);
});
test('unsupported descriptors and unsaved preview never navigate or execute content',()=>{
 const f=fixture();f.render({ui:{kind:'navigate',destination:'javascript:evil'}});assert.equal(f.children.length,0);
 f.render({ui:{kind:'brief_preview',saved:false,title:'<script>x</script>',notes:'notes'}});
 assert.match(f.children[0].textContent,/<script>/);assert.deepEqual(f.calls,[]);assert.equal(f.children.filter(x=>x.click).length,1); // explicit save button only; rendering performs no mutation
});
test('read failure displays unavailable; no empty-success claim',()=>{
 const f=fixture();f.render({ui:{kind:'audit_status'},audit:{available:false}});
 assert.match(f.children[0].textContent,/unavailable/);assert.equal(f.children.length,1);
});

test('extensionless marketing stays on page with dirty input and no confirmation',()=>{
 const f=fixture('/hub/owner/marketing',true,false);f.render({ui:{kind:'navigate',destination:'drafts'}});f.children[0].click();
 assert.equal(f.location.hash,'#create?filter=drafts');assert.deepEqual(f.calls,[]);
});
test('audit summary uses expandable escaped caption detail instead of raw IDs',()=>{
 const f=fixture();f.render({ui:{kind:'audit_status'},audit:{available:true,observed_at:'now',posts:[{id:'secret-id',caption_excerpt:'<img src=x>',status:'draft',state:'current_pass',audit_at:1},{id:'other',caption_excerpt:'Second',status:'draft',state:'stale_or_unverified',audit_at:0}]}});
 assert.match(f.children[1].textContent,/1 current pass.*1 stale or unverified/);
 const details=f.children[2]; assert.match(details.children[0].textContent,/Show 2/);
 assert.match(details.children[1].textContent,/<img src=x>/);assert.doesNotMatch(details.children[1].textContent,/secret-id/);
 assert.equal(details.open,undefined);assert.deepEqual(f.calls,[]);
});

test('actual MarketingTabs hash router and queue filtering retain typed captions',()=>{
 const html=readFileSync(new URL('../../public/hub/owner/marketing.html',import.meta.url),'utf8');
 const router=html.slice(html.indexOf('  var loadedOnce ='),html.indexOf('  function wireShell()'));
 const queue=html.slice(html.indexOf("  var queueFilter = 'drafts';"),html.indexOf('  // datetime-local wants LOCAL parts.'));
 assert.match(router,/function tabFromHash/);assert.match(queue,/filterQueue = function/);
 const nodes=new Map(),cards=[['draft','one'],['published','two']].map(([status,id])=>({hidden:false,caption:{value:'Owner unsaved '+id},getAttribute(k){return k==='data-queue-status'?status:id;}}));
 const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{style:{},textContent:''});return nodes.get(id);},querySelectorAll(s){return s==='[data-queue-card]'?cards:[];}};
 let creates=0,mounts=0,route;
 const window={MarketingTabs:{createInstagram(){creates++;},createEmail(){},teachTeam(){},teachTraining(){}},MarketingPhotoLibrary:{mount(){mounts++;}},addEventListener(name,fn){if(name==='hashchange')route=fn;}};
 const location={hash:'#create'};
 vm.runInNewContext(queue+'\n'+router,{window,document,location,URLSearchParams});
 route();assert.equal(creates,1);assert.equal(document.getElementById('lane-instagram').style.display,'');
 location.hash='#photos';route();assert.equal(mounts,1);
 location.hash='#create-instagram';route();assert.equal(creates,1);
 location.hash='#create?filter=live';route();assert.equal(cards[0].hidden,true);assert.equal(cards[1].hidden,false);
 location.hash='#create?filter=drafts';route();assert.equal(cards[0].hidden,false);assert.equal(cards[1].hidden,true);
 assert.equal(cards[0].caption.value,'Owner unsaved one');assert.equal(cards[1].caption.value,'Owner unsaved two');assert.equal(creates,1);
});

test('brief preview requires click, retries stable key, saved label requires durable response',async()=>{
 const children=[],calls=[];let attempt=0;
 const root={appendChild(e){children.push(e);}};
 const document={createElement(){return {appendChild(){},addEventListener(name,fn){this[name]=fn;}};}};
 const window={};const fetch=async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});if(++attempt===1)throw Error('timeout');return {ok:true,json:async()=>({ok:true,saved:true,brief:{id:'obi_saved',status:'draft',created_at:1}})};};
 vm.runInNewContext(source,{window,document,fetch,crypto:{randomUUID:()=> 'stable-key'},Date});
 window.AnejoOperatorPrivateUI({ui:{kind:'brief_preview',saved:false,title:'Topic',notes:'Exact owner words'}},root);
 assert.equal(calls.length,0);const button=children.find(x=>x.click);await button.click();assert.equal(button.disabled,false);assert.ok(children.some(x=>/not verified/.test(x.textContent)));
 await button.click();assert.equal(calls[0].body.request_id,calls[1].body.request_id);assert.equal(calls[1].body.topic,'Exact owner words');assert.equal(button.disabled,true);assert.ok(children.some(x=>/Saved owner-supplied draft idea/.test(x.textContent)));await button.click();assert.equal(calls.length,2);
});

test('saved ideas load only on click and render exact text safely after reload',async()=>{
 const children=[];const root={appendChild(e){children.push(e);}};let calls=0;
 const document={createElement(){return {addEventListener(name,fn){this[name]=fn;}};}};const window={};
 const fetch=async()=>{calls++;return {ok:true,json:async()=>({ok:true,ideas:[{title:'Owner-supplied draft idea',topic:'<script>owner text</script>',status:'draft',created_at:1}]})};};
 vm.runInNewContext(source,{window,document,fetch,Date});window.AnejoOperatorPrivateUI({ui:{kind:'saved_ideas'}},root);
 assert.equal(calls,0);await children[0].click();assert.equal(calls,1);assert.ok(children.some(x=>x.textContent==='<script>owner text</script>'));
});
