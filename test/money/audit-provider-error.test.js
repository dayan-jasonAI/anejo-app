import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditProviderError} from '../../functions/_lib/audit_provider_error.js';
const encoder=new TextEncoder();
const response=(message,type='invalid_request_error',status=400,headers={})=>new Response(JSON.stringify({error:{type,message}}),{status,headers});
const streamed=(chunks,{throws=false,status=400}={})=>{let reads=0,cancelled=false;return{status,headers:new Headers(),body:{getReader:()=>({read:async()=>{reads++;if(throws)throw Error('sk-ant-SECRET PRIVATE_PROMPT');return chunks.length?{value:chunks.shift(),done:false}:{done:true};},cancel:()=>{cancelled=true;return Promise.resolve();},releaseLock:()=>{}})},get reads(){return reads;},get cancelled(){return cancelled;}};};
for(const [message,classification] of [
 ['JSON schema is too complex','schema_complexity'],
 ['Schema is too complex for compilation','schema_complexity'],
 ['Schema complexity exceeds budget','schema_complexity'],
 ['Unsupported constraint maxLength in schema','schema_constraint'],
 ['output_config.format.schema: invalid schema keyword','schema_constraint'],
 ['maxItems is not supported','schema_constraint'],
 ['Model does not exist','model'],
 ['Unknown model requested','model'],
 ['Image exceeds maximum size of 5 MB','image_request_size'],
 ['request body is too large','image_request_size'],
 ['Invalid image format','image_request_size'],
 ['Prompt is too long','context'],
 ['Context length exceeded','context'],
 ['Invalid API key','auth'],
 ['Too many requests','rate_limit'],
 ['Unfamiliar diagnostic','unknown']
])test('classifies provider diagnostic inference '+classification+': '+message,async()=>{
 const r=await auditProviderError(response(message),'written');assert.equal(r.classification,classification);assert.equal(r.read_status,'ok');assert.equal(r.classification_basis,'provider_diagnostic_inference');assert.equal(r.stage,'written');assert.equal(r.http_status,400);assert.ok(!JSON.stringify(r).includes(message));
});
for(const [message,classification] of [
 ['Your credit balance is too low to access the API. Please add credits.','billing'],
 ['Insufficient credits','billing'],
 ['Credit balance is exhausted','billing'],
 ['Payment required','billing'],
 ['Payment was declined','billing'],
 ['Payment method has been rejected','billing'],
 ['Invalid value for temperature: 2','request_parameter'],
 ['Unsupported parameter: max_tokens','request_parameter'],
 ['thinking: unsupported','request_parameter'],
 ['The parameter `temperature` is invalid','request_parameter'],
 ['max_tokens is not supported','request_parameter'],
 ['Invalid thinking configuration','request_parameter']
])test('explicit future diagnostic classification '+classification+': '+message,async()=>{
 const result=await auditProviderError(response(message),'visual');
 assert.equal(result.classification,classification);assert.equal(result.classification_basis,'provider_diagnostic_inference');
 assert.deepEqual(Object.keys(result),['reason','stage','http_status','error_type','request_id','classification','read_status','classification_basis']);
 assert.ok(!JSON.stringify(result).includes(message));
});
test('new diagnostic categories reject negated, unrelated and vague text',async()=>{
 for(const message of [
  'Your credit balance is not too low','Payment was not declined','No payment required','Payment required is not the cause',
  'Credit balance is sufficient','Billing issue','Check your credit balance','Please add a payment method',
  'An example: payment required','Example: invalid temperature','Unsupported parameter: top_p',
  'Example. Invalid temperature','Payment required? No, that diagnostic is unrelated','Invalid temperature. This is not the cause',
  'temperature is not invalid','max_tokens is supported','thinking is not unsupported','Invalid temperature is not the cause',
  'There is no unsupported max_tokens parameter','The prompt discusses unsupported thinking','Unfamiliar diagnostic',
  'Invalid temperature_sensor','Unsupported max_tokens_extra','Invalid value for thinking_mode'
 ])assert.equal((await auditProviderError(response(message),'visual')).classification,'unknown',message);
});
test('existing classification precedence survives new diagnostic categories',async()=>{
 for(const message of ['Payment required','Unsupported parameter: max_tokens']){
  for(const [status,classification] of [[401,'auth'],[403,'auth'],[429,'rate_limit'],[413,'image_request_size']])assert.equal((await auditProviderError(response(message,'invalid_request_error',status),'visual')).classification,classification);
  for(const [type,classification] of [['authentication_error','auth'],['permission_error','auth'],['rate_limit_error','rate_limit'],['request_too_large','image_request_size']])assert.equal((await auditProviderError(response(message,type),'visual')).classification,classification);
 }
 assert.equal((await auditProviderError(response('Payment required. JSON schema is too complex'),'visual')).classification,'schema_complexity');
});
test('new diagnostic classifications cannot expose provider text or arbitrary fields',async()=>{
 for(const [message,classification] of [['Payment required: sk-ant-SECRET PRIVATE_PROMPT https://private.internal','billing'],['Invalid value for temperature: sk-ant-SECRET PRIVATE_PROMPT https://private.internal','request_parameter']]){
  const result=await auditProviderError(new Response(JSON.stringify({error:{type:'invalid_request_error',message,detail:message},prompt:message}),{status:400}),'visual');
  assert.equal(result.classification,classification);
  for(const privateText of ['SECRET','PRIVATE_PROMPT','https://private','detail','prompt'])assert.ok(!JSON.stringify(result).includes(privateText));
 }
});
test('closed output cannot leak arbitrary provider fields, prompt or secrets',async()=>{
 const secret='sk-ant-SECRET PRIVATE_PROMPT https://private.example';
 const r=await auditProviderError(new Response(JSON.stringify({error:{type:secret,message:secret,detail:secret},prompt:secret,url:secret,model:secret}),{status:400}),'visual');
 assert.deepEqual(Object.keys(r),['reason','stage','http_status','error_type','request_id','classification','read_status','classification_basis']);assert.equal(r.error_type,null);assert.equal(r.classification,'unknown');assert.ok(!JSON.stringify(r).includes('SECRET'));assert.ok(!JSON.stringify(r).includes('PRIVATE'));assert.ok(!JSON.stringify(r).includes('https'));
});
test('only allowlisted error types survive',async()=>{for(const type of ['invalid_request_error','authentication_error','permission_error','not_found_error','request_too_large','rate_limit_error','api_error','overloaded_error'])assert.equal((await auditProviderError(response('',type),'visual')).error_type,type);});
test('safe request id survives; header injection and oversized ids do not',async()=>{
 assert.equal((await auditProviderError(response('','invalid_request_error',400,{'request-id':'req_ABC-123_xyz'}),'visual')).request_id,'req_ABC-123_xyz');
 for(const id of ['req_x\nSECRET','req_<script>','sk-ant-SECRET','req_'+ 'x'.repeat(101)]){
  const r=await auditProviderError({status:400,body:null,headers:{get:()=>id}},'visual');assert.equal(r.request_id,null);assert.ok(!JSON.stringify(r).includes(id));
 }
});
test('missing and empty body are explicit and safe',async()=>{
 for(const r of [undefined,{status:400},new Response(null,{status:400}),new Response('',{status:400})])assert.equal((await auditProviderError(r,'visual')).read_status,'absent');
});
test('malformed JSON and malformed UTF8 never escape body contents',async()=>{
 for(const r of [new Response('{sk-ant-SECRET',{status:400}),streamed([new Uint8Array([255])])]){const result=await auditProviderError(r,'visual');assert.equal(result.read_status,'non_json');assert.equal(result.classification,'unknown');}
});
test('oversized first chunk is rejected without a second read',async()=>{const r=streamed([encoder.encode('SECRET'.repeat(3000)),encoder.encode('PRIVATE')]);const result=await auditProviderError(r,'visual');assert.equal(result.read_status,'oversized');assert.equal(r.reads,1);assert.equal(r.cancelled,true);assert.ok(!JSON.stringify(result).includes('SECRET'));});
test('stream cap applies to cumulative chunks and accepts exactly 16KiB',async()=>{
 const r=streamed([new Uint8Array(8192),new Uint8Array(8192),new Uint8Array(1)]);assert.equal((await auditProviderError(r,'visual')).read_status,'oversized');assert.equal(r.reads,3);
 const body=JSON.stringify({error:{type:'api_error',message:'x'.repeat(16384-43)}});assert.equal(encoder.encode(body).length,16384);assert.equal((await auditProviderError(streamed([encoder.encode(body)]),'visual')).read_status,'ok');
});
test('throwing reads, body access and unavailable readers stay bounded and private',async()=>{
 for(const r of [streamed([],{throws:true}),{status:400,body:{}},{status:400,get body(){throw Error('SECRET');}}]){const result=await auditProviderError(r,'visual');assert.equal(result.read_status,'unreadable');assert.ok(!JSON.stringify(result).includes('SECRET'));}
});
test('invalid stream chunks, failed header access and failed cleanup do not throw',async()=>{
 const r={status:400,headers:{get(){throw Error('SECRET');}},body:{getReader:()=>({read:async()=>({done:false,value:'PRIVATE'}),cancel(){throw Error('SECRET');},releaseLock(){throw Error('SECRET');}})}};
 const result=await auditProviderError(r,'visual');assert.equal(result.read_status,'unreadable');assert.equal(result.request_id,null);
});
test('HTTP type classifications are diagnostic inference and status/stage inputs cannot leak',async()=>{
 for(const [status,classification] of [[401,'auth'],[403,'auth'],[413,'image_request_size'],[429,'rate_limit']])assert.equal((await auditProviderError(response('', 'invalid_request_error',status),'visual')).classification,classification);
 const r=await auditProviderError({status:'SECRET',body:null},'SECRET');assert.equal(r.http_status,null);assert.equal(r.stage,'visual');assert.ok(!JSON.stringify(r).includes('SECRET'));
});

test('empty chunks cannot accumulate unbounded retained objects',async()=>{const r=streamed(Array.from({length:65},()=>new Uint8Array()));const result=await auditProviderError(r,'visual');assert.equal(result.read_status,'unreadable');assert.equal(r.reads,65);assert.equal(r.cancelled,true);});

test('total streamed-read deadline closes a never-resolving read without waiting for cancellation',{timeout:2500},async()=>{
 let cancelled=false,released=false;
 const response={status:400,headers:new Headers(),body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:()=>{cancelled=true;return new Promise(()=>{});},releaseLock:()=>{released=true;}})}};
 const started=Date.now(),result=await auditProviderError(response,'visual');
 assert.equal(result.read_status,'timeout');assert.equal(result.classification,'unknown');assert.equal(cancelled,true);assert.equal(released,true);assert.ok(Date.now()-started>=900);assert.ok(Date.now()-started<2400);
});
test('a partial body shares the same total deadline instead of resetting it for each read',{timeout:2500},async()=>{
 let reads=0;
 const response={status:400,headers:new Headers(),body:{getReader:()=>({read:()=>{reads++;return reads===1?Promise.resolve({done:false,value:encoder.encode('{"error":')}):new Promise(()=>{});},cancel:()=>Promise.resolve(),releaseLock:()=>{}})}};
 const result=await auditProviderError(response,'written');assert.equal(result.read_status,'timeout');assert.equal(reads,2);assert.equal(result.stage,'written');
});
