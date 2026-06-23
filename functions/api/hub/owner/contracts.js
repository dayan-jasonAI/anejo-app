// GET /api/hub/owner/contracts — owner view of B2B contract accounts: each account, its sites
// (with the per-site intake link, lazily minted), and the recent daily-count ledger. Owner-only.
import { json, bad, randToken, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  let accounts = [];
  try { accounts = ((await env.DB.prepare('SELECT * FROM contract_accounts ORDER BY name').all()).results) || []; } catch { accounts = []; }

  const out = [];
  for (const a of accounts) {
    let sites = [];
    try { sites = ((await env.DB.prepare('SELECT * FROM contract_sites WHERE account_id = ? ORDER BY name').bind(a.id).all()).results) || []; } catch { sites = []; }
    for (const s of sites) {
      if (!s.intake_token) {
        const tok = randToken(22);
        try { await env.DB.prepare('UPDATE contract_sites SET intake_token = ?, updated_at = ? WHERE id = ?').bind(tok, now(), s.id).run(); s.intake_token = tok; } catch { /* best-effort */ }
      }
    }
    let recent = [];
    try {
      recent = ((await env.DB.prepare(
        'SELECT site_id, service_date, headcount, total_cents, is_rush, invoiced FROM contract_orders WHERE account_id = ? ORDER BY service_date DESC LIMIT 60'
      ).bind(a.id).all()).results) || [];
    } catch { recent = []; }
    out.push({ account: a, sites, recent });
  }
  return json({ ok: true, accounts: out });
};
