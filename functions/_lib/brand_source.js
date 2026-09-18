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
    if (r?.success === false || !Array.isArray(r?.results)) throw new Error('Invalid brand read');
    return { rows: r.results, status: r.results.length ? 'ok' : 'empty' };
  } catch { return { rows: [], status: 'unavailable' }; }
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
 * The sections of the brief that govern what a CUSTOMER-FACING agent may say.
 *
 * Aña answers a stranger in under 400 characters, on Haiku, on every inbound DM. Handing her the
 * whole brief would be 25,000 chars of plating geometry and kitchen production specs to decide a
 * two-sentence reply — 3.8x the tokens for context she cannot use. These five are the ones that
 * actually constrain her: who we are (§1), the Golden Rule (§4), allergens (§8), voice (§11) and
 * the non-negotiables (§12). Measured at 6,701 chars against the live doc.
 *
 * §6 Menu is DELIBERATELY absent. She already receives live prices and availability from
 * menu_items; the brief's menu section is prose that can lag a price change by however long it
 * takes the owner to edit two documents. One source per fact.
 */
export const CUSTOMER_FACING_SECTIONS = [1, 4, 8, 11, 12];

/**
 * Keep only the numbered `## N.` sections asked for.
 *
 * Numbered headings are the selector because the rest of the codebase already refers to this
 * document that way (§8, §10, §11 appear in comments and test names), and because an unnumbered
 * `## ` heading is, by construction, not part of the ratified brief — the Studio's proposals are
 * the only unnumbered sections there are, so they can never survive this filter either.
 *
 * Returns '' when nothing matches. That is a signal, not an answer: loadBrand() treats an empty
 * slice as "the document has been renumbered under us" and falls back to the whole brief rather
 * than handing a customer-facing agent a brief with no allergen rules in it.
 */
export function onlySections(body, numbers) {
  const want = new Set(numbers.map(Number));
  const kept = [];
  let keeping = false;
  for (const line of String(body).split('\n')) {
    if (/^##\s/.test(line)) {
      const m = /^##\s+(\d+)\s*\./.exec(line);
      keeping = !!m && want.has(Number(m[1]));
    }
    if (keeping) kept.push(line);
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
export async function loadBrand(env, { maxChars = 32000, sections = null } = {}) {
  // Narrow the document to the caller's sections, if it asked for any. An empty result means the
  // numbering moved, so the caller gets the whole brief rather than a confidently empty one.
  const narrow = (body) => {
    if (!sections) return body;
    return onlySections(body, sections) || body;
  };

  maxChars = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 32000;
  const read = await rows(env,
    "SELECT id, title, body, updated_at FROM docs WHERE active = 1 AND doc_type = 'brand' ORDER BY updated_at DESC LIMIT 10");
  const candidates = read.rows.map(d => {
    const approved = withoutProposals(d.body || '');
    const body = narrow(approved);
    return { ...d, text: body ? `### ${d.title || 'Brand & Standards Brief'}\n${body}` : '',
      section_fallback: !!sections && !onlySections(approved, sections) && !!approved };
  }).filter(d => d.text);
  const source = candidates.length ? 'd1' : 'repo';
  const sourceText = candidates.length ? candidates.map(d => d.text).join('\n\n') : narrow(BRAND_CONTEXT);
  const text = sourceText.slice(0, maxChars);
  let offset = 0;
  const supplied = [];
  for (const doc of candidates) {
    if (offset < text.length) supplied.push({ id: doc.id ?? null, updated_at: doc.updated_at ?? null,
      supplied_chars: Math.min(doc.text.length, text.length - offset), original_chars: doc.text.length,
      section_fallback: doc.section_fallback });
    offset += doc.text.length + 2;
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return { text, source, receipt: {
    schema: 1, source, read_status: read.status,
    fallback_reason: source === 'repo' ? (read.status === 'unavailable' ? 'live_read_unavailable' : 'no_usable_live_text') : null,
    documents: supplied,
    rendered_sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''),
    original_chars: sourceText.length, supplied_chars: text.length, truncated: text.length < sourceText.length,
    requested_sections: sections, selection_limit: 10, selection_may_be_limited: read.rows.length >= 10,
    section_fallback: source === 'repo' ? !!sections && !onlySections(BRAND_CONTEXT, sections) : supplied.some(d => d.section_fallback),
  } };
}
