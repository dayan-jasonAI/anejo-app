// GET /api/hub/owner/eod-compliance — end-of-day report compliance for a given date.
// Owner-only. Query: ?date=YYYY-MM-DD (defaults today). Returns who filed, who's missing,
// and blockers flagged, so the owner can chase missing reports.
import { json } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { today, parseJson } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  const url = new URL(request.url);
  const date = (url.searchParams.get('date') || '').trim() || today();

  // Active staff expected to file (kitchen + driver).
  let expected = [];
  try {
    const res = await env.DB
      .prepare("SELECT id, name, role, team, lang FROM staff WHERE active=1 AND role IN ('kitchen','driver') ORDER BY role, name")
      .all();
    expected = (res && res.results) || [];
  } catch {
    expected = [];
  }

  // Reports filed for the date.
  let reports = [];
  try {
    const res = await env.DB
      .prepare("SELECT id, staff_id, role, summary, has_blockers, blockers, on_time, ai_drafted, status, created_at FROM eod_reports WHERE report_date = ?")
      .bind(date)
      .all();
    reports = (res && res.results) || [];
  } catch {
    reports = [];
  }

  const byStaff = new Map();
  reports.forEach((r) => byStaff.set(r.staff_id, r));

  const filed = [];
  const missing = [];
  expected.forEach((s) => {
    const r = byStaff.get(s.id);
    if (r) {
      filed.push({
        staff_id: s.id,
        name: s.name,
        role: s.role,
        team: s.team,
        report_id: r.id,
        on_time: r.on_time,
        has_blockers: r.has_blockers,
        blockers: r.blockers,
        ai_drafted: r.ai_drafted,
        summary: r.summary,
        created_at: r.created_at,
      });
    } else {
      missing.push({ staff_id: s.id, name: s.name, role: s.role, team: s.team, lang: s.lang });
    }
  });

  const expectedCount = expected.length;
  const filedCount = filed.length;
  const pct = expectedCount ? Math.round((filedCount / expectedCount) * 100) : null;
  const blockers = filed.filter((f) => f.has_blockers);

  return json({
    ok: true,
    date,
    expected: expectedCount,
    filed: filedCount,
    missing_count: missing.length,
    pct,
    filed_reports: filed,
    missing,
    blockers,
  });
};
