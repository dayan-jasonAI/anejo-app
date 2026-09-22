// Sales OS — THE STANDING APPROVAL for the introduction email.
// Files under functions/_lib are NOT routed.
//
// WHAT THE OWNER ASKED FOR (2026-09-21): "The initial email we sent to the first 11 is perfect and
// it can have my approval to be sent out automatically as the prospect lists get refreshed with new
// prospects."
//
// WHAT THIS DOES WITH THAT. The rule this system is built around — no prospect email leaves without
// a human reading it — is not removed. It is moved earlier. The owner reads one exact email and
// ATTESTS it; that attestation approves its future copies, and it is recorded on every email it
// authorises. The moment anything that email is made of changes — the template, the offer, the
// sender, the reply-to, the postal footer, the proof line — the fingerprint stops matching and
// automatic sending HALTS until he reads and attests again. A standing approval that silently
// survives a rewrite of what it approved is not an approval.
//
// WHAT IT STILL WILL NOT DO, and each of these is deliberate:
//   · Follow-ups. Only step 1, the letter he read. Every later step waits for him.
//   · Anything with a flagged claim. If the draft trips the claim checker, a human looks at it.
//   · Anything to a buyer whose own licensing requirement we cannot meet. The readiness gate applies
//     with NO acknowledgement available to a machine — which today means no adult day care center
//     gets an automatic email while the dietitian signature is missing. That gap is exactly what
//     cost this business time on the Boca Raton deal; a robot must not be able to wave it through.
//   · Anything outside the send window, the daily email cap, or its own smaller daily cap.
//   · Anything at all while deliverability is going wrong: bounces and complaints halt it.
import { now, toJson, parseJson } from '../hub.js';
import { configHash } from './config.js';
import { salesRow, salesRows, logActivity, createOpportunity } from './store.js';
import { previewOutreach, approveOutreach, startSequence, DEFAULT_SEQUENCE_ID } from './outreach.js';

export const ATTESTATION_KEY = 'sales.auto_intro_attestation';

/**
 * The fingerprint of "the email he approved": everything that decides what a step-1 letter says.
 * Not the rendered copy for one prospect — that differs by name — but every input that shapes it.
 */
export async function templateFingerprint(env, cfg) {
  const step = await salesRow(env, 'SELECT subject_template, body_template, step_number FROM sales_sequence_steps WHERE sequence_id = ? AND step_number = 1', DEFAULT_SEQUENCE_ID);
  return configHash({
    subject_template: (step && step.subject_template) || '',
    body_template: (step && step.body_template) || '',
    offer: cfg.offer || {},
    proof: cfg.proof || {},
    sender: cfg.sender || {},
    postal: cfg.postal_address || '',
    service_area: (cfg.service_area && cfg.service_area.label) || '',
  });
}

export async function getAttestation(env) {
  const r = await salesRow(env, 'SELECT value FROM app_settings WHERE key = ?', ATTESTATION_KEY);
  return r && r.value ? parseJson(r.value, null) : null;
}

/**
 * Record the owner's standing approval of the exact email he just read. `sample` is the rendered
 * preview he was shown, stored verbatim so there is no argument later about what he approved.
 */
export async function attest(env, { cfg, sample, ctx } = {}) {
  if (!ctx || !ctx.distinct_id) return { ok: false, error: 'A standing approval needs a signed-in owner.' };
  if (!sample || !sample.subject || !sample.text) return { ok: false, error: 'Preview the exact email first — the attestation stores what you read.' };
  const fingerprint = await templateFingerprint(env, cfg);
  const value = {
    fingerprint,
    approved_by: ctx.distinct_id,
    approved_at: now(),
    sample_subject: String(sample.subject).slice(0, 300),
    sample_text: String(sample.text).slice(0, 8000),
    sample_for: sample.for || null,
  };
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
  ).bind(ATTESTATION_KEY, toJson(value), ctx.distinct_id, now()).run();
  await logActivity(env, { kind: 'auto_intro_attested', ctx, detail: { fingerprint, subject: value.sample_subject } });
  return { ok: true, attestation: value };
}

/**
 * Deliverability is the other thing that must be able to stop this. Two complaints, or a fifth of
 * the recent batch bouncing, and the machine stops writing letters until a human looks.
 */
export async function healthHalt(env, { window = 20 } = {}) {
  const rows = await salesRows(env,
    `SELECT status, bounced_at, complained_at FROM sales_outreach
      WHERE status IN ('sent','bounced','complained') ORDER BY sent_at DESC LIMIT ?`, window);
  if (rows.length < 5) return null;                     // too few to judge
  const complaints = rows.filter((r) => r.complained_at || r.status === 'complained').length;
  const bounces = rows.filter((r) => r.bounced_at || r.status === 'bounced').length;
  if (complaints >= 2) return `${complaints} spam complaints in the last ${rows.length} emails`;
  if (bounces / rows.length > 0.2) return `${bounces} of the last ${rows.length} emails bounced`;
  return null;
}

/** Everything that has to be true before a letter can go out on a standing approval. */
export async function autoIntroStatus(env, cfg, { atMs = Date.now() } = {}) {
  const reasons = [];
  const enabled = cfg.flags['sales.auto_intro_enabled'] === true;
  if (!enabled) reasons.push('Automatic intro email is switched off.');
  const att = await getAttestation(env);
  const fingerprint = await templateFingerprint(env, cfg);
  if (!att) reasons.push('No standing approval on file — read the exact email and attest it.');
  else if (att.fingerprint !== fingerprint) {
    reasons.push('The email changed since you approved it (template, offer, sender, footer or proof). Read it again and re-attest.');
  }
  const halt = await healthHalt(env);
  if (halt) reasons.push(`Paused on deliverability: ${halt}.`);
  const sentToday = await salesRow(env,
    "SELECT COUNT(*) AS n FROM sales_outreach WHERE auto_approved = 1 AND approved_at >= ?",
    atMs - 24 * 3600000);
  const cap = Number(cfg.flags['sales.max_auto_intros_per_day']) || 0;
  const used = Number((sentToday && sentToday.n) || 0);
  if (cap > 0 && used >= cap) reasons.push(`Daily automatic cap reached (${used}/${cap}).`);
  return {
    ok: reasons.length === 0, reasons, enabled,
    attested: !!att, fingerprint_matches: !!att && att.fingerprint === fingerprint,
    attestation: att ? { approved_at: att.approved_at, approved_by: att.approved_by, subject: att.sample_subject } : null,
    used_today: used, cap, halt,
  };
}

/** Is this prospect one a machine may write to on its own? */
export async function prospectEligible(env, org, { readiness, checklistFor }) {
  if (!org) return { ok: false, why: 'not found' };
  if (org.do_not_contact || ['suppressed', 'converted', 'disqualified'].includes(org.status)) return { ok: false, why: 'do not contact' };
  if (!['A', 'B'].includes(org.current_tier)) return { ok: false, why: `tier ${org.current_tier || '—'} is below the automatic bar` };
  const check = checklistFor(org.business_category || 'other', readiness);
  if (check.blocking_outreach && check.blocking_outreach.length) {
    return { ok: false, why: `readiness: ${check.blocking_outreach.map((x) => x.label.split(' (')[0]).join('; ')}` };
  }
  return { ok: true };
}

/**
 * Draft step 1 for prospects that arrived since the last pass and clear every bar.
 * Creates the opportunity if there is none. Drafts only — approval is the next function's job.
 */
export async function autoEnrollNew(env, { cfg, limit = 10, ctx = null } = {}) {
  const out = { considered: 0, enrolled: 0, skipped: [] };
  const { loadReadiness, buyerChecklist } = await import('./requirements.js');
  const readiness = await loadReadiness(env);
  const rows = await salesRows(env,
    `SELECT o.* FROM sales_organizations o
      WHERE o.do_not_contact = 0 AND o.status NOT IN ('suppressed','converted','disqualified')
        AND o.current_tier IN ('A','B')
        AND EXISTS (SELECT 1 FROM sales_contacts c WHERE c.organization_id = o.id AND c.email IS NOT NULL
                      AND c.suppressed = 0 AND c.marketing_email_allowed = 1)
        AND NOT EXISTS (SELECT 1 FROM sales_outreach x WHERE x.organization_id = o.id)
      ORDER BY o.current_score DESC LIMIT ?`, Math.max(1, Math.min(25, limit)));
  for (const org of rows) {
    out.considered++;
    const el = await prospectEligible(env, org, { readiness, checklistFor: buyerChecklist });
    if (!el.ok) { out.skipped.push({ name: org.name, why: el.why }); continue; }
    let opp = await salesRow(env, "SELECT * FROM sales_opportunities WHERE organization_id = ? AND stage NOT IN ('won','lost') ORDER BY created_at DESC LIMIT 1", org.id);
    if (!opp) {
      const made = await createOpportunity(env, org.id, { ctx });
      if (!made.ok) { out.skipped.push({ name: org.name, why: made.error }); continue; }
      opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE id = ?', made.opportunity_id);
    }
    const r = await startSequence(env, { opportunity_id: opp.id, cfg, ctx });
    if (r.ok) out.enrolled++;
    else out.skipped.push({ name: org.name, why: r.error || 'could not enroll' });
  }
  return out;
}

/**
 * Approve the step-1 drafts the standing approval covers. Everything else is left for the owner:
 * later steps, flagged claims, buyers with an open readiness gap, and anything the attestation no
 * longer matches. Sending itself is unchanged — the existing send pass does it, in the window,
 * under the daily cap.
 */
export async function autoApproveIntros(env, { cfg, atMs = Date.now(), limit = 10 } = {}) {
  const status = await autoIntroStatus(env, cfg, { atMs });
  if (!status.ok) return { approved: 0, skipped: [], halted: status.reasons };
  const { loadReadiness, buyerChecklist } = await import('./requirements.js');
  const readiness = await loadReadiness(env);
  const att = await getAttestation(env);
  const room = status.cap > 0 ? Math.max(0, status.cap - status.used_today) : limit;
  const take = Math.max(0, Math.min(limit, room));
  if (!take) return { approved: 0, skipped: [], halted: ['Daily automatic cap reached.'] };

  const drafts = await salesRows(env,
    `SELECT x.*, o.name AS organization_name FROM sales_outreach x
       JOIN sales_organizations o ON o.id = x.organization_id
      WHERE x.status = 'pending_approval' AND x.step_number = 1 AND x.snoozed_until IS NULL
      ORDER BY x.created_at LIMIT ?`, take * 3);
  const out = { approved: 0, skipped: [], attestation: att.fingerprint };
  for (const d of drafts) {
    if (out.approved >= take) break;
    const org = await salesRow(env, 'SELECT * FROM sales_organizations WHERE id = ?', d.organization_id);
    const el = await prospectEligible(env, org, { readiness, checklistFor: buyerChecklist });
    if (!el.ok) { out.skipped.push({ name: d.organization_name, why: el.why }); continue; }
    const flags = parseJson(d.flags_json, []);
    if (Array.isArray(flags) && flags.length) { out.skipped.push({ name: d.organization_name, why: 'flagged claim — a person should read this one' }); continue; }
    const p = await previewOutreach(env, d.id, { cfg });
    if (!p.ok) { out.skipped.push({ name: d.organization_name, why: p.error }); continue; }
    // acknowledge_flags is FALSE on purpose: a machine may not wave anything through. If the draft
    // or the buyer trips a gate, it stays in the queue for the owner.
    const r = await approveOutreach(env, d.id, {
      cfg, subject: p.subject, body: p.body, render_hash: p.render_hash, acknowledge_flags: false,
      ctx: { distinct_id: att.approved_by, role: 'owner', auto: true },
    });
    if (!r.ok) { out.skipped.push({ name: d.organization_name, why: r.error }); continue; }
    await env.DB.prepare('UPDATE sales_outreach SET auto_approved = 1, attestation_hash = ? WHERE id = ?')
      .bind(att.fingerprint, d.id).run();
    out.approved++;
    await logActivity(env, {
      organization_id: d.organization_id, outreach_id: d.id, kind: 'auto_approved',
      detail: { attestation: att.fingerprint, subject: p.subject, attested_at: att.approved_at },
      event: 'sales.auto_approved', props: { step: 1 },
    });
  }
  return out;
}
