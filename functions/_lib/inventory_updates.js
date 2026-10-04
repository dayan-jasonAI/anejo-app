import { id } from './hub.js';
import { sendPushTickle } from './push.js';

export const inventorySnapshot = (row) => row ? JSON.stringify(row) : null;

export function changeInsert({ itemId, action, actorId, before, after, at, changeId = id('ich'), table = 'inventory_items', marker = 'last_change_id' }) {
  if (!['inventory_items','menu_items'].includes(table) || !['last_change_id','last_inventory_change_id'].includes(marker)) throw new Error('Unsupported inventory audit target.');
  const afterSnapshot = after ? { ...after, [marker]: changeId } : null;
  return { changeId, table, marker, statement: { sql: `INSERT INTO inventory_changes (id,item_id,action,actor_id,before_json,after_json,created_at,push_status) SELECT ?,?,?,?,?,?,?,? FROM ${table} WHERE id=? AND ${marker}=?`, args: [changeId,itemId,action,actorId || null,inventorySnapshot(before),inventorySnapshot(afterSnapshot),at,'pending',itemId,changeId] } };
}

export async function notifyInventory(env, changeId) {
  let status = 'noop';
  try {
    const result = await sendPushTickle(env, { roles: ['owner'], notification: { type: 'inventory_updated', id: changeId } });
    status = result?.sent > 0 ? 'sent' : result?.failed > 0 ? 'failed' : 'noop';
  } catch { status = 'failed'; }
  try { await env.DB.prepare('UPDATE inventory_changes SET push_status=? WHERE id=?').bind(status, changeId).run(); } catch { status = 'failed'; }
  return status;
}

export async function commitChange(env, mutation, change) {
  try {
    const prepared = (q) => env.DB.prepare(q.sql).bind(...q.args);
    const results = await env.DB.batch([prepared(mutation), prepared(change.statement)]);
    if (Number(results?.[0]?.meta?.changes) !== 1 || Number(results?.[1]?.meta?.changes) !== 1) return { ok: false, error: new Error('Inventory mutation conflict.') };
    return { ok: true, change_id: change.changeId };
  }
  catch (error) { return { ok: false, error }; }
}
