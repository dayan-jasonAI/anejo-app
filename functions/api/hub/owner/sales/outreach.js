// /api/hub/owner/sales/outreach — the approval queue (OWNER ONLY).
//
//   GET                                        → pending drafts + why sending is / is not ready
//   POST { op:'start_sequence', opportunity_id, contact_id? }   → enroll + draft step 1 (sends nothing)
//   POST { op:'preview', id, subject?, body? } → the exact email as it would be sent, and its render_hash
//   POST { op:'approve', id, subject, body, render_hash, acknowledge_flags? }
//   POST { op:'approve_batch', ids:[…], acknowledge_flags? } → the same gate, run per draft
//   POST { op:'edit' | 'reject' | 'snooze', id, … }
//   POST { op:'mark_replied', opportunity_id, sentiment?, note? } / { op:'stop_sequence', opportunity_id }
//   POST { op:'draft_followup', organization_id, contact_id?, intent?, instruction? }
//                                              → a follow-up written from this prospect's OWN record
//   POST { op:'send_now' }                     → send the approved batch NOW (owner-initiated)
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
import { draftFollowup } from '../../../../_lib/sales/followup.js';
import { startCampaign, campaignList, setCampaignStatus, logReply, replyInbox } from '../../../../_lib/sales/campaigns.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const cfg = await loadSalesConfig(env);
  const view = new URL(request.url).searchParams.get('view') || 'queue';
  if (view === 'campaigns') return json({ ok: true, campaigns: await campaignList(env) });
  if (view === 'replies') return json({ ok: true, replies: await replyInbox(env, { limit: 40 }) });
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
    // BATCH APPROVAL. Nine drafts waiting is nine preview-read-approve round trips, which is how a
    // queue becomes a backlog. This is not a shortcut around the rule: each draft is previewed
    // server-side and approved against ITS OWN render hash, exactly as the single path does. What is
    // batched is the owner's clicking, not his reading — the UI shows every subject, body and gap
    // first, and anything that changed since he looked is refused by the hash, by id, with a reason.
    // A campaign: one action, a named set, the same gates. Drafts only.
    case 'start_campaign': return reply(await startCampaign(env, {
      name: b.name, goal: b.goal, category: b.category,
      organization_ids: b.organization_ids, acknowledge_gaps: b.acknowledge_gaps === true, cfg, ctx,
    }));
    case 'campaign_status': return reply(await setCampaignStatus(env, String(b.campaign_id || ''), String(b.status || ''), { ctx }));
    // What a prospect actually said, in their words: stops the sequence, moves the stage, drafts the answer.
    case 'log_reply': return reply(await logReply(env, {
      organization_id: String(b.organization_id || ''), outreach_id: b.outreach_id || null,
      contact_id: b.contact_id || null, channel: b.channel || 'email', body: b.body,
      draft: b.draft !== false, cfg, ctx,
    }));
    case 'approve_batch': {
      const ids = Array.isArray(b.ids) ? b.ids.map((x) => String(x || '')).filter(Boolean).slice(0, 25) : [];
      if (!ids.length) return bad('Select at least one draft to approve.');
      const results = [];
      for (const oid of ids) {
        const p = await previewOutreach(env, oid, { cfg });
        if (!p.ok) { results.push({ id: oid, ok: false, error: p.error }); continue; }
        const r = await approveOutreach(env, oid, {
          cfg, subject: p.subject, body: p.body, render_hash: p.render_hash,
          acknowledge_flags: b.acknowledge_flags === true, ctx,
        });
        results.push({ id: oid, ok: !!r.ok, error: r.ok ? null : r.error, code: r.code || null, readiness_gaps: r.readiness_gaps || null });
      }
      const approved = results.filter((r) => r.ok).length;
      return json({ ok: true, approved, refused: results.length - approved, results });
    }
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
    case 'draft_followup': return reply(await draftFollowup(env, {
      organization_id: String(b.organization_id || ''), contact_id: b.contact_id || null,
      intent: b.intent || null, instruction: b.instruction || null, cfg, ctx,
    }));
    // THE OWNER PRESSING A BUTTON IS NOT AUTOMATION. The business-hours window exists so the
    // scheduler never mails a clinic at 2am on a Sunday; it was never meant to stop him answering a
    // prospect who replied at 6pm. The window still governs every scheduled pass — only this one,
    // which he has to press himself and which can only release emails he has already approved,
    // ignores it. Every other readiness check still applies.
    case 'send_now': return json(await sendApproved(env, { cfg, limit: 10, ignoreWindow: true }));
    default: return bad('Unknown action.');
  }
};
