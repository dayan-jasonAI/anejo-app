import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../public/hub/owner/assets/operator.js',import.meta.url),'utf8').split('/* operator.js —')[0];
function node(tag){return{tag,children:[],textContent:'',appendChild(e){this.children.push(e);},addEventListener(n,fn){this[n]=fn;},set innerHTML(_){throw Error('HTML injection forbidden');}};}
function flatten(n){return[n,...n.children.flatMap(flatten)];}
function fixture({dirty=false,confirm=true,hook=true}={}){
 const root=node('root'),calls=[];
 const window={confirm:()=>{calls.push('confirm');return confirm;}};if(hook)window.AnejoOperatorHasUnsavedChanges=()=>dirty;
 const document={createElement:node,querySelectorAll:()=>dirty?[{type:'text',tagName:'INPUT',value:'changed',defaultValue:'original',closest:()=>false}]:[]};
 vm.runInNewContext(source,{window,document,Date,URL,location:{assign:path=>calls.push(path)},fetch:()=>{throw Error('read-only card cannot fetch');}});
 return{root,calls,render:(catering,language='en')=>window.AnejoOperatorPrivateUI({ui:{kind:'catering_status',language},catering},root),all:()=>flatten(root),text:()=>flatten(root).map(n=>n.textContent).join('\n')};
}
const snapshot=events=>({available:true,observed_at:'2026-09-28T02:00:00Z',timezone:'America/New_York',scope:{date_from:'2026-09-27',date_through:'2026-10-10',limit:20,deposit_status:'paid'},truncated:false,events});
test('unavailable is distinct from verified empty window',()=>{
 const unavailable=fixture();unavailable.render({available:false,events:null});assert.match(unavailable.text(),/unavailable/);assert.doesNotMatch(unavailable.text(),/No saved catering events were returned/);
 const empty=fixture();empty.render(snapshot([]));assert.match(empty.text(),/No saved catering events were returned/);assert.match(empty.text(),/2026-09-27 – 2026-10-10/);assert.match(empty.text(),/not proof of current physical delivery/);
});
test('missing time/window does not render actionable records',()=>{
 const f=fixture();f.render({...snapshot([{quote_id:'cq1'}]),observed_at:'bad'});assert.match(f.text(),/could not be verified/);assert.equal(f.all().filter(n=>n.tag==='button').length,0);
});
test('hostile text stays text and id becomes encoded query only on explicit click',()=>{
 const f=fixture();const id='../../other?next=javascript:evil#<img>';
 f.render(snapshot([{quote_id:id,event_date:'<script>bad</script>',recorded_status:'<img src=x>',assignment_status:'accepted',url:'https://evil.test'}]));
 assert.match(f.text(),/<script>bad<\/script>/);assert.equal(f.calls.length,0);const buttons=f.all().filter(n=>n.tag==='button');assert.equal(buttons.length,1);buttons[0].click();assert.deepEqual(f.calls,['/hub/kitchen/event.html?id='+encodeURIComponent(id)]);
});
test('dirty hook and baseline input both cancel navigation',()=>{
 for(const hook of [true,false]){const f=fixture({dirty:true,confirm:false,hook});f.render(snapshot([{quote_id:'cq1'}]));f.all().find(n=>n.tag==='button').click();assert.deepEqual(f.calls,['confirm']);}
});
test('dirty approval navigates only to production plan',()=>{const f=fixture({dirty:true});f.render(snapshot([{quote_id:'cq1'}]));f.all().find(n=>n.tag==='button').click();assert.deepEqual(f.calls,['confirm','/hub/kitchen/event.html?id=cq1']);});
test('invalid identifiers cannot create navigation controls',()=>{
 const f=fixture();f.render(snapshot([null,{quote_id:null},{quote_id:''},{quote_id:'\n'},{quote_id:'x'.repeat(201)},{quote_id:'\ud800'}]));assert.equal(f.all().filter(n=>n.tag==='button').length,0);
});
test('hard rendering cap exposes truncation and absent progress never becomes planned',()=>{
 const f=fixture();f.render(snapshot(Array.from({length:25},(_,i)=>({quote_id:'cq'+i,recorded_status:null}))));assert.equal(f.all().filter(n=>n.tag==='button').length,20);assert.match(f.text(),/truncated/);assert.match(f.text(),/Saved execution: not recorded/);assert.doesNotMatch(f.text(),/Saved execution: planned/);
});
test('Spanish card labels remain explicit about saved evidence and click action',()=>{
 const f=fixture();f.render({...snapshot([{quote_id:'cq1',recorded_status:'ready'}]),truncated:true},'es');assert.match(f.text(),/Progreso guardado/);assert.match(f.text(),/no prueba de la entrega física actual/);assert.match(f.text(),/Resultados limitados/);assert.equal(f.all().find(n=>n.tag==='button').textContent,'Abrir plan de producción');
});
