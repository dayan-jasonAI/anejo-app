// The social loop, running without anyone watching.
//
// The account has six posts because writing them is a job nobody has time for. This closes the
// loop: a planner writes the week, a human approves, a timer publishes. Two of those three steps
// are new, and both are the kind that can embarrass a brand in public.
//
// The rules everything below defends:
//   1. NOTHING PUBLISHES WITHOUT A HUMAN. Generated copy reaching a real profile unreviewed is how
//      a business advertises a bowl it stopped selling, in a voice that is not its own.
//   2. IT CANNOT PROMOTE WHAT IT CANNOT SELL. Five of seven bowls are off this week.
//   3. LATE IS WRONG, NOT LATE. Timing is part of a social post in a way it is not for an email.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const AUTO = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');
const TICK = readFileSync(new URL('../../functions/api/hub/admin/social-tick.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
const CRON = readFileSync(new URL('../../cron/worker.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0061_social_planning.sql', import.meta.url), 'utf8');

// ---------- 1. the human gate ----------

test('the planner writes DRAFTS — it has no path to publish', () => {
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /VALUES \(\?,'instagram',\?,NULL,\?,'draft'/, 'every insert lands as a draft');
  assert.ok(!/publishImage|media_publish/.test(planner), 'the planner cannot publish');
  // 0072 amended rule 1: the ONE path from draft to scheduled inside the planner is the trust
  // promotion, and its single UPDATE carries both gates in the same WHERE — the owner's
  // auto_publish toggle (the id only enters the loop via autoPublishCategories) and a PASSED
  // governance audit. Anything else the planner writes stays a draft for a human.
  const promotions = planner.match(/status='scheduled'/g) || [];
  assert.equal(promotions.length, 1, 'exactly one, gated, promotion site');
  assert.match(planner, /SET status='scheduled', updated_at=\? WHERE id=\? AND status='draft' AND audit_status='pass'/);
  assert.match(planner, /autoPublishCategories\(env\)/);
});

test('scheduling is a separate, explicit human action', () => {
  assert.match(API, /if \(op === 'schedule'\)/);
  assert.match(API, /event: 'social\.post_scheduled'/);
});

test('a post with no image cannot be scheduled or published', () => {
  // Otherwise the tick has to decide what to do about it at 11am on a Tuesday, and the only
  // honest answer then is "nothing".
  // Slides live in social_post_media now; the guard counts them instead of reading the legacy
  // column, and the no-image publish refusal lives in the shared path.
  assert.match(API, /if \(!\(await loadPostMedia\(env, postId\)\)\.length\) return bad\('Add a photo before scheduling it\.'/);
  const SHARED_LIB = readFileSync(new URL('../../functions/_lib/social_publish.js', import.meta.url), 'utf8');
  assert.match(SHARED_LIB, /This post has no image yet — add one before publishing\./);
});

test('the tick never even picks up an imageless post', () => {
  // Belt and braces: without this it would churn one through publishing→failed every minute.
  assert.match(TICK, /EXISTS \(SELECT 1 FROM social_post_media m WHERE m\.post_id = social_posts\.id\)/);
});

// ---------- 2. it cannot promote what it cannot sell ----------

test('the planner is built from the LIVE menu, availability included', () => {
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /const onSale = bowls\.filter\(\(it\) => isAvailable\(it\) && isOrderable\(it\)\)/);
  assert.match(planner, /Currently SOLD OUT and must not be mentioned/);
});

test('with nothing on sale it writes nothing, rather than cheerful copy about an empty menu', () => {
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /if \(!onSale\.length\)/);
  assert.match(planner, /reason: 'no_bowls_available'/);
});

test('it is told not to invent prices, discounts or claims', () => {
  assert.match(AUTO, /Do not invent menu items, prices, discounts, delivery areas, deadlines, cutoffs or claims/);
});

test('no AI response means no posts — there is no template fallback', () => {
  // A hand-rolled template post is worse than none: it trains the owner to ignore the queue.
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /if \(!ai \|\| !Array\.isArray\(ai\.data\)\)/);
  assert.match(planner, /reason: env\.ANTHROPIC_API_KEY \? 'no_usable_response' : 'no_api_key'/);
});

test('it tops up to the CADENCE target, scoped to this week, instead of piling on forever', () => {
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /const cadence = await getCadenceConfig\(env\)/);
  assert.match(planner, /const need = Math\.max\(0, cadence\.feed_per_week - Number\(pending \|\| 0\)\)/);
  assert.match(planner, /if \(!need\)/);
  // The bug this replaces: WANT was a flat ceiling on the ENTIRE backlog with no time bound, so
  // an owner behind on approvals kept a permanent pile at/above the ceiling and the planner
  // drafted nothing ever again. The count must be scoped to THIS week's schedule window.
  assert.match(planner, /AND scheduled_at >= \? AND scheduled_at < \?/);
  assert.match(planner, /const weekStart = etWeekStartOf\(date\)/);
});

// ---------- 3. late is wrong ----------

test('a post that comes due too late goes back to draft instead of out', () => {
  assert.match(TICK, /const GRACE_MS = 2 \* 60 \* 60 \* 1000/);
  assert.match(TICK, /if \(late > GRACE_MS\)/);
  assert.match(TICK, /UPDATE social_posts SET status='draft', error=\?/);
});

test('the claim still guards against a timer racing a click', () => {
  assert.match(TICK, /UPDATE social_posts SET status='publishing', error=NULL, updated_at=\? WHERE id=\? AND status='scheduled'/);
  assert.match(TICK, /claim\.meta\.changes !== 1\) continue/);
});

test('one post per tick, not a burst', () => {
  // ~20s each, and a burst reads as a bot and burns the daily cap.
  assert.match(TICK, /const PER_TICK = 1/);
});

test('no Instagram token is a SKIP, not a failure every minute', () => {
  assert.match(TICK, /if \(!igConfigured\(env\)\) return json\(\{ ok: true, skipped: 'instagram_not_configured'/);
});

// ---------- wiring ----------

test('both halves are actually scheduled, not just written', () => {
  assert.match(CRON, /'\/api\/hub\/admin\/social-tick'/);
  assert.match(CRON, /'0 14 \* \* 0': \['social_plan'\]/, 'the planner runs weekly');
  assert.match(AUTO, /IMPLEMENTED = \[.*'social_plan'\]/);
  assert.match(AUTO, /social_plan: socialPlan/);
});

test('the tick is not open to the internet', () => {
  assert.match(TICK, /ctEq\(cronKey, env\.CRON_KEY\)/);
  assert.match(TICK, /requireRole\(request, env, \['owner'\]\)/);
});

test('media_key became nullable without losing the rows that had one', () => {
  // SQLite cannot drop NOT NULL, so the table is rebuilt — and the carry-over lists columns
  // explicitly, because a column-order surprise would shuffle a caption into a media key.
  assert.match(MIG, /media_key\s+TEXT,/);
  assert.match(MIG, /INSERT INTO social_posts_new\s*\n\s*\(id, platform, caption, media_key, public_token/);
  assert.ok(!/INSERT INTO social_posts_new SELECT \*/.test(MIG));
});

test('a planner post is marked as one', () => {
  // So an owner's own draft is never treated as disposable, and tone can be reviewed later.
  assert.match(MIG, /source\s+TEXT NOT NULL DEFAULT 'owner'/);
  assert.match(AUTO, /'planner','system'/);
});

// ---------- a page nobody can reach is a page that does not exist ----------

test('every owner page is reachable — from the nav or from another page', () => {
  // social.html shipped three commits without a nav entry and no inbound link from anywhere. It
  // worked, it was deployed, it was tested — and the only way to open it was to type the URL.
  // This checks reachability rather than nav membership, because plenty of pages are deliberately
  // reached from Overview or a sibling instead of the bottom bar.
  const dir = new URL('../../public/hub/owner/', import.meta.url);
  const nav = readFileSync(new URL('assets/owner.js', dir), 'utf8');
  const pages = readdirSync(dir).filter((f) => f.endsWith('.html') && f !== 'index.html');

  // Everything that could link to an owner page.
  const corpus = [];
  for (const d of ['../../public/hub/owner/', '../../public/hub/', '../../public/hub/kitchen/', '../../public/hub/driver/']) {
    let files = [];
    try { files = readdirSync(new URL(d, import.meta.url)); } catch { files = []; }
    for (const f of files) {
      if (!/\.(html|js)$/.test(f)) continue;
      try { corpus.push({ name: f, text: readFileSync(new URL(d + f, import.meta.url), 'utf8') }); } catch { /* dir */ }
    }
  }

  const unreachable = pages.filter((p) => {
    const href = `/hub/owner/${p}`;
    if (nav.includes(`href: '${href}'`)) return false;
    return !corpus.some((c) => c.name !== p && c.text.includes(href));
  });
  assert.deepEqual(unreachable, [], `unreachable owner pages: ${unreachable.join(', ')}`);
});

test('the social page highlights its own nav tab', () => {
  // It was copied from content.html and kept init('content'), so it would have lit the wrong tab
  // even once linked — and two pages claiming one view key is its own small confusion.
  const PAGE = readFileSync(new URL('../../public/hub/owner/social.html', import.meta.url), 'utf8');
  const NAV = readFileSync(new URL('../../public/hub/owner/assets/owner.js', import.meta.url), 'utf8');
  assert.match(PAGE, /Owner\.init\('social', load\)/);
  assert.match(NAV, /\{ view: 'social', href: '\/hub\/owner\/social\.html'/);
});

test('a caption cannot name a weekday that contradicts its own slot', () => {
  // The first real run wrote "Monday starts with intention" into a THURSDAY slot. Given only an
  // ISO date, the model derived the weekday itself and got it wrong — and a reader has no way to
  // know the post was scheduled, so it just reads as careless.
  assert.match(AUTO, /NEVER name a weekday, date or time of day in the caption unless it matches the day_offset/);
  assert.match(AUTO, /day_offset 0 is today, 1 is \$\{new Date/, 'the weekdays are spelled out rather than derived');
});

test('a draft caption can be corrected before approval', () => {
  // The first planner run wrote "Order for the week before Wednesday" — an ordering deadline that
  // does not exist. Without an edit op the only options were publish-it-wrong or delete-and-rerun.
  assert.match(API, /if \(op === 'edit'\)/);
  assert.match(API, /already live — edit the caption in the Instagram app/);
});

test('the planner is TOLD the real ordering rule, not left to guess', () => {
  // It invented a weekly cutoff. The real one is 6 PM the day before, rolling daily.
  // The hour itself became DYNAMIC (the owner moved 6 PM to 8 PM and moves it at will) — a
  // hard-coded hour in the prompt was just the next wrong deadline waiting to be published. The
  // pin now asserts the hour is READ, not written.
  assert.match(AUTO, /orderByLabel. the DAY BEFORE — a rolling daily cutoff, not a weekly one/);
  assert.match(AUTO, /const schedOps = await loadOperating\(env\)/);
  assert.match(AUTO, /deadlines, cutoffs/);
});

// ---------- the planner reads the REAL brand standards ----------

test('the bundled brief is byte-identical to the markdown source', () => {
  // Workers cannot read files at runtime, so the brief ships as a generated module. Two copies of
  // a source of truth is one too many unless something forces them equal — this does.
  const md = readFileSync(new URL('../../docs/brand-standards-brief.md', import.meta.url), 'utf8');
  const mod = readFileSync(new URL('../../functions/_lib/brand_brief.js', import.meta.url), 'utf8');
  const exported = JSON.parse(mod.slice(mod.indexOf('export const BRAND_BRIEF = ') + 'export const BRAND_BRIEF = '.length).replace(/;\s*$/, ''));
  assert.equal(exported, md, 'run scripts/sync-brand-brief.py after editing the markdown');
});

test('the planner prompt carries the real standards, not a paraphrase', () => {
  // The one-line "warm, family-rooted" note I wrote by hand is gone. Two real sources now feed the
  // prompt: the curated brand context (voice, photo standard, the Reposado ruling) and §3 of the
  // sync-enforced full brief — the product lines — because the standing objective is that people
  // know EVERYTHING Añejo sells, and excerpts that stop at voice would keep the planner writing
  // bowl posts forever.
  assert.match(AUTO, /BRAND_CONTEXT/);
  assert.match(AUTO, /WHAT AÑEJO SELLS \(promote across ALL of it, not only bowls\)/);
  assert.match(AUTO, /productLines\(\)/);
  assert.ok(!/warm, family-rooted, quietly confident/.test(AUTO), 'the hand-written paraphrase is deleted');
  assert.match(AUTO, /image_brief you write MUST comply with the Photo standard/);
});

// ---------- upload and edit are real, on the page ----------

test('upload rejects by MAGIC BYTES, not filename, and forces the .jpg key', () => {
  // Pinned to FACTS that survive restyling — this endpoint was rewritten twice in parallel while
  // the behaviour stayed right, and a test that fails on variable names cries wolf.
  const UP = readFileSync(new URL('../../functions/api/hub/owner/social-upload.js', import.meta.url), 'utf8');
  assert.match(UP, /0xff, 0xd8, 0xff/, 'the JPEG magic bytes are what is checked');
  assert.match(UP, /bytes/, 'and they are checked on decoded bytes, not the mime string');
  assert.match(UP, /\.jpg`/, 'the stored key always ends .jpg');
  assert.match(UP, /contentType: 'image\/jpeg'/, 'and is typed as jpeg regardless of the claim');
  assert.match(UP, /HEIC photo/, 'the commonest failure — an iPhone camera-roll HEIC — is named, with the fix');
  assert.match(UP, /requireRole\(request, env, \['owner'\]\)/, 'owner-only');
});

test('the page has a real caption editor and a real upload button', () => {
  // "You can edit the caption inline" was false: the API op existed, the page had no field. The
  // claim is now pinned to the DOM it describes.
  const PAGE = readFileSync(new URL('../../public/hub/owner/social.html', import.meta.url), 'utf8');
  assert.match(PAGE, /data-editcap/, 'a save-caption control exists on the card');
  assert.match(PAGE, /textarea id="cap_/, 'the caption is a field, not a div, until published');
  assert.match(PAGE, /data-upload/, 'an upload button exists on imageless cards');
  assert.match(PAGE, /social-upload/, 'and it posts to the upload endpoint');
  assert.match(PAGE, /input type="file" id="mfile" accept="image\/jpeg"/, 'the compose form uploads too');
});

test('a published caption is read-only', () => {
  // Our copy changing after the fact would disagree with what people actually read.
  const PAGE = readFileSync(new URL('../../public/hub/owner/social.html', import.meta.url), 'utf8');
  assert.match(PAGE, /p\.status === 'published'\s*\? '<div class="cap">/);
});
