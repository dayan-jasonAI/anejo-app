import test from 'node:test';
import assert from 'node:assert/strict';
import {ownerEnv,OWNER_COOKIE} from '../helpers/sqlite-d1.js';
import {onRequestGet} from '../../functions/api/hub/owner/catering-deposit.js';
test('owner quote readback preserves exact itemization and confirmed fee for reopening the editor',async()=>{
 const env=ownerEnv();
 const breakdown={lines:[{name:'Dish A',qty:'30',cents:5000},{name:'Dish B',qty:'30',cents:11750},{name:'Dish C',qty:'30',cents:7000},{name:'Dish D',qty:'30',cents:3000},{name:'Rolls',qty:'30',cents:3875}],subtotal_cents:30625,delivery_fee_cents:2500,total_cents:33125};
 env.DB.sqlite.prepare("INSERT INTO catering_quotes(id,guests,total_cents,deposit_pct,deposit_cents,balance_cents,terms_version,terms_json,quote_json,created_at,updated_at) VALUES('synthetic_quote',30,33125,.5,16563,16562,'fixture','{}',?,1,1)").run(JSON.stringify(breakdown));
 const response=await onRequestGet({env,request:new Request('https://anejocateringco.com/api/hub/owner/catering-deposit',{headers:{cookie:OWNER_COOKIE}})});
 assert.equal(response.status,200);
 const q=(await response.json()).quotes.find(x=>x.id==='synthetic_quote');
 assert.deepEqual(JSON.parse(q.quote_json),breakdown);
 assert.equal(q.delivery_fee_cents,2500);
 assert.equal(q.total_cents,33125);
});
