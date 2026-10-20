// Provider-confirmed replacement, with durable identities before external effects.
// Square DELETE cancels the associated order. Never infer retirement from 404/timeouts:
// https://developer.squareup.com/reference/square/checkout-api/delete-payment-link
import {sendInProgress} from './catering_quote_send_review.js';
import { square } from './square.js';
import {editableUnpaidCheckout} from './catering_checkout_state.js';
import { createDepositCheckout } from './catering_deposit.js';
import { mintAccessToken } from './catering_quote_delivery.js';
import { quoteLineTotals } from './catering_quote_totals.js';
import { depositSplit } from './catering_deposit.js';
import { termsFor } from './catering_terms.js';
import { id } from './hub.js';

export function revisionPayload(body, source) {
  let old = {};
  try { old = JSON.parse(source.quote_json || '{}'); } catch { /* optional metadata */ }
  if(Number(old.tax_cents||0)!==0||Number(old.discount_cents||0)!==0)return {ok:false,error:'Existing tax or discount needs a reviewed recalculation before revision.'};
  const norm = quoteLineTotals(body.lines,body.delivery_fee_cents,old.delivery_fee_cents??null);
  if (!norm.ok) return norm;
  const guests = Number(body.guests);
  const eventDate = String(body.event_date || '');
  if (!Number.isSafeInteger(guests) || guests < 1 || guests > 10000) return { ok: false, error: 'Enter a whole guest count between 1 and 10,000.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !Number.isFinite(Date.parse(eventDate + 'T12:00:00Z')) || new Date(eventDate + 'T12:00:00Z').toISOString().slice(0, 10) !== eventDate) return { ok: false, error: 'Enter a valid event date.' };
  const name = String(body.customer_name || '').trim().slice(0, 80);
  const email = String(body.customer_email || '').trim().toLowerCase().slice(0, 160);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Customer name and email are required.' };
  const split = depositSplit(norm.total_cents, source.deposit_pct);
  if (!split.ok) return split;
  return { ok: true, payload: {
    fixedTerms: termsFor({ totalCents: split.total_cents, depositCents: split.deposit_cents, balanceCents: split.balance_cents, eventDate }),
    totalCents: norm.total_cents, guests, eventDate, customerName: name, customerEmail: email,
    customerPhone: String(body.customer_phone || '').trim().slice(0, 32), lang: body.lang === 'es' ? 'es' : 'en',
    note: String(body.note || '').trim().slice(0, 500), depositPct: source.deposit_pct,
    quoteBreakdown: { ...old, lead_id: old.lead_id || source.source_lead_id || null, source: 'owner_revision', ...(/^[a-zA-Z0-9_-]{1,80}$/.test(String(body.draft_id||''))?{draft_id:body.draft_id}:{}), revised_from: source.id, lines: norm.lines, subtotal_cents: norm.subtotal_cents, total_cents: norm.total_cents, delivery_fee_cents: norm.delivery_fee_cents, discount_cents: 0,
      recommendations: body.recommendations || [] },
  } };
}

export function canceledUnpaidOrder(order, expectedId) {
  return Boolean(order && order.id === expectedId && order.state === 'CANCELED'
    && (order.tenders == null || (Array.isArray(order.tenders) && order.tenders.length === 0))
    && (!order.net_amounts?.total_money || Number(order.net_amounts.total_money.amount) >= 0));
}

export async function reviseQuote(env, body, { actor, baseUrl, approvedLines, approvedGuests }) {
  const sourceId = String(body.quote_id || '');
  const source = await env.DB.prepare('SELECT * FROM catering_quotes WHERE id = ?').bind(sourceId).first();
  if (!source) return { ok: false, error: 'Quote not found.' };
  if(await sendInProgress(env,sourceId))return {ok:false,error:'A quote send is in progress or uncertain. Reconcile its receipt before revising checkout.'};
  const unfinishedParent = await env.DB.prepare("SELECT source_quote_id FROM catering_quote_revisions WHERE replacement_quote_id = ? AND state != 'complete'").bind(sourceId).first();
  const duplicateLock=await env.DB.prepare("SELECT source_quote_id FROM catering_quote_duplicate_retirements WHERE (target_quote_id=? OR source_quote_id=?) AND state!='complete'").bind(sourceId,sourceId).first();
  if(duplicateLock)return {ok:false,error:'Finish recovering the duplicate retirement before revising this quote.'};
  if (unfinishedParent) return { ok: false, error: 'Finish recovering the earlier revision before revising its replacement.' };
  let journal = await env.DB.prepare('SELECT * FROM catering_quote_revisions WHERE source_quote_id = ?').bind(sourceId).first();
  if (journal && ((approvedLines && JSON.stringify(JSON.parse(journal.payload_json).quoteBreakdown.lines) !== JSON.stringify(approvedLines)) || (approvedGuests !== undefined && JSON.parse(journal.payload_json).guests !== approvedGuests))) return { ok: false, error: 'Another revision was saved first. Reload and review its total before continuing.' };
  if (journal && (journal.state === 'complete' || source.deposit_status === 'void')) {
    const q = await env.DB.prepare('SELECT * FROM catering_quotes WHERE id = ?').bind(journal.replacement_quote_id).first();
    if(q?.deposit_status==='void')return {ok:false,error:'The saved replacement is void. Recover the current active quote before continuing.'};
    if (q && journal.state !== 'complete') await env.DB.prepare("UPDATE catering_quote_revisions SET state='complete',updated_at=? WHERE source_quote_id=?").bind(Date.now(), sourceId).run();
    return q ? { ok: true, quote_id: q.id, quote_url: `${baseUrl}/q/${q.access_token}`, url: q.deposit_status==='unpaid'?q.payment_link_url:undefined, deposit_cents: q.deposit_cents, total_cents: q.total_cents, customer_email: q.customer_email, customer_phone: q.customer_phone, recovered: true } : { ok: false, error: 'Replacement record needs recovery.' };
  }
  if (source.deposit_status !== 'unpaid') return { ok: false, error: 'Only unpaid quotes may be revised. Paid bookings retain their agreed terms.' };
  if (!source.payment_link_id || !source.square_order_id) return { ok: false, error: 'Original Square identifiers are missing. Retirement cannot be verified.' };
  if (!journal) {
    if (Number(body.expected_updated_at) !== Number(source.updated_at)) return { ok: false, error: 'Quote changed. Reload before revising.' };
    const parsed = revisionPayload(body, source);
    if (!parsed.ok) return parsed;
    await env.DB.prepare(`INSERT OR IGNORE INTO catering_quote_revisions
      (source_quote_id,replacement_quote_id,access_token,payload_json,source_updated_at,state,created_by,created_at,updated_at)
      SELECT ?,?,?,?,?,'pending',?,?,? WHERE EXISTS (SELECT 1 FROM catering_quotes WHERE id=? AND deposit_status='unpaid' AND updated_at=?) AND NOT EXISTS (SELECT 1 FROM catering_quote_revisions WHERE replacement_quote_id=? AND state!='complete') AND NOT EXISTS(SELECT 1 FROM catering_quote_duplicate_retirements WHERE (target_quote_id=? OR source_quote_id=?) AND state!='complete') AND NOT EXISTS(SELECT 1 FROM catering_quote_send_reviews WHERE quote_id=? AND state IN ('sending','unknown'))`).bind(sourceId, id('cq'), mintAccessToken(), JSON.stringify(parsed.payload), source.updated_at, actor, Date.now(), Date.now(), sourceId, source.updated_at,sourceId,sourceId,sourceId,sourceId).run();
    journal = await env.DB.prepare('SELECT * FROM catering_quote_revisions WHERE source_quote_id = ?').bind(sourceId).first();
    if (!journal) return { ok: false, error: 'Could not save the revision. Nothing retired.' };
  }
  // The first approved payload owns this attempt; recovery never changes it or invents a new checkout.
  const payload = JSON.parse(journal.payload_json);
  if ((approvedLines && JSON.stringify(payload.quoteBreakdown.lines) !== JSON.stringify(approvedLines)) || (approvedGuests !== undefined && payload.guests !== approvedGuests)) return { ok: false, error: 'Another revision was saved first. Reload and review its total before continuing.' };
  if(payload.retainedTargetUpdatedAt!==undefined){const target=await env.DB.prepare('SELECT deposit_status,updated_at FROM catering_quotes WHERE id=?').bind(journal.replacement_quote_id).first();if(!target||target.deposit_status==='void'||target.updated_at!==payload.retainedTargetUpdatedAt)return {ok:false,error:'The retained quote changed. Stop and review duplicate retirement before continuing.'};}
  if (journal.state === 'pending') {
    if (Number(source.updated_at) !== Number(journal.source_updated_at)) return { ok: false, error: 'Original quote changed after this revision was saved. Owner review required.' };
    const before = await square(env, `/v2/orders/${encodeURIComponent(source.square_order_id)}`);
    if (!before.ok || !before.data?.order) return { ok: false, error: 'Cannot verify original Square order. Retry this revision to recover.' };
    const order = before.data.order;
    if (!canceledUnpaidOrder(order, source.square_order_id)) {
      if (!editableUnpaidCheckout(order,source.square_order_id)) return { ok: false, error: 'Square shows payment or a non-editable order. Replacement is blocked; review payments.' };
      const retired = await square(env, `/v2/online-checkout/payment-links/${encodeURIComponent(source.payment_link_id)}`, { method: 'DELETE' });
      if (!retired.ok || retired.data?.cancelled_order_id !== source.square_order_id) return { ok: false, error: 'Original checkout retirement is unconfirmed. Retry to recover; no replacement has been created.' };
    }
    // A successful DELETE alone is not sufficient: inspect the authoritative canceled order after it.
    const proof = await square(env, `/v2/orders/${encodeURIComponent(source.square_order_id)}`);
    if (!proof.ok || !canceledUnpaidOrder(proof.data?.order, source.square_order_id)) return { ok: false, error: 'Cancellation/payment state is uncertain. Replacement is blocked until verified.' };
    await env.DB.prepare("UPDATE catering_quote_revisions SET state='retired',updated_at=? WHERE source_quote_id=? AND state='pending'").bind(Date.now(), sourceId).run();
  }
  const current = await env.DB.prepare('SELECT * FROM catering_quotes WHERE id = ?').bind(sourceId).first();
  if (current?.deposit_status !== 'unpaid') return { ok: false, error: 'A payment was recorded during revision. Stop and review the booking.' };
  const created = await createDepositCheckout(env, { ...payload, createdBy: actor, baseUrl, send: false, fixedQuoteId: journal.replacement_quote_id, fixedAccessToken: journal.access_token });
  if (!created.ok) return { ok: false, error: 'Original checkout is retired. Retry this saved revision to recover its replacement. ' + created.error };
  const retired = payload.retainedTargetUpdatedAt===undefined
    ? await env.DB.prepare("UPDATE catering_quotes SET deposit_status='void',updated_at=? WHERE id=? AND deposit_status='unpaid'").bind(Date.now(), sourceId).run()
    : await env.DB.prepare("UPDATE catering_quotes SET deposit_status='void',updated_at=? WHERE id=? AND deposit_status='unpaid' AND EXISTS(SELECT 1 FROM catering_quotes WHERE id=? AND deposit_status IN ('unpaid','paid') AND updated_at=?)").bind(Date.now(),sourceId,journal.replacement_quote_id,payload.retainedTargetUpdatedAt).run();
  if (retired.meta?.changes !== 1) {
    const check = await env.DB.prepare('SELECT * FROM catering_quotes WHERE id = ?').bind(sourceId).first();
    if (check?.deposit_status !== 'void') return { ok: false, error: 'Replacement saved but source changed. Do not send; owner review required.' };
  }
  await env.DB.prepare("UPDATE catering_quote_revisions SET state='complete',updated_at=? WHERE source_quote_id=?").bind(Date.now(), sourceId).run();
  return { ...created, customer_email: payload.customerEmail, customer_phone: payload.customerPhone, revision_of: sourceId };
}

export {retireDuplicateQuote} from './catering_quote_duplicates.js';
