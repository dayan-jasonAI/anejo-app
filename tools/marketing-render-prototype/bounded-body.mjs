const MAX_REQUEST_BYTES=5*1024*1024;
const BODY_READ_DEADLINE_MS=15_000;
function rejection(message,status=400){const error=new Error(message);error.status=status;return error;}
// Content-Length is only an early rejection hint. The streaming count enforces the cap.
export async function readBoundedBody(request){
 const declared=request.headers.get('content-length');
 if(declared!==null){if(!/^\d+$/.test(declared)||!Number.isSafeInteger(Number(declared)))throw rejection('Invalid Content-Length');if(Number(declared)>MAX_REQUEST_BYTES)throw rejection('Request body exceeds 5 MiB',413);}
 if(!request.body)throw rejection('JPEG or PNG body required');
 const reader=request.body.getReader(),chunks=[];let size=0,chunkCount=0,emptyChunks=0,timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(rejection('Request body read deadline exceeded',408)),BODY_READ_DEADLINE_MS);});
 try {while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;if(++chunkCount>32_768)throw rejection('Too many request stream chunks',413);if(!value.byteLength){if(++emptyChunks>64)throw rejection('Too many empty request stream chunks',400);continue;}size+=value.byteLength;if(size>MAX_REQUEST_BYTES)throw rejection('Request body exceeds 5 MiB',413);chunks.push(value);}}
 catch(error){try{reader.cancel().catch(()=>{});}catch{/* Cancellation must never delay bounded rejection. */}throw error;}
 finally{clearTimeout(timer);reader.releaseLock();}
 if(!size)throw rejection('JPEG or PNG body required');
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
