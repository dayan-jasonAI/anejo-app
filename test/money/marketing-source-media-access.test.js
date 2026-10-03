import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv} from '../helpers/sqlite-d1.js';
import {onRequestGet} from '../../functions/api/hub/media/[[path]].js';
for(const role of ['owner','marketing','kitchen'])test('private source-version media role '+role,async t=>{
 let reads=0;const env=ownerEnv({MEDIA:{async get(){reads++;return {body:new Uint8Array([1,2,3]),httpMetadata:{contentType:'image/jpeg'}};}}});t.after(()=>env.DB.sqlite.close());
 const response=await onRequestGet({env,request:new Request('https://anejo.test/api/hub/media/marketing-source-versions/version-1',{headers:{cookie:'anejo_sess=tok-'+role}}),params:{path:['marketing-source-versions','version-1']}});
 if(role==='kitchen'){assert.equal(response.status,404);assert.equal(reads,0);}
 else{assert.equal(response.status,200);assert.equal(reads,1);assert.equal(response.headers.get('cache-control'),'private, max-age=3600');}
});
