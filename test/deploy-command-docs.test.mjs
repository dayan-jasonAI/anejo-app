// There is exactly ONE guarded way to publish this project — `npm run deploy` — and this file
// keeps it that way.
//
// WHY. scripts/predeploy-guard.mjs refuses to publish a checkout that is behind origin/main. npm
// runs it through the `predeploy` hook, so it only fires for `npm run deploy`. A bare
// `npx wrangler pages deploy public --project-name=anejo-app` never reaches it — wrangler has no
// pre-deploy hook for Pages (`build` is not in wrangler's supportedPagesConfigFields, verified
// against wrangler 3.114.17), so there is nothing to hang the check on at the tool level.
//
// That would be a footnote if the unguarded command were hard to reach. It was not: it was the
// FIRST command in this repo's own CLAUDE.md, and in docs/INSTAGRAM_TOKEN_SWAP.md, so anyone
// following the documentation — human or agent — bypassed the guard by doing as they were told.
// On 2026-08-04 that is exactly what happened. The guard has been fixed twice now; neither fix
// mattered on the path people actually take.
//
// So the documentation IS the control surface, and it gets a test like any other control surface.
// A mention of `pages deploy` is allowed only where it is guarded or where the file is explaining
// the rule rather than instructing someone to run it.
//
// WHAT THIS DOES NOT DO — stated plainly so it is not mistaken for full coverage. Nothing here
// stops someone typing `npx wrangler pages deploy` by hand, or using a globally installed
// wrangler, or `npx wrangler@3` (which ignores node_modules entirely). Prevention ends at the
// documented path. That half is covered from the other side by scripts/verify-live-deploy.mjs,
// which reads what is actually live and compares it to the trunk — `npm run verify:deploy`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// fileURLToPath, not `.pathname`: the latter is percent-encoded, so a checkout under a path with
// a space (e.g. "Dayan Workspace" — real, on the machine this runs on) turns into a literal %20
// and every read below ENOENTs. Same bug, same fix, as predeploy-guard.test.mjs and
// marketing-role.test.js — found together 2026-08-15 auditing why `npm run deploy` couldn't run.
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[/\\]$/, '');
const read = (rel) => readFileSync(`${ROOT}/${rel}`, 'utf8');

// Every text file git can see — TRACKED AND UNTRACKED (minus ignored), from git itself.
//
// The untracked half is not decoration. This scan first shipped as `ls-files` alone, and a new
// file added in the same session passed the suite right up until it was committed — green for the
// reason the check exists to prevent, on the very commit that introduced it. Anything a `git add`
// would sweep in gets scanned now, so the answer does not depend on when you happen to run it.
function scannableTextFiles() {
  const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' });
  return [...new Set(out.split('\0').filter((f) => f && /\.(md|mjs|js|json|sh|ya?ml|toml|txt)$/.test(f)))];
}

// Files that DESCRIBE the rule rather than tell anyone to run the command. They still get scanned
// for the pattern; they are simply allowed to contain it.
const EXPLAINERS = new Set([
  'scripts/predeploy-guard.mjs',
  'scripts/verify-live-deploy.mjs',
  'test/deploy-command-docs.test.mjs',
]);

// A line is fine if it routes through the guarded entry point or invokes the guard itself.
const guardedLine = (line) => /npm run deploy/.test(line) || /predeploy-guard/.test(line);

test('the guard still runs before every `npm run deploy`', () => {
  // If this ever stops being true, every other assertion here is decoration.
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.scripts.predeploy, 'a predeploy hook must exist');
  assert.match(pkg.scripts.predeploy, /predeploy-guard\.mjs/, 'predeploy runs the guard');
  assert.match(pkg.scripts.deploy, /wrangler pages deploy/, 'deploy is the wrangler call npm wraps');
});

test('no file tells anyone to run an UNGUARDED wrangler deploy', () => {
  // The regression: CLAUDE.md said `npx wrangler pages deploy public`, so following the docs meant
  // skipping the guard. Docs are the control surface here — this is the check on them.
  const offenders = [];
  for (const file of scannableTextFiles()) {
    if (EXPLAINERS.has(file)) continue;
    const lines = read(file).split('\n');
    lines.forEach((line, i) => {
      if (!/pages deploy/.test(line)) return;
      // package.json's own `deploy` script IS the wrangler call — npm guards it via predeploy.
      if (file === 'package.json' && /"deploy"\s*:/.test(line)) return;
      if (guardedLine(line)) return;
      offenders.push(`${file}:${i + 1}  ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `unguarded deploy command(s) found — route these through \`npm run deploy\`:\n${offenders.join('\n')}`);
});

test('the two documented deploy paths both name the guarded entry point', () => {
  // Pinned by content, not just by absence: a doc that simply deleted the command would pass the
  // check above while leaving the reader with no way to deploy at all.
  assert.match(read('CLAUDE.md'), /npm run deploy/, 'CLAUDE.md points at the guarded command');
  assert.match(read('CLAUDE.md'), /never a bare/i, 'and says why the bare form is wrong');
  assert.match(read('docs/INSTAGRAM_TOKEN_SWAP.md'), /npm run deploy/);
});
