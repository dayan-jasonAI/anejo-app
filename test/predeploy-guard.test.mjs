// The deploy guard is the last thing between a stale checkout and production, and it talks to git
// for every answer it gives — so it is tested against REAL throwaway repositories, not a mock of
// git. A mocked git would have happily agreed with the bug this file exists to pin: the guard used
// to compare HEAD against origin/<current-branch>, so a branch that had never been pushed made
// `rev-list` throw and the guard excused itself with "skipped". On 2026-08-04 that let a checkout
// 69 commits behind main reach the deploy command; only a human noticing stopped a 130-file revert
// of live work. Every case below builds an actual bare origin + clone and runs the real script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `.pathname` on a file: URL is percent-encoded — a checkout under e.g. "Dayan Workspace" (a real
// path on the machine this suite actually runs on) turns the space into a literal `%20`, and
// execFileSync then tries to run a file that does not exist. fileURLToPath() decodes it. Found
// 2026-08-15: this made EVERY case below fail with ENOENT/MODULE_NOT_FOUND, on an unrelated
// deploy — the guard's own test suite blocked the guard from ever running.
const GUARD = fileURLToPath(new URL('../scripts/predeploy-guard.mjs', import.meta.url));

const git = (cwd, ...args) => execFileSync('git', args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
}).trim();

// Commit identity is passed per-call so the test never depends on the machine's git config.
const commit = (cwd, message) => {
  writeFileSync(join(cwd, 'file.txt'), message);
  git(cwd, 'add', '-A');
  git(cwd, '-c', 'user.email=t@t.test', '-c', 'user.name=Test', 'commit', '-q', '-m', message);
};

// A bare "origin" with one commit on main, plus a clone of it. Returns { origin, clone, tmp }.
function scenario() {
  const tmp = mkdtempSync(join(tmpdir(), 'anejo-guard-'));
  const origin = join(tmp, 'origin.git');
  const seed = join(tmp, 'seed');
  git(tmp, 'init', '--bare', '--initial-branch=main', origin);
  git(tmp, 'init', '--initial-branch=main', seed);
  commit(seed, 'first');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', '-u', 'origin', 'main');
  const clone = join(tmp, 'clone');
  git(tmp, 'clone', '-q', origin, clone);
  return { tmp, origin, seed, clone };
}

// Run the real guard in `cwd`. Returns { code, out } — never throws on a non-zero exit.
function runGuard(cwd) {
  try {
    const out = execFileSync(process.execPath, [GUARD], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

// Move origin/main forward by one commit, so every clone of it is now one behind the trunk.
function advanceTrunk(s, message = 'published by someone else') {
  commit(s.seed, message);
  git(s.seed, 'push', '-q', 'origin', 'main');
}

const cleanup = (s) => rmSync(s.tmp, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// The regression this file was written for
// ---------------------------------------------------------------------------

test('BLOCKS a branch that is behind the trunk and has never been pushed', () => {
  // THE BUG, exactly: an unpushed branch name means origin/<branch> does not resolve. The old
  // guard treated that as "cannot determine" and passed. It is the most dangerous shape there is —
  // a local branch nobody else has seen is precisely the one that has drifted.
  const s = scenario();
  try {
    git(s.clone, 'checkout', '-q', '-b', 'claude/never-pushed');
    advanceTrunk(s);
    const r = runGuard(s.clone);
    assert.equal(r.code, 1, 'a stale unpushed branch must not reach the deploy');
    assert.match(r.out, /DEPLOY BLOCKED/);
    assert.match(r.out, /1 commit\(s\) BEHIND origin\/main/);
    assert.match(r.out, /published by someone else/, 'it names the work that would be reverted');
    assert.match(r.out, /git merge origin\/main/, 'a feature branch is told to merge, not pull');
    assert.ok(!/skipped/.test(r.out), 'the old fail-open path is gone');
  } finally { cleanup(s); }
});

test('BLOCKS a detached HEAD that is behind the trunk', () => {
  // Also previously waved through, on the reasoning that a detached HEAD has no branch to compare.
  // It has a trunk to compare against, and it reverts production just as hard.
  const s = scenario();
  try {
    advanceTrunk(s);
    git(s.clone, 'checkout', '-q', '--detach', 'HEAD');
    const r = runGuard(s.clone);
    assert.equal(r.code, 1);
    assert.match(r.out, /DEPLOY BLOCKED/);
    assert.match(r.out, /git pull --ff-only/, 'no branch to merge into — pull is the advice');
  } finally { cleanup(s); }
});

test('BLOCKS main itself when it is behind origin/main', () => {
  const s = scenario();
  try {
    advanceTrunk(s);
    const r = runGuard(s.clone);
    assert.equal(r.code, 1);
    assert.match(r.out, /BEHIND origin\/main/);
    assert.match(r.out, /git pull --ff-only/);
  } finally { cleanup(s); }
});

test('WARNS but does not block a pushed branch behind its OWN counterpart', () => {
  // Level with the trunk, but someone else pushed to this branch. This USED to block, on the
  // reasoning that it was "the same class of loss, different ref". It is not: their commit is not
  // on the trunk, so it was never published, so deploying a trunk-level tree cannot erase it. The
  // honest report is "you may be shipping without work you meant to include" — a warning.
  const s = scenario();
  try {
    git(s.clone, 'checkout', '-q', '-b', 'shared');
    git(s.clone, 'push', '-q', '-u', 'origin', 'shared');
    // A colleague's commit lands on the shared branch.
    const other = join(s.tmp, 'other');
    git(s.tmp, 'clone', '-q', '-b', 'shared', s.origin, other);
    commit(other, 'a colleague pushed this');
    git(other, 'push', '-q', 'origin', 'shared');

    const r = runGuard(s.clone);
    assert.equal(r.code, 0, 'nothing RELEASED is at risk — this must not block the deploy');
    assert.match(r.out, /1 commit\(s\) on origin\/shared are not in this tree/);
    assert.match(r.out, /Not blocking/);
    assert.match(r.out, /git merge origin\/shared/, 'it still says how to include that work');
    assert.ok(!/DEPLOY BLOCKED/.test(r.out));
  } finally { cleanup(s); }
});

test('ALLOWS a branch restarted from main after a squash merge', () => {
  // THE FALSE POSITIVE THAT FORCED THE RULE ABOVE TO CHANGE, as its own regression test.
  // Squash-merging rewrites the branch's commits into one new commit on main and discards the
  // link, so git cannot tell that the branch's content is already in the trunk. Restart the branch
  // from main — this repo's standard post-merge workflow — and the stale remote branch ref makes
  // the fresh, perfectly current checkout look "behind". Blocking here blocked the normal case.
  const s = scenario();
  try {
    git(s.clone, 'checkout', '-q', '-b', 'claude/feature');
    commit(s.clone, 'feature work');
    git(s.clone, 'push', '-q', '-u', 'origin', 'claude/feature');

    // The PR is squash-merged: main gains ONE new commit carrying that content, unrelated by id.
    advanceTrunk(s, 'feature work (#42)');

    // Standard post-merge restart: same branch name, rebuilt from the trunk.
    git(s.clone, 'fetch', '-q', 'origin');
    git(s.clone, 'checkout', '-q', '-B', 'claude/feature', 'origin/main');

    const r = runGuard(s.clone);
    assert.equal(r.code, 0, 'a checkout level with the trunk is never stale, whatever a branch ref says');
    assert.match(r.out, /up to date with origin\/main/);
    assert.match(r.out, /Expected right after a squash merge/);
    assert.ok(!/DEPLOY BLOCKED/.test(r.out));
  } finally { cleanup(s); }
});

// ---------------------------------------------------------------------------
// What must still be allowed — a guard that blocks normal work gets disabled
// ---------------------------------------------------------------------------

test('ALLOWS a checkout level with the trunk', () => {
  const s = scenario();
  try {
    const r = runGuard(s.clone);
    assert.equal(r.code, 0);
    assert.match(r.out, /up to date with origin\/main/);
  } finally { cleanup(s); }
});

test('ALLOWS a branch that is AHEAD — that is what deploying is', () => {
  const s = scenario();
  try {
    git(s.clone, 'checkout', '-q', '-b', 'claude/new-work');
    commit(s.clone, 'my unpublished fix');
    const r = runGuard(s.clone);
    assert.equal(r.code, 0, 'unpushed work ahead of the trunk is the normal deploy');
    assert.match(r.out, /1 to publish/);
  } finally { cleanup(s); }
});

test('ALLOWS a dirty tree — deploy then commit is the normal order here', () => {
  const s = scenario();
  try {
    writeFileSync(join(s.clone, 'file.txt'), 'uncommitted edit');
    const r = runGuard(s.clone);
    assert.equal(r.code, 0);
  } finally { cleanup(s); }
});

// ---------------------------------------------------------------------------
// Fail-open, deliberately — but only where the answer is genuinely unknowable
// ---------------------------------------------------------------------------

test('FAILS OPEN when there is no remote to compare against', () => {
  // An unreachable GitHub must never block a deploy: the guard would then be the outage.
  const s = scenario();
  try {
    const solo = join(s.tmp, 'solo');
    git(s.tmp, 'init', '--initial-branch=main', solo);
    commit(solo, 'local only');
    const r = runGuard(solo);
    assert.equal(r.code, 0);
    assert.match(r.out, /skipped/);
  } finally { cleanup(s); }
});

test('FAILS OPEN outside a git checkout', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'anejo-guard-nogit-'));
  try {
    const r = runGuard(tmp);
    assert.equal(r.code, 0);
    assert.match(r.out, /skipped \(not a git checkout\)/);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('a clone with origin/HEAD unset still checks against main, not nothing', () => {
  // origin/HEAD is absent on --single-branch clones and older ones. The fallback must be a real
  // comparison; treating "no origin/HEAD" as unknowable would reopen the hole by another door.
  const s = scenario();
  try {
    git(s.clone, 'remote', 'set-head', 'origin', '--delete');
    advanceTrunk(s);
    const r = runGuard(s.clone);
    assert.equal(r.code, 1, 'still compared against origin/main');
    assert.match(r.out, /BEHIND origin\/main/);
  } finally { cleanup(s); }
});
