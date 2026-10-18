import { json,bad } from '../_lib/util.js';
import { callbackQuote,callbackCapabilities,listCallbacks,requestCallback } from '../_lib/catering_callbacks.js';
const reply=(body,status=200)=>json(body,status,{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
export async function onRequestGet({request,env}) {
  try {
    if(!env.DB)return bad('Callback service unavailable.',503);
    const quote=await callbackQuote(env,new URL(request.url).searchParams.get('token'));
    if(!quote)return bad('That quote link is not valid.',404);
    return reply({ok:true,capabilities:callbackCapabilities,requests:await listCallbacks(env,quote.id)});
  }catch{return bad('Could not load preferred callback times.',503);}
}
export async function onRequestPost({request,env}) {
  let b;try{b=await request.json();}catch{return bad('Send JSON.');}
  try {
    if(!env.DB)return bad('Callback service unavailable.',503);
    const quote=await callbackQuote(env,b?.token);
    if(!quote)return bad('That quote link is not valid.',404);
    const result=await requestCallback(env,quote,b);
    return result.error?bad(result.error):reply(result);
  }catch{return bad('Could not save your preferred time. Please try again.',503);}
}
