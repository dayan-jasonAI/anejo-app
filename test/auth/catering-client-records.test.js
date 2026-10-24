import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { makeSqliteD1, makeKV } from '../helpers/sqlite-d1.js';
import { ensureCustomerAccount, ensureCateringCustomerAccount } from '../../functions/_lib/customer-accounts.js';
import { onRequestGet as me } from '../../functions/api/client/me.js';
import { onRequestGet as verify } from '../../functions/api/auth/verify.js';
import { onRequestPost as payBalance } from '../../functions/api/client/catering-balance.js';

function fixture() {
  const DB = makeSqliteD1();
  const SESSIONS = makeKV({ 'session:mine': JSON.stringify({ type:'client',email:' Buyer@Example.test ',created:Date.now(),la:Date.now() }) });
  return { DB,SESSIONS,SQUARE_ACCESS_TOKEN:'fixture',SQUARE_LOCATION_ID:'fixture',SQUARE_ENV:'sandbox' };
}
function quote(env,id='cq_mine',email='buyer@example.test',deposit='paid',balance='due') {
  env.DB.sqlite.prepare(`INSERT INTO catering_quotes
    (id,customer_name,customer_email,customer_phone,event_date,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,balance_status,deposit_paid_at,deposit_paid_cents,balance_paid_at,balance_due_date,terms_version,terms_json,quote_json,access_token,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,'Guest',email,'5615550100','2099-01-02',30,33125,.5,16563,16562,deposit,balance,deposit==='paid'?1000:null,deposit==='paid'?16563:null,balance==='paid'?2000:null,'2099-01-01','v1','{}','{"lines":[{"name":"Roast pork","qty":30,"provider_key":"secret"}]}',Buffer.from(id).toString('hex').padEnd(32,'0'),1,2);
}
const request = (url='/api/client/me',options={}) => new Request('https://anejo.test'+url,{...options,headers:{Cookie:'anejo_sess=mine',...options.headers}});
const paymentRequest = (body,headers={}) => request('/api/client/catering-balance',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});

test('canonical account survives mixed case and repeated payments without creating trainer-client permissions',async()=>{
  const env=fixture();quote(env);
  const first=await ensureCateringCustomerAccount(env,'cq_mine');
  const second=await ensureCustomerAccount(env,{email:' BUYER@example.test ',name:'New name',source:'verified_signin'});
  assert.equal(first.id,second.id);assert.equal(second.name,'Guest');
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM customer_accounts').n,1);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM clients').n,0);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM points_ledger').n,0);
  assert.equal(env.SESSIONS.store.size,1,'upserting a contact must not create a session');
  assert.equal(await ensureCustomerAccount(env,{email:'not an email'}),null);
  quote(env,'cq_unpaid','other@example.test','unpaid');
  assert.equal(await ensureCateringCustomerAccount(env,'cq_unpaid'),null);
});

test('client magic link verifies ownership before creating its canonical account/session',async()=>{
  const env=fixture();
  env.DB.sqlite.prepare('INSERT INTO auth_tokens(token,user_email,user_type,expires_at) VALUES(?,?,?,?)').run('valid','buyer@example.test','client',Date.now()+10000);
  const invalid=await verify({request:new Request('https://anejo.test/api/auth/verify?token=bad'),env});
  assert.equal(invalid.status,302);assert.equal(env.DB.one('SELECT COUNT(*) n FROM customer_accounts').n,0);
  const response=await verify({request:new Request('https://anejo.test/api/auth/verify?token=valid'),env});
  assert.equal(response.headers.get('Location'),'https://anejo.test/client/dashboard');
  assert.ok(response.headers.get('Set-Cookie'));
  assert.equal(env.DB.one('SELECT email FROM customer_accounts').email,'buyer@example.test');
  const count=env.SESSIONS.store.size;
  await verify({request:new Request('https://anejo.test/api/auth/verify?token=valid'),env});
  assert.equal(env.SESSIONS.store.size,count,'used links cannot mint another session');
});

test('account reads only session-owned events and recorded rewards; paid/void/waived states have no payment CTA',async()=>{
  const env=fixture();quote(env);quote(env,'cq_other','other@example.test');quote(env,'cq_void','buyer@example.test','void');
  quote(env,'cq_settled','buyer@example.test','paid','paid');quote(env,'cq_waived','buyer@example.test','paid','waived');
  await ensureCateringCustomerAccount(env,'cq_mine');
  env.DB.sqlite.prepare("INSERT INTO points_ledger(id,email,delta,reason,created_at) VALUES('mine','buyer@example.test',8,'earn',1),('other','other@example.test',999,'earn',1)").run();
  env.DB.sqlite.prepare("INSERT INTO catering_balance_checkouts(quote_id,amount_cents,paid_at,created_at) VALUES('cq_settled',16562,2000,1)").run();
  env.DB.sqlite.prepare("INSERT INTO catering_balance_reminders(id,quote_id,kind,amount_cents,sent_at,created_at,receipt_status) VALUES('r','cq_mine','due_today',16562,3000,1,'accepted')").run();
  const response=await me({request:request('/api/client/me?email=other@example.test'),env});
  const data=await response.json();
  assert.equal(response.headers.get('Cache-Control'),'no-store, private');
  assert.equal(data.account.email,'buyer@example.test');
  assert.deepEqual(data.catering.map(q=>q.id).sort(),['cq_mine','cq_settled','cq_waived']);
  assert.equal(data.catering.find(q=>q.id==='cq_mine').payment_action,'balance');
  assert.equal(data.catering.find(q=>q.id==='cq_settled').payment_action,null);
  assert.equal(data.catering.find(q=>q.id==='cq_waived').payment_action,null);
  assert.equal(data.catering.find(q=>q.id==='cq_settled').activity.find(a=>a.kind==='balance_received').amount_cents,16562);
  assert.equal(data.rewards.points,8);assert.equal(data.rewards_activity.length,1);
  const serialized=JSON.stringify(data);
  for(const secret of ['other@example.test','cq_other','provider_key','customer_phone','square_order_id','payment_link_url'])assert.ok(!serialized.includes(secret),secret);
  assert.ok(data.catering.find(q=>q.id==='cq_mine').activity.some(a=>a.kind==='balance_email_accepted'));
});

test('balance endpoint refuses signed-out, staff, cross-site, other-customer and settled requests without provider calls',async t=>{
  const env=fixture();quote(env);quote(env,'cq_other','other@example.test');quote(env,'cq_settled','buyer@example.test','paid','paid');
  const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);globalThis.fetch=async()=>{throw Error('no provider calls permitted');};
  assert.equal((await payBalance({request:new Request('https://anejo.test/api/client/catering-balance',{method:'POST',body:'{}'}),env})).status,401);
  env.SESSIONS.store.set('session:staff',JSON.stringify({type:'staff',email:'buyer@example.test',created:Date.now(),la:Date.now()}));
  assert.equal((await payBalance({request:paymentRequest({quote_id:'cq_mine'},{Cookie:'anejo_sess=staff'}),env})).status,401);
  assert.equal((await payBalance({request:paymentRequest({quote_id:'cq_mine'},{Origin:'https://evil.test'}),env})).status,403);
  assert.equal((await payBalance({request:paymentRequest({quote_id:'cq_other',email:'other@example.test'}),env})).status,404);
  assert.equal((await payBalance({request:paymentRequest({quote_id:'cq_settled'}),env})).status,409);
});

test('balance action reuses exact saved owned payment and ignores caller supplied amount/url',async t=>{
  const env=fixture();quote(env);
  env.DB.sqlite.prepare("INSERT INTO catering_balance_checkouts(quote_id,amount_cents,payment_link_url,created_at) VALUES('cq_mine',16562,'https://square.link/owned',1)").run();
  const old=globalThis.fetch;t.after(()=>globalThis.fetch=old);globalThis.fetch=async()=>{throw Error('must reuse the stored checkout');};
  const response=await payBalance({request:paymentRequest({quote_id:'cq_mine',amount:1,url:'https://evil.test'}),env});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,url:'https://square.link/owned'});
  assert.equal(env.DB.one('SELECT amount_cents FROM catering_balance_checkouts').amount_cents,16562);
});

test('account event payment control renders balance amount, accurate activity and no dead or wrong-state pay links',()=>{
  const context={window:{},Intl,fetch:()=>{throw Error('render must not call provider');}};
  vm.runInNewContext(readFileSync('public/assets/js/client-catering.js','utf8'),context);
  const mount={innerHTML:'',querySelectorAll:()=>[]};
  context.window.AnejoCatering.render([{id:'cq_mine',event_date:'2099-01-02',lang:'en',total_cents:33125,balance_cents:16562,deposit_status:'paid',balance_status:'due',payment_action:'balance',url:'/q/own',activity:[{kind:'deposit_received',at:1000,amount_cents:16563}]}],mount);
  assert.match(mount.innerHTML,/cc-pay/);assert.match(mount.innerHTML,/Pay the balance · \$165.62/);assert.match(mount.innerHTML,/Deposit received · \$165.63/);
  context.window.AnejoCatering.render([{id:'cq_mine',event_date:'2099-01-02',lang:'en',deposit_status:'paid',balance_status:'waived',payment_action:null,url:'/q/own'}],mount);
  assert.ok(!mount.innerHTML.includes('cc-pay"'));assert.match(mount.innerHTML,/Balance waived/);
});

test('ledger or rewards-rule lookup failure does not masquerade as zero points or an empty history',async()=>{
  for(const broken of ['ledger','settings']){
    const env=fixture();quote(env);
    if(broken==='ledger'){
      const original=env.DB.prepare;
      env.DB.prepare=sql=>{if(sql.includes('SUM(delta)'))throw Error('ledger unavailable');return original(sql);};
    }else{
      const original=env.SESSIONS.get;
      env.SESSIONS.get=key=>{if(key==='rewards:config')throw Error('settings unavailable');return original(key);};
    }
    const data=await (await me({request:request(),env})).json();
    assert.equal(data.rewards,null);assert.equal(data.rewards_status,'unavailable');assert.equal(data.rewards_activity,null);
    assert.equal(data.catering[0].payment_action,'balance','a rewards outage must not strand balance payment');
  }
});

test('customer account backfill includes paid customers only and preserves canonical email across products',()=>{
  const env=fixture();quote(env);quote(env,'cq_unpaid','unpaid@example.test','unpaid');
  env.DB.sqlite.exec(readFileSync('migrations/0158_customer_accounts.sql','utf8'));
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM customer_accounts WHERE email='buyer@example.test'").n,1);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM customer_accounts WHERE email='unpaid@example.test'").n,0);
  env.DB.sqlite.exec(readFileSync('migrations/0158_customer_accounts.sql','utf8'));
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM customer_accounts').n,1);
});

test('meal-plan account still renders current bowl and rewards after canonical account integration',()=>{
  const elements={main:{innerHTML:''},signout:{style:{}}};
  const context={window:{AnejoCatering:{render(){}}},document:{getElementById:id=>elements[id]||{}},fetch:()=>new Promise(()=>{})};
  vm.runInNewContext(readFileSync('public/assets/js/customer-orders.js','utf8'),context);
  const inline=[...readFileSync('public/client/dashboard.html','utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  vm.runInNewContext(inline,context);
  context.render({authenticated:true,email:'buyer@example.test',client:{id:'client',name:'Guest'},plan:{status:'active',daily_calories:1500,daily_protein_g:100,daily_carbs_g:150,daily_fat_g:60},subscription:{id:'sub',status:'active',weekly_amount_cents:5000},today_bowls:[{window:'lunch',bowl:'RAIZ',image:'/assets/img/bowl.jpg'}],orders:[],catering:[],rewards:{tier:'vital',tier_name:'Vital',points:12,free_delivery:false},rewards_activity:[]},{});
  assert.match(elements.main.innerHTML,/Your bowl today/);assert.match(elements.main.innerHTML,/RAIZ/);assert.match(elements.main.innerHTML,/points/);
  assert.ok(!elements.main.innerHTML.includes('Free delivery'));
});

test('ownership or balance changes while checkout prepares cannot expose a stale payment URL',async t=>{
  const previous=globalThis.fetch;t.after(()=>globalThis.fetch=previous);
  for(const change of ["customer_email='different@example.test'",'balance_cents=99999',"balance_status='paid'"]){
    const env=fixture();quote(env);
    globalThis.fetch=async()=>{
      env.DB.exec('UPDATE catering_quotes SET '+change+" WHERE id='cq_mine'");
      return new Response(JSON.stringify({payment_link:{order_id:'synthetic_order',url:'https://square.link/owned'}}));
    };
    const response=await payBalance({request:paymentRequest({quote_id:'cq_mine'}),env});
    assert.equal(response.status,409,change);const data=await response.json();assert.equal(data.url,undefined);assert.ok(data.error);
  }
});
