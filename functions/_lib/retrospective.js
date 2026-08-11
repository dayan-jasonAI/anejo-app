// What happened since last time — the half of the learning loop that was missing.
//
// THE GAP THIS CLOSES. docs/MARKETING_TEAM_DESIGN.md §7 specifies five steps, and steps 1–3 were
// built: assets carry the brief that produced them (post_provenance), metrics are swept daily
// (instagram_insights), and signals are detected and raised as alerts. Step 4 — "next planning
// session OPENS with that summary" — was not. buildSpine() handed the Team Lead the three
// highest-reach posts as bare numbers: no comparison to a baseline, no verdict, and no mention of
// the success_metric the Lead itself wrote into the brief. The strategist could see WHAT happened
// and never whether it was good, so week 10 was planned much like week 1.
//
// DETERMINISTIC ON PURPOSE. The design names a "Performance Analyst" agent for this. It is code
// instead, for the same reason the scheduler and publisher are: the job is joining rows and
// comparing numbers to thresholds, and a model asked to do that can get it wrong in a way nobody
// notices. The Lead is already a frontier model — give it correct facts and let IT do the
// interpreting. Cheaper, and there is no second opinion to reconcile.
//
// ONE SET OF VERDICTS. The thresholds come from detectPerformanceSignals(), the same function the
// daily alert tick calls. If the Lead's read of a weak run ever disagreed with the alert the owner
// got on his phone that morning, one of them would be wrong and he would have no way to tell which.
// Files under functions/_lib are NOT routed.
import { detectPerformanceSignals } from './instagram_insights.js';
import { parseJson } from './hub.js';

// The Team Lead runs on Opus. Every character here is billed at frontier input rates on every turn
// of a conversation, so this block earns its size or it does not ship: a hard cap, and the parts
// most likely to change a decision are rendered first so the tail is what gets cut.
export const RETRO_BUDGET = 2400;

const BRIEF_LIMIT = 4;      // the briefs a strategist could plausibly still be acting on
const FLAG_SAMPLE = 40;     // recent audited drafts to tally rejection reasons across
const TOP_FLAGS = 4;

async function rows(env, sql, ...args) {
  try {
    const r = await env.DB.prepare(sql).bind(...args).all();
    return (r && r.results) || [];
  } catch { return []; }
}
async function firstRow(env, sql, ...args) {
  try { return await env.DB.prepare(sql).bind(...args).first(); } catch { return null; }
}

/**
 * Performance per brief, joined through the provenance stamp.
 *
 * The inner GROUP BY collapses each post to its LATEST capture — ig_media_metrics holds one row
 * per post per day, and summing every row would multiply a post's reach by how many days it has
 * been measured, which is the kind of number that looks like a triumph and is an arithmetic bug.
 */
async function briefPerformance(env) {
  const out = new Map();
  const list = await rows(env,
    `SELECT pp.brief_id AS brief_id,
            COUNT(DISTINCT pp.post_id) AS posts,
            SUM(m.reach) AS reach,
            SUM(m.saved) AS saved
       FROM post_provenance pp
       JOIN (SELECT post_id, MAX(capture_date) AS cd, reach, saved
               FROM ig_media_metrics
              WHERE post_id IS NOT NULL
              GROUP BY post_id) m
         ON m.post_id = pp.post_id
      WHERE pp.brief_id IS NOT NULL
      GROUP BY pp.brief_id`);
  for (const r of list) out.set(String(r.brief_id), r);
  return out;
}

// 'audit_unavailable' is governance.js saying the audit COULD NOT RUN — the model was unreachable
// or unconfigured. It is an outage, not a brand judgement, and tallying it beside claim/voice would
// tell the strategist the brand is failing when what failed was the auditor. Counted separately and
// said in different words, because the response is different too: one is "write differently", the
// other is "your gate is down". Drafts it lands on are unscored, and automations.js will only
// auto-schedule a draft whose audit_status is 'pass', so they are stuck rather than at risk.
const NOT_A_REJECTION = new Set(['audit_unavailable']);

/**
 * What the Brand Auditor keeps rejecting. §7 step 5: "recurring misses become prompt rules" — and
 * the first step of that is the strategist being able to SEE which miss recurs.
 */
async function recurringFlags(env) {
  const list = await rows(env,
    `SELECT audit_flags FROM social_posts
      WHERE audit_flags IS NOT NULL AND audit_flags != '[]'
      ORDER BY created_at DESC LIMIT ${FLAG_SAMPLE}`);
  const tally = new Map();
  let unaudited = 0;
  for (const r of list) {
    const flags = parseJson(r.audit_flags, null);
    if (!Array.isArray(flags)) continue;
    for (const f of flags) {
      // governance.js writes { type: 'claim' | 'voice', detail: '…' }. `type` FIRST, and verified
      // against production rows rather than assumed: a tally keyed on a missing property renders
      // every flag as "[object Object] (21×)", which is worse than saying nothing — it looks like
      // a finding. code/flag/string are tolerated for older rows and hand-written fixtures.
      const key = String((f && (f.type || f.code || f.flag)) || (typeof f === 'string' ? f : '') || '').trim().slice(0, 40);
      if (!key) continue;
      if (NOT_A_REJECTION.has(key)) { unaudited += 1; continue; }
      tally.set(key, (tally.get(key) || 0) + 1);
    }
  }
  return {
    flags: [...tally.entries()]
      .filter(([, n]) => n >= 2)               // once is an incident, twice is a pattern
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_FLAGS),
    unaudited,
  };
}

/**
 * Everything the Lead needs to open a planning conversation knowing how the last one went.
 * Never throws: a retrospective that breaks the strategy desk is worse than no retrospective.
 */
export async function buildRetrospective(env) {
  if (!env || !env.DB) return null;

  let signals = null;
  try { signals = await detectPerformanceSignals(env); } catch { signals = null; }

  const briefs = await rows(env,
    `SELECT id, title, success_metric, status, created_at FROM team_briefs
      WHERE status != 'archived' ORDER BY created_at DESC LIMIT ${BRIEF_LIMIT}`);
  const perf = await briefPerformance(env);

  const cov = await firstRow(env,
    `SELECT (SELECT COUNT(*) FROM social_posts WHERE status = 'published') AS published,
            (SELECT COUNT(DISTINCT pp.post_id) FROM post_provenance pp
               JOIN social_posts sp ON sp.id = pp.post_id
              WHERE pp.brief_id IS NOT NULL AND sp.status = 'published') AS attributed`);

  const audit = await recurringFlags(env);

  return {
    signals,
    flags: audit.flags,
    unaudited: audit.unaudited,
    coverage: { published: Number((cov && cov.published) || 0), attributed: Number((cov && cov.attributed) || 0) },
    briefs: briefs.map((b) => {
      const p = perf.get(String(b.id)) || null;
      return {
        title: String(b.title || 'Untitled brief').slice(0, 80),
        target: b.success_metric ? String(b.success_metric).slice(0, 140) : null,
        posts: p ? Number(p.posts) || 0 : 0,
        reach: p && Number.isFinite(Number(p.reach)) ? Number(p.reach) : null,
        saved: p && Number.isFinite(Number(p.saved)) ? Number(p.saved) : null,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// "Not enough history yet" is a fact worth stating. A silent omission reads to a model as "nothing
// happened", which is the failure this whole file exists to stop — the Lead inventing a trend from
// an absence is exactly the invented-deadline bug in another costume.
function signalLines(s) {
  if (!s) return ['Performance data could not be read this turn — do not characterise the trend.'];
  const out = [];

  const ft = s.followerTrend;
  if (ft && ft.enoughData) {
    const dir = ft.falling ? 'DOWN' : ft.flat ? 'flat' : 'up';
    out.push(`Followers: ${ft.latestFollowers}, ${dir}${ft.flat ? '' : ` ${ft.delta > 0 ? '+' : ''}${ft.delta}`} over ${ft.windowDays} days.`);
  } else {
    out.push(`Followers: not enough history for a ${s.followerWindowDays || 14}-day trend — do not claim one.`);
  }

  const sil = s.silence;
  if (sil && sil.enoughData) {
    out.push(sil.flagged
      ? `SILENT: nothing has posted in ${sil.daysSince} days. Cadence is the problem before creative is.`
      : `Cadence: last post ${sil.daysSince} day${sil.daysSince === 1 ? '' : 's'} ago.`);
  }

  const sp = s.singlePost;
  if (sp && sp.enoughData) {
    out.push(`Newest post reached ${sp.reach} against a median of ${Math.round(sp.baselineMedian)} across the ${sp.baselineN} before it (${Math.round(sp.ratio * 100)}% of baseline)${sp.flagged ? ' — BELOW the bar.' : '.'}`);
  } else {
    out.push('Not enough posts yet to compare one against a baseline.');
  }

  const wr = s.weakRun;
  if (wr && wr.enoughData) {
    out.push(wr.flagged
      ? `WEAK RUN: the last ${wr.reaches.length} posts all landed at or below baseline (${wr.reaches.join(', ')} vs median ${Math.round(wr.baselineMedian)}). This is a pattern, not variance.`
      : 'No weak run — the recent posts are not all below baseline.');
  }

  return out;
}

function briefLines(retro) {
  if (!retro.briefs.length) return ['No briefs on the board yet.'];
  const out = [];
  for (const b of retro.briefs) {
    const target = b.target ? `target: "${b.target}"` : 'no success metric was ever written for it';
    if (!b.posts) {
      out.push(`- "${b.title}" — ${target} · NO published post carries this brief's id, so it cannot be judged yet.`);
    } else {
      const bits = [`${b.posts} post${b.posts === 1 ? '' : 's'}`];
      if (retro.signals) {
        if (Number.isFinite(b.reach)) bits.push(`${b.reach} reach`);
        if (Number.isFinite(b.saved)) bits.push(`${b.saved} saves`);
      }
      out.push(`- "${b.title}" — ${target} · delivered: ${bits.join(', ')}.`);
    }
  }
  return out;
}

/**
 * The retrospective as prompt text, hard-capped. Returns '' when there is nothing honest to say,
 * so a fresh install's prompt is byte-identical to what it was before this file existed.
 */
export function renderRetrospective(retro, { maxChars = RETRO_BUDGET } = {}) {
  if (!retro) return '';

  const parts = [
    '=== SINCE LAST TIME — READ THIS BEFORE PROPOSING ANYTHING ===',
    ...signalLines(retro.signals),
    '',
    'What the briefs promised, and what actually arrived:',
    ...briefLines(retro),
  ];

  const { published, attributed } = retro.coverage;
  if (published > 0 && attributed < published) {
    parts.push(`Attribution is PARTIAL: ${attributed} of ${published} published posts carry a brief id. ` +
      'Judge the scorecard above accordingly — an unattributed post is unmeasured, not unsuccessful.');
  }

  if (retro.flags.length) {
    parts.push('', 'What the Brand Auditor keeps rejecting: ' +
      retro.flags.map(([code, n]) => `${code} (${n}×)`).join(', ') + '.');
  }

  // Deliberately NOT folded into the line above. "The auditor could not run" is an outage the
  // owner can fix; "your captions keep making claims" is writing the Lead can fix. Reporting them
  // as one number would hand the strategist a brand problem it cannot solve.
  if (retro.unaudited > 0) {
    parts.push(`The Brand Auditor could not RUN on ${retro.unaudited} recent draft${retro.unaudited === 1 ? '' : 's'} — ` +
      'that is the gate failing, not the writing. Those drafts are unscored, and an unscored draft is ' +
      'never auto-scheduled, so they are stuck rather than at risk.');
  }

  parts.push('',
    'Use this. If you propose something that just underperformed, say what will be different this ' +
    'time. If a brief above has no posts attributed, chasing a NEW angle before that one has shipped ' +
    'is how the board fills with abandoned briefs.');

  // Cut whole lines from the tail, never mid-sentence: the leading lines are the trend and the
  // scorecard, which are what change a decision.
  const kept = [];
  let used = 0;
  for (const line of parts) {
    if (used + line.length + 1 > maxChars) break;
    kept.push(line);
    used += line.length + 1;
  }
  return kept.join('\n');
}
