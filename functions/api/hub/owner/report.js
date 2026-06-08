// POST /api/hub/owner/report — report export stub for the command center.
// Owner-only. Body: { report_type, format?, from?, to? }.
// report_type ∈ payroll|deliveries|finance|accountability|temp_compliance.
//
// SANDBOX POSTURE: this does NOT generate a real file yet. It validates the request,
// instruments report.exported, and returns a stub descriptor (status:'queued') so the UI
// flow is wired end-to-end. A later job/automation will produce the actual artifact.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { id, today } from '../../../_lib/hub.js';

const REPORT_TYPES = ['payroll', 'deliveries', 'finance', 'accountability', 'temp_compliance'];
const FORMATS = ['csv', 'pdf', 'json'];

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const report_type = (b && b.report_type || '').toString().trim();
  if (!REPORT_TYPES.includes(report_type)) return bad('Unknown report_type.');
  let format = (b && b.format || 'csv').toString().toLowerCase();
  if (!FORMATS.includes(format)) format = 'csv';

  const from = (b && b.from || '').toString().trim() || null;
  const to = (b && b.to || '').toString().trim() || today();

  await capture(env, {
    event: 'report.exported',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    actor_type: 'human',
    team: ctx.team,
    properties: { report_type, format, from, to, platform: 'api' },
  });

  // Stub descriptor — no artifact generated in sandbox posture.
  return json({
    ok: true,
    status: 'queued',
    stub: true,
    report: {
      id: id('rep'),
      report_type,
      format,
      from,
      to,
      requested_by: ctx.distinct_id,
      note: 'Report generation is stubbed in sandbox posture; no file produced yet.',
    },
  });
};
