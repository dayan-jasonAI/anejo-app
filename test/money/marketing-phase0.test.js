// Phase 0 of the marketing team: unblock the owner.
//
// Three gaps, each found by the owner trying to use the product:
//   · "You can edit drafts" was false — the API op existed, the page had no field.
//   · Attaching an image meant pasting an R2 key nobody has on their phone.
//   · The planner had never read the brand brief, and the owner called the output off-brand
//     within a day. He was right: it was working from a one-line summary I wrote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { section } from '../../scripts/build-brand-context.mjs';
import { BRAND_CONTEXT, BRAND_SECTIONS } from '../../functions/_lib/brand_context.js';

// 2026-08-04: the Social compose form and post cards now live inside the Create > Instagram tab
// of the unified marketing.html workspace (see that file's own header comment).
const PAGE = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');
const UPLOAD = readFileSync(new URL('../../functions/api/hub/owner/social-upload.js', import.meta.url), 'utf8');
const AUTO = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');
const BRIEF = readFileSync(new URL('../../docs/brand-standards-brief.md', import.meta.url), 'utf8');

// ---------- the planner reads the owner's brief, not my summary ----------

test('the generated brand context matches the doc — drift fails here', () => {
  // The module is baked because Functions cannot read repo files at runtime. Editing the doc
  // without regenerating would silently ship a stale brand voice; this test makes that loud.
  const expected = BRAND_SECTIONS.map((h) => section(BRIEF, h)).join('\n\n');
  assert.equal(BRAND_CONTEXT, expected, 'run: node scripts/build-brand-context.mjs');
});

test('the context carries the sections that define the brand, verbatim', () => {
  for (const marker of [
    '40% protein / 30% carbs / 30% fat',       // the Golden Rule
    'Premium but not arrogant',                 // voice
    'No cheap takeout look',                    // photo standard
    'never sound like generic meal prep',       // anti-voice
  ]) assert.ok(BRAND_CONTEXT.includes(marker), `missing: ${marker}`);
});

test('the planner prompt is built FROM the brief and defers to it', () => {
  // The planner no longer keeps its own copy of BRAND_CONTEXT — it shares ONE brand loader with
  // the Team Lead and the Brand Auditor (functions/_lib/brand_source.js), so an owner edit in the
  // HUB reaches all three the same run. brand_context.js/BRAND_CONTEXT is still the fallback
  // FLOOR inside that shared loader for a fresh/empty database — see brand_source.js itself.
  assert.match(AUTO, /import \{ loadBrand \} from '\.\/brand_source\.js'/, 'planner must import the SHARED loader');
  assert.match(AUTO, /await loadBrand\(env, \{ maxChars: PLANNER_BRAND_BUDGET \}\)/, 'and must actually CALL it — an unused import is not wiring');
  assert.match(AUTO, /=== AÑEJO BRAND BRIEF \(excerpts\) ===/);
  assert.match(AUTO, /Follow it over any instinct of your own/);
  // The hand-written one-liner it replaces must be gone — two voices is worse than one.
  assert.ok(!AUTO.includes('warm, family-rooted, quietly confident'), 'my summary voice removed');
});

test('image briefs are bound to the Photo standard and claims to the Golden Rule', () => {
  assert.match(AUTO, /image_brief you write MUST comply with the Photo standard/);
  assert.match(AUTO, /approximate ranges, never medical claims/);
});

// ---------- upload: a phone photo becomes a media key ----------

test('the page and the endpoint agree on one contract', () => {
  // The first version shipped as multipart on a different URL than the page called — an upload
  // that would 404 at the exact moment the owner picked a photo.
  assert.match(PAGE, /Hub\.api\('\/api\/hub\/owner\/social-upload'/);
  assert.match(UPLOAD, /data_url/);
});

test('JPEG is verified by MAGIC BYTES, never by the label', () => {
  // The data-URL mime string is browser-written; the publish path refuses non-.jpg keys, so a
  // mislabelled PNG accepted here would create an upload that can never be posted.
  assert.match(UPLOAD, /JPEG_MAGIC = \[0xff, 0xd8, 0xff\]/);
  assert.match(UPLOAD, /JPEG_MAGIC\.every/);
  assert.match(UPLOAD, /not a JPEG/);
});

test('upload is gated to the marketing desk and size-capped on the SERVER', () => {
  // The page's 5MB check is convenience; a crafted request skips the page entirely.
  assert.match(UPLOAD, /requireRole\(request, env, MARKETING_DESK\)/);
  assert.match(UPLOAD, /bin\.length > MAX_BYTES/);
});

test('uploads land under studio/ with a random name, content-typed as JPEG', () => {
  // The literal grew an optional `_<role>` suffix (see social-upload.js's header — the branding
  // tool re-uploads a client-composited photo through this route and needs to carry the source
  // slide's role forward), but a plain phone-photo upload with no role still gets the exact old
  // shape: `role` is '' when not sent, and `${'' ? ... : ''}` contributes nothing.
  assert.match(UPLOAD, /`studio\/\$\{ym\}\/\$\{id\('up'\)\}\$\{role \? `_\$\{role\}` : ''\}\.jpg`/);
  assert.match(UPLOAD, /contentType: 'image\/jpeg'/);
});

test('both surfaces can upload: compose form and each planner draft', () => {
  assert.match(PAGE, /id="mpick"/);
  assert.match(PAGE, /data-upload="/);
});

// ---------- the caption is finally editable where the owner works ----------

test('every non-published card carries an editable caption FIELD, wired to the op', () => {
  assert.match(PAGE, /<textarea id="cap_' \+ esc\(p\.id\)/);
  assert.match(PAGE, /data-editcap/);
  assert.match(PAGE, /op: 'edit', id: pid, caption/);
});

test('a published caption is read-only — our copy must match what people actually read', () => {
  assert.match(PAGE, /p\.status === 'published'\s*\?\s*'<div class="cap">/);
});
