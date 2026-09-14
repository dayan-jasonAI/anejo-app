// Working the list, and knowing what the automation actually did.
//
// Two problems these pin down, both found by looking at real production numbers: 35 of 37 prospects
// were unworkable because an opportunity had to be created one at a time, and three of the four
// scheduled jobs appeared never to have run when in fact they ran hourly and skipped in silence.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const post = async (env, body) => {
  const { onRequestPost } = await import('../../functions/api/hub/owner/sales/index.js');
  const { OWNER_COOKIE } = await import('../helpers/sqlite-d1.js');
  return onRequestPost({ env, request: new Request('https://anejo.test/api/hub/owner/sales', {
    method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) });
};

test('working the list makes prospects addressable, is safe to repeat, and contacts nobody', async () => {
  const { readyEnv, seedProspect } = await import('../helpers/sales-fixture.js');
  const { salesRows, suppressOrganization } = await import('../../functions/_lib/sales/store.js');
  const { env, cfg } = await readyEnv();

  const a = await seedProspect(env, cfg, { name: 'Alpha Day Program', website: 'https://alphaday.org/', opportunity: false, email: 'a@alphaday.org' });
  const b = await seedProspect(env, cfg, { name: 'Beta Counseling', website: 'https://betacounseling.org/', opportunity: false, email: 'b@betacounseling.org' });
  const c = await seedProspect(env, cfg, { name: 'Gamma Recovery', website: 'https://gammarecovery.org/', opportunity: false, email: 'c@gammarecovery.org' });
  await suppressOrganization(env, c.orgId, { reason: 'asked' });

  const r1 = await (await post(env, { op: 'bulk_advance', ids: [a.orgId, b.orgId, c.orgId], actions: ['create_opportunity'] })).json();
  assert.equal(r1.ok, true);
  assert.equal(r1.opportunities_created, 2);
  assert.equal(r1.skipped.length, 1, 'a do-not-contact organization is never made addressable');
  assert.match(r1.skipped[0].why, /do-not-contact/);

  // Nothing was written that could reach a prospect. Making someone addressable is not contacting them.
  assert.equal((await salesRows(env, 'SELECT id FROM sales_outreach')).length, 0, 'no email was drafted, queued or sent');

  // Pressing it again on the same list is harmless — the second pass creates nothing new.
  const r2 = await (await post(env, { op: 'bulk_advance', ids: [a.orgId, b.orgId, c.orgId], actions: ['create_opportunity'] })).json();
  assert.equal(r2.opportunities_created, 0);
  assert.equal(r2.opportunities_existing, 2);
  assert.equal((await salesRows(env, 'SELECT id FROM sales_opportunities')).length, 2, 'still exactly two, not four');
});

test('an empty selection is refused rather than silently doing nothing', async () => {
  const { readyEnv } = await import('../helpers/sales-fixture.js');
  const { env } = await readyEnv();
  assert.equal((await post(env, { op: 'bulk_advance', ids: [] })).status, 400);
});

test('a switched-ON job that finds nothing to do still leaves a row; a switched-off one stays silent', async () => {
  const { readyEnv, reload, setting } = await import('../helpers/sales-fixture.js');
  const { runSalesJob } = await import('../../functions/_lib/sales/jobs.js');

  // Switched OFF: the documented default. Silence here is correct — an off feature must not fill the
  // run log with hourly proof of its own silence.
  const off = await readyEnv({ emailEnabled: false });
  const offCfg = await reload(off.env);
  assert.equal(offCfg.flags['sales.email_enabled'], false);
  const rOff = await runSalesJob(off.env, 'send', { cfg: offCfg });
  assert.equal(rOff.outcome, 'skipped');
  assert.equal(off.env.DB.rows("SELECT id FROM agent_runs WHERE automation_type = 'sales_send'").length, 0,
    'a job that is off writes nothing');

  // Switched ON with nothing approved to send. This is the case that used to be invisible, and the
  // one that matters: it is indistinguishable from "never scheduled" unless it says so.
  const on = await readyEnv({ emailEnabled: true });
  setting(on.env, 'sales.email_enabled', true);
  const onCfg = await reload(on.env);
  assert.equal(onCfg.flags['sales.email_enabled'], true);
  const rOn = await runSalesJob(on.env, 'send', { cfg: onCfg });
  assert.equal(rOn.outcome, 'skipped', 'there is genuinely nothing approved to send');
  const rows = on.env.DB.rows("SELECT outcome, output FROM agent_runs WHERE automation_type = 'sales_send'");
  assert.equal(rows.length, 1, 'it ran, so it says so');
  assert.equal(rows[0].outcome, 'skipped');
  assert.match(rows[0].output, /nothing sent/, 'and it says WHY it had nothing to do');
});
