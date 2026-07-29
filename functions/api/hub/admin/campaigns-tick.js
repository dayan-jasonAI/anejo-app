// POST /api/hub/admin/campaigns-tick — send campaigns whose scheduled time has arrived.
// Auth: owner session OR the X-Cron-Key header, same as every other tick.
//
// Pages Functions have no cron of their own; the separate `anejo-cron` Worker POSTs here every
// minute. THAT WORKER IS THE WHOLE FEATURE — a scheduled campaign with no scheduler deployed is a
// campaign that silently never sends, which is worse than one that refused to be scheduled. The
// HUB reads `scheduler_ready` and says so before the owner relies on it.
//
// Two properties matter more than anything else here:
//
//  1. AT MOST ONCE. sendCampaignBatch claims the campaign with a conditional UPDATE and each
//     recipient row the same way, so two overlapping ticks cannot mail the same person twice.
//     Nothing in this file re-implements that; it just drives it.
//
//  2. LATE IS NOT THE SAME AS DUE. If the scheduler was down, a campaign can come due hours after
//     its moment. "Your Founders window is open until 10 AM" arriving at 6 PM is worse than never
//     arriving — it is wrong, and it goes to the whole list. Past the grace window a campaign is
//     put BACK TO DRAFT with the reason recorded, for a human to decide.
import { json, bad, now, ctEq } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { sendCampaignBatch } from '../owner/campaigns.js';

// How late is too late. Long enough to absorb a short outage, short enough that nothing
// time-sensitive goes out at the wrong end of the day.
const GRACE_MS = 2 * 60 * 60 * 1000;
// A tick is one HTTP request with a wall-clock budget; sendCampaignBatch does ~25 per call. Loop a
// few times for a small list, then leave the rest queued — the next minute's tick resumes it.
const MAX_BATCHES = 4;
const TICK_BUDGET_MS = 20000;

export const onRequestPost = async ({ request, env }) => {
  const cronKey = request.headers.get('x-cron-key') || '';
  const viaCron = !!(env.CRON_KEY && ctEq(cronKey, env.CRON_KEY));
  if (!viaCron) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }
  if (!env.DB) return bad('Database not configured.', 500);

  const t = now();
  const startedAt = Date.now();
  const fired = [], missed = [], resumed = [];

  // Anything already mid-send is picked up FIRST. A campaign larger than one tick's budget sits at
  // 'sending' with queued rows, and without this it would stall there forever — a half-sent
  // campaign being the one outcome worse than an unsent one.
  let inFlight = [];
  try {
    const r = await env.DB.prepare(
      "SELECT id, name FROM campaigns WHERE status='sending' ORDER BY updated_at LIMIT 5"
    ).all();
    inFlight = (r && r.results) || [];
  } catch { inFlight = []; }

  let due = [];
  try {
    const r = await env.DB.prepare(
      "SELECT id, name, scheduled_at FROM campaigns WHERE status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 5"
    ).bind(t).all();
    due = (r && r.results) || [];
  } catch { due = []; }

  for (const c of due) {
    const late = t - Number(c.scheduled_at || 0);
    if (late > GRACE_MS) {
      const noteMins = Math.round(late / 60000);
      await env.DB.prepare(
        "UPDATE campaigns SET status='draft', schedule_note=?, updated_at=? WHERE id=? AND status='scheduled'"
      ).bind(
        `Did not send: it came due ${noteMins} minutes late (the scheduler was not running), which is past the ${Math.round(GRACE_MS / 60000)}-minute window. It is back to draft — send it by hand if it is still relevant.`,
        t, c.id
      ).run();
      missed.push({ id: c.id, name: c.name, late_minutes: noteMins });
    }
  }

  const work = [
    ...inFlight.map((c) => ({ ...c, kind: 'resume' })),
    ...due.filter((c) => !missed.some((m) => m.id === c.id)).map((c) => ({ ...c, kind: 'fire' })),
  ];

  for (const c of work) {
    if (Date.now() - startedAt > TICK_BUDGET_MS) break;
    let last = null;
    for (let i = 0; i < MAX_BATCHES; i++) {
      if (Date.now() - startedAt > TICK_BUDGET_MS) break;
      // No `expect`: nobody is watching a screen, so there is no number to have been wrong about.
      last = await sendCampaignBatch({ env, request, cid: c.id, expect: undefined });
      if (!last.ok || last.done) break;
    }
    const entry = {
      id: c.id, name: c.name,
      ok: !!(last && last.ok),
      done: !!(last && last.done),
      sent: (last && last.totals && last.totals.sent) || 0,
      remaining: (last && last.remaining) || 0,
      error: last && !last.ok ? last.error : null,
    };
    (c.kind === 'resume' ? resumed : fired).push(entry);
  }

  return json({ ok: true, at: t, fired, resumed, missed, checked: due.length + inFlight.length });
};
