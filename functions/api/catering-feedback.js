import {json} from '../_lib/util.js';
import {limitOr429} from '../_lib/ratelimit.js';
import {readCateringFeedback,saveCateringFeedback} from '../_lib/catering_experience.js';
async function handle({request,env},write){
 const limited=await limitOr429(env,request,{name:'catering-feedback',limit:30,windowSec:60});if(limited)return limited;
 const origin=request.headers.get('Origin');if(write&&origin&&origin!==new URL(request.url).origin)return json({ok:false,error:'Open the feedback link to continue.'},403);
 try{const b=write?await request.json():null;if(write&&(!b||typeof b!=='object'||Array.isArray(b)))return json({ok:false,error:'Enter a feedback response.'},400,{'Cache-Control':'no-store, private'});const out=write?await saveCateringFeedback(env,b):await readCateringFeedback(env,new URL(request.url).searchParams.get('t'));return json(out,out.ok?200:400,{'Cache-Control':'no-store, private'});}catch{return json({ok:false,error:'Feedback is temporarily unavailable. Please try again.'},503,{'Cache-Control':'no-store, private'});}
}
export const onRequestGet=ctx=>handle(ctx,false);
export const onRequestPost=ctx=>handle(ctx,true);
