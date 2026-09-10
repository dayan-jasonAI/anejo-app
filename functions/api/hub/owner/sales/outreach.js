// /api/hub/owner/sales/outreach — the approval queue (OWNER ONLY).
//
//   GET                                        → pending drafts + why sending is / is not ready
//   POST { op:'start_sequence', opportunity_id, contact_id? }   → enroll + draft step 1 (sends nothing)
//   POST { op:'preview', id, subject?, body? } → the exact email as it would be sent, and its render_hash
//   POST { op:'approve', id, subject, body, render_hash, acknowledge_flags? }
//   POST { op:'edit' | 'reject' | 'snooze', id, … }
//   POST { op:'mark_replied', opportunity_id, sentiment?, note? } / { op:'stop_sequence', opportunity_id }
//   POST { op:'send_now' }                     → the same gated batch the scheduler runs
//
// "No email leaves the Hub without a human reading it first." approve REQUIRES the render_hash the
// preview returned; there is no op that sends a draft, and no op that approves without a preview.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { loadSalesConfig } from '../../../../_lib/sales/config.js';
import { stopSequences } from '../../../../_lib/sales/store.js';
import {
  approvalQueue, sendReadiness, startSequence, previewOutreach, approveOutreach, editOutreach, rejectOutreach,
  snoozeOutreach, markReplied, sendApproved,
} from '../../../../_lib/sales/outreach.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const cfg = await loadSalesConfig(env);
  return json({ ok: true, queue: await approvalQueue(env), send_readiness: sendReadiness(env, cfg), flags: cfg.flags });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const cfg = await loadSalesConfig(env);
  if (!cfg.flags['sales.enabled']) return bad('The Sales workspace is switched off.', 409);
  const reply = (r) => (r && r.ok ? json(r) : json({ ok: false, ...r }, r && r.code === 'stale_preview' ? 409 : 400));

  switch (String((b && b.op) || '')) {
    case 'start_sequence': return reply(await startSequence(env, { opportunity_id: String(b.opportunity_id || ''), contact_id: b.contact_id || null, cfg, ctx }));
    case 'preview': return reply(await previewOutreach(env, String(b.id || ''), { cfg, subject: b.subject, body: b.body }));
    case 'approve': return reply(await approveOutreach(env, String(b.id || ''), {
      cfg, subject: b.subject, body: b.body, render_hash: b.render_hash, acknowledge_flags: b.acknowledge_flags === true, ctx,
    }));
    case 'edit': return reply(await editOutreach(env, String(b.id || ''), { subject: b.subject, body: b.body, cfg, ctx }));
    case 'reject': return reply(await rejectOutreach(env, String(b.id || ''), { reason: b.reason, ctx }));
    case 'snooze': return reply(await snoozeOutreach(env, String(b.id || ''), { until: b.until, ctx }));
    case 'mark_replied': return reply(await markReplied(env, { opportunity_id: String(b.opportunity_id || ''), sentiment: b.sentiment, note: b.note, ctx }));
    case 'stop_sequence': {
      const r = await stopSequences(env, { opportunity_id: String(b.opportunity_id || ''), reason: 'manual', ctx });
      return json({ ok: true, ...r });
    }
    case 'send_now': return json(await sendApproved(env, { cfg, limit: 10 }));
    default: return bad('Unknown action.');
  }
};
