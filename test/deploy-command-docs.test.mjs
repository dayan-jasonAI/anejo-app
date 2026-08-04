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
// documented path. Catching the rest means checking the LIVE deployment's source commit against
// origin/main after the fact — a detector, not a guard, and it does not exist yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (rel) => readFileSync(`${ROOT}/${rel}`, 'utf8');

// Every tracked text file, from git itself — so a new doc cannot slip in unscanned.
function trackedTextFiles() {
  const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' });
  return out.split('\0').filter((f) => f && /\.(md|mjs|js|json|sh|ya?ml|toml|txt)$/.test(f));
}

// Files that DESCRIBE the rule rather than tell anyone to run the command. They still get scanned
// for the pattern; they are simply allowed to contain it.
const EXPLAINERS = new Set([
  'scripts/predeploy-guard.mjs',
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
  for (const file of trackedTextFiles()) {
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
