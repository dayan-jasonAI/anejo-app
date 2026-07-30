// Regenerate functions/_lib/brand_context.js from docs/brand-standards-brief.md.
//
// Pages Functions cannot read repo files at runtime, so the brief's marketing-relevant sections
// are baked into a module. This script is the ONLY way that module should change — edit the doc,
// run this, commit both. A test regenerates and diffs, so a doc edit that skips this step fails
// CI instead of silently shipping a stale brand voice.
//
//   node scripts/build-brand-context.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const DOC = 'docs/brand-standards-brief.md';
const OUT = 'functions/_lib/brand_context.js';

const md = readFileSync(DOC, 'utf8');

/** Everything from a heading line up to the next heading of the same-or-higher level. */
export function section(src, heading) {
  const start = src.indexOf(heading);
  if (start === -1) throw new Error(`Section not found in brief: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  const rest = src.slice(start + heading.length);
  const next = rest.search(new RegExp(`^#{1,${level}} `, 'm'));
  return (heading + (next === -1 ? rest : rest.slice(0, next))).trim();
}

const SECTIONS = [
  '## 1. Who we are',
  '## 2. Vision & mission',
  '## 4. The Golden Rule',
  '### Photo standard',
  '## 11. Brand voice',
];

const body = SECTIONS.map((h) => section(md, h)).join('\n\n');

const out = `// GENERATED — do not edit by hand. Source: ${DOC}
// Regenerate with: node scripts/build-brand-context.mjs
//
// This is the brand's own voice, standards and identity, verbatim from the brief Dayan wrote —
// not a paraphrase. The first planner run worked from a one-line summary instead of this, and the
// result read as off-brand to the owner within a day. The lesson: the brand document IS the
// context; summarising it is how the brand drifts.

export const BRAND_CONTEXT = ${JSON.stringify(body)};

export const BRAND_SECTIONS = ${JSON.stringify(SECTIONS)};
`;

writeFileSync(OUT, out);
console.log(`wrote ${OUT} (${body.length} chars from ${SECTIONS.length} sections)`);
