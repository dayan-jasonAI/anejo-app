// Restock / purchase orders.
//   GET  /api/hub/kitchen/restock/create            → list recent restock orders (+items)
//   GET  /api/hub/kitchen/restock/create?suggest=1  → AI-suggested quantities (graceful demo)
//   POST /api/hub/kitchen/restock/create            → create a draft PO with line items
//        body: { vendor_id?, note?, ai_suggested?, items:[{name,qty,unit,unit_cost_cents}] }
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { id, now, bit } from '../../../../_lib/hub.js';

const MODEL = 'claude-sonnet-4-6';

// A small static pantry baseline used both for demo suggestions and as the AI prompt seed.
const PANTRY = [
  { name: 'Quinoa', unit: 'lb' },
  { name: 'Chicken breast', unit: 'lb' },
  { name: 'Steak (flank)', unit: 'lb' },
  { name: 'Salmon fillet', unit: 'lb' },
  { name: 'Shrimp', unit: 'lb' },
  { name: 'Tuna', unit: 'lb' },
  { name: 'Tofu', unit: 'block' },
  { name: 'Chickpeas', unit: 'can' },
  { name: 'Mixed greens', unit: 'lb' },
  { name: 'Avocado', unit: 'each' },
  { name: 'Pumpkin seeds', unit: 'lb' },
  { name: 'Mango', unit: 'each' },
  { name: 'Lime', unit: 'each' },
];

async function aiSuggest(env, day, orderCount, bowlTally) {
  if (!env.ANTHROPIC_API_KEY) return null;
  const sys = 'You are the kitchen purchasing assistant for Añejo Catering Co. (Mediterranean-Cuban bowls, Palm Beach County). Given recent order volume, suggest restock quantities. Return ONLY a JSON array of {name, qty, unit} objects. Use realistic restaurant quantities. No prose.';
  const user = [
    `Date: ${day}. Recent orders: ${orderCount}.`,
    `Bowl/item tally over the window: ${JSON.stringify(bowlTally)}.`,
    `Pantry items to consider: ${PANTRY.map((p) => `${p.name} (${p.unit})`).join(', ')}.`,
    'Return a JSON array of restock line items.',
  ].join('\n');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: sys, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const text = (data.content || []).map((c) => c.text || '').join('');
    const first = text.indexOf('[');
    const last = text.lastIndexOf(']');
    if (first === -1 || last === -1) return null;
    const arr = JSON.parse(text.slice(first, last + 1));
    return Array.isArray(arr) ? arr.slice(0, 40) : null;
  } catch { return null; }
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);

  if (url.searchParams.get('suggest') === '1') {
    // Build a simple recent-demand signal from the last 7 days of orders.
    const since = now() - 7 * 24 * 3600 * 1000;
    const { results } = await env.DB.prepare(
      "SELECT items FROM orders WHERE created_at >= ? AND status != 'canceled'"
    ).bind(since).all();
    const tally = {};
    let orderCount = 0;
    for (const row of results || []) {
      orderCount += 1;
      let items = [];
      try { items = JSON.parse(row.items || '[]'); } catch { items = []; }
      if (Array.isArray(items)) for (const it of items) {
        const nm = (it && it.name) || 'Item';
        tally[nm] = (tally[nm] || 0) + (Number(it && it.qty) || 1);
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    const ai = await aiSuggest(env, today, orderCount, tally);
    if (ai) return json({ suggested: ai, source: 'ai', order_count: orderCount });
    // Demo fallback: scale baseline pantry by recent order count.
    const factor = Math.max(1, Math.ceil(orderCount / 10));
    const demo = PANTRY.slice(0, 8).map((p) => ({ name: p.name, qty: factor * 5, unit: p.unit }));
    return json({ suggested: demo, source: 'demo', order_count: orderCount });
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM restock_orders ORDER BY created_at DESC LIMIT 50'
  ).all();
  const pos = results || [];
  for (const po of pos) {
    const { results: items } = await env.DB.prepare(
      'SELECT * FROM restock_items WHERE restock_order_id = ? ORDER BY created_at ASC'
    ).bind(po.id).all();
    po.items = items || [];
  }
  return json({ restock_orders: pos });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const items = Array.isArray(b && b.items) ? b.items : [];
  if (!items.length) return bad('At least one line item is required.');

  const poId = id('po');
  const ts = now();
  let totalCents = 0;
  for (const it of items) {
    const qty = Number(it && it.qty) || 0;
    const unitCost = Number(it && it.unit_cost_cents) || 0;
    if (unitCost && qty) totalCents += Math.round(unitCost * qty);
  }

  await env.DB.prepare(
    `INSERT INTO restock_orders (id, created_by, vendor_id, status, ai_suggested, line_item_count, total_cents, note, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    poId, staff ? staff.id : null, (b && b.vendor_id) || null, 'draft',
    bit(b && b.ai_suggested), items.length, totalCents || null, (b && b.note) || null, ts, ts
  ).run();

  for (const it of items) {
    await env.DB.prepare(
      `INSERT INTO restock_items (id, restock_order_id, name, qty, unit, unit_cost_cents, created_at)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(
      id('rsi'), poId, (it && it.name) || 'Item',
      Number(it && it.qty) || null, (it && it.unit) || null,
      it && it.unit_cost_cents != null ? Number(it.unit_cost_cents) : null, ts
    ).run();
  }

  const po = await env.DB.prepare('SELECT * FROM restock_orders WHERE id = ?').bind(poId).first();
  return json({ ok: true, restock_order: po });
};
