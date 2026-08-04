#!/usr/bin/env node
// Check what is ACTUALLY LIVE against the trunk. A detector, not a guard.
//
// WHY A DETECTOR AND NOT MORE GUARD. scripts/predeploy-guard.mjs refuses to publish a stale
// checkout, but it only runs through npm's `predeploy` hook. wrangler has no pre-deploy hook for
// Pages (`build` is not in supportedPagesConfigFields, checked against 3.114.17), so a bare
// `npx wrangler pages deploy` — or a global wrangler, or `npx wrangler@3`, which ignores
// node_modules entirely — reaches Cloudflare without passing anything of ours. Prevention ends at
// the documented path. This reads the result instead, so it does not care how the deploy was
// invoked.
//
// WHAT NORMAL LOOKS LIKE HERE. This project is git-connected: pushing to main auto-deploys
// (`deployment_trigger.type === 'github:push'`). So the healthy steady state is "live commit ==
// origin/main", and a manual `ad_hoc` deployment is by definition an override of that.
//
// WHAT IT LOOKS FOR
//   reverted   — the live commit is a strict ANCESTOR of the commit that was live before it.
//                Production moved backwards; published work is no longer on the site. This is the
//                exact shape of the 2026-08-04 near-miss (a checkout 69 commits behind main
//                reaching the deploy command) and it is a hard failure.
//   diverged   — live and previously-live commits are unrelated. Published from another line of
//                history; same class, different mechanism.
//   off_trunk  — the live commit is not an ancestor of origin/<trunk>. Production is running code
//                that is not on the trunk, so nobody can reproduce what is serving. On 2026-08-04
//                this was true for hours: 926a934 was live while main had been rebased past it.
//   dirty      — the deployment recorded commit_dirty, so live content matches NO commit exactly.
//   behind     — live is a clean ancestor of the trunk, N commits back. Informational: with
//                auto-deploy this is just the gap between a push and its build.
//
// Fails OPEN (exit 0, and says so out loud) when it genuinely cannot tell: no API token, no
// network, no commit metadata on the deployment, or a commit this clone has never fetched. A
// detector that silently skips is the failure it was built to catch, so every skip prints.
// `--strict` turns skips and warnings into a non-zero exit, for unattended use.
import { execFileSync } from 'node:child_process';

const API = 'https://api.cloudflare.com/client/v4';

// ---------------------------------------------------------------------------
// The decision, as a pure function — no network, no git, so it can be tested
// against fixtures for shapes that are impractical to reproduce for real
// (a revert, a divergence, a dirty deploy).
// ---------------------------------------------------------------------------
//   deployments: newest-first [{ id, commit, dirty, trigger, created }]
//   git: { known(sha) -> bool, isAncestor(a, b) -> bool, countBetween(a, b) -> number }
export function assess({ deployments, trunkRef, git }) {
  const findings = [];
  const add = (level, code, message) => findings.push({ level, code, message });

  const live = deployments[0];
  if (!live) return { findings: [{ level: 'skip', code: 'no_deployments', message: 'no successful production deployment found' }] };
  if (!live.commit) {
    add('skip', 'no_commit_metadata', `live deployment ${live.id} carries no commit hash (direct upload from a non-git directory?)`);
    return { findings };
  }
  if (!git.known(live.commit)) {
    add('skip', 'unknown_commit', `live commit ${short(live.commit)} is not in this clone — fetch it, or this check cannot judge what is serving`);
    return { findings };
  }

  if (live.dirty) {
    add('warn', 'dirty', `live deployment was published from a DIRTY tree at ${short(live.commit)} — what is serving matches no commit exactly`);
  }
  if (live.trigger && live.trigger !== 'github:push') {
    add('warn', 'manual_deploy', `live deployment was ${live.trigger}, not an auto-deploy from ${trunkRef} — someone published by hand`);
  }

  // Did production move BACKWARDS? Compare against the previous distinct live commit.
  const prev = deployments.slice(1).find((d) => d.commit && d.commit !== live.commit);
  if (prev && git.known(prev.commit)) {
    if (git.isAncestor(live.commit, prev.commit)) {
      add('fail', 'reverted', `PRODUCTION WENT BACKWARDS: ${short(live.commit)} is an ancestor of ${short(prev.commit)}, which was live before it. Work that had been published is no longer on the site.`);
    } else if (!git.isAncestor(prev.commit, live.commit)) {
      add('fail', 'diverged', `live ${short(live.commit)} and previously-live ${short(prev.commit)} are unrelated — production was published from a different line of history`);
    }
  }

  // Is what is serving even on the trunk?
  if (!git.known(trunkRef)) {
    add('skip', 'no_trunk', `${trunkRef} does not resolve in this clone`);
    return { findings };
  }
  if (!git.isAncestor(live.commit, trunkRef)) {
    add('fail', 'off_trunk', `live ${short(live.commit)} is NOT an ancestor of ${trunkRef} — production is running code that is not on the trunk, so it cannot be reproduced from git`);
  } else {
    const behind = git.countBetween(live.commit, trunkRef);
    if (behind > 0) {
      add('info', 'behind', `live ${short(live.commit)} is ${behind} commit(s) behind ${trunkRef} — normal between a push and its build; investigate if it does not clear`);
    } else {
      add('ok', 'current', `live ${short(live.commit)} is exactly ${trunkRef}`);
    }
  }
  return { findings };
}

const short = (sha) => String(sha).slice(0, 7);

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------
const sh = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const gitOracle = {
  known: (rev) => { try { sh(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]); return true; } catch { return false; } },
  isAncestor: (a, b) => {
    try { execFileSync('git', ['merge-base', '--is-ancestor', a, b], { stdio: 'ignore' }); return true; }
    catch { return false; }
  },
  countBetween: (a, b) => { try { return Number(sh(['rev-list', '--count', `${a}..${b}`])) || 0; } catch { return 0; } },
};

function trunkBranch() {
  try {
    const name = sh(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).replace(/^refs\/remotes\/origin\//, '');
    if (name) return name;
  } catch { /* unset */ }
  return 'main';
}

async function fetchDeployments({ token, account, project }) {
  const url = `${API}/accounts/${account}/pages/projects/${project}/deployments?env=production&per_page=10`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Cloudflare API returned ${res.status}`);
  const body = await res.json();
  if (!body.success) throw new Error('Cloudflare API reported failure');
  return (body.result || [])
    .filter((d) => d.latest_stage && d.latest_stage.status === 'success')
    .map((d) => ({
      id: String(d.id || '').slice(0, 8),
      created: d.created_on,
      commit: (d.deployment_trigger && d.deployment_trigger.metadata && d.deployment_trigger.metadata.commit_hash) || null,
      dirty: !!(d.deployment_trigger && d.deployment_trigger.metadata && d.deployment_trigger.metadata.commit_dirty),
      trigger: (d.deployment_trigger && d.deployment_trigger.type) || null,
    }));
}

async function main() {
  const strict = process.argv.includes('--strict');
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const project = process.env.PAGES_PROJECT || 'anejo-app';

  if (!token || !account) {
    return finish([{ level: 'skip', code: 'no_credentials', message: 'CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set — cannot read what is live' }], strict);
  }

  // The live commit may post-date this clone's last fetch; without it every comparison is a skip.
  try { execFileSync('git', ['fetch', '--quiet'], { stdio: 'ignore', timeout: 20000 }); } catch { /* offline: judged on what we have */ }

  let deployments;
  try { deployments = await fetchDeployments({ token, account, project }); }
  catch (e) { return finish([{ level: 'skip', code: 'api_unreachable', message: `could not read deployments (${e.message})` }], strict); }

  const { findings } = assess({ deployments, trunkRef: `origin/${trunkBranch()}`, git: gitOracle });
  return finish(findings, strict);
}

function finish(findings, strict) {
  const icon = { fail: '✖', warn: '!', info: '·', skip: '?', ok: '✓' };
  for (const f of findings) console[f.level === 'fail' ? 'error' : 'log'](`${icon[f.level] || '·'} live deploy: ${f.message}`);

  const failed = findings.some((f) => f.level === 'fail');
  const soft = findings.some((f) => f.level === 'warn' || f.level === 'skip');
  if (failed) {
    console.error('\n  Production does not match the trunk. Re-deploy from an up-to-date checkout:\n    git pull --ff-only && npm run deploy\n');
    process.exit(1);
  }
  if (strict && soft) process.exit(1);
}

// Only run when invoked directly — importing this for its assess() must not fire a network call.
if (process.argv[1] && process.argv[1].endsWith('verify-live-deploy.mjs')) {
  main().catch((e) => { console.log(`? live deploy: skipped (${e.message})`); });
}
