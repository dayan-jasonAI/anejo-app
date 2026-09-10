// /api/hub/owner/sales/deal — proposals and Convert to Contract Account (OWNER ONLY).
//
//   GET  ?opportunity_id=                               → proposals + the computed monthly total
//   POST { op:'save_proposal', opportunity_id, fields }  → create/update the draft terms
//   POST { op:'confirm_proposal', proposal_id, expect_monthly_cents }
//   POST { op:'convert', proposal_id, expect_monthly_cents }   → the bridge into contract_accounts
//   POST { op:'link_existing', opportunity_id, account_id }    → won against an account that already exists
//
// Both confirm and convert carry the monthly total the owner is LOOKING AT. If the stored terms
// produce any other number, nothing happens — the same "the audience changed since you previewed
// it" rule Broadcast uses, applied to money.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { parseJson } from '../../../../_lib/hub.js';
import { salesRows, salesRow } from '../../../../_lib/sales/store.js';
import { saveProposal, confirmProposal, convertToContractAccount, linkExistingAccount, validateProposal, BILLING_MODELS } from '../../../../_lib/sales/convert.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const oppId = new URL(request.url).searchParams.get('opportunity_id') || '';
  const opp = await salesRow(env, 'SELECT * FROM sales_opportunities WHERE id = ?', oppId);
  if (!opp) return bad('Opportunity not found.', 404);
  const org = await salesRow(env, 'SELECT name FROM sales_organizations WHERE id = ?', opp.organization_id);
  const proposals = (await salesRows(env, 'SELECT * FROM sales_proposals WHERE opportunity_id = ? ORDER BY created_at DESC', oppId)).map((p) => {
    const terms = { ...p, sites: parseJson(p.sites_json, []), contacts: parseJson(p.contacts_json, []) };
    const v = validateProposal({ ...terms, estimated_monthly_cents: p.estimated_monthly_cents });
    return { ...terms, sites_json: undefined, contacts_json: undefined, complete: v.ok, missing: v.errors, computed_monthly_cents: v.terms.estimated_monthly_cents ?? null };
  });
  return json({ ok: true, opportunity: opp, organization_name: org && org.name, proposals, billing_models: BILLING_MODELS });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const reply = (r) => (r && r.ok ? json(r) : json({ ok: false, ...r }, r && (r.code === 'account_exists' || r.code === 'stale_total') ? 409 : 400));
  switch (String((b && b.op) || '')) {
    case 'save_proposal': return reply(await saveProposal(env, { opportunity_id: String(b.opportunity_id || ''), fields: b.fields || {}, ctx }));
    case 'confirm_proposal': return reply(await confirmProposal(env, String(b.proposal_id || ''), { ctx, expect_monthly_cents: b.expect_monthly_cents }));
    case 'convert': return reply(await convertToContractAccount(env, { proposal_id: String(b.proposal_id || ''), ctx, expect_monthly_cents: b.expect_monthly_cents }));
    case 'link_existing': return reply(await linkExistingAccount(env, { opportunity_id: String(b.opportunity_id || ''), account_id: String(b.account_id || ''), ctx }));
    default: return bad('Unknown action.');
  }
};
