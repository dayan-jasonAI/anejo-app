import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const page=readFileSync(new URL('../../public/hub/owner/marketing.html',import.meta.url),'utf8');
const source=page.slice(page.indexOf('  function setComposerPhoto'),page.indexOf('  var WORD'));
function harness(){
 const fields={cap:{id:'cap',value:'Caption still being written',focus(){}},sched:{id:'sched',value:'2026-10-01T12:00'},mkey:{id:'mkey',value:''},mpolish:{},'picked-photo-preview':{}};
 const calls=[];
 const ctx={DATA:{posts:[{id:'draft1',status:'draft'}]},window:{MarketingTabs:{openPhotoComposer(){}}},document:{getElementById:id=>fields[id],querySelectorAll:()=>Object.values(fields).filter(n=>n.id)},esc:s=>String(s||''),Hub:{api:async(p,o)=>{calls.push(o.body);fields.cap.value='New typing during request';return {ok:true};},toast(){}},Owner:{get:async()=>({ok:true,posts:[{id:'draft1',status:'draft'}]})},render(){Object.values(fields).filter(n=>n.id).forEach(n=>{n.value='';});}};
 vm.runInNewContext(source,ctx);return {ctx,fields,calls};
}
test('library selection replaces photo but preserves caption and schedule without saving a post',async()=>{
 const {ctx,fields,calls}=harness();await ctx.window.MarketingTabs.pickLibraryPhoto({media_key:'marketing-library/a.jpg',url:'/api/hub/media/marketing-library/a.jpg',name:'Food'});
 assert.equal(fields.cap.value,'Caption still being written');assert.equal(fields.sched.value,'2026-10-01T12:00');assert.equal(fields.mkey.value,'marketing-library/a.jpg');assert.equal(calls.length,0);assert.equal(fields.mpolish.hidden,false);
});
test('attachment refresh preserves edits made while request is in flight',async()=>{
 const {ctx,fields,calls}=harness();await ctx.attachLibraryPhoto('draft1',{media_key:'marketing-library/a.jpg'});
 assert.equal(fields.cap.value,'New typing during request');assert.equal(fields.sched.value,'2026-10-01T12:00');assert.equal(calls[0].op,'attach');
});
test('scheduled posts refuse photo attachment before network mutation',async()=>{
 const {ctx,calls}=harness();ctx.DATA.posts[0].status='scheduled';await assert.rejects(ctx.attachLibraryPhoto('draft1',{media_key:'marketing-library/a.jpg'}),/Return this post to draft/);assert.equal(calls.length,0);
});
test('post type rerender preserves form values',()=>{
 const {ctx,fields}=harness();ctx.renderKeepingFields();assert.equal(fields.cap.value,'Caption still being written');assert.equal(fields.sched.value,'2026-10-01T12:00');
});
