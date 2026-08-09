// POST /api/hub/admin/intel-tick — work the Intel Bench queue, then keep the standing
// competitor sweep fresh. Auth: owner session OR the X-Cron-Key header, same as every other
// tick. Intended cadence: weekly (Mondays); safe to fire by hand from the HUB whenever.
//
// AT MOST 2 QUESTIONS PER RUN: each answer is a multi-search web research call, so a burst of
// queued questions must drain over several runs instead of spending a week's budget in one.
// A budget/no-key skip leaves the request PENDING — it retries next run when the new week's
// budget opens, and only a real failure marks it 'failed'.
import { json, bad, now, ctEq } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { runIntel, competitorSweep, platformPulse } from '../../../_lib/intel.js';

// A competitor brief older than this is a map of last month's market. 21 days keeps the
// sweep roughly monthly-with-slack on a weekly tick without ever running it twice in a row.
// The Instagram platform pulse ages the same way and shares this threshold.
const SWEEP_STALE_MS = 21 * 24 * 60 * 60 * 1000;

export const onRequestPost = async ({ request, env }) => {
  const cronKey = request.headers.get('x-cron-key') || '';
  const viaCron = !!(env.CRON_KEY && ctEq(cronKey, env.CRON_KEY));
  if (!viaCron) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }
  if (!env.DB) return bad('Database not configured.', 500);

  let pending = [];
  try {
    const r = await env.DB.prepare(
      "SELECT id, question FROM intel_requests WHERE status='pending' ORDER BY created_at LIMIT 2"
    ).all();
    pending = (r && r.results) || [];
  } catch { pending = []; }

  const answered = [];
  const failed = [];
  let skipped = null;
  for (const req of pending) {
    const res = await runIntel(env, { kind: 'adhoc', question: req.question, feature: 'intel_request' });
    if (res.ok) {
      try {
        await env.DB.prepare("UPDATE intel_requests SET status='done', answer_intel_id=?, updated_at=? WHERE id=?")
          .bind(res.intel_id, now(), req.id).run();
      } catch { /* the brief exists either way; the queue row heals on a later pass */ }
      answered.push({ request_id: req.id, intel_id: res.intel_id });
    } else if (res.skipped) {
      // Not the question's fault — no key or no budget. Leave it pending and stop working
      // the queue: the same skip would hit every remaining question this run.
      skipped = res.skipped;
      break;
    } else {
      try {
        await env.DB.prepare("UPDATE intel_requests SET status='failed', updated_at=? WHERE id=?")
          .bind(now(), req.id).run();
      } catch { /* best-effort */ }
      failed.push({ request_id: req.id, error: res.error || 'unknown' });
    }
  }

  // Quiet queue → keep the two standing pictures fresh: the local-competitor sweep and the
  // Instagram platform pulse. Only when there was no queue work at all: a run that already
  // answered questions has spent enough for one tick. AT MOST ONE freshness brief per tick —
  // each is a multi-search web-research call, so running both here would double the burst the
  // "2 questions per run" ceiling exists to prevent. Competitor takes precedence when both are
  // stale; the pulse then refreshes on the next weekly tick. runIntel's own budget/no-key gate
  // is the backstop: a skip leaves the brief simply un-refreshed, exactly as before.
  let sweep = null;
  let pulse = null;
  if (!pending.length && !skipped) {
    const staleSince = (kind) => {
      // Freshest brief of this kind; 0 = none ever, which is always "stale" and runs first.
      return env.DB.prepare('SELECT MAX(created_at) t FROM market_intel WHERE kind=?')
        .bind(kind).first()
        .then((r) => Number(r && r.t) || 0)
        .catch(() => 0);
    };
    const t = now();
    if (t - (await staleSince('competitor')) > SWEEP_STALE_MS) {
      const res = await competitorSweep(env);
      sweep = res.ok ? { ok: true, intel_id: res.intel_id, searches: res.searches } : { ok: false, reason: res.skipped || res.error || 'unknown' };
    } else if (t - (await staleSince('platform')) > SWEEP_STALE_MS) {
      const res = await platformPulse(env);
      pulse = res.ok ? { ok: true, intel_id: res.intel_id, searches: res.searches } : { ok: false, reason: res.skipped || res.error || 'unknown' };
    }
  }

  return json({
    ok: true,
    pending_seen: pending.length,
    answered,
    failed,
    // Non-null names why queued questions were left waiting — 'budget' resolves itself when
    // the ISO week rolls; 'no_api_key' needs a secret set.
    skipped,
    sweep,
    pulse,
  });
};
