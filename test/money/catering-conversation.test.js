import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phoneDigits,smsReceipt,leadForPhone,sendCateringSms} from '../../functions/_lib/catering_conversation.js';
test('normalizes US phones without treating a partial number as a customer match',async()=>{
 assert.equal(phoneDigits('+1 (561) 555-1234'),'5615551234');
 assert.equal(await leadForPhone({},'1234'),null);
});
test('provider acceptance remains distinct from delivery and no-op',()=>{
 assert.equal(smsReceipt({status:'sent',provider_sid:'SM123'}).status,'provider_accepted');
 assert.equal(smsReceipt({status:'sent'}).status,'unverified');
 assert.equal(smsReceipt({status:'delivered',provider_sid:'SM123'}).status,'delivered');
 assert.equal(smsReceipt(null).status,'unverified');
});
test('ambiguous shared phone cannot attach a quote to another lead',async()=>{
 const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:[{id:'one'},{id:'two'}]})})})}};
 assert.equal(await leadForPhone(env,'5615551234'),null);
});
test('missing consent never attempts a send',async()=>{
 const result=await sendCateringSms({}, {lead:{phone:'5615551234',sms_consent:0}});
 assert.equal(result.ok,false);
});
test('opt-out and existing request claims prevent provider side effects',async()=>{
 let calls=0;const original=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('must not send');};
 try{
 const env={DB:{prepare:()=>({bind:()=>({first:async()=>({id:'stop'})})})}};
 const result=await sendCateringSms(env,{lead:{phone:'5615551234',sms_consent:1},requestId:'1234567890123456'});
 assert.equal(result.ok,false);assert.equal(calls,0);
 }finally{globalThis.fetch=original;}
});
test('a previously claimed send cannot contact the provider twice',async()=>{
 const queries=[];
 const env={DB:{prepare:sql=>({bind:()=>({first:async()=>null,run:async()=>{queries.push(sql);return {meta:{changes:0}};}})})}};
 const result=await sendCateringSms(env,{thread:{id:'thr'},lead:{phone:'+15615551234',sms_consent:1},body:'Hello',requestId:'1234567890123456'});
 assert.equal(result.ok,false);assert.match(result.error,/already exists/);assert.equal(queries.length,1);
});
test('provider uncertainty is retained with its receipt rather than declared failed',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('network disconnected');};
 const env={TWILIO_ACCOUNT_SID:'test',TWILIO_AUTH_TOKEN:'test',TWILIO_FROM:'+15615550000',DB:{prepare:()=>({bind:()=>({first:async()=>null,run:async()=>({meta:{changes:1}})})})}};
 try{
 const result=await sendCateringSms(env,{thread:{id:'thr'},lead:{phone:'+15615551234',sms_consent:1},body:'Hello',requestId:'1234567890123456'});
 assert.equal(result.ok,false);assert.equal(result.sms.status,'unknown');
 }finally{globalThis.fetch=original;}
});
