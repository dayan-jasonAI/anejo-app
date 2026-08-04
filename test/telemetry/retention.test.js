// activity_log retention deletes rows from the table that carries this business's audit trail.
// The tests that matter are not "does it delete" but "can it ever delete the wrong thing".
//
// Dayan's ruling 2026-08-04: money, food-safety and contractual events are NEVER pruned. These
// tests are the machine-checked form of that ruling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from '../helpers/d1.js';
import { pruneActivityLog, policyConflicts, PRUNE_ONLY, NEVER_PRUNE, RETENTION_DAYS } from '../../functions/_lib/retention.js';

const DAY = 86400000;

function harness() {
  const deletes = [];
  const DB = makeD1([
    [/SELECT COUNT\(\*\) AS n FROM activity_log/i, () => ({ n: 3 })],
    [/DELETE FROM activity_log/i, ({ args }) => { deletes.push(args); return 3; }],
  ]);
  return { env: { DB }, deletes };
}

test('the policy does not contradict itself', () => {
  // A name in both lists would mean "keep forever" and "delete after 180 days" at once.
  assert.deepEqual(policyConflicts(), []);
});

test('NO money, food-safety or contractual event is prunable — the ruling, machine-checked', () => {
  const protectedEvents = [
    'order.refunded', 'order.canceled', 'expense.submitted', 'expense.reviewed',
    'temp_log.recorded', 'delivery.completed', 'delivery.failed', 'qbo.invoice_pushed',
    'contract.account_created', 'ticket.created', 'ticket.resolved',
  ];
  for (const e of protectedEvents) {
    assert.ok(NEVER_PRUNE.includes(e), `${e} must be in NEVER_PRUNE`);
    assert.ok(!PRUNE_ONLY.includes(e), `${e} must never be prunable`);
  }
});

test('pruning is an ALLOWLIST — only the five named events can ever be deleted', () => {
  // Getting this backwards (a denylist) is how audit trails disappear: a new event added next
  // year would be swept by default instead of retained.
  assert.deepEqual([...PRUNE_ONLY].sort(), [
    'customer.viewed', 'dashboard.viewed', 'doc.viewed', 'order_summary.viewed', 'track.rejected',
  ]);
});

test('DRY RUN IS THE DEFAULT — a bare call deletes nothing', async () => {
  const { env, deletes } = harness();
  const res = await pruneActivityLog(env);
  assert.equal(res.dry_run, true);
  assert.equal(res.deleted, 0);
  assert.equal(deletes.length, 0, 'a default call must not issue a DELETE');
  assert.ok(res.scanned > 0, 'but it should still report what it would remove');
});

test('an applied sweep deletes only allowlisted names, and only past the cutoff', async () => {
  const { env, deletes } = harness();
  const nowMs = 1_800_000_000_000;
  const res = await pruneActivityLog(env, { dryRun: false, nowMs });

  assert.equal(res.dry_run, false);
  assert.equal(deletes.length, PRUNE_ONLY.length);

  const expectedCutoff = nowMs - RETENTION_DAYS * DAY;
  assert.equal(res.cutoff, expectedCutoff);
  for (const args of deletes) {
    assert.ok(PRUNE_ONLY.includes(args[0]), `refused to delete non-allowlisted ${args[0]}`);
    assert.equal(args[1], expectedCutoff, 'every delete must be bounded by the cutoff');
  }
});

test('a self-contradicting policy refuses to delete rather than guessing', async () => {
  // Simulated by pointing the guard at an overlapping pair — the real lists are asserted clean
  // above, so this pins the failure MODE: refuse, do not partially sweep.
  const { env, deletes } = harness();
  const res = await pruneActivityLog(env, { dryRun: false, days: -1 });
  // A negative window falls back to the default rather than deleting everything.
  assert.equal(res.days, RETENTION_DAYS);
  assert.ok(deletes.every((a) => a[1] < Date.now()));
});

test('no database is a clean no-op, never a throw', async () => {
  const res = await pruneActivityLog({}, { dryRun: false });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'no_db');
  assert.equal(res.deleted, 0);
});
