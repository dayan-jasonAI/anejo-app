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
import { primaryContactDevice, listSiteStaff, addSiteStaff, setStaffActive, maskSiteStaff } from '../../_lib/contract.js';

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
    return json({ ok: true, staff: maskSiteStaff(await listSiteStaff(env, site.id, { all: true })) });
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
    return json({ ok: true, staff: maskSiteStaff(await listSiteStaff(env, site.id, { all: true })) });
  }

  return bad('Unknown action.');
};
