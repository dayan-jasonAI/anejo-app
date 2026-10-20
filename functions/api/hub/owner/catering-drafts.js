import {json} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {listDrafts,loadDraft,saveDraft,archiveDraft,attachDraft,recoverDraft} from '../../../_lib/catering_quote_drafts.js';
const reply=result=>{const {http_status,...body}=result;return json(body,http_status||(result.ok?200:409),{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});};
export async function onRequestGet({env,request}){try{const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;const url=new URL(request.url);return reply(url.searchParams.has('id')?await loadDraft(env,url.searchParams.get('id')):await listDrafts(env,url.searchParams.get('include_archived')==='1'));}catch{return reply({ok:false,error:'Draft storage is unavailable. No checkout or customer message was created.',http_status:503});}}
export async function onRequestPost({env,request}){
 try{const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return reply({ok:false,error:'Origin not allowed.',http_status:403});
 const raw=await request.text();if(raw.length>70000)return reply({ok:false,error:'Draft request is too large.',http_status:413});let body;try{body=JSON.parse(raw);}catch{return reply({ok:false,error:'Send valid JSON.',http_status:400});}
 const actions={save:saveDraft,archive:archiveDraft,attach:attachDraft,recover:recoverDraft};const action=Object.hasOwn(actions,body?.op)?actions[body.op]:null;if(!action)return reply({ok:false,error:'Choose save, archive, attach or recover.',http_status:400});return reply(await action(env,body,ctx.email||ctx.distinct_id||'owner'));
 }catch{return reply({ok:false,error:'Draft operation could not be confirmed. Reload the saved draft before retrying. No checkout or customer message was created.',http_status:503});}
}
