#!/usr/bin/env node
// Generate functions/_lib/track-allowlist.js from .telemetry/tracking-plan.yaml.
//
// WHY GENERATED, NOT HAND-WRITTEN
// /api/hub/track accepted ANY event name until 2026-08-04. That is how the HUB ended up with 57
// events nobody had planned. An allowlist fixes it only if it cannot drift from the plan — a
// hand-maintained copy would be a second source of truth, and the second source is always the
// stale one. So the plan is the source and this file is derived.
//
//   node scripts/gen-track-allowlist.mjs           → write the file
//   node scripts/gen-track-allowlist.mjs --check   → exit 1 if the committed file is stale
//
// --check runs in the test suite, so a plan edit that forgets to regenerate fails before deploy.
//
// Deliberately dependency-free: it reads one flow-sequence line rather than pulling in a YAML
// parser, because this has to run in predeploy on any machine.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = join(ROOT, '.telemetry', 'tracking-plan.yaml');
const OUT = join(ROOT, 'functions', '_lib', 'track-allowlist.js');

function readAllowed() {
  const src = readFileSync(PLAN, 'utf8');
  const m = src.match(/^\s*currently_allowed:\s*\[([^\]]*)\]/m);
  if (!m) throw new Error('tracking-plan.yaml: client_allowlist.currently_allowed not found');
  const names = m[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  if (!names.length) throw new Error('tracking-plan.yaml: client_allowlist.currently_allowed is empty');
  const bad = names.filter((n) => !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(n));
  if (bad.length) throw new Error(`not object.action snake_case: ${bad.join(', ')}`);
  return names.sort();
}

function render(names) {
  return `// GENERATED FILE — do not edit by hand.
// Source: .telemetry/tracking-plan.yaml → client_allowlist.currently_allowed
// Regenerate: node scripts/gen-track-allowlist.mjs
// A stale copy fails the test suite (test/telemetry/allowlist.test.js), which gates deploy.
//
// These are the ONLY event names the browser may post to /api/hub/track. Server-side capture()
// calls are not affected — they are code-reviewed. This guards the one rail that accepts a name
// from outside the codebase.
// Files under functions/_lib are not routed.

export const CLIENT_ALLOWED = Object.freeze([
${names.map((n) => `  '${n}',`).join('\n')}
]);

const SET = new Set(CLIENT_ALLOWED);

/** True if the browser is permitted to emit this event name. */
export function isClientEventAllowed(name) {
  return typeof name === 'string' && SET.has(name);
}
`;
}

const names = readAllowed();
const next = render(names);

if (process.argv.includes('--check')) {
  let current = '';
  try { current = readFileSync(OUT, 'utf8'); } catch { /* missing counts as stale */ }
  if (current !== next) {
    console.error('✗ track-allowlist.js is STALE. Run: node scripts/gen-track-allowlist.mjs');
    process.exit(1);
  }
  console.log(`✓ track-allowlist.js in sync (${names.length} client events)`);
} else {
  writeFileSync(OUT, next);
  console.log(`✓ wrote ${OUT} (${names.length} client events)`);
}
