import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { requireRole, currentRole, visibilityScope } from '../../functions/_lib/roles.js';
const request = () => new Request('https://anejo.test/api/hub/owner/staff', { headers: { Cookie: OWNER_COOKIE } });
test('an existing owner session loses authority immediately after downgrade', async () => {
  const env = ownerEnv();
  env.DB.sqlite.prepare("UPDATE staff SET role='driver',team='delivery',is_lead=0 WHERE id='stf_owner'").run();
  const denied = await requireRole(request(), env, ['owner']);
  assert.equal(denied.status, 403);
  const ctx = await currentRole(env, request());
  assert.equal(ctx.role, 'driver');
  assert.equal(ctx.team, 'delivery');
});
test('current team and lead status control scope instead of stale session grants', async () => {
  const env = ownerEnv();
  env.DB.sqlite.prepare("UPDATE staff SET role='kitchen',team='kitchen',is_lead=1 WHERE id='stf_owner'").run();
  assert.deepEqual(visibilityScope(await requireRole(request(), env, ['kitchen'])), { team: 'kitchen', lead: true });
  env.DB.sqlite.prepare("UPDATE staff SET team='delivery',is_lead=0 WHERE id='stf_owner'").run();
  assert.deepEqual(visibilityScope(await requireRole(request(), env, ['kitchen'])), { self: 'stf_owner' });
});
test('inactive, missing and unavailable staff records fail closed', async () => {
  const env = ownerEnv();
  env.DB.sqlite.prepare("UPDATE staff SET active=0 WHERE id='stf_owner'").run();
  assert.equal((await requireRole(request(), env, ['owner'])).status, 401);
  env.DB.sqlite.prepare("DELETE FROM staff WHERE id='stf_owner'").run();
  assert.equal((await requireRole(request(), env, ['owner'])).status, 401);
  env.DB = { prepare() { throw new Error('unavailable'); } };
  assert.equal((await requireRole(request(), env, ['owner'])).status, 401);
  delete env.DB;
  assert.equal((await requireRole(request(), env, ['owner'])).status, 401);
});
test('trainer and client sessions retain their nonstaff semantics', async () => {
  for (const type of ['trainer', 'client']) {
    const env = ownerEnv(); const now = Date.now();
    env.SESSIONS.store.set('session:tok-owner', JSON.stringify({ type, uid: 'fixture', email: 'fixture@example.test', la: now, created: now }));
    delete env.DB;
    const ctx = await requireRole(request(), env, [type]);
    assert.equal(ctx.role, type); assert.equal(ctx.distinct_id, 'fixture');
  }
});
