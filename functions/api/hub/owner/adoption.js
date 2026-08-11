// GET /api/hub/owner/adoption — staff adoption summary (owner-only). Reads activity_log.
//
// THE QUESTION THIS ANSWERS: "is my team actually using the HUB, and are they filing their EOD
// reports?" Traffic answers a question about customers; this one answers a question about staff.
// Different audience, different table, different screen.
//
// WHY IT EXISTS. The v1 tracking plan declared internal_user_policy — "exclude actor_type=system
// from adoption metrics" — and then nothing ever read it. 103 event types were being written to
// activity_log with exactly one reader: a raw chronological feed. A telemetry table nobody queries
// is the estate's most repeated failure (followup_drafts: 39 rows, no screen; funnel_events: six
// steps rendered, one written). This is the screen that makes the policy real.
//
// EVERY QUERY HERE FILTERS actor_type='human'. That is the whole point: automation writes far more
// events than people do (5 automation types on a 15-minute loop), so counting it would drown the
// signal and make adoption look healthy while nobody logged in. The new composite index
// idx_activity_actor_type_created (migration 0073) is what makes that filter cheap.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';

// Events that mean "a human did real work", as opposed to merely looking at a screen. Adoption
// measured by pageviews flatters itself; adoption measured by work done does not.
const WORK_EVENTS = [
  'shift.clocked_in', 'shift.clocked_out', 'eod_report.submitted',
  'delivery.completed', 'delivery.picked', 'order.prep_started', 'order.ready',
  'order.bowl_checked', 'checklist.completed', 'delivery.checklist_completed',
  'temp_log.recorded', 'inventory.counted', 'recipe.created', 'ticket.created',
];

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get('days') || '30', 10) || 30));
  const since = Date.now() - days * 86400000;

  // Every read is best-effort: a broken panel must not blank the whole screen. Each helper
  // returns a safe empty value rather than throwing, and the page renders what it has.
  const all = async (sql, ...binds) => {
    try { return ((await env.DB.prepare(sql).bind(...binds).all()).results) || []; }
    catch { return []; }
  };
  const one = async (sql, ...binds) => {
    try { return (await env.DB.prepare(sql).bind(...binds).first()) || null; }
    catch { return null; }
  };

  const workList = WORK_EVENTS.map(() => '?').join(',');

  const [
    activeStaff, totalStaff, byDay, byRole, byPerson, eod, shifts, topEvents, systemShare,
  ] = await Promise.all([
    // Distinct humans who did ANYTHING in the window.
    one("SELECT COUNT(DISTINCT actor_id) AS n FROM activity_log WHERE actor_type='human' AND actor_id IS NOT NULL AND created_at>?", since),
    // Denominator: staff who could have. Without it "6 active" has no meaning.
    // NB: the column is `active`, not `is_active`. Getting this wrong returns 0 silently (the
    // helper swallows the error), which would render adoption as "not enough data" forever.
    one('SELECT COUNT(*) AS n FROM staff WHERE active=1'),
    // Daily active humans — the adoption curve.
    all(`SELECT date(created_at/1000,'unixepoch') AS day, COUNT(DISTINCT actor_id) AS n
           FROM activity_log WHERE actor_type='human' AND actor_id IS NOT NULL AND created_at>?
          GROUP BY day ORDER BY day ASC`, since),
    all(`SELECT COALESCE(actor_role,'unknown') AS role, COUNT(DISTINCT actor_id) AS people, COUNT(*) AS events
           FROM activity_log WHERE actor_type='human' AND created_at>?
          GROUP BY role ORDER BY events DESC`, since),
    // Per-person work, not per-person clicks.
    all(`SELECT a.actor_id, COALESCE(st.name,'—') AS name, COALESCE(a.actor_role,'—') AS role,
                COUNT(*) AS events, MAX(a.created_at) AS last_seen
           FROM activity_log a LEFT JOIN staff st ON st.id = a.actor_id
          WHERE a.actor_type='human' AND a.actor_id IS NOT NULL AND a.created_at>?
            AND a.event IN (${workList})
          GROUP BY a.actor_id ORDER BY events DESC LIMIT 25`, since, ...WORK_EVENTS),
    one("SELECT COUNT(*) AS n FROM activity_log WHERE event='eod_report.submitted' AND created_at>?", since),
    // The EOD denominator: a report is expected per completed shift.
    one("SELECT COUNT(*) AS n FROM activity_log WHERE event='shift.clocked_out' AND created_at>?", since),
    all(`SELECT event, COUNT(*) AS n FROM activity_log WHERE actor_type='human' AND created_at>?
          GROUP BY event ORDER BY n DESC LIMIT 15`, since),
    // Proof the exclusion is doing something. If this is high, an unfiltered screen would be lying.
    one("SELECT SUM(CASE WHEN actor_type='system' THEN 1 ELSE 0 END) AS sys, COUNT(*) AS total FROM activity_log WHERE created_at>?", since),
  ]);

  const active = (activeStaff && activeStaff.n) || 0;
  const roster = (totalStaff && totalStaff.n) || 0;
  const eodDone = (eod && eod.n) || 0;
  const eodExpected = (shifts && shifts.n) || 0;

  return json({
    ok: true,
    days,
    active_staff: active,
    roster,
    // Null rather than 0 when there is no roster — "0%" and "not enough data" are different
    // statements, and a dashboard that cannot tell them apart teaches the owner to distrust it.
    adoption_rate: roster > 0 ? Math.round((active / roster) * 100) : null,
    eod_submitted: eodDone,
    eod_expected: eodExpected,
    eod_compliance_rate: eodExpected > 0 ? Math.round((eodDone / eodExpected) * 100) : null,
    by_day: byDay,
    by_role: byRole,
    by_person: byPerson,
    top_events: topEvents,
    system_events_excluded: (systemShare && systemShare.sys) || 0,
    total_events: (systemShare && systemShare.total) || 0,
  });
};
