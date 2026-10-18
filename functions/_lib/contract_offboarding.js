import { etDate } from './contract.js';

// Offboarding preserves all orders, invoice balances, menus and historical records.
// D1 batch is atomic: a missing audit/support table rolls every change back.
export async function offboardContractAccount(env, ctx, input) {
  const accountId = String(input.account_id || '').trim();
  const date = String(input.effective_date || '');
  const reason = String(input.reason || '').trim();
  const today = etDate(Date.now());
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > today) {
    return { ok: false, error: 'Choose a valid effective date on or before today. Offboarding stops service immediately.' };
  }
  if (!reason || reason.length > 500) return { ok: false, error: 'Provide a reason (500 characters maximum).' };
  if (input.confirm !== true) return { ok: false, error: 'Confirm that all locations and ordering access should be offboarded.' };
  const account = await env.DB.prepare('SELECT id, name, status FROM contract_accounts WHERE id = ?').bind(accountId).first();
  if (!account) return { ok: false, error: 'Account not found.' };
  const sites = (await env.DB.prepare('SELECT id, name, active FROM contract_sites WHERE account_id = ?').bind(accountId).all()).results;
  const future = await env.DB.prepare('SELECT COUNT(*) AS count FROM contract_orders WHERE account_id = ? AND service_date >= ?').bind(accountId, today).first();
  const warnings = Number(future?.count) ? [`${future.count} existing order record(s) dated today or later remain unchanged. Review fulfillment separately; no orders were canceled or refunded.`] : [];
  if (account.status === 'terminated') return { ok: true, already_offboarded: true, warnings };
  const stamp = Date.now();
  const siteIds = 'SELECT id FROM contract_sites WHERE account_id = ?';
  const prepare = (sql, ...args) => env.DB.prepare(sql).bind(...args);
  await env.DB.batch([
    prepare("UPDATE contract_accounts SET status = 'terminated', updated_at = ? WHERE id = ?", stamp, accountId),
    prepare('UPDATE contract_sites SET active = 0, updated_at = ? WHERE account_id = ?', stamp, accountId),
    prepare(`UPDATE contract_site_staff SET active = 0 WHERE site_id IN (${siteIds})`, accountId),
    prepare(`UPDATE contract_intake_devices SET revoked = 1 WHERE site_id IN (${siteIds})`, accountId),
    prepare(`UPDATE contract_feedback_qr SET active = 0 WHERE site_id IN (${siteIds})`, accountId),
    prepare(`UPDATE contract_survey_reminders SET status = 'blocked', error = 'Account offboarded', updated_at = ? WHERE site_id IN (${siteIds}) AND status = 'queued'`, stamp, accountId),
    prepare(`UPDATE alerts SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ?, updated_at = ? WHERE status = 'open' AND ref_type = 'contract_site' AND (ref_id IN (${siteIds}) OR ref_id IN (SELECT name FROM contract_sites WHERE account_id = ?))`, ctx.distinct_id || null, stamp, stamp, accountId, accountId),
    prepare(`INSERT OR IGNORE INTO contract_terms_events (id, account_id, site_id, event, changed_by, changed_role, before_json, after_json, note, created_at) VALUES (?, ?, NULL, 'offboarded', ?, 'owner', ?, ?, ?, ?)`, `cte_offboard_${accountId}`, accountId, ctx.email || ctx.distinct_id || null, JSON.stringify({ account, sites }), JSON.stringify({ status: 'terminated', effective_date: date, executed_at: stamp, active_sites: 0, historical_orders_preserved: true }), reason, stamp),
  ]);
  return { ok: true, effective_date: date, sites_offboarded: sites.length, warnings };
}
