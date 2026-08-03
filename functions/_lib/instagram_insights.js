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
import { etDateOf, parseJson } from './hub.js';
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
