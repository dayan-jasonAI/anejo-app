import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const staff=readFileSync(new URL('../../public/hub/owner/staff.html',import.meta.url),'utf8');
const finance=readFileSync(new URL('../../public/hub/owner/finance.html',import.meta.url),'utf8');
const between=(s,start,end)=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)));
const staffFunctions=between(staff,'  function loadRoster()','  function renderManage()');
const financeFunctions=between(finance,'  function paymentSwitchCopy(','  function autopayLoad(');
const plain=v=>JSON.parse(JSON.stringify(v));
async function staffFixture({current=false,label='Continue',allow=true}={}){
 const record={id:'staff-fixture',name:'Canonical person',role:'kitchen',active:current,is_lead:current};
 const calls=[],confirmations=[],handlers={};const el={innerHTML:'',addEventListener:(n,f)=>{handlers[n]=f;}};
 const ctx={rosterIntents:Object.create(null),ROLES:[],TEAMS:[],EMPLOYMENT:[],opt:()=>'',dollarsFromCents:()=>'',document:{getElementById:()=>el},window:{},confirm:m=>{confirmations.push(m);return allow;},Hub:{toast(){},api:(url,options)=>{calls.push({url,...plain(options)});return Promise.resolve({ok:true});}},Owner:{get:()=>Promise.resolve({ok:true,staff:[record]}),badge:()=>'',esc:String}};
 vm.createContext(ctx);vm.runInContext(staffFunctions,ctx);ctx.loadRoster();await Promise.resolve();ctx.wireRoster();
 const click=async(action,id='staff-fixture')=>{const btn={textContent:label,getAttribute:k=>k==='data-act'?action:null};const row={getAttribute:()=>id,querySelector:()=>({textContent:'MUTATED LABEL AND BADGES'})};handlers.click({target:{closest:s=>s==='button[data-act]'?btn:row}});await Promise.resolve();};
 return{record,calls,confirmations,click,ctx};
}
for(const action of['lead','active'])for(const current of[false,true])for(const label of['Make lead / Reactivate','Hacer líder / Reactivar','Neutral action'])test(`${action} ${current} sends canonical intent with ${label}`,async()=>{
 const f=await staffFixture({current,label});await f.click(action);assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{url:'/api/hub/owner/staff',method:'POST',body:{op:'update',id:'staff-fixture',[action==='lead'?'is_lead':'active']:!current}});assert.equal(f.confirmations.length,action==='active'&&current?1:0);if(f.confirmations.length)assert.equal(f.confirmations[0],'Deactivate Canonical person? They lose access immediately.');
});
test('staff intent is captured from the loaded record and cannot be changed by later object/label mutation',async()=>{const f=await staffFixture({current:false,label:'Deactivate'});assert(Object.isFrozen(f.ctx.rosterIntents['staff-fixture']));f.record.active=true;f.record.is_lead=true;await f.click('active');assert.equal(f.calls[0].body.active,true);});
test('declined deactivation and unknown records never issue a staff operation',async()=>{const f=await staffFixture({current:true,label:'Reactivar',allow:false});await f.click('active');await f.click('lead','unknown');assert.equal(f.calls.length,0);});
function financeFixture({locale='en',key='contracts',next=true,label='Continue',allow=true}={}){
 const calls=[],confirmations=[],toasts=[];let refreshed=0;const button={textContent:label,disabled:false,getAttribute:k=>k==='data-switch'?key:k==='data-next'?(next?'1':'0'):null,addEventListener:(n,fn)=>{if(n==='click')button.click=fn;}};
 const el={innerHTML:'',querySelectorAll:s=>s==='[data-switch]'?[button]:[]};const ctx={document:{getElementById:()=>el},window:{AnejoLang:{get:()=>locale},confirm:m=>{confirmations.push(m);return allow;}},Owner:{esc:String,money:()=>'$0.00'},Hub:{toast:m=>toasts.push(m),api:(url,options)=>{calls.push({url,...plain(options)});return Promise.resolve({ok:true});}},autopayLoad:()=>{refreshed++;}};
 vm.createContext(ctx);vm.runInContext(financeFunctions,ctx);ctx.autopayRender({ok:true,settings:{},accounts:[],invoices:[]});return{button,calls,confirmations,toasts,ctx,get refreshed(){return refreshed;}};
}
for(const locale of['en','es'])for(const key of['contracts','payouts','card_capture'])for(const next of[false,true])for(const label of['Turn ON','Activar','Neutral action'])test(`finance ${locale} ${key} ${next} keeps canonical operation with ${label}`,async()=>{
 const f=financeFixture({locale,key,next,label});f.button.click();await Promise.resolve();assert.deepEqual(f.calls,[{url:'/api/hub/owner/autopay',method:'POST',body:{op:'set',which:key,on:next}}]);assert.equal(f.confirmations.length,next?1:0);if(next){assert.equal(f.confirmations[0],f.ctx.paymentSwitchCopy(key)[0]);if(locale==='es')assert.doesNotMatch(f.confirmations[0],/contracts|payouts|card_capture|\bTurn\b|\bApproved\b/);}assert.equal(f.toasts[0],f.ctx.paymentSwitchCopy(key)[next?1:2]);assert.equal(f.refreshed,1);
});
for(const key of['contracts','payouts','card_capture'])test(`declining ${key} does not change automatic-payment settings`,()=>{const f=financeFixture({locale:'es',key,allow:false});f.button.click();assert.equal(f.calls.length,0);assert.equal(f.button.disabled,false);});
test('unknown finance switch fails closed without a request',()=>{const f=financeFixture({key:'unsupported'});f.button.click();assert.equal(f.calls.length,0);assert.equal(f.confirmations.length,0);});
test('finance Spanish warnings retain each switch’s distinct money behavior',()=>{const f=financeFixture({locale:'es'});assert.match(f.ctx.paymentSwitchCopy('contracts')[0],/Solo podrán cobrarse los importes de facturas aprobados/);assert.match(f.ctx.paymentSwitchCopy('payouts')[0],/no envía dinero/);assert.match(f.ctx.paymentSwitchCopy('card_capture')[0],/no cobra a la tarjeta/);});
