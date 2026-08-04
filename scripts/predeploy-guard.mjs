#!/usr/bin/env node
// Refuse to deploy a checkout that is BEHIND the published trunk.
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
// WHAT "BEHIND" IS MEASURED AGAINST — and the hole this closes. The base is the TRUNK
// (origin/main), because that is what production is deployed from. It used to be
// origin/<current-branch>, which quietly meant:
//   · on a feature branch with no pushed counterpart, `rev-list HEAD..origin/<branch>` threw and
//     the guard skipped itself entirely — precisely the checkout most likely to be stale;
//   · on a detached HEAD it bailed before checking anything, though a detached HEAD 69 commits
//     behind the trunk reverts production exactly as hard as an attached one.
// On 2026-08-04 a session reached the deploy command from a branch 69 commits behind main whose
// name had never been pushed. The guard printed "skipped (no origin/<branch> to compare against)"
// and would have reverted 130 files of released work. A guard whose default is to excuse itself on
// the unusual case is not a guard — the unusual case is the whole population it exists for.
//
// Still fails OPEN on what it genuinely cannot determine — not a git checkout, no network, no
// origin trunk to compare against. A guard that blocks deploys when GitHub is unreachable would be
// worse than the problem it prevents. That set is now much smaller than it was.
//
// KNOWN LIMIT, stated so nobody mistakes this for full coverage: npm runs this via the `predeploy`
// hook, so it only fires for `npm run deploy`. A bare `npx wrangler pages deploy public
// --project-name=anejo-app` — the form CLAUDE.md documents, and the form used on 2026-08-04 —
// never reaches this file. Deploy through `npm run deploy` if you want the check.
import { execFileSync } from 'node:child_process';

const sh = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

// The branch production is deployed from. Read it off the remote rather than assuming 'main', but
// fall back to 'main' — origin/HEAD is unset on plenty of clones (--single-branch, older clones,
// worktrees made before the ref existed), and that must not turn into a skipped check.
function trunkBranch() {
  try {
    const name = sh(['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']).replace(/^refs\/remotes\/origin\//, '');
    if (name) return name;
  } catch { /* unset — fall through to the default */ }
  return 'main';
}

// How many commits `ref` has that HEAD does not. null means the ref does not resolve here.
function countRange(range) {
  try {
    const n = Number(sh(['rev-list', '--count', range]));
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

function main() {
  let head;
  try { head = sh(['rev-parse', '--abbrev-ref', 'HEAD']); } catch { return ok('not a git checkout'); }
  // A detached HEAD is still worth checking against the trunk — it is unnamed, not current.
  const branch = head === 'HEAD' ? null : head;

  try { execFileSync('git', ['fetch', '--quiet'], { stdio: 'ignore', timeout: 20000 }); }
  catch { return ok('could not reach the remote'); }

  const trunk = trunkBranch();
  const trunkRef = `origin/${trunk}`;
  const behindTrunk = countRange(`HEAD..${trunkRef}`);
  // The one honest unknown left: this clone has no origin trunk at all.
  if (behindTrunk === null) return ok(`no ${trunkRef} to compare against`);

  if (behindTrunk > 0) {
    const fix = (branch === trunk || branch === null)
      ? 'git pull --ff-only'
      : `git merge ${trunkRef}       (or: git rebase ${trunkRef})`;
    return block(behindTrunk, trunkRef, fix);
  }

  // Secondary: a branch that HAS been pushed must not be behind its own counterpart either —
  // someone else may have pushed to it, and this tree would publish without their work.
  if (branch && branch !== trunk) {
    const behindOwn = countRange(`HEAD..origin/${branch}`);
    if (behindOwn !== null && behindOwn > 0) return block(behindOwn, `origin/${branch}`, 'git pull --ff-only');
  }

  const ahead = countRange(`${trunkRef}..HEAD`) || 0;
  const where = branch ? `${branch} is` : 'detached HEAD is';
  console.log(`✓ deploy guard: ${where} up to date with ${trunkRef}${ahead ? ` (${ahead} to publish)` : ''}`);
}

function block(behind, ref, fix) {
  const cwd = process.cwd();
  const missing = (() => {
    try { return sh(['log', '--oneline', `HEAD..${ref}`]).split('\n').slice(0, 5); }
    catch { return []; }
  })();

  console.error(`
✖ DEPLOY BLOCKED — this checkout is ${behind} commit(s) BEHIND ${ref}.

  ${cwd}

  Deploying from here would publish older code over the live site and remove work
  that is already released. Recent commits this copy does not have:

${missing.map((l) => '    · ' + l).join('\n')}

  Fix it:   ${fix}
            (then re-run the deploy)

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
