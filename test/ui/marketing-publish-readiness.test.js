import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../../public/hub/owner/marketing.html',import.meta.url),'utf8');
const start=page.indexOf("    document.querySelectorAll('[data-dryrun]')");
const handler=page.slice(start,page.indexOf("    document.querySelectorAll('[data-audit]')",start));
function fixture(edited=false){
 let finish;const pending=new Promise(r=>{finish=r;});const calls=[],toasts=[];
 const button={disabled:false,getAttribute:()=> 'saved-post'};const result={hidden:true,textContent:''};
 vm.runInNewContext(handler,{document:{querySelectorAll:()=>[button],querySelector:()=>result},approvalCaption:()=>({caption:edited?'unsaved':'saved',expected_caption:'saved'}),Hub:{toast:x=>toasts.push(x),api:(url,init)=>{calls.push({url,...init});return pending;}}});
 return {button,result,calls,toasts,finish};
}
test('owner readiness control blocks double clicks and retains the provider result',async()=>{
 assert.match(page,/Test Instagram upload \(no publish\)/);const f=fixture();f.button.onclick();f.button.onclick();assert.equal(f.calls.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].body)),{op:'dry_run',id:'saved-post'});assert.equal(f.button.disabled,true);
 f.finish({ok:true,container_id:'verified-container'});await new Promise(r=>setImmediate(r));assert.equal(f.button.disabled,false);assert.equal(f.result.hidden,false);assert.match(f.result.textContent,/Nothing was published or scheduled.*verified-container/);
});
test('unsaved caption changes cannot silently test a different stored draft',()=>{
 const f=fixture(true);f.button.onclick();assert.equal(f.calls.length,0);assert.equal(f.button.disabled,false);assert.match(f.toasts[0],/Save your caption changes/);
});
test('readiness errors remain visible including non-JSON server failures',async()=>{
 for(const response of [{error:'Provider image failure'},{_status:502}]){const f=fixture();f.button.onclick();f.finish(response);await new Promise(r=>setImmediate(r));assert.match(f.result.textContent,/Provider image failure|HTTP 502/);assert.equal(f.button.disabled,false);}
});
