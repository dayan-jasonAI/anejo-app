// Deterministic owner-operated fulfillment. No provider, checkout, or notification calls.
import { id, etDateOf, parseJson } from './hub.js';
const notifications = { enabled: false, sent: false };
const failure = (error, status = 409) => ({ ok: false, error, status });
export const executionQuoteSnapshot = q => JSON.stringify([q.quote_json, q.event_date, q.serving_time, q.address, q.guests, q.dietary_notes]);
const snapshot = executionQuoteSnapshot;
const blank = quote_id => ({ quote_id, status:'planned', version:0, delivery_mode:null, travel_minutes:null,
  setup_minutes:null, handling_confirmed:false, packing_confirmed:false });
function quoteBlockers(q, at) {
  if (!q) return ['Event not found.'];
  const out = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(q.event_date || '') || q.event_date < etDateOf(at)) out.push('Past or undated events cannot be changed through live execution.');
  if (q.deposit_status !== 'paid') out.push('A paid, non-void deposit is required.');
  const lines = parseJson(q.quote_json, {})?.lines;
  if (!Array.isArray(lines) || !lines.length || lines.some(l => !String(l?.name || '').trim() || !String(l?.qty || '').trim()) || !(q.guests > 0)) out.push('A complete itemized menu and guest count are required.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(q.serving_time || '')) out.push('Confirm the event serving time.');
  return out;
}
function next(e) {
  if (!e.delivery_mode) return [];
  return ({planned:['preparing'],preparing:['ready'],ready:e.delivery_mode === 'pickup' ? ['completed'] : ['en_route'],en_route:['arrived'],arrived:['completed'],completed:[]})[e.status] || [];
}
export async function readExecution(env, quoteId, {at = Date.now()} = {}) {
  const q = await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(quoteId).first();
  if (!q) return failure('Event not found.',404);
  const row = await env.DB.prepare('SELECT * FROM catering_execution WHERE quote_id=?').bind(quoteId).first();
  const execution = row ? {...row,handling_confirmed:!!row.handling_confirmed,packing_confirmed:!!row.packing_confirmed} : blank(quoteId);
  const history = await env.DB.prepare('SELECT id,from_status,to_status,version,actor,note,recorded_at FROM catering_execution_transitions WHERE quote_id=? ORDER BY version').bind(quoteId).all();
  const blockers = quoteBlockers(q,at);
  const configurable = !blockers.length && ['planned','preparing'].includes(execution.status);
  const read_only = !!blockers.length;
  if (row && row.quote_snapshot !== snapshot(q)) blockers.push('Event details changed. Reconfirm the execution plan before continuing.');
  if (next(execution).includes('completed') && !(q.balance_status === 'paid' || q.balance_status === 'waived' || q.balance_cents === 0)) blockers.push('The recorded balance must be paid or waived before completion.');
  return {ok:true, configurable, read_only, execution, transitions:history.results || [], available_actions:blockers.length ? [] : next(execution), blockers, notifications};
}
export async function mutateExecution(env, b, ctx, {at = Date.now()} = {}) {
  if (ctx?.role !== 'owner' || !(ctx.email || ctx.distinct_id)) return failure('Owner access required.',403);
  if (!b?.quote_id || !['configure','transition'].includes(b.op) || !Number.isInteger(b.expected_version) || b.expected_version < 0 || !/^[\w-]{8,100}$/.test(b.idempotency_key || '')) return failure('Quote, action, version and a unique request key are required.',400);
  const actor = ctx.email || ctx.distinct_id;
  const requestJson = JSON.stringify([b.op,b.expected_version,b.target_status || null,b.delivery_mode || null,b.travel_minutes ?? null,b.setup_minutes ?? null,b.handling_confirmed === true,b.packing_confirmed === true,String(b.note || '').slice(0,1000),actor]);
  const previous = await env.DB.prepare('SELECT request_json FROM catering_execution_transitions WHERE quote_id=? AND idempotency_key=?').bind(b.quote_id,b.idempotency_key).first();
  if (previous) return previous.request_json === requestJson ? {...await readExecution(env,b.quote_id,{at}),replayed:true} : failure('Request key already belongs to another action.');
  const q = await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(b.quote_id).first();
  if (!q) return failure('Event not found.',404);
  const blockers = quoteBlockers(q,at);
  if (blockers.length) return failure(blockers.join(' '));
  const e = await env.DB.prepare('SELECT * FROM catering_execution WHERE quote_id=?').bind(b.quote_id).first() || blank(b.quote_id);
  if (e.version !== b.expected_version) return failure('The event changed. Reload before continuing.');
  let target = e.status;
  const config = {...e};
  if (b.op === 'configure') {
    if (!['planned','preparing'].includes(e.status)) return failure('The packed execution plan cannot be changed.');
    if (!['owner_self','pickup'].includes(b.delivery_mode)) return failure('Choose owner delivery or customer pickup.',400);
    if (![b.travel_minutes,b.setup_minutes].every(n => Number.isInteger(n) && n >= 0 && n <= 720) || b.handling_confirmed !== true) return failure('Confirm travel/setup minutes and food handling for every dish.',400);
    if (b.delivery_mode === 'pickup' && b.travel_minutes !== 0) return failure('Pickup travel minutes must be zero.',400);
    if (b.delivery_mode === 'owner_self' && !String(q.address || '').trim()) return failure('Confirm the delivery address.');
    Object.assign(config,{delivery_mode:b.delivery_mode,travel_minutes:b.travel_minutes,setup_minutes:b.setup_minutes,handling_confirmed:1,quote_snapshot:snapshot(q)});
  } else {
    if (e.quote_snapshot !== snapshot(q)) return failure('Event details changed. Reconfirm the execution plan before continuing.');
    target = b.target_status;
    if (!next(e).includes(target)) return failure('That execution transition is not available.');
    if (target === 'ready' && b.packing_confirmed !== true) return failure('Confirm the food and all packages are ready.');
    if (target === 'ready') config.packing_confirmed = 1;
    if (target === 'completed' && !(q.balance_status === 'paid' || q.balance_status === 'waived' || q.balance_cents === 0)) return failure('The recorded balance must be paid or waived before completion.');
  }
  // Quote snapshot/payment predicates close the read/write race. Audit failure rolls back state.
  const result = await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO catering_execution (quote_id,created_at,updated_at) VALUES (?,?,?)').bind(q.id,at,at),
    env.DB.prepare(`UPDATE catering_execution SET status=?,version=version+1,delivery_mode=?,travel_minutes=?,setup_minutes=?,handling_confirmed=?,packing_confirmed=?,quote_snapshot=?,updated_by=?,updated_at=?
      WHERE quote_id=? AND version=? AND EXISTS (SELECT 1 FROM catering_quotes q WHERE q.id=? AND q.deposit_status='paid' AND COALESCE(q.quote_json,'')=? AND COALESCE(q.event_date,'')=? AND COALESCE(q.serving_time,'')=? AND COALESCE(q.address,'')=? AND q.guests=? AND q.dietary_notes IS ? AND q.balance_status IS ? AND q.balance_cents IS ?)`)
      .bind(target,config.delivery_mode,config.travel_minutes,config.setup_minutes,config.handling_confirmed ? 1:0,config.packing_confirmed ? 1:0,config.quote_snapshot,actor,at,q.id,e.version,q.id,q.quote_json || '',q.event_date || '',q.serving_time || '',q.address || '',q.guests,q.dietary_notes,q.balance_status,q.balance_cents),
    env.DB.prepare(`INSERT INTO catering_execution_transitions (id,quote_id,idempotency_key,request_json,from_status,to_status,version,actor,note,recorded_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE changes()=1`)
      .bind(id('cex'),q.id,b.idempotency_key,requestJson,e.status,target,e.version+1,actor,String(b.note || '').slice(0,1000) || null,at),
  ]);
  if (result[1]?.meta?.changes !== 1) {
    // Another identical request may have won after our initial replay lookup.
    const winner = await env.DB.prepare('SELECT request_json FROM catering_execution_transitions WHERE quote_id=? AND idempotency_key=?').bind(b.quote_id,b.idempotency_key).first();
    if (winner?.request_json === requestJson) return {...await readExecution(env,q.id,{at}),replayed:true};
    return failure('The event changed. Reload before continuing.');
  }
  return readExecution(env,q.id,{at});
}
