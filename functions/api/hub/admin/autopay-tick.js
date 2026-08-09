// POST /api/hub/admin/autopay-tick
//   Charges contract invoices that have passed BOTH safeties: the contracts switch is on AND an
//   owner has approved that invoice's exact amount. Everything else is refused and logged.
//
// Auth: owner session OR an X-Cron-Key header matching env.CRON_KEY (constant-time).
//
// THE SHORT-CIRCUIT IS DELIBERATE. When the switch is off this endpoint reads one settings row and
// returns — it does not enumerate invoices, does not touch Square, and cannot charge anything even
// if an approval exists. "Off" has to mean off at the top of the function, not off inside a loop.
//
// A charged invoice CONSUMES its approval (see _lib/autopay.js), so this tick running hourly does
// not re-charge anything: the second pass finds no approval and refuses.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { captureSystem } from '../../../_lib/track.js';
import { raiseAlert } from '../../../_lib/alerts.js';
import { getAutopaySettings, chargeContractInvoice } from '../../../_lib/autopay.js';

function ctEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cronAuthed(request, env) {
  const k = request.headers.get('x-cron-key');
  return !!(env.CRON_KEY && k && ctEq(k, env.CRON_KEY));
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  if (!cronAuthed(request, env)) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }

  const settings = await getAutopaySettings(env);
  if (!settings.contracts_enabled) {
    return json({ ok: true, skipped: 'autopay_off', charged: 0, refused: 0, settings });
  }

  // Only invoices an owner has already approved are even loaded. The per-invoice gate in
  // chargeContractInvoice re-checks everything anyway — this WHERE clause is an optimisation, not
  // the safety. Two independent checks is the intent.
  let rows = [];
  try {
    const r = await env.DB.prepare(
      `SELECT * FROM contract_invoices
        WHERE status IN ('open','sent')
          AND autopay_approved_at IS NOT NULL
          AND autopay_approved_cents IS NOT NULL
        ORDER BY autopay_approved_at ASC LIMIT 50`
    ).all();
    rows = (r && r.results) || [];
  } catch {
    return json({ ok: true, charged: 0, refused: 0, note: 'No approved invoices could be read — migration 0086 may not be applied.' });
  }

  let charged = 0, refused = 0, failed = 0;
  const results = [];
  for (const inv of rows) {
    const r = await chargeContractInvoice(env, inv, { actor: 'cron', settings });
    if (r.charged) charged += 1;
    else if (r.reason === 'square_error') failed += 1;
    else refused += 1;
    results.push({ invoice_id: inv.id, charged: !!r.charged, reason: r.reason || null });

    // A refusal on an APPROVED invoice means the amount moved after approval — the owner has to
    // look, because the invoice is still unpaid and the client is expecting it to be handled.
    if (!r.charged && r.reason && r.reason !== 'autopay_off') {
      await raiseAlert(env, {
        alert_type: 'autopay_refused', severity: 'warning',
        dedupe_key: `autopay_refused:${inv.id}:${r.reason}`,
        title: 'Automatic charge refused',
        body: `Invoice ${inv.number || inv.id} was not charged — ${r.reason}. It is still unpaid.`,
        ref_type: 'invoice', ref_id: inv.id,
      }).catch(() => {});
    }
  }

  try {
    await captureSystem(env, {
      event: 'automation.run', role: 'system',
      properties: { automation_type: 'contract_autopay', outcome: failed ? 'failed' : 'success', charged, refused, failed },
    });
  } catch { /* best-effort */ }

  return json({ ok: true, charged, refused, failed, results });
};
