import test from 'node:test';
import assert from 'node:assert/strict';
import {readBoundedBody} from './bounded-body.mjs';
const request=(stream,headers={})=>({body:stream,headers:new Headers(headers)});
const stream=chunks=>new ReadableStream({start(c){for(const value of chunks)c.enqueue(value);c.close();}});
const rejected=status=>error=>error.status===status;
test('streamed count rejects an underreported overflow without waiting for cancellation',async()=>{
 let cancelled=false;
 const input=new ReadableStream({start(c){c.enqueue(new Uint8Array(5*1024*1024+1));},cancel(){cancelled=true;return new Promise(()=>{});}});
 await assert.rejects(readBoundedBody(request(input,{'content-length':'1'})),rejected(413));
 assert.equal(cancelled,true);assert.equal(input.locked,false);
});
test('exact cap and chunk ordering are preserved',async()=>{
 const a=new Uint8Array(2*1024*1024).fill(17),b=new Uint8Array(3*1024*1024).fill(219);
 const bytes=await readBoundedBody(request(stream([a,b])));assert.equal(bytes.length,5*1024*1024);assert.equal(bytes[a.length-1],17);assert.equal(bytes[a.length],219);
});
test('empty/declared malformed/declared oversize inputs reject',async()=>{
 for(const value of ['-1','hello','9007199254740992'])await assert.rejects(readBoundedBody(request(stream([]),{'content-length':value})),rejected(400));
 await assert.rejects(readBoundedBody(request(stream([]),{'content-length':String(5*1024*1024+1)})),rejected(413));
 await assert.rejects(readBoundedBody(request(stream([]))),rejected(400));
 await assert.rejects(readBoundedBody(request(null)),rejected(400));
});
test('fragmented and empty-chunk streams are bounded',async()=>{
 const fragments=stream(Array.from({length:32769},()=>new Uint8Array([1])));
 await assert.rejects(readBoundedBody(request(fragments)),rejected(413));assert.equal(fragments.locked,false);
 const empties=stream(Array.from({length:65},()=>new Uint8Array()));
 await assert.rejects(readBoundedBody(request(empties)),rejected(400));assert.equal(empties.locked,false);
});
test('stalled reads enforce the 15-second deadline and release ownership',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let cancelled=false;
 const input=new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;return new Promise(()=>{});}});
 const pending=readBoundedBody(request(input));const result=assert.rejects(pending,rejected(408));
 t.mock.timers.tick(15000);await result;assert.equal(cancelled,true);assert.equal(input.locked,false);
});
