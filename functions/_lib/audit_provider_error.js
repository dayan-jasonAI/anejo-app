// Bounded provider diagnostics. Classification is an inference, never proof of cause.
const MAX_BYTES=16*1024;
const READ_DEADLINE_MS=1000;
const ERROR_TYPES=new Set(['invalid_request_error','authentication_error','permission_error','not_found_error','request_too_large','rate_limit_error','api_error','overloaded_error']);
function explicitDiagnostic(message){
 // Only direct diagnostic clauses qualify. Reject negated, quoted-example and
 // explanatory text instead of guessing from a parameter or billing keyword.
 if(/\b(?:(?<!must )not(?! supported\b)|no|never|isn't|isn’t|wasn't|wasn’t|example|hypothetical|unrelated|rather than)\b/iu.test(message))return 'unknown';
 for(const clause of message.split(/[\n;]|[.!?](?:\s|$)/u)){
  const text=clause.trim();
  if(/^(?:your |the )?credit balance (?:is |was )?(?:too low|insufficient|exhausted|depleted|zero)\b|^(?:insufficient|exhausted|depleted) (?:credit balance|credits)\b|^payment (?:method )?(?:is |was |has been )?(?:required|declined|refused|rejected)\b/iu.test(text))return 'billing';
  if(/^(?:(?:the )?(?:parameter )?[`"']?(?:thinking(?:\.[a-z_]+)?|max_tokens|temperature)[`"']?\s*(?::|is|was)\s*(?:invalid|unsupported|not supported)\b|(?:invalid|unsupported) (?:value for (?:the )?(?:parameter )?|(?:request )?parameter\s*:?\s*)?[`"']?(?:thinking(?:\.[a-z_]+)?|max_tokens|temperature)\b[`"']?)/iu.test(text))return 'request_parameter';
  if(/^(?:the )?(?:parameter )?[`"']?(?:thinking(?:\.[a-z_]+)?|max_tokens|temperature)[`"']?\s*:\s*.{0,80}\b(?:not supported|must be (?:a |an |one of |between |greater than |less than |at least |at most |enabled\b|disabled\b|adaptive\b|positive\b|non-negative\b|integer\b|number\b|[0-9])|must not exceed\b|less than or equal\b)/iu.test(text))return 'request_parameter';
 }
 return 'unknown';
}
function classify(message,type,status){
 if(type==='authentication_error'||type==='permission_error'||status===401||status===403)return 'auth';
 if(type==='rate_limit_error'||status===429)return 'rate_limit';
 if(/(?:schema|grammar).{0,100}(?:too complex|complexity|too many|exceeds?.{0,30}(?:limit|budget))|(?:complexity|too complex).{0,100}(?:schema|grammar)/iu.test(message))return 'schema_complexity';
 if(/(?:json.?schema|output_config|structured output|schema).{0,100}(?:unsupported|not supported|invalid|constraint|keyword)|(?:unsupported|invalid|not supported).{0,100}(?:schema|constraint|keyword)|(?:maxLength|minLength|maxItems|minItems|additionalProperties).{0,80}(?:not supported|unsupported)/iu.test(message))return 'schema_constraint';
 if(/(?:context|prompt|input).{0,80}(?:too long|token limit|context window|maximum.{0,30}tokens|exceeds?.{0,30}tokens)|(?:too many tokens|context length exceeded)/iu.test(message))return 'context';
 if(type==='request_too_large'||status===413||/(?:image|request|payload|body).{0,80}(?:too large|too big|size limit|maximum.{0,30}(?:size|bytes|megabytes|mb)|exceeds?.{0,30}(?:size|bytes|mb))|(?:invalid|unsupported).{0,40}(?:image|image format)/iu.test(message))return 'image_request_size';
 if(/(?:model).{0,80}(?:not found|does not exist|unsupported|not supported|not available|invalid)|(?:unknown|invalid|unsupported).{0,40}model/iu.test(message))return 'model';
 if(/(?:authentication|invalid api key|unauthorized|permission denied)/iu.test(message))return 'auth';
 if(/(?:rate limit|too many requests)/iu.test(message))return 'rate_limit';
 return explicitDiagnostic(message);
}
export async function auditProviderError(response,stage){
 const result={reason:'provider_rejected',stage:stage==='written'?'written':'visual',http_status:null,error_type:null,request_id:null,classification:'unknown',read_status:'absent',classification_basis:'provider_diagnostic_inference'};
 try{if(Number.isInteger(response?.status)&&response.status>=100&&response.status<=599)result.http_status=response.status;}catch{/* Never retain an exception. */}
 try{const id=response?.headers?.get?.('request-id')||response?.headers?.get?.('x-request-id');if(typeof id==='string'&&/^req_[A-Za-z0-9_-]{1,100}$/.test(id))result.request_id=id;}catch{/* Header contents and failures stay private. */}
 let reader,deadlineTimer;
 try{
  if(!response?.body)return result;
  if(typeof response.body.getReader!=='function'){result.read_status='unreadable';return result;}
  reader=response.body.getReader();
  const expired=Symbol('read_deadline');
  const deadline=new Promise(resolve=>{deadlineTimer=setTimeout(()=>resolve(expired),READ_DEADLINE_MS);});
  const chunks=[];let size=0,emptyReads=0;
  while(true){
   const chunk=await Promise.race([reader.read(),deadline]);
   if(chunk===expired){result.read_status='timeout';return result;}
   if(chunk.done)break;
   if(!(chunk.value instanceof Uint8Array)){result.read_status='unreadable';return result;}
   if(!chunk.value.byteLength){if(++emptyReads>64){result.read_status='unreadable';return result;}continue;}
   if(chunk.value.byteLength>MAX_BYTES-size){result.read_status='oversized';return result;}
   size+=chunk.value.byteLength;chunks.push(chunk.value);
  }
  if(!size)return result;
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  let payload;
  try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{result.read_status='non_json';return result;}
  result.read_status='ok';
  const error=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload.error:null;
  const type=error&&typeof error==='object'?error.type:null;
  if(typeof type==='string'&&ERROR_TYPES.has(type))result.error_type=type;
  const message=error&&typeof error==='object'&&typeof error.message==='string'?error.message:'';
  result.classification=classify(message,result.error_type,result.http_status);
  return result;
 }catch{result.read_status='unreadable';return result;}
 finally{
  if(deadlineTimer!==undefined)clearTimeout(deadlineTimer);
  // Cancellation is best effort; do not await a malicious or stalled cancel promise.
  try{const cancelled=reader?.cancel?.();if(cancelled&&typeof cancelled.catch==='function')cancelled.catch(()=>{});}catch{/* No exception text escapes. */}
  try{reader?.releaseLock?.();}catch{/* No exception text escapes. */}
 }
}
