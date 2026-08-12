// Reading how posts performed — the input half of the learning loop. NOT routed.
//
// Needs the instagram_business_manage_insights permission, which means a token generated AFTER
// that permission was added to the app. An old token fails with a permission error, and callers
// surface that as "regenerate the token", not as a mystery.
//
// TWO FACTS ABOUT META'S INSIGHTS API THAT SHAPE THIS FILE:
//   1. likes/comments come free on the media list; reach/saved/shares/views need the /insights
//      edge. Two different calls, different failure modes.
//   2. /insights REJECTS THE WHOLE CALL if any one metric is invalid for that media type — and
//      validity varies by type and API version. So on failure we retry with the minimal set
//      (reach, saved) rather than losing everything because 'views' was renamed again. A partial
//      snapshot beats no snapshot; the columns simply stay NULL.
import { resolveTarget, igConfigured } from './instagram.js';
import { etDateOf, etMidnightMs, addEtDays, parseJson } from './hub.js';
import { TRUST_CATEGORIES } from './trust_ledger.js';
import { loadTraining } from './training.js';

async function graphGet(env, base, path, params) {
  const qs = new URLSearchParams({ ...params, access_token: env.IG_ACCESS_TOKEN });
  try {
    const r = await fetch(`${base}${path}?${qs}`);
    const j = await r.json().catch(() => null);
    if (!r.ok || (j && j.error)) {
      const e = (j && j.error) || {};
      return { ok: false, error: [e.message, e.error_user_msg].filter(Boolean).join(' — ') || `HTTP ${r.status}`, code: e.code || r.status };
    }
    return { ok: true, body: j };
  } catch (e) {
    return { ok: false, error: 'Could not reach Instagram. ' + String((e && e.message) || '').slice(0, 120) };
  }
}

const FULL_METRICS = 'reach,saved,shares,views,total_interactions';
const MIN_METRICS = 'reach,saved';

/** { reach, saved, shares, views, total_interactions } — whatever Meta will give us for this post. */
async function mediaInsights(env, base, mediaId) {
  let r = await graphGet(env, base, `/${mediaId}/insights`, { metric: FULL_METRICS });
  if (!r.ok && !/permission|#10\b|#200\b/i.test(String(r.error))) {
    // Invalid-metric shape, not a permissions problem — fall back rather than lose the snapshot.
    r = await graphGet(env, base, `/${mediaId}/insights`, { metric: MIN_METRICS });
  }
  if (!r.ok) return { ok: false, error: r.error };
  const out = {};
  for (const m of (r.body && r.body.data) || []) {
    const v = m.values && m.values[0] ? Number(m.values[0].value) : null;
    if (Number.isFinite(v)) out[m.name] = v;
  }
  return { ok: true, metrics: out };
}

/**
 * One sweep: every recent post on the account (ours or not), with whatever metrics Meta grants.
 * A permission failure on /insights does not sink the sweep — likes/comments and the account
 * numbers still land, and `insights_error` tells the caller exactly what to fix.
 */
export async function sweepAccountInsights(env, { limit = 25 } = {}) {
  if (!igConfigured(env)) return { ok: false, reason: 'not_configured' };
  const target = await resolveTarget(env);
  if (!target.ok) return target;
  const { base, id: igId } = target;

  const acct = await graphGet(env, base, `/${igId}`, { fields: 'followers_count,media_count' });
  const media = await graphGet(env, base, `/${igId}/media`, {
    fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count',
    limit: String(limit),
  });
  if (!media.ok) return { ok: false, error: media.error };

  const rows = [];
  let insightsError = null;
  for (const m of (media.body && media.body.data) || []) {
    const ins = await mediaInsights(env, base, m.id);
    if (!ins.ok && !insightsError) insightsError = ins.error;
    const mm = ins.ok ? ins.metrics : {};
    rows.push({
      media_id: m.id,
      media_type: m.media_type || null,
      caption: String(m.caption || '').slice(0, 300) || null,
      permalink: m.permalink || null,
      posted_at: m.timestamp ? Date.parse(m.timestamp) : null,
      likes: Number.isFinite(m.like_count) ? m.like_count : null,
      comments: Number.isFinite(m.comments_count) ? m.comments_count : null,
      reach: mm.reach ?? null,
      saved: mm.saved ?? null,
      shares: mm.shares ?? null,
      views: mm.views ?? null,
      total_interactions: mm.total_interactions ?? null,
    });
  }

  return {
    ok: true,
    account: acct.ok ? { followers: acct.body.followers_count ?? null, media_count: acct.body.media_count ?? null } : null,
    rows,
    insights_error: insightsError,   // non-null = likes/comments only; the token needs the new scope
  };
}

/**
 * A compact performance readout for the planner: what recently worked, what did not. Returns ''
 * when there is nothing yet — the planner must never see an empty scaffold that reads like data.
 */
export async function performanceBrief(env) {
  if (!env || !env.DB) return '';
  try {
    const today = etDateOf(Date.now());
    const r = await env.DB.prepare(
      `SELECT caption, media_type, likes, comments, reach, saved
         FROM ig_media_metrics
        WHERE capture_date = (SELECT MAX(capture_date) FROM ig_media_metrics)
        ORDER BY COALESCE(reach, likes, 0) DESC LIMIT 8`
    ).all();
    const rows = (r && r.results) || [];
    if (!rows.length) return '';
    const line = (m, i) => {
      const parts = [];
      if (m.reach != null) parts.push(`reach ${m.reach}`);
      if (m.likes != null) parts.push(`${m.likes} likes`);
      if (m.saved != null) parts.push(`${m.saved} saves`);
      if (m.comments != null) parts.push(`${m.comments} comments`);
      return `${i + 1}. [${m.media_type || 'POST'}] "${String(m.caption || '').slice(0, 90)}" — ${parts.join(', ') || 'no metrics yet'}`;
    };
    const top = rows.slice(0, 3).map(line).join('\n');
    const bottom = rows.length > 3 ? line(rows[rows.length - 1], rows.length - 1) : '';
    return (
      `=== HOW RECENT POSTS PERFORMED (as of ${today}) ===\n` +
      `Best performers:\n${top}\n` +
      (bottom ? `Weakest:\n${bottom}\n` : '') +
      `Write toward what the numbers say people respond to — subject, angle and format — without repeating captions verbatim.\n` +
      `=== END PERFORMANCE ===`
    );
  } catch { return ''; }
}

// ---------------------------------------------------------------------------
// Attribution rollup — reporting results back BY CAUSE, not just a top-3 list.
//
// performanceBrief() (above) answers "what did well." This answers the question the owner
// actually has: "did the rule I wrote / the brief I approved / this format actually help?" — by
// comparing the reach of published posts WITH a given cause against published posts WITHOUT it.
//
// STATISTICAL HONESTY IS THE POINT, NOT A NICETY. The account has a handful of published posts.
// A ranking built on n=2 vs n=1 is not a finding, it is noise wearing a finding's clothes — and a
// planner or owner that trusts it will optimize for the noise. So every comparison below reports
// its sample size, and MIN_SAMPLE_SIZE (chosen to match AUTO_PUBLISH_AFTER in trust_ledger.js —
// the same "five in a row" bar this codebase already uses to decide a signal is real enough to
// act on) gates whether a comparison is allowed to say anything more than "not enough data yet."
// Below that bar, one outlier post can flip which side looks better; this refuses to rank rather
// than produce a confident-looking order from noise.
export const MIN_SAMPLE_SIZE = 5;

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// pairs: [{ reach, inGroup }], already restricted to the posts where this dimension is actually
// KNOWN (see the per-dimension universe comments in attributionRollup). `enoughData` is the only
// field a caller should gate a ranking or a "this helped" claim on.
function compareGroups(pairs) {
  const withArr = [];
  const withoutArr = [];
  for (const p of pairs) (p.inGroup ? withArr : withoutArr).push(p.reach);
  return {
    withN: withArr.length,
    withoutN: withoutArr.length,
    withMedianReach: median(withArr),
    withMeanReach: mean(withArr),
    withoutMedianReach: median(withoutArr),
    withoutMeanReach: mean(withoutArr),
    enoughData: withArr.length >= MIN_SAMPLE_SIZE && withoutArr.length >= MIN_SAMPLE_SIZE,
  };
}

/**
 * Every published post that has a reach reading, joined against its provenance (0076) if any.
 * `hasProvenance` says whether a post_provenance row exists at all — the row-presence signal
 * that separates "predates this feature" from "recorded, and confirmed empty" (see
 * post_provenance.js). `ruleIds` is `null` when unknown (no row, or the row never recorded rule
 * ids) and an array — possibly empty — when known; that null/array distinction is what lets the
 * rollup tell "no rules were in force" apart from "we don't know."
 */
async function publishedPostsWithReach(env) {
  const r = await env.DB.prepare(
    `SELECT p.id AS post_id, m.reach AS reach,
            (pv.post_id IS NOT NULL) AS has_provenance,
            pv.rule_ids AS rule_ids, pv.brief_id AS brief_id, pv.category AS category, pv.format AS format
       FROM social_posts p
       JOIN ig_media_metrics m
         ON m.post_id = p.id
        AND m.capture_date = (SELECT MAX(m2.capture_date) FROM ig_media_metrics m2 WHERE m2.media_id = m.media_id)
       LEFT JOIN post_provenance pv ON pv.post_id = p.id
      WHERE p.status = 'published' AND m.reach IS NOT NULL`
  ).all();
  return ((r && r.results) || []).map((row) => ({
    postId: row.post_id,
    reach: Number(row.reach),
    hasProvenance: !!row.has_provenance,
    ruleIds: row.rule_ids != null ? parseJson(row.rule_ids, null) : null,
    briefId: row.brief_id ?? null,
    category: row.category ?? null,
    format: row.format ?? null,
  }));
}

const EMPTY_ROLLUP = { ok: true, generatedAt: null, minSampleSize: MIN_SAMPLE_SIZE, totalPublished: 0, totalWithProvenance: 0, byRule: [], byBrief: [], byCategory: [], byFormat: [] };

/**
 * Reach by cause: per training rule, per campaign brief, per category, per format — each as a
 * with-it vs without-it comparison of published posts, honestly capped at what the sample size
 * actually supports. Never throws (a DB hiccup, a pre-0076 schema, or zero published posts all
 * degrade to the same empty-but-valid shape) — a caller can always safely render this.
 *
 * WHICH POSTS COUNT FOR WHICH COMPARISON (the "known universe" for each dimension — see
 * post_provenance.js for why these are not all the same test):
 *   · byRule     — posts where rule_ids was actually recorded (an array, possibly empty). A post
 *                  with no provenance row at all contributes to NEITHER side of a rule comparison.
 *   · byBrief    — posts where a provenance row exists at all (brief_id NULL there is read as
 *                  "confirmed no brief," per the migration's convention).
 *   · byCategory — same gate as byBrief.
 *   · byFormat   — posts where format was explicitly recorded ('single' or 'carousel'). Format is
 *                  the one field expected to be stamped in a LATER call than rule/brief/category
 *                  (Creative Studio decides it, downstream of the planner), so a provenance row
 *                  existing is not enough here — only an actual format value is.
 */
export async function attributionRollup(env) {
  if (!env || !env.DB) return EMPTY_ROLLUP;
  try {
    const items = await publishedPostsWithReach(env);
    const totalPublished = items.length;
    if (!totalPublished) return { ...EMPTY_ROLLUP, generatedAt: Date.now() };
    const totalWithProvenance = items.filter((it) => it.hasProvenance).length;

    let rules = [];
    try { rules = (await loadTraining(env)).rules || []; } catch { rules = []; }
    const ruleUniverse = items.filter((it) => it.ruleIds !== null);
    const byRule = rules.map((rule) => ({
      ruleId: rule.id,
      ruleText: String(rule.text || '').replace(/\s+/g, ' ').trim().slice(0, 140),
      ...compareGroups(ruleUniverse.map((it) => ({ reach: it.reach, inGroup: it.ruleIds.includes(rule.id) }))),
    }));

    let briefRows = [];
    try {
      const r = await env.DB.prepare('SELECT id, title FROM team_briefs ORDER BY created_at DESC LIMIT 50').all();
      briefRows = (r && r.results) || [];
    } catch { briefRows = []; }
    const briefUniverse = items.filter((it) => it.hasProvenance);
    const byBrief = briefRows.map((brief) => ({
      briefId: brief.id,
      briefTitle: String(brief.title || '').slice(0, 140),
      ...compareGroups(briefUniverse.map((it) => ({ reach: it.reach, inGroup: it.briefId === brief.id }))),
    }));

    const categoryUniverse = items.filter((it) => it.hasProvenance);
    const byCategory = TRUST_CATEGORIES.map((cat) => ({
      category: cat,
      ...compareGroups(categoryUniverse.map((it) => ({ reach: it.reach, inGroup: it.category === cat }))),
    }));

    const formatUniverse = items.filter((it) => it.format !== null);
    const byFormat = ['single', 'carousel'].map((fmt) => ({
      format: fmt,
      ...compareGroups(formatUniverse.map((it) => ({ reach: it.reach, inGroup: it.format === fmt }))),
    }));

    return { ok: true, generatedAt: Date.now(), minSampleSize: MIN_SAMPLE_SIZE, totalPublished, totalWithProvenance, byRule, byBrief, byCategory, byFormat };
  } catch {
    return EMPTY_ROLLUP;
  }
}

/**
 * A compact planner-facing summary of the rollup above — same discipline as performanceBrief():
 * returns '' when there is nothing worth saying, so a caller that concatenates it into a prompt
 * never injects a scaffold that reads like data. Only comparisons that clear MIN_SAMPLE_SIZE on
 * both sides are surfaced; everything else stays silent rather than teaching the planner (or the
 * owner) a pattern that is really just noise from a handful of posts.
 */
export async function attributionBrief(env) {
  if (!env || !env.DB) return '';
  try {
    const rollup = await attributionRollup(env);
    if (!rollup.ok || !rollup.totalPublished) return '';

    const lines = [];
    const fmtDelta = (c) => {
      const withM = Math.round(c.withMedianReach);
      const withoutM = Math.round(c.withoutMedianReach);
      const dir = withM > withoutM ? 'higher' : withM < withoutM ? 'lower' : 'no different';
      return `median reach ${withM} vs ${withoutM} without it (${dir}; n=${c.withN} vs n=${c.withoutN})`;
    };
    for (const r of rollup.byRule) {
      if (r.enoughData) lines.push(`Rule "${r.ruleText}": ${fmtDelta(r)}.`);
    }
    for (const b of rollup.byBrief) {
      if (b.enoughData) lines.push(`Brief "${b.briefTitle}": ${fmtDelta(b)}.`);
    }
    for (const c of rollup.byCategory) {
      if (c.enoughData) lines.push(`Category ${c.category}: ${fmtDelta(c)}.`);
    }
    for (const f of rollup.byFormat) {
      if (f.enoughData) lines.push(`Format ${f.format}: ${fmtDelta(f)}.`);
    }
    if (!lines.length) return '';

    return (
      `=== WHAT IS ACTUALLY WORKING (${rollup.totalPublished} published posts measured) ===\n` +
      lines.join('\n') + '\n' +
      `Comparisons below ${rollup.minSampleSize} posts on either side are withheld as not statistically meaningful yet — do not invent a pattern to fill the gap.\n` +
      `=== END WHAT IS WORKING ===`
    );
  } catch { return ''; }
}

// ---------------------------------------------------------------------------
// UNDERPERFORMANCE DETECTION (0079) — the piece that was always missing. Everything above in
// this file answers "what happened" (performanceBrief, attributionRollup); nothing before this
// noticed when the answer was bad and said so. The owner's own words: a real strategist "should
// realize its results are not catching anyone's attention." This is that realization, made
// mechanical — and, per the same audit, it must react without manufacturing confidence a
// six-post account cannot support.
//
// FOUR DISTINCT FAILURE MODES, because they are not the same problem and do not deserve the same
// response:
//   · a single post landing far below the account's own recent baseline (usually ordinary
//     variance for an account this small — informational, never a page)
//   · a RUN of consecutive weak posts (a pattern, not a blip — worth changing the approach)
//   · the follower count flat or falling over a real window (the account itself losing ground)
//   · total silence — nothing published at all for a stretch (today NOTHING notices this)
//
// STATISTICAL HONESTY CARRIES THROUGH FROM ABOVE. Every signal needs its own baseline with
// enough history to mean something, and reports `enoughData: false` instead of a confident
// verdict when it lacks that — the same discipline attributionRollup uses (see MIN_SAMPLE_SIZE
// above), applied to a single account's own trend rather than a with/without split.

// Smaller than MIN_SAMPLE_SIZE (5) ON PURPOSE. MIN_SAMPLE_SIZE gates a two-way split (with a
// cause vs without it), where a thin n on EITHER side is easily flipped by one outlier. A
// baseline here describes only ONE group — the account's own immediately-prior history — so a
// lower bar (three posts) is enough to say "the newest post/run looked different from what came
// right before it," without pretending to a rigor a six-post account can never supply.
export const BASELINE_MIN_POSTS = 3;

// A post at or below half its own account's recent median reach is not noise — that is a large,
// unambiguous gap, not the kind of day-to-day wobble a handful of posts would produce by chance.
// A RATIO, not a fixed reach count, because this account's reach has moved from single digits to
// triple digits over its life; a fixed number would either never fire early on or fire on nearly
// every post once reach grows.
export const UNDERPERFORM_RATIO = 0.5;

// A RUN gets a shallower per-post bar (0.7, not 0.5) because its evidence is repetition, not the
// size of any one miss — three posts each modestly soft is still a real pattern that a single
// 50%-miss check, run post-by-post, would not catch.
export const WEAK_RUN_LENGTH = 3;
export const WEAK_RUN_RATIO = 0.7;

// Two weeks: long enough that ordinary day-to-day follower noise (a few unrelated unfollows)
// washes out, short enough to catch a real stall before a full month of it passes unnoticed —
// which is exactly what "reach could go to zero for a month and nothing would say a word" today
// describes.
export const FOLLOWER_TREND_WINDOW_DAYS = 14;

// Ten days is comfortably past this account's own rhythm: the default cadence targets 4 feed
// posts/week (~1.75 days apart), and even a slow week of owner-approval delay rarely stretches
// past one week. Ten days is over 5x the expected gap between posts — long enough that a normal
// quiet week cannot trip it, short enough that a pipeline actually gone dark gets noticed inside
// two weeks, not never.
export const SILENCE_DAYS = 10;

function daysBetween(earlierDateStr, laterDateStr) {
  return Math.round((etMidnightMs(laterDateStr) - etMidnightMs(earlierDateStr)) / 86400000);
}

/**
 * Latest reach reading for every post on the account (ours or pre-pipeline — same whole-account
 * sweep philosophy as sweepAccountInsights), newest first. This is the one read both the
 * single-post and weak-run detectors share; a failure here costs both signals together, which is
 * honest — they are two analyses of the same underlying read, not two independent ones.
 */
async function recentAccountReach(env, { limit = 30 } = {}) {
  const r = await env.DB.prepare(
    `SELECT m.media_id, m.post_id, m.caption, m.posted_at, m.reach
       FROM ig_media_metrics m
      WHERE m.reach IS NOT NULL AND m.posted_at IS NOT NULL
        AND m.capture_date = (SELECT MAX(m2.capture_date) FROM ig_media_metrics m2 WHERE m2.media_id = m.media_id)
      ORDER BY m.posted_at DESC
      LIMIT ?`
  ).bind(limit).all();
  return ((r && r.results) || []).map((row) => ({
    mediaId: row.media_id,
    postId: row.post_id ?? null,
    caption: row.caption ?? null,
    postedAt: Number(row.posted_at),
    reach: Number(row.reach),
  }));
}

// items: newest-first, from recentAccountReach. Compares the single newest post against the
// median of everything before it.
function singlePostUnderperformance(items) {
  if (!items.length) return { enoughData: false };
  const [newest, ...rest] = items;
  if (rest.length < BASELINE_MIN_POSTS) return { enoughData: false };
  const baselineMedian = median(rest.map((it) => it.reach));
  if (!baselineMedian) return { enoughData: false };
  const ratio = newest.reach / baselineMedian;
  return {
    enoughData: true,
    flagged: ratio <= UNDERPERFORM_RATIO,
    mediaId: newest.mediaId, postId: newest.postId, caption: newest.caption,
    reach: newest.reach, baselineMedian, baselineN: rest.length, ratio,
  };
}

// The baseline for a RUN is computed from the posts BEFORE the run, excluding the run itself —
// comparing a run to a median that includes the run would let the run drag down its own
// yardstick, quietly making itself look less bad than it is.
function weakRunDetection(items) {
  if (items.length < WEAK_RUN_LENGTH + BASELINE_MIN_POSTS) return { enoughData: false };
  const run = items.slice(0, WEAK_RUN_LENGTH);
  const baseline = items.slice(WEAK_RUN_LENGTH);
  const baselineMedian = median(baseline.map((it) => it.reach));
  if (!baselineMedian) return { enoughData: false };
  const flagged = run.every((it) => it.reach <= baselineMedian * WEAK_RUN_RATIO);
  return {
    enoughData: true,
    flagged,
    mediaIds: run.map((it) => it.mediaId),
    postIds: run.map((it) => it.postId).filter(Boolean),
    reaches: run.map((it) => it.reach),
    baselineMedian, baselineN: baseline.length,
  };
}

// Falling or flat followers over FOLLOWER_TREND_WINDOW_DAYS. Requires the account's OWN history
// to actually reach back that far — a three-day-old install must never be told it has a 14-day
// trend, because it does not.
async function followerTrend(env) {
  const r = await env.DB.prepare(
    'SELECT capture_date, followers FROM ig_account_metrics ORDER BY capture_date ASC'
  ).all();
  const rows = ((r && r.results) || []).filter((row) => Number.isFinite(row.followers));
  if (rows.length < 2) return { enoughData: false };
  const today = etDateOf(Date.now());
  const windowStart = addEtDays(today, -FOLLOWER_TREND_WINDOW_DAYS);
  const earliest = rows[0];
  if (earliest.capture_date > windowStart) return { enoughData: false };
  const latest = rows[rows.length - 1];
  // The snapshot closest to (but not after) the window boundary — the last row seen while
  // walking forward that is still <= windowStart.
  let baselineRow = earliest;
  for (const row of rows) {
    if (row.capture_date <= windowStart) baselineRow = row; else break;
  }
  const delta = latest.followers - baselineRow.followers;
  return {
    enoughData: true,
    falling: delta < 0,
    flat: delta === 0,
    delta,
    latestFollowers: latest.followers,
    baselineFollowers: baselineRow.followers,
    windowDays: daysBetween(baselineRow.capture_date, latest.capture_date),
  };
}

// Nothing published at all for SILENCE_DAYS+ — the failure mode nothing in this codebase noticed
// before 0079. Uses the whole-account posted_at (not just our pipeline's published_at) so a hand
// posted photo still resets the clock, same as sweepAccountInsights's whole-account philosophy.
async function silenceDetection(env) {
  const row = await env.DB.prepare(
    'SELECT MAX(posted_at) AS last FROM ig_media_metrics WHERE posted_at IS NOT NULL'
  ).first();
  const lastPostedAt = row && Number.isFinite(row.last) ? Number(row.last) : null;
  // No posting history at all reads as "we don't know yet," never as "silent" — a fresh install
  // or a sweep that has not run yet must not open with a false alarm.
  if (!lastPostedAt) return { enoughData: false };
  const today = etDateOf(Date.now());
  const lastDate = etDateOf(lastPostedAt);
  const daysSince = daysBetween(lastDate, today);
  return { enoughData: true, flagged: daysSince >= SILENCE_DAYS, daysSince, lastPostedAt };
}

const EMPTY_SIGNALS = {
  ok: true, generatedAt: null,
  baselineMinPosts: BASELINE_MIN_POSTS, underperformRatio: UNDERPERFORM_RATIO,
  weakRunLength: WEAK_RUN_LENGTH, weakRunRatio: WEAK_RUN_RATIO,
  followerWindowDays: FOLLOWER_TREND_WINDOW_DAYS, silenceDays: SILENCE_DAYS,
  singlePost: { enoughData: false }, weakRun: { enoughData: false },
  followerTrend: { enoughData: false }, silence: { enoughData: false },
};

/**
 * The four signals above, each computed and degraded INDEPENDENTLY — a missing or pre-0064
 * table costs the specific signal(s) that read it, never the whole snapshot, and never the
 * caller (insights-tick.js's daily run, or the weekly planner via reactionBrief below). Never
 * throws; a caller can always safely read every field.
 */
export async function detectPerformanceSignals(env) {
  if (!env || !env.DB) return EMPTY_SIGNALS;
  let singlePost = { enoughData: false };
  let weakRun = { enoughData: false };
  try {
    const items = await recentAccountReach(env, { limit: 30 });
    singlePost = singlePostUnderperformance(items);
    weakRun = weakRunDetection(items);
  } catch { /* pre-0064 schema, or a query hiccup — both signals stay "not enough data" */ }

  let followerT = { enoughData: false };
  try { followerT = await followerTrend(env); }
  catch { /* pre-0064 schema, or ig_account_metrics not populated yet */ }

  let silence = { enoughData: false };
  try { silence = await silenceDetection(env); }
  catch { /* pre-0064 schema */ }

  return { ...EMPTY_SIGNALS, generatedAt: Date.now(), singlePost, weakRun, followerTrend: followerT, silence };
}

/**
 * Turn a signals snapshot into the alerts it warrants. PURE — no DB, no raiseAlert call — so the
 * severity/wording rules can be tested without mocking D1 or Instagram. insights-tick.js calls
 * this once per day and raises whatever comes back.
 *
 * SEVERITY, decided once here instead of at each call site:
 *   · singlePost → 'info'. One quiet post is ordinary variance for an account this size — the
 *     task this was built for is explicit that a single post must never page anyone.
 *   · weakRun → 'warning'. Three in a row is a pattern the team should look at, but it does not
 *     break the day's operation (alerts.js's own definition of 'critical'), so it stays below
 *     that bar.
 *   · followerTrend falling → 'warning' (the account is actually losing ground); flat → 'info'
 *     (no loss, but no movement either — worth knowing, not worth interrupting anyone for).
 *   · silence → 'warning'. A dark pipeline is an operational gap the team can act on today, but
 *     — like the others — it never rises to 'critical', because no day's operation depends on an
 *     Instagram post going out.
 * Nothing here ever returns 'critical': none of these four conditions "breaks the whole day's
 * operation unless someone acts now," which is the only bar alerts.js reserves that severity for.
 */
export function alertsForSignals(signals) {
  const out = [];
  if (!signals) return out;
  const { singlePost, weakRun, followerTrend: ft, silence } = signals;

  if (singlePost && singlePost.enoughData && singlePost.flagged) {
    out.push({
      alert_type: 'social_underperform',
      // Her business as much as his (2026-08-11): she works these daily.
      notifyRoles: ['marketing'],
      severity: 'info',
      title: 'A post landed well below its recent baseline',
      body: `Reach ${singlePost.reach} vs a baseline median of ${Math.round(singlePost.baselineMedian)} ` +
        `across the ${singlePost.baselineN} posts before it (${Math.round(singlePost.ratio * 100)}% of baseline).`,
      ref_type: 'ig_media', ref_id: singlePost.mediaId || null,
      dedupe_key: `social_underperform:single:${singlePost.mediaId}`,
    });
  }

  if (weakRun && weakRun.enoughData && weakRun.flagged) {
    out.push({
      alert_type: 'social_underperform',
      // Her business as much as his (2026-08-11): she works these daily.
      notifyRoles: ['marketing'],
      severity: 'warning',
      title: `${WEAK_RUN_LENGTH} posts in a row underperformed`,
      body: `Reach ${weakRun.reaches.join(', ')} vs a baseline median of ${Math.round(weakRun.baselineMedian)} ` +
        `across the ${weakRun.baselineN} posts before them.`,
      ref_type: 'ig_media', ref_id: (weakRun.mediaIds && weakRun.mediaIds[0]) || null,
      dedupe_key: `social_underperform:weak_run:${(weakRun.mediaIds || []).join(',')}`,
    });
  }

  if (ft && ft.enoughData && (ft.falling || ft.flat)) {
    out.push({
      alert_type: 'social_underperform',
      // Her business as much as his (2026-08-11): she works these daily.
      notifyRoles: ['marketing'],
      severity: ft.falling ? 'warning' : 'info',
      title: ft.falling ? 'Followers are trending down' : 'Followers are flat',
      body: `${ft.latestFollowers} followers now vs ${ft.baselineFollowers} ${ft.windowDays} days ago ` +
        `(${ft.delta >= 0 ? '+' : ''}${ft.delta}).`,
      ref_type: 'ig_account', ref_id: null,
      dedupe_key: `social_underperform:followers:${ft.falling ? 'falling' : 'flat'}`,
    });
  }

  if (silence && silence.enoughData && silence.flagged) {
    out.push({
      alert_type: 'social_underperform',
      // Her business as much as his (2026-08-11): she works these daily.
      notifyRoles: ['marketing'],
      severity: 'warning',
      title: 'Nothing has posted to Instagram in over a week',
      body: `${silence.daysSince} days since the last post to the account.`,
      ref_type: 'ig_account', ref_id: null,
      dedupe_key: 'social_underperform:silence',
    });
  }

  return out;
}

/**
 * The planner's explicit, IMPERATIVE response to sustained underperformance — the piece that
 * turns "here is what happened" (performanceBrief/attributionBrief above) into "here is what to
 * do differently." Only the WEAK RUN signal instructs a change: a single soft post is ordinary
 * variance (see UNDERPERFORM_RATIO), and instructing the planner to react to it would train it
 * to chase noise every week. Below the sample floor this says so PLAINLY instead of staying
 * silent, so the planner is never left guessing whether quiet data means "nothing to react to
 * yet" or "everything is fine" — those are different claims, and only one of them licenses the
 * planner to leave its approach alone with confidence.
 */
export async function reactionBrief(env) {
  if (!env || !env.DB) return '';
  try {
    const signals = await detectPerformanceSignals(env);
    const { weakRun } = signals;
    if (weakRun.enoughData && weakRun.flagged) {
      return (
        `=== REACT: THE LAST ${WEAK_RUN_LENGTH} POSTS UNDERPERFORMED (reach ${weakRun.reaches.join(', ')}, ` +
        `vs a baseline median of ${Math.round(weakRun.baselineMedian)} across the ${weakRun.baselineN} posts before them) ===\n` +
        `Do NOT repeat the same format, category and angle this run used. Pick a DIFFERENT format ` +
        `(single image vs carousel), a DIFFERENT category than these three leaned on, and a DIFFERENT ` +
        `angle (the food itself / the kitchen-process / the people it feeds / a direct invitation to ` +
        `order) for at least one post this week. This is an instruction to try something different, ` +
        `not a suggestion — three posts in a row below baseline is a pattern, not noise.\n` +
        `=== END REACT ===`
      );
    }
    if (!weakRun.enoughData) {
      return (
        `=== NOT ENOUGH DATA TO REACT ===\n` +
        `There is not yet enough published-post history to tell whether recent performance is a real ` +
        `pattern or ordinary variance for this account. Do NOT change format, category or angle in ` +
        `response to performance this week — follow the brand and menu guidance above as usual.\n` +
        `=== END NOT ENOUGH DATA ===`
      );
    }
    return '';
  } catch { return ''; }
}
