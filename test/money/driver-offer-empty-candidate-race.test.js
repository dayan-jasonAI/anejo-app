import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { offerToNext } from '../../functions/_lib/dispatch.js';

async function scenario(transition, legacy = false) {
  const env = ownerEnv(), at = Date.now();
  env.DB.sqlite.prepare("INSERT INTO staff(id,name,email,role,active,offers_accepted,created_at,updated_at)VALUES('driver_race','Synthetic Driver','synthetic-race@test.example','driver',1,4,?,?)").run(at,at);
  // The only eligible driver is already excluded: this must reach the empty-candidate branch.
  env.DB.sqlite.prepare("INSERT INTO routes(id,driver_id,route_date,status,offer_status,declined_ids,offered_at,created_at,updated_at)VALUES('route_race',NULL,'2026-10-31','assigned','unoffered',?,NULL,?,?)").run(JSON.stringify(['driver_race']),at,at);
  const prepare = env.DB.prepare.bind(env.DB);
  let raced = false, emptyWrite = false;
  env.DB.prepare = sql => {
    if (sql.startsWith("UPDATE routes SET offer_status='unfilled'")) {
      emptyWrite = true;
      if (legacy) return {bind(t,rid){return prepare("UPDATE routes SET offer_status='unfilled',updated_at=? WHERE id=?").bind(t,rid);}};
    }
    const stmt = prepare(sql);
    if (sql.startsWith("SELECT id, name, phone FROM staff WHERE role='driver'")) {
      const all = stmt.all.bind(stmt);
      stmt.all = async () => {
        raced = true;
        if (transition === 'accept') {
          env.DB.sqlite.prepare("UPDATE routes SET driver_id='driver_race',offer_status='accepted',offered_at=?,updated_at=? WHERE id='route_race'").run(at+1,at+1);
          env.DB.sqlite.prepare("UPDATE staff SET offers_accepted=5 WHERE id='driver_race'").run();
        } else env.DB.sqlite.prepare("UPDATE routes SET status='canceled',offer_status='canceled',updated_at=? WHERE id='route_race'").run(at+1);
        return all();
      };
    }
    return stmt;
  };
  try {
    const out = await offerToNext(env,'route_race');
    assert.equal(raced,true); assert.equal(emptyWrite,true,'the test exercised the empty-candidate UPDATE');
    assert.equal(out.ok,false,'stale no-candidate claim must fail');
    assert.equal(out.reason,'offer_changed');
    const r = env.DB.one("SELECT * FROM routes WHERE id='route_race'");
    assert.equal(r.offer_status,transition==='accept'?'accepted':'canceled');
    assert.equal(r.status,transition==='accept'?'assigned':'canceled');
    assert.equal(env.DB.one("SELECT offers_accepted n FROM staff WHERE id='driver_race'").n,transition==='accept'?5:4);
    assert.equal(env.DB.one("SELECT count(*) n FROM route_offers WHERE route_id='route_race' AND outcome='unfilled'").n,0);
    assert.equal(env.DB.one("SELECT count(*) n FROM alerts WHERE ref_id='route_race'").n,0);
  } finally {env.DB.sqlite.close();}
}
for (const transition of ['accept','cancel']) {
  test(`empty-candidate claim cannot overwrite concurrent ${transition}`,()=>scenario(transition));
}
test('legacy unconditional update negative control fails the same race assertions',async()=>{
  for (const transition of ['accept','cancel']) await assert.rejects(()=>scenario(transition,true),/stale no-candidate claim must fail/);
});
