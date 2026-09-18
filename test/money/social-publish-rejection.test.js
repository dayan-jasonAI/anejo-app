import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv} from '../helpers/sqlite-d1.js';
import {publishSocialPost} from '../../functions/_lib/social_publish.js';
function fixture({status='publishing',marker=1,missing=false,writeFailure=false}={}){
 const env=ownerEnv();env.DB.sqlite.prepare('INSERT INTO social_posts (id,status,caption,public_token,created_at,updated_at,auto_audit_required) VALUES (?,?,?,?,?,?,?)').run('p',status,'caption','token',1,1,marker);
 const prepare=env.DB.prepare.bind(env.DB);const writes=[];
 env.DB.prepare=sql=>{
 if(sql.startsWith('SELECT auto_audit_required'))return {bind(){return this;},async first(){if(missing)return null;throw new Error('source/marker unavailable');}};
 if(sql.startsWith('UPDATE social_posts')){writes.push(sql);if(writeFailure)return {bind(){return this;},async run(){throw new Error('write unavailable');}};}
 return prepare(sql);
 };return {env,writes};
}
const request=new Request('https://anejo.test');
test('approval-read outage fails only claimed row and never calls provider',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('provider must not run');};
 try{const {env}=fixture();const result=await publishSocialPost(env,request,{id:'p'});assert.equal(result.ok,false);assert.match(result.error,/evidence unavailable/);const row=env.DB.one("SELECT status,error FROM social_posts WHERE id='p'");assert.equal(row.status,'failed');assert.equal(row.error,result.error);}finally{globalThis.fetch=original;}
});
test('missing manual approval record in dry run returns failure without mutation',async()=>{
 const {env,writes}=fixture({marker:null,status:'draft',missing:true});const result=await publishSocialPost(env,request,{id:'p'},{publish:false});assert.equal(result.ok,false);assert.match(result.error,/record unavailable/);assert.equal(writes.length,0);assert.equal(env.DB.one("SELECT status FROM social_posts WHERE id='p'").status,'draft');
});
test('approval failure never overwrites completed post and survives failed error persistence',async()=>{
 const complete=fixture({status:'published'});assert.equal((await publishSocialPost(complete.env,request,{id:'p'})).ok,false);assert.equal(complete.env.DB.one("SELECT status FROM social_posts WHERE id='p'").status,'published');
 const broken=fixture({writeFailure:true});const result=await publishSocialPost(broken.env,request,{id:'p'});assert.equal(result.ok,false);assert.match(result.error,/evidence unavailable/);
});
