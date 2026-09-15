// One email to several people — a client's accountant and an owner, so that whoever sees it first answers
// — with each address meeting the suppression list on its own, and every existing single-address caller
// left byte-identical.
import { test } from 'node:test';
import assert from 'node:assert/strict';

async function freshEnv() {
  const { ownerEnv } = await import('../helpers/sqlite-d1.js');
  return ownerEnv({ RESEND_API_KEY: 're_test' });
}
const suppress = (env, email, reason = 'bounced') => env.DB.sqlite.prepare(
  'INSERT INTO email_suppressions (email, reason, detail, created_at, updated_at) VALUES (?,?,?,0,0)'
).run(email, reason, 'test');
const send = async (env, opts) => {
  const { sendEmail } = await import('../../functions/_lib/email.js');
  const { stubFetch } = await import('../helpers/sales-fixture.js');
  const f = stubFetch();
  try { return { r: await sendEmail(env, { subject: 'Holiday', html: '<p>Closed</p>', ...opts }), calls: f.calls }; } finally { f.restore(); }
};

test('several people share ONE message, normalised and de-duplicated', async () => {
  const env = await freshEnv();
  const { r, calls } = await send(env, { to: ['Accounting@Clinic.example', 'owner@clinic.example', 'accounting@clinic.example'] });
  assert.equal(calls.length, 1, 'one message, not one per person');
  assert.deepEqual(calls[0].body.to, ['accounting@clinic.example', 'owner@clinic.example']);
  assert.equal(r.dropped, undefined, 'nobody was left off');
});

test('a suppressed address is dropped and named — the others still receive it', async () => {
  const env = await freshEnv();
  suppress(env, 'owner@clinic.example');
  const { r, calls } = await send(env, { to: ['accounting@clinic.example', 'owner@clinic.example'] });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.to, ['accounting@clinic.example'], 'a bounced owner never costs the accountant the email');
  assert.deepEqual(r.dropped, [{ email: 'owner@clinic.example', reason: 'bounced' }]);
});

test('when every address is suppressed, nothing is sent at all', async () => {
  const env = await freshEnv();
  suppress(env, 'accounting@clinic.example');
  suppress(env, 'owner@clinic.example', 'complained');
  const { r, calls } = await send(env, { to: ['accounting@clinic.example', 'owner@clinic.example'] });
  assert.equal(calls.length, 0);
  assert.equal(r.skipped, true);
});

test('a single address keeps exactly the request body it has always had', async () => {
  const env = await freshEnv();
  const { r, calls } = await send(env, { to: 'someone@clinic.example' });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body.to, ['someone@clinic.example']);
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['from', 'html', 'subject', 'to'], 'no new keys for existing callers');
  assert.equal(r.dropped, undefined);
});
