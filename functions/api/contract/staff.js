// POST /api/contract/staff  { t, op:'add'|'remove'|'approve', name?, phone?, staff_id? }
//   PUBLIC (token-gated) — but ONLY the site's PRIMARY contact may use it.
//
// The owner can manage a site's roster from the HUB. This endpoint is the client's half of the
// same job: the registered contact can add the colleague who covers for them BEFORE the day they
// are out, instead of the office being stuck waiting on Añejo to add a number. That was the whole
// shape of the 2026-08-03 Pompano failure — the office had a person ready to order and no way to
// authorize her.
//
// AUTHORIZATION IS THE TRUSTED DEVICE, NOT THE TOKEN. The intake link is shareable by design
// (it lives in an email in an office), so holding it cannot be enough to change who may commit
// this account to spend. The caller must be on a device that has completed the 6-digit
// verification AND whose verified number is the site's primary contact number. Anyone else —
// including an authorized non-primary staffer and any stand-in — gets a flat refusal.
import { json, bad, normalizePhone } from '../../_lib/util.js';
import { limitOr429 } from '../../_lib/ratelimit.js';
import { primaryContactDevice, listSiteStaff, addSiteStaff, setStaffActive, maskSiteStaff, sendStaffInvite } from '../../_lib/contract.js';
import { raiseAlert } from '../../_lib/alerts.js';

/**
 * Tell the owner when a CLIENT changes who may order for their own site.
 *
 * The owner handed the primary contact this power so a sick day cannot block the count. Knowing
 * when it is used is how he keeps that power delegated instead of taking it back: the people on
 * this list are the ones who can commit the account to spend, and a roster that grows without him
 * ever seeing it is a billing record he cannot explain later.
 *
 * raiseAlert is the existing owner channel — an alert row plus a payload-less push tickle to his
 * devices. No new notification path, and nothing here reaches the client. Never throws: losing
 * the heads-up must not fail the roster change the office just made.
 */
async function notifyOwnerRosterChange(env, { site, action, name, by }) {
  try {
    const who = (name || 'Someone').toString().slice(0, 60);
    const actor = (by || 'The main contact').toString().slice(0, 60);
    await raiseAlert(env, {
      alert_type: 'contract_roster_changed',
      severity: action === 'removed' ? 'warning' : 'info',
      title: `${site.name}: ${who} ${action === 'added' ? 'can now order' : action === 'allowed' ? 'was allowed to order' : 'can no longer order'}`,
      body: `${actor} ${action} ${who} on the ${site.name} lunch-order list. Anyone on that list gets their own 6-digit code and can submit the daily head count.`,
      team: 'owner',
      ref_type: 'contract_site',
      ref_id: site.id,
      source: 'contract_intake',
      // Per site + person + action, so repeated taps on the same row do not stack up alerts —
      // but a later, different change to the same person still raises a fresh one.
      dedupe_key: `roster:${site.id}:${who}:${action}`,
    });
  } catch { /* best-effort: the office's change stands either way */ }
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const limited = await limitOr429(env, request, { name: 'contract-staff', limit: 20, windowSec: 60 });
  if (limited) return limited;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }

  const ctx = await primaryContactDevice(env, b && b.t, request.headers.get('Cookie') || '');
  if (!ctx.ok) return json({ ok: false, error: ctx.error }, 200);
  const { site } = ctx;

  const op = (b && b.op) || '';

  if (op === 'add') {
    const r = await addSiteStaff(env, {
      site_id: site.id, account_id: site.account_id,
      name: b.name, phone: b.phone, added_by: 'site_contact', active: true,
    });
    if (!r.ok) return json(r, 200);
    let invited = null;
    if (b.invite) {
      invited = await sendStaffInvite(env, {
        site, name: b.name, phone: b.phone, lang: b.lang,
        addedBy: site.contact_name || 'Your office', origin: new URL(request.url).origin,
      });
    }
    await notifyOwnerRosterChange(env, { site, action: 'added', name: b.name, by: site.contact_name });
    return json({ ok: true, invited, staff: maskSiteStaff(await listSiteStaff(env, site.id, { all: true })) });
  }

  // 'approve' promotes a stand-in who already ordered; 'remove' deactivates anybody.
  if (op === 'approve' || op === 'remove') {
    const staffId = String((b && b.staff_id) || '');
    const row = await env.DB.prepare('SELECT * FROM contract_site_staff WHERE id = ? AND site_id = ?').bind(staffId, site.id).first().catch(() => null);
    if (!row) return json({ ok: false, error: 'That person is not on this site’s list.' }, 200);
    // The primary contact is who every receipt is copied to and who authorizes everyone else.
    // Removing them from the intake page would leave the site with no one able to manage it and
    // no one on the receipts — that change belongs to Añejo, not to a phone in an office.
    if (row.is_primary && op === 'remove') return json({ ok: false, error: 'The main contact can only be changed by Añejo. Call us and we’ll update it.' }, 200);
    // Defence in depth: the phone comparison in primaryContactDevice is the gate, and this
    // re-check means a future refactor there cannot silently widen who may edit the roster.
    if (normalizePhone(ctx.device.phone) !== normalizePhone(site.contact_phone)) return json({ ok: false, error: 'Only the main contact can change this list.' }, 200);
    const r = await setStaffActive(env, { staff_id: staffId, active: op === 'approve' });
    if (!r.ok) return json(r, 200);
    await notifyOwnerRosterChange(env, {
      site, action: op === 'approve' ? 'allowed' : 'removed', name: row.name, by: site.contact_name,
    });
    return json({ ok: true, staff: maskSiteStaff(await listSiteStaff(env, site.id, { all: true })) });
  }

  return bad('Unknown action.');
};
