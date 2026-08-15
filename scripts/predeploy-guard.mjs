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
// HOW THIS GETS RUN, and the limit that remains. npm runs it via the `predeploy` hook, so it fires
// for `npm run deploy` and nothing else. wrangler has no pre-deploy hook to hang it on — `build` is
// not in wrangler's supportedPagesConfigFields for Pages (checked against 3.114.17) — so a bare
// `npx wrangler pages deploy` cannot be intercepted at the tool.
//
// What WAS fixable: the bare form was the command this repo's own CLAUDE.md and
// docs/INSTAGRAM_TOKEN_SWAP.md told you to run, so following the documentation meant bypassing the
// guard, which is what happened on 2026-08-04. Both now point at `npm run deploy`, and
// test/deploy-command-docs.test.mjs fails if an unguarded command reappears in any tracked file.
//
// NOT COVERED HERE, by construction: typing `npx wrangler pages deploy` by hand, a global
// wrangler, or `npx wrangler@3` (which ignores node_modules). Nothing that runs before a deploy
// can see those. `scripts/verify-live-deploy.mjs` covers them from the other side — it reads what
// is actually live and compares it to the trunk, so it does not care how the deploy was invoked.
// Run it any time with `npm run verify:deploy`; `npm run deploy` runs it automatically afterwards.
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

  // Secondary: a branch that HAS been pushed may be behind its own counterpart — someone else
  // pushed to it, and this tree would deploy without their work.
  //
  // THIS WARNS, IT DOES NOT BLOCK (changed 2026-08-15). It used to block, on the reasoning that
  // this was "the same class of loss, different ref". It is not the same class. What must never
  // happen is REVERTING RELEASED WORK, and released means the TRUNK — a colleague's commit sitting
  // on a shared branch has not been published, so deploying a tree level with the trunk does not
  // erase it. It only means you may be shipping without work you meant to include, which is worth
  // saying and not worth blocking.
  //
  // The cost of getting that wrong was a guard that fires on the NORMAL case: after a squash merge
  // the PR branch is restarted from main, the stale remote branch still points at the pre-squash
  // commits, and git reports the fresh checkout as behind them — content that is already IN the
  // tree, under different commit ids. Squash-merging discards the link and git cannot see through
  // it. This repo squash-merges its PRs, so the old rule blocked the standard workflow, and a gate
  // that fires on the normal case is a gate everyone learns to bypass. Found in aether-launch on
  // this guard's first run there, 2026-08-15, and ported back.
  if (branch && branch !== trunk) {
    const behindOwn = countRange(`HEAD..origin/${branch}`);
    if (behindOwn !== null && behindOwn > 0) {
      console.log(`! deploy guard: ${behindOwn} commit(s) on origin/${branch} are not in this tree.`);
      console.log(`  Not blocking — this tree is level with ${trunkRef}, so nothing RELEASED is lost.`);
      console.log(`  Expected right after a squash merge. If you meant to include that work: git merge origin/${branch}`);
    }
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
