// GET/POST /api/hub/owner/team — the owner's strategy chat with the Marketing Team Lead. Owner-only.
//
// The split of powers is the whole design: the LEAD proposes (words + at most one action block),
// and THIS FILE executes — deterministically, from a fixed allowlist, writing only draft rows.
// The model never holds the pen on the database, so a hallucinated field name or a fourth verb
// dies in the parser instead of becoming data. Nothing here can schedule or publish; those ops
// live in social.js behind the owner's own clicks.
import { json, bad, id, now, randToken } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { toJson, parseJson } from '../../../_lib/hub.js';
import { capture } from '../../../_lib/track.js';
import { leadReply, buildSpine, ALLOWED_ACTIONS } from '../../../_lib/team_lead.js';
import { auditSavedDraft, SOCIAL_AUDIT_SNAPSHOT } from '../../../_lib/social_audit.js';
import { stampPostProvenance } from '../../../_lib/post_provenance.js';
import { TRUST_CATEGORIES, captionHash } from '../../../_lib/trust_ledger.js';
import { bowlArtFor } from '../../../_lib/bowl_art.js';
import { ensureFoodPhoto } from '../../../_lib/food_photo.js';
import { isSegment } from '../../../_lib/audience.js';

const MAX_DRAFT_POSTS = 5;

async function loadMessages(env, limit = 40) {
  try {
    const r = await env.DB.prepare(
      'SELECT id, role, body, actions_json, created_at, inference_receipt_id, inference_outcome_json FROM team_messages ORDER BY created_at DESC LIMIT ?'
    ).bind(limit).all();
    // Stored newest-first for the LIMIT, served oldest-first because it is a chat.
    return (((r && r.results) || [])).reverse();
  } catch { return []; }
}

async function loadBriefs(env, limit = 20) {
  try {
    const r = await env.DB.prepare(
      'SELECT id, title, objective, audience, angle, channels, cadence, success_metric, status, created_at FROM team_briefs ORDER BY created_at DESC LIMIT ?'
    ).bind(limit).all();
    return (r && r.results) || [];
  } catch { return []; }
}

// The owner's complaint, part two: "it's just a random chat box that lacks." The Lead already
// DOES three real things (create_brief, request_intel, draft_posts, all in executeAction above) —
// what was missing was a place that shows the doing. These two queries are that place: the posts
// the Lead actually commissioned and the questions it actually filed, so the panel above the chat
// reads as a team member with a track record instead of a transcript.
//
// source='planner' AND created_by='lead' is the exact fingerprint executeAction's draft_posts
// branch writes (see the INSERT above) — the SAME source value the automated weekly planner also
// uses, but that one always writes created_by='system' (functions/_lib/automations.js), so the
// AND clause is what keeps this list to the Lead's own work and out of the automation's.
async function loadLeadDrafts(env, limit = 8) {
  try {
    const r = await env.DB.prepare(
      "SELECT id, caption, status, created_at FROM social_posts WHERE source='planner' AND created_by='lead' ORDER BY created_at DESC LIMIT ?"
    ).bind(limit).all();
    return (r && r.results) || [];
  } catch { return []; }
}

// requested_by='lead' is the value request_intel's own INSERT writes (see executeAction above) —
// the intel_requests table is shared with the owner's own manual questions (api/hub/owner/intel.js)
// and the discovery cron, so this filter is what keeps the list to what the LEAD asked for.
async function loadLeadIntel(env, limit = 8) {
  try {
    const r = await env.DB.prepare(
      "SELECT id, question, status, created_at FROM intel_requests WHERE requested_by='lead' ORDER BY created_at DESC LIMIT ?"
    ).bind(limit).all();
    return (r && r.results) || [];
  } catch { return []; }
}

// The sidebar headline, cut from the same spine the Lead reads — one gathering pass, no second
// slightly-different set of numbers for the human.
function spineSummary(spine) {
  return {
    budget: spine.budget,
    followers: spine.metrics.account ? spine.metrics.account.followers : null,
    metrics_as_of: spine.metrics.account ? spine.metrics.account.capture_date : null,
    drafts_pending: spine.drafts.count,
    menu_available: spine.menu.concat(spine.other_items || []).filter((m) => m.available).length,
    menu_total: spine.menu.length + (spine.other_items || []).length,
    // Which brand brief the Lead actually read: 'd1' = the owner-maintained doc in the HUB,
    // 'repo' = the compiled snapshot that ships with the deploy. Surfaced because a Lead that
    // sounds off-brand and a brief that never reached it look identical from the chat.
    brand_source: spine.brand_source || 'repo',
  };
}

/**
 * Execute the Lead's single action block. Deterministic on purpose: every branch validates its
 * own fields and writes draft-state rows only. Returns a result object that is persisted into
 * the lead message's actions_json — the audit trail of what the proposal actually did.
 */
export async function executeAction(env, action, evidence = {}) {
  if (!action || !ALLOWED_ACTIONS.includes(action.action)) return null;
  const t = now();

  if (action.action === 'create_brief') {
    const title = String(action.title || '').trim().slice(0, 200);
    if (!title) return { action: 'create_brief', ok: false, error: 'missing title' };
    const briefId = id('tb');
    const channels = Array.isArray(action.channels) ? action.channels.map(String).slice(0, 10) : null;
    try {
      await env.DB.prepare(
        `INSERT INTO team_briefs (id, title, objective, audience, angle, channels, assets_json, cadence, success_metric, status, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'draft','lead',?,?)`
      ).bind(
        briefId, title,
        String(action.objective || '').slice(0, 1000) || null,
        String(action.audience || '').slice(0, 500) || null,
        String(action.angle || '').slice(0, 1000) || null,
        channels ? toJson(channels) : null,
        Array.isArray(action.assets) && action.assets.length ? toJson(action.assets.slice(0, 10)) : null,
        String(action.cadence || '').slice(0, 300) || null,
        String(action.success_metric || '').slice(0, 300) || null,
        t, t
      ).run();
      return { action: 'create_brief', ok: true, brief_id: briefId, title };
    } catch (e) {
      return { action: 'create_brief', ok: false, error: String((e && e.message) || '').slice(0, 120) };
    }
  }

  if (action.action === 'request_intel') {
    const question = String(action.question || '').trim().slice(0, 1000);
    if (!question) return { action: 'request_intel', ok: false, error: 'missing question' };
    const reqId = id('intel');
    try {
      // NB: updated_at genuinely did NOT exist in production until migration 0082 — 0070 declared
      // it but was a no-op (see that migration's header). This INSERT without it is the ONLY
      // intel_requests write that ever succeeded, which is why every historical row is
      // requested_by='lead'. Now that 0082 has added the column, write it like everyone else.
      await env.DB.prepare(
        "INSERT INTO intel_requests (id, question, status, requested_by, created_at, updated_at) VALUES (?,?,'pending','lead',?,?)"
      ).bind(reqId, question, t, t).run();
      return { action: 'request_intel', ok: true, request_id: reqId, question };
    } catch (e) {
      return { action: 'request_intel', ok: false, error: String((e && e.message) || '').slice(0, 120) };
    }
  }

  if (action.action === 'draft_posts') {
    // Drafts come from the Lead's OWN provided assets — this executor writes them down verbatim,
    // it does not generate. status 'draft' + source 'planner' is the same shape socialPlan
    // produces, so the Social page's existing approve/attach/schedule flow picks them up as-is.
    //
    // A draft about one identifiable bowl gets that bowl's staged brand image, so the owner sees a
    // whole post instead of a caption with an empty frame. It is a starting point, replaceable
    // with the 📷 upload — never a claim the art direction was rendered.
    const assets = Array.isArray(action.assets) ? action.assets : [];
    const count = Math.min(MAX_DRAFT_POSTS, Math.max(0, Math.floor(Number(action.count)) || assets.length));
    const context = evidence.input_context;
    const receipt = evidence.inference_receipt;
    const receiptId = receipt?.ok === true && receipt.persisted === true && /^inf_[a-f0-9]+$/.test(receipt.receipt_id || '') ? receipt.receipt_id : null;
    // Presence in current storage cannot prove inclusion in an earlier inference. Only the
    // same inference's supplied-ID receipt can support attribution, never a second read.
    const sourceId = (supplied, value) => {
      if (!receiptId || !Array.isArray(supplied)) return undefined;
      if (!value) return null;
      return supplied.includes(value) ? value : undefined;
    };
    const briefId = sourceId(context?.supplied_brief_ids, action.brief_id);
    const training = context?.components?.training;
    const rulesKnown = receiptId && training &&
      (['ok', 'empty'].includes(training.reads?.rules) || (!training.reads && ['ok', 'empty'].includes(training.read_status)));
    const ruleIds = rulesKnown && Array.isArray(context?.supplied_rule_ids) ? context.supplied_rule_ids : undefined;
    const posts = [];
    const made = [];
    for (const a of assets.slice(0, count)) {
      const caption = String((a && a.caption) || '').trim().slice(0, 2200);
      if (!caption) continue;
      const brief = String((a && a.image_brief) || '').trim().slice(0, 1500) || null;
      const category = TRUST_CATEGORIES.includes(a.category || action.category) ? (a.category || action.category) : null;
      const intelId = sourceId(context?.supplied_intel_ids, a.intel_id || action.intel_id);
      const postId = id('sp');
      const art = bowlArtFor(`${caption}\n${brief || ''}`);
      try {
        await env.DB.prepare(
          `INSERT INTO social_posts (id, platform, caption, media_key, public_token, status, scheduled_at, image_brief, source, created_by, created_at, updated_at)
           VALUES (?,'instagram',?,?,?,'draft',NULL,?,'planner','lead',?,?)`
        ).bind(postId, caption, art, randToken(24), brief, t, t).run();
        // social_post_media is the AUTHORITY — media_key on the post is display-only history, and
        // the public window Instagram fetches through is per-SLIDE. A draft with only the column
        // set would look illustrated in the queue and still be unpublishable.
        let linkedReceipt = null;
        if (receiptId) {
          try {
            const linked = await env.DB.prepare('UPDATE social_posts SET inference_receipt_id=? WHERE id=? AND inference_receipt_id IS NULL').bind(receiptId, postId).run();
            if (linked?.success !== false && linked?.meta?.changes === 1) linkedReceipt = receiptId;
          } catch { /* draft survives, but has no persisted inference evidence */ }
        }
        let originalMediaKey = null;
        if (art) {
          try {
            await env.DB.prepare(
              'INSERT INTO social_post_media (id, post_id, seq, media_key, public_token, created_at) VALUES (?,?,0,?,?,?)'
            ).bind(id('spm'), postId, art, randToken(24), t).run();
            originalMediaKey = art;
          } catch { /* caption draft still stands; owner can attach by hand */ }
        } else {
          // NO staged bowl art matched — the caption names two bowls, or none. That is the common
          // case for the posts this business actually wants (macro plans, catering, "every Anejo
          // bowl"), and until now it meant the Lead produced a caption with an empty frame that
          // the food-first guard would later warn about. Generate one instead: same shared path
          // the planner and the owner's repair button use (_lib/food_photo.js).
          //
          // Only in the `else` — a matched bowl image IS real photography, and the generated
          // stand-in must never displace it or be paid for alongside it.
          const photo = await ensureFoodPhoto(env, { postId, caption, imageBrief: brief });
          if (photo.ok) originalMediaKey = photo.media_key;
        }
        // Seal the original design AFTER attachment, using the same revision definition as
        // the planner and trust gate. Old schemas retain drafts but earn no trust credit.
        try {
          if (originalMediaKey && linkedReceipt) await env.DB.prepare(`UPDATE social_posts SET category=?, original_caption_hash=?,
            original_design_snapshot=${SOCIAL_AUDIT_SNAPSHOT}
            WHERE id=? AND status='draft' AND original_design_snapshot IS NULL
            AND caption=? AND COALESCE(image_brief,'')=? AND COALESCE(media_key,'')=?
            AND (SELECT COUNT(*) FROM social_post_media WHERE post_id=social_posts.id)=1
            AND EXISTS (SELECT 1 FROM social_post_media WHERE post_id=social_posts.id AND seq=0 AND media_key=?)`)
            .bind(category, captionHash(caption), postId, caption, brief || '', art || '', originalMediaKey).run();
        } catch { /* no original evidence means no clean-approval credit */ }
        let media;
        try { media = (await env.DB.prepare('SELECT id, seq, media_key FROM social_post_media WHERE post_id=? ORDER BY seq, id').bind(postId).all()).results; }
        catch { /* unknown media is not an empty carousel */ }
        await stampPostProvenance(env, {
          postId, briefId: linkedReceipt ? briefId : undefined, intelId: linkedReceipt ? intelId : undefined,
          ruleIds: linkedReceipt ? ruleIds : undefined, category,
          format: media?.length ? (media.length > 1 ? 'carousel' : 'single') : undefined,
          slideCount: media?.length ? media.length : undefined,
        });
        // Same finished-image, revision-bound audit as manually assembled drafts.
        // Unavailable media/provider leaves a visible flag, never a caption-only pass.
        try { await auditSavedDraft(env, postId, caption); }
        catch { /* draft stands, visibly unscored */ }
        posts.push({ id: postId, inference_receipt_id: linkedReceipt, inference_evidence: linkedReceipt ? 'input_recorded' : 'unverified' });
        made.push(caption.split('\n')[0].slice(0, 60));
      } catch { /* one bad row must not lose the rest of the set */ }
    }
    return { action: 'draft_posts', ok: made.length > 0, brief_id: briefId, drafted: made.length, titles: made, posts };
  }

  if (action.action === 'propose_campaign') {
    // The Broadcast bridge (2026-09-10). A DRAFT row in `campaigns`, exactly the shape the Broadcast
    // desk's own 'save' op writes — so it appears in Marketing → Broadcast for the owner to preview,
    // edit and send. Nothing here sends: sendCampaignBatch runs only from the owner's click or a
    // schedule HE sets, and resolves the audience through _lib/audience.js consent rules that this
    // branch cannot widen. The segment must be a real, consented segment — a cold prospect is not one.
    const channel = action.channel === 'sms' ? 'sms' : 'email';
    const segment = String(action.segment || '').trim();
    if (!isSegment(segment)) return { action: 'propose_campaign', ok: false, error: `unknown audience '${segment.slice(0, 40)}'` };
    const name = String(action.name || action.subject || '').trim().slice(0, 120);
    const body = String(action.body || '').trim().slice(0, 6000);
    const subject = String(action.subject || '').trim().slice(0, 200);
    if (!name || !body) return { action: 'propose_campaign', ok: false, error: 'missing name or body' };
    if (channel === 'email' && !subject) return { action: 'propose_campaign', ok: false, error: 'an email campaign needs a subject' };
    const cid = id('cmp');
    try {
      await env.DB.prepare(
        `INSERT INTO campaigns (id, channel, name, subject, body, body_format, segment, status, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,'text',?,'draft','lead',?,?)`
      ).bind(cid, channel, name, channel === 'email' ? subject : null, body, segment, t, t).run();
      return { action: 'propose_campaign', ok: true, campaign_id: cid, name, segment, channel, status: 'draft' };
    } catch (e) {
      return { action: 'propose_campaign', ok: false, error: String((e && e.message) || '').slice(0, 120) };
    }
  }

  return null;
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const spine = await buildSpine(env);
  const messages = await loadMessages(env);
  for (const m of messages) m.actions = parseJson(m.actions_json, null);
  return json({
    ok: true, messages, briefs: await loadBriefs(env), spine: spineSummary(spine),
    activity: { drafts: await loadLeadDrafts(env), intel: await loadLeadIntel(env) },
  });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const message = String((b && b.message) || '').trim().slice(0, 4000);
  if (!message) return bad('Say something first.');

  // History BEFORE persisting the new message, so the model sees prior turns + the new message
  // exactly once each.
  // Execution results ride along in the history the Lead reads: without them the model has only
  // its own prose to go on, and it will assert state that never materialized (the phantom-draft
  // bug — "draft #5 is in your queue" about a block the old executor silently dropped).
  const history = (await loadMessages(env, 20)).map((m) => {
    let body = m.body;
    const acts = parseJson(m.actions_json, null);
    if (m.role === 'lead' && acts) {
      const list = (Array.isArray(acts) ? acts : [acts]).map((a) =>
        a.dropped ? `DROPPED (${a.reason})` : `${a.action || '?'}: ${a.ok ? 'ok' : 'FAILED'}`);
      body += `\n[system record — what actually executed from this message: ${list.join('; ')}]`;
    }
    return { role: m.role, body };
  });

  const t = now();
  try {
    await env.DB.prepare('INSERT INTO team_messages (id, role, body, actions_json, created_at) VALUES (?,?,?,NULL,?)')
      .bind(id('tm'), 'owner', message, t).run();
  } catch (e) {
    return bad('Could not save the message. ' + String((e && e.message) || '').slice(0, 120), 500);
  }

  const reply = await leadReply(env, { history, message });

  let leadBody, executed = null, model = null;
  if (reply.ok) {
    leadBody = reply.text;
    model = reply.model;
    // Every block, in order — and dropped blocks pass through as their own results, so the
    // thread the Lead reads next turn states exactly what ran and what did not.
    const blocks = Array.isArray(reply.actions) ? reply.actions : (reply.action ? [reply.action] : []);
    const results = [];
    for (const blk of blocks) {
      if (blk && blk.dropped) { results.push({ ok: false, dropped: true, reason: blk.reason }); continue; }
      results.push(await executeAction(env, blk, { inference_receipt: reply.inference_receipt, input_context: reply.input_context }));
    }
    executed = results.length === 0 ? null : (results.length === 1 ? results[0] : results);
  } else if (reply.reason === 'budget_unavailable') {
    leadBody = 'I cannot read the AI spending ledger right now, so I have paused model work. This does not mean the weekly budget is used up. Your existing briefs and drafts remain available.';
  } else if (reply.reason === 'budget') {
    // Deterministic copy, not a model call — at the ceiling the refusal must cost nothing.
    leadBody = 'The weekly AI budget is used up, so I can\'t think out loud until the new week starts. The briefs and drafts already on the board still stand.';
  } else if (reply.reason === 'no_api_key') {
    leadBody = 'The AI key isn\'t configured, so the Team Lead is offline. Add ANTHROPIC_API_KEY to bring this desk to life.';
  } else {
    leadBody = 'I couldn\'t reach the model just now — nothing was lost, try that message again in a moment.';
  }

  const receipt = reply.inference_receipt;
  const receiptId = receipt?.ok === true && receipt.persisted === true && /^inf_[a-f0-9]+$/.test(receipt.receipt_id || '') ? receipt.receipt_id : null;
  const outcome = { model_ok: reply.ok, reason: reply.ok ? null : reply.reason,
    inference_evidence: receiptId ? 'input_recorded' : 'unverified',
    inference_attempts: reply.inference_attempts || [],
  };
  let saved = false;
  try {
    const result = await env.DB.prepare('INSERT INTO team_messages (id, role, body, actions_json, created_at, inference_receipt_id, inference_outcome_json) VALUES (?,?,?,?,?,?,?)')
      .bind(id('tm'), 'lead', leadBody, executed ? toJson(executed) : null, now(), receiptId, toJson(outcome)).run();
    saved = result?.success !== false && result?.meta?.changes === 1;
  } catch { /* return saved=false; never claim this reply was persisted */ }

  await capture(env, {
    event: 'team_lead.message',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: {
      ok: reply.ok, model, reason: reply.ok ? null : reply.reason,
      action: executed ? (Array.isArray(executed) ? executed.map((r) => r.action || 'dropped').join(',') : executed.action) : null,
    },
  });

  const spine = await buildSpine(env);
  const messages = await loadMessages(env);
  for (const m of messages) m.actions = parseJson(m.actions_json, null);
  return json({
    ok: true,
    reply: { body: leadBody, model, executed, saved, inference_receipt_id: saved ? receiptId : null, inference_outcome: outcome },
    degraded: reply.ok ? null : reply.reason,
    messages,
    briefs: await loadBriefs(env),
    spine: spineSummary(spine),
    activity: { drafts: await loadLeadDrafts(env), intel: await loadLeadIntel(env) },
  });
};
