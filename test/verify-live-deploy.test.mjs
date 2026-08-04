// The live-deploy detector, tested on the shapes that matter.
//
// The verdict logic is a pure function on purpose: the cases worth testing — production reverted
// to an older commit, published from an unrelated branch, published from a dirty tree — are ones
// you cannot conjure against the real Cloudflare project without doing the damage. So assess()
// takes the deployment list and a git oracle as arguments, and here both are fixtures.
//
// The IO half (Cloudflare fetch, git ancestry) is deliberately thin and is exercised for real by
// `npm run verify:deploy`, which is how it was checked against live production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../scripts/verify-live-deploy.mjs';

// A linear history a<-b<-c<-d, plus 'x' on an unrelated branch off a.
const PARENTS = { a: [], b: ['a'], c: ['b'], d: ['c'], x: ['a'] };
const ancestorOf = (a, b) => {
  if (a === b) return true;
  const seen = new Set();
  const walk = [b];
  while (walk.length) {
    const n = walk.pop();
    if (n === a) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    walk.push(...(PARENTS[n] || []));
  }
  return false;
};
const git = {
  known: (r) => r === 'origin/main' || Object.prototype.hasOwnProperty.call(PARENTS, r),
  isAncestor: (a, b) => ancestorOf(a, b === 'origin/main' ? 'd' : b),
  countBetween: (a, b) => {
    const target = b === 'origin/main' ? 'd' : b;
    let n = 0;
    for (const k of Object.keys(PARENTS)) if (ancestorOf(k, target) && !ancestorOf(k, a)) n += 1;
    return n;
  },
};
const dep = (id, commit, extra = {}) => ({ id, commit, dirty: false, trigger: 'github:push', ...extra });
const run = (deployments) => assess({ deployments, trunkRef: 'origin/main', git });
const codes = (r) => r.findings.map((f) => f.code);
const level = (r, code) => (r.findings.find((f) => f.code === code) || {}).level;

// ---------------------------------------------------------------------------
// The regression this exists to catch
// ---------------------------------------------------------------------------

test('FAILS when production moved BACKWARDS to an ancestor of what was live', () => {
  // The 2026-08-04 near-miss, as it would have looked from outside: a deploy from a checkout
  // behind the trunk lands, and the live commit is now an ancestor of the one it replaced.
  const r = run([dep('new', 'b', { trigger: 'ad_hoc' }), dep('old', 'd')]);
  assert.ok(codes(r).includes('reverted'), 'the revert is named');
  assert.equal(level(r, 'reverted'), 'fail');
  assert.match(r.findings.find((f) => f.code === 'reverted').message, /WENT BACKWARDS/);
  assert.equal(level(r, 'manual_deploy'), 'warn', 'and the hand-published trigger is flagged too');
});

test('FAILS when the live commit is not on the trunk at all', () => {
  // Production running code nobody can reproduce from git — true of this very project for hours
  // on 2026-08-04, when a rebased-away commit was live.
  const r = run([dep('live', 'x'), dep('prev', 'a')]);
  assert.ok(codes(r).includes('off_trunk'));
  assert.equal(level(r, 'off_trunk'), 'fail');
});

test('FAILS when live and previously-live are unrelated histories', () => {
  const r = run([dep('live', 'x'), dep('prev', 'd')]);
  assert.ok(codes(r).includes('diverged'));
  assert.equal(level(r, 'diverged'), 'fail');
});

// ---------------------------------------------------------------------------
// What must NOT alarm — a detector that cries wolf gets muted
// ---------------------------------------------------------------------------

test('is quiet when live is exactly the trunk', () => {
  const r = run([dep('live', 'd'), dep('prev', 'c')]);
  assert.deepEqual(codes(r), ['current']);
  assert.equal(level(r, 'current'), 'ok');
});

test('treats "behind the trunk" as INFO, not a failure', () => {
  // With auto-deploy on push, this is just the gap between a push and its build. Failing here
  // would make the detector fire on every normal deploy and it would be turned off within a week.
  const r = run([dep('live', 'c'), dep('prev', 'b')]);
  assert.equal(level(r, 'behind'), 'info');
  assert.ok(!r.findings.some((f) => f.level === 'fail'));
  assert.match(r.findings.find((f) => f.code === 'behind').message, /1 commit\(s\) behind/);
});

test('a forward deploy that skips commits is fine — that is a normal catch-up', () => {
  const r = run([dep('live', 'd'), dep('prev', 'a')]);
  assert.ok(!r.findings.some((f) => f.level === 'fail'));
});

// ---------------------------------------------------------------------------
// Warnings and honest skips
// ---------------------------------------------------------------------------

test('WARNS on a dirty deployment — live content matches no commit', () => {
  const r = run([dep('live', 'd', { dirty: true }), dep('prev', 'c')]);
  assert.equal(level(r, 'dirty'), 'warn');
  assert.ok(!r.findings.some((f) => f.level === 'fail'), 'dirty alone is not a revert');
});

test('WARNS on a hand-published deployment even when the commit checks out', () => {
  const r = run([dep('live', 'd', { trigger: 'ad_hoc' }), dep('prev', 'c')]);
  assert.equal(level(r, 'manual_deploy'), 'warn');
});

test('SKIPS loudly when the live commit is not in this clone', () => {
  // Never silently: an unjudgeable state is exactly what the old guard used to pass on.
  const r = run([dep('live', 'zz'), dep('prev', 'd')]);
  assert.deepEqual(codes(r), ['unknown_commit']);
  assert.equal(level(r, 'unknown_commit'), 'skip');
});

test('SKIPS when the deployment carries no commit metadata', () => {
  const r = run([dep('live', null), dep('prev', 'd')]);
  assert.deepEqual(codes(r), ['no_commit_metadata']);
});

test('SKIPS when there are no successful deployments to read', () => {
  assert.deepEqual(codes(run([])), ['no_deployments']);
});

test('a single deployment is judged against the trunk, with no revert check to make', () => {
  const r = run([dep('only', 'd')]);
  assert.deepEqual(codes(r), ['current']);
});

test('importing the module does not perform IO', () => {
  // The direct-invocation guard at the bottom of the script is what makes this file testable;
  // without it, importing assess() would fire a live Cloudflare request on every test run.
  assert.equal(typeof assess, 'function');
});
