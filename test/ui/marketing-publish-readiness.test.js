import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const page=readFileSync(new URL('../../public/hub/owner/marketing.html',import.meta.url),'utf8');
const start=page.indexOf("    document.querySelectorAll('[data-dryrun]')");
const handler=page.slice(start,page.indexOf("    document.querySelectorAll('[data-audit]')",start));
function fixture(edited=false){
 let finish;const pending=new Promise(r=>{finish=r;});const calls=[],toasts=[];
 const button={disabled:false,getAttribute:()=> 'saved-post'};
 vm.runInNewContext(handler,{document:{querySelectorAll:()=>[button]},approvalCaption:()=>({caption:edited?'unsaved':'saved',expected_caption:'saved'}),Hub:{toast:x=>toasts.push(x)},op:(body,text)=>{calls.push({body,text});return pending;}});
 return {button,calls,toasts,finish};
}
test('visible owner readiness control requests only a nonpublishing dry run and blocks double clicks',async()=>{
 assert.match(page,/Test Instagram upload \(no publish\)/);
 const f=fixture();f.button.onclick();f.button.onclick();assert.equal(f.calls.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].body)),{op:'dry_run',id:'saved-post'});
 assert.equal(f.button.disabled,true);assert.match(f.calls[0].text,/Nothing was published or scheduled/);
 f.finish();await Promise.resolve();await Promise.resolve();assert.equal(f.button.disabled,false);
});
test('unsaved caption changes cannot silently test a different stored draft',()=>{
 const f=fixture(true);f.button.onclick();assert.equal(f.calls.length,0);
 assert.equal(f.button.disabled,false);assert.match(f.toasts[0],/Save your caption changes/);
});
