// /api/hub/owner/orders — manual order entry (phone / in-person sales).
//   POST { customer_name, customer_email?, phone?, items:[{name,qty,price_cents?}],
//          delivery_date, delivery_window:'lunch'|'dinner', subtotal_cents?, fee_cents?,
//          status?:'paid'|'pending', note? }
//        → inserts an orders row (square_order_id NULL marks it manual), default status
//          'paid' (payment collected by hand), totals computed server-side
//          (tax from env.SALES_TAX_PCT, default 7%). Note/phone ride along inside the
//          items JSON as a trailing meta entry so the kitchen board surfaces them.
//          Fires order.received {manual:true}. NO SMS is sent from here.
//   GET  → recent manual orders (square_order_id IS NULL), newest first, limit 20.
// Owner-only.
import { json, bad, id, now, isEmail, normalizePhone } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { parseJson } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let rows = [];
  try {
    const res = await env.DB.prepare(
      'SELECT id, items, delivery_date, delivery_window, subtotal_cents, fee_cents, tax_pct, ' +
      'total_estimate_cents, status, customer_name, customer_email, created_at ' +
      'FROM orders WHERE square_order_id IS NULL ORDER BY created_at DESC LIMIT 20'
    ).all();
    rows = (res && res.results) || [];
  } catch {
    rows = [];
  }
  const items = rows.map((o) => ({ ...o, items: parseJson(o.items, []) }));
  return json({ ok: true, items, count: items.length });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const customerName = (b && b.customer_name || '').toString().trim().slice(0, 120);
  if (!customerName) return bad('Customer name is required.');

  let customerEmail = (b && b.customer_email || '').toString().trim().toLowerCase();
  if (customerEmail && !isEmail(customerEmail)) return bad('Invalid customer email.');
  if (!customerEmail) customerEmail = null;

  const phone = normalizePhone(b && b.phone);

  const dateStr = (b && b.delivery_date || '').toString().trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return bad('Delivery date must be YYYY-MM-DD.');
  const win = (b && b.delivery_window || '').toString();
  if (win !== 'lunch' && win !== 'dinner') return bad("Delivery window must be 'lunch' or 'dinner'.");

  const rawItems = Array.isArray(b && b.items) ? b.items : [];
  if (!rawItems.length) return bad('Add at least one item.');
  if (rawItems.length > 40) return bad('Too many item lines.');

  const orderItems = [];
  let computedSubtotal = 0;
  let itemCount = 0;
  for (const it of rawItems) {
    const name = (it && it.name || '').toString().trim().slice(0, 120);
    if (!name) return bad('Every item needs a name.');
    const qty = Math.floor(Number(it && it.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) return bad(`Invalid quantity for ${name}.`);
    let priceCents = 0;
    if (it && it.price_cents != null && it.price_cents !== '') {
      priceCents = Math.round(Number(it.price_cents));
      if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > 500000) return bad(`Invalid price for ${name}.`);
    }
    computedSubtotal += priceCents * qty;
    itemCount += qty;
    orderItems.push({ name, qty, price_cents: priceCents });
  }

  // Note + phone ride inside the items JSON as a trailing meta entry — the kitchen board
  // renders array entries as "name ×qty", so the note is visible where prep happens.
  const note = (b && b.note || '').toString().trim().slice(0, 500);
  if (note || phone) {
    const label = note
      ? `Note: ${note}${phone ? ` · 📞 ${phone}` : ''}`
      : `📞 ${phone}`;
    orderItems.push({ id: 'meta', name: label, qty: 1, price_cents: 0, meta: { manual: true, note: note || null, phone: phone || null } });
  }

  // Totals: subtotal override accepted, fee default 0, tax from env (FL+PBC 7% default).
  let subtotalCents = computedSubtotal;
  if (b && b.subtotal_cents != null && b.subtotal_cents !== '') {
    subtotalCents = Math.round(Number(b.subtotal_cents));
    if (!Number.isFinite(subtotalCents) || subtotalCents < 0 || subtotalCents > 10000000) return bad('Invalid subtotal.');
  }
  let feeCents = 0;
  if (b && b.fee_cents != null && b.fee_cents !== '') {
    feeCents = Math.round(Number(b.fee_cents));
    if (!Number.isFinite(feeCents) || feeCents < 0 || feeCents > 100000) return bad('Invalid fee.');
  }
  const taxPct = Number(env.SALES_TAX_PCT || 7);
  const totalCents = Math.round((subtotalCents + feeCents) * (1 + taxPct / 100));

  const status = (b && b.status) === 'pending' ? 'pending' : 'paid';

  const orderId = id('ord');
  const t = now();
  await env.DB.prepare(
    `INSERT INTO orders (id, square_order_id, payment_link_id, items, delivery_date, delivery_window,
        subtotal_cents, fee_cents, tax_pct, total_estimate_cents, status, customer_name, customer_email,
        created_at, updated_at)
     VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    orderId, JSON.stringify(orderItems), dateStr, win,
    subtotalCents, feeCents, taxPct, totalCents, status, customerName, customerEmail, t, t
  ).run();

  await capture(env, {
    event: 'order.received',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { order_id: orderId, item_count: itemCount, delivery_window: win, manual: true },
  });

  return json({
    ok: true,
    order: {
      id: orderId,
      square_order_id: null,
      items: orderItems,
      delivery_date: dateStr,
      delivery_window: win,
      subtotal_cents: subtotalCents,
      fee_cents: feeCents,
      tax_pct: taxPct,
      total_estimate_cents: totalCents,
      status,
      customer_name: customerName,
      customer_email: customerEmail,
      created_at: t,
    },
  });
};
