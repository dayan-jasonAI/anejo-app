import { id } from './hub.js';
import { sendPushTickle } from './push.js';

export const inventorySnapshot = (row) => row ? JSON.stringify(row) : null;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function inventoryRequest(env, actorId, action, body) {
  const requestId = body && body.request_id;
  if (requestId == null || requestId === '') return { request: null, replay: null, conflict: false };
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(requestId)) {
    return { request: null, replay: null, conflict: true };
  }
  const payload = { ...body };
  delete payload.request_id;
  const input = canonical({ action, payload });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const actor = String(actorId || 'anonymous');
  const keyDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${actor}\0${requestId}`));
  const key = [...new Uint8Array(keyDigest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const row = await env.DB.prepare("SELECT id,action,after_json,push_status FROM inventory_changes WHERE actor_id=? AND json_extract(after_json,'$.__request.id')=? ORDER BY created_at DESC LIMIT 1").bind(actor, requestId).first();
  if (!row) return { request: { id: requestId, hash, changeId: `ich_req_${key}` }, replay: null, conflict: false };
  let metadata;
  try { metadata = JSON.parse(row.after_json || 'null')?.__request; } catch { metadata = null; }
  if (!metadata || metadata.hash !== hash) return { request: null, replay: null, conflict: true };
  const saved = metadata.response && typeof metadata.response === 'object' ? metadata.response : {};
  let after = {};
  try { after = JSON.parse(row.after_json || '{}') || {}; } catch { /* legacy malformed audit is not replayable */ }
  const receipt = { id: after.id, revision: after.revision ?? after.inventory_revision ?? null,
    inventory_revision: after.inventory_revision ?? null, stock_count: after.stock_count,
    on_hand: after.on_hand, active: after.active, photo_status: after.photo_status };
  return { request: null, replay: { ...receipt, ...saved, ok: true, persisted: true, replayed: true, change_id: row.id, push_status: row.push_status }, conflict: false };
}

export function changeInsert({ itemId, action, actorId, before, after, at, changeId = id('ich'), table = 'inventory_items', marker = 'last_change_id', request }) {
  if (!['inventory_items','menu_items'].includes(table) || !['last_change_id','last_inventory_change_id'].includes(marker)) throw new Error('Unsupported inventory audit target.');
  const afterSnapshot = after ? { ...after, [marker]: changeId, ...(request ? { __request: request } : {}) } : null;
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
