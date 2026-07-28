#!/usr/bin/env node
// Refuse to deploy a checkout that is BEHIND origin/main.
//
// WHY THIS EXISTS. There is more than one clone of this repo on this machine, and every one of them
// carries the same `wrangler pages deploy --project-name=anejo-app` and the same production D1
// database id. A second clone was found sitting 108 commits behind — July 13 code — and running
// `npm run deploy` from it would have pushed that over the live site, erasing the promo engine, the
// knowledge base, the broadcast layer and every money-path fix, with no warning and no undo.
//
// Being AHEAD is normal (that is what deploying is). Being DIRTY is normal (deploy then commit).
// Being BEHIND means someone else's work is already published and this checkout would revert it.
// That is the only case worth blocking, so it is the only case blocked.
//
// Fails OPEN on anything it cannot determine — no network, no git, a detached HEAD. A guard that
// blocks deploys when GitHub is unreachable would be worse than the problem it prevents.
import { execFileSync } from 'node:child_process';

const sh = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function main() {
  let branch;
  try { branch = sh(['rev-parse', '--abbrev-ref', 'HEAD']); } catch { return ok('not a git checkout'); }
  if (branch === 'HEAD') return ok('detached HEAD');

  try { execFileSync('git', ['fetch', '--quiet'], { stdio: 'ignore', timeout: 20000 }); }
  catch { return ok('could not reach the remote'); }

  let behind;
  try {
    behind = Number(sh(['rev-list', '--count', `HEAD..origin/${branch}`]));
  } catch { return ok(`no origin/${branch} to compare against`); }

  if (!Number.isFinite(behind) || behind === 0) {
    const ahead = (() => { try { return Number(sh(['rev-list', '--count', `origin/${branch}..HEAD`])); } catch { return 0; } })();
    console.log(`✓ deploy guard: up to date with origin/${branch}${ahead ? ` (${ahead} to publish)` : ''}`);
    return;
  }

  const cwd = process.cwd();
  const missing = (() => {
    try { return sh(['log', '--oneline', `HEAD..origin/${branch}`]).split('\n').slice(0, 5); }
    catch { return []; }
  })();

  console.error(`
✖ DEPLOY BLOCKED — this checkout is ${behind} commit(s) BEHIND origin/${branch}.

  ${cwd}

  Deploying from here would publish older code over the live site and remove work
  that is already released. Recent commits this copy does not have:

${missing.map((l) => '    · ' + l).join('\n')}

  Fix it:   git pull --ff-only    (then re-run the deploy)

  If you meant to deploy a different copy, check you are in the right directory —
  every clone of this repo deploys to the SAME production project.
`);
  process.exit(1);
}

function ok(reason) {
  // Deliberately permissive: say why the check was skipped rather than silently passing.
  console.log(`✓ deploy guard: skipped (${reason})`);
}

main();
