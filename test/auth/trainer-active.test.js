import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentRole, requireRole } from '../../functions/_lib/roles.js';
import { trainerSession, requireTrainer } from '../../functions/_lib/guard.js';

const request = new Request('https://anejo.test/api/clients', { headers: { Cookie: 'anejo_sess=trainer-fixture' } });
function envFor(row, { type = 'trainer', uid = 'trainer_fixture', fail = false } = {}) {
  return {
    SESSIONS: { get: async () => JSON.stringify({ type, uid, email: 'trainer@example.test', la: Date.now(), created: Date.now() }) },
    DB: { prepare: () => ({ bind: (id) => {
      assert.equal(id, uid);
      return { first: async () => { if (fail) throw new Error('database unavailable'); return row; } };
    } }) },
  };
}

test('active trainer retains session identity and access', async () => {
  const env = envFor({ active: 1 });
  const session = await requireTrainer(env, request);
  assert.equal(session.type, 'trainer');
  assert.equal(session.uid, 'trainer_fixture');
  assert.equal(session.email, 'trainer@example.test');
});

test('missing or deactivated trainer cannot reuse an unexpired session', async () => {
  for (const row of [null, { active: 0 }]) {
    const env = envFor(row);
    assert.equal(await trainerSession(env, request), null);
    assert.equal((await requireTrainer(env, request)).status, 401);
  }
});

test('database error or absent binding denies trainer access', async () => {
  const env = envFor({ active: 1 }, { fail: true });
  assert.equal((await requireTrainer(env, request)).status, 401);
  delete env.DB;
  assert.equal((await requireTrainer(env, request)).status, 401);
});

test('nontrainer and missing-identity sessions remain denied without consulting the DB', async () => {
  for (const opts of [{ type: 'staff' }, { uid: null }]) {
    const env = envFor(null, opts);
    env.DB.prepare = () => { throw new Error('must not consult DB'); };
    assert.equal(await trainerSession(env, request), null);
  }
});

test('HUB role resolver also denies removed and unavailable trainers', async () => {
  for (const env of [envFor(null), envFor({ active: 0 }), envFor({ active: 1 }, { fail: true })]) {
    assert.equal(await currentRole(env, request), null);
    assert.equal((await requireRole(request, env, ['trainer'])).status, 401);
  }
  assert.equal((await currentRole(envFor({ active: 1 }), request)).role, 'trainer');
});
