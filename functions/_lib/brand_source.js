// ONE brand source for every AI surface that reasons about Añejo's own brand text.
//
// Before this module existed there were effectively FOUR places a "brand brief" could come from,
// and no two AI surfaces necessarily agreed on which one they were reading (see the audit that
// found this: the Team Lead and the Creative Studio preferred the live, owner-editable copy; the
// content planner and the Brand Auditor were still reading the compiled, deploy-gated snapshot).
// The consequence was concrete, not theoretical: the owner rewrote a section of his brand voice
// in the HUB, watched it change the Studio and the Lead, and the Brand Auditor — the gate that
// scores every draft before he sees it — kept judging against the OLD text, because nothing had
// told it the live copy existed.
//
// This file is the one implementation. Team Lead, the planner, and the Brand Auditor all call
// `loadBrand()`; none of them keeps a private copy, so there is nothing left to drift.
// Files under functions/_lib are NOT routed.
import { BRAND_CONTEXT } from './brand_context.js';

async function rows(env, sql, ...args) {
  try {
    const r = await env.DB.prepare(sql).bind(...args).all();
    return (r && r.results) || [];
  } catch { return []; }
}

/**
 * A proposal is not a standard.
 *
 * The Studio appends kitchen proposals awaiting the owner's review into the SAME `docs` row as the
 * ratified brief, under `## Proposed Studio Brief Change`. That was harmless while every reader of
 * the brief used the compiled snapshot; the moment ANY reader preferred live D1, unapproved content
 * became brief content. One such block was a price list quoting three bowls above what the
 * storefront actually charges — a reader would have been reasoning from the owner's inbox instead
 * of his decisions.
 *
 * Dropped at injection rather than at rest: the owner's approval flow keeps writing proposals into
 * that row, and deleting them there would be editing his document to fix our prompt. Ruling: Dayan
 * 2026-08-02.
 *
 * Level-2 headings decide. Every `## ` re-opens the question, so a proposal's own `### ` subsections
 * and body ride along with it, and the ratified section that follows comes straight back.
 */
const PROPOSAL_HEADING = /^##\s+Proposed Studio Brief Change\b/i;

export function withoutProposals(body) {
  const kept = [];
  let skipping = false;
  for (const line of String(body).split('\n')) {
    if (/^##\s/.test(line)) skipping = PROPOSAL_HEADING.test(line);
    if (!skipping) kept.push(line);
  }
  return kept.join('\n').trim();
}

/**
 * The brand brief, preferring the copy the OWNER can edit.
 *
 * Two copies exist and they are not interchangeable. `docs` rows (doc_type='brand') are live: the
 * Studio grounds on them, and an owner-approved brief change (_lib/brief.js) overwrites them. The
 * compiled BRAND_CONTEXT is a build-time snapshot of docs/brand-standards-brief.md — it ships with
 * the code and cannot move until a deploy. Reading only the snapshot is what made an approval in
 * the HUB change the Studio's brief and not (until this file) every other reader of it: same
 * business, multiple answers depending which file happened to import which constant.
 *
 * So: live wins, snapshot is the floor, and `source` is reported rather than hidden — if the D1
 * doc is thinner than the brief it replaces, the caller needs to SEE 'd1' to know why the brief
 * got vaguer, instead of guessing at the model.
 *
 * `maxChars` is the caller's own budget, not a global one — the Team Lead's chat, the weekly
 * planner, and the per-draft Brand Auditor each carry a different amount of OTHER context in the
 * same prompt, so each passes its own ceiling. Every existing caller's number is preserved from
 * before this file existed; nothing got smaller by moving in here.
 *
 * No role_scope filter: every caller of this function is an internal AI surface reasoning about
 * the owner's own brand, not a staff-facing view that needs to hide anything.
 */
export async function loadBrand(env, { maxChars = 20000 } = {}) {
  const docs = await rows(env,
    "SELECT title, body FROM docs WHERE active = 1 AND doc_type = 'brand' ORDER BY updated_at DESC LIMIT 10");
  const parts = [];
  let used = 0;
  for (const d of docs) {
    const body = withoutProposals(d.body || '');
    if (!body || used >= maxChars) continue;
    const block = `### ${d.title || 'Brand & Standards Brief'}\n${body}`.slice(0, maxChars - used);
    parts.push(block);
    used += block.length;
  }
  return parts.length
    ? { text: parts.join('\n\n'), source: 'd1' }
    : { text: BRAND_CONTEXT, source: 'repo' };
}
