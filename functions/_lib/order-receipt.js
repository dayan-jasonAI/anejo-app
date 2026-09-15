import { randToken } from './util.js';

// Guest capability scoped to one new checkout; it grants no account or customer-data access.
export async function createOrderReceipt(env, orderId) {
  if (!env.SESSIONS) return null;
  const token = randToken(32);
  await env.SESSIONS.put(`order-receipt:${token}`, JSON.stringify({ orderId, created: Date.now() }), { expirationTtl: 86400 });
  return token;
}

export async function readOrderReceipt(env, token) {
  if (!/^[a-f0-9]{64}$/.test(token || '') || !env.SESSIONS || !env.DB) return null;
  const raw = await env.SESSIONS.get(`order-receipt:${token}`);
  if (!raw) return null;
  let receipt;
  try { receipt = JSON.parse(raw); } catch { return null; }
  if (!receipt?.orderId || !Number.isFinite(receipt.created) || Date.now() - receipt.created > 86400000) return null;
  const order = await env.DB.prepare(
    'SELECT id, status, subtotal_cents, discount_cents FROM orders WHERE id=?'
  ).bind(receipt.orderId).first();
  if (!order) return null;
  const paid = ['paid', 'prep', 'ready', 'fulfilled'].includes(order.status);
  if (!paid) return { paid: false };
  const subtotal = Number(order.subtotal_cents);
  const discount = Number(order.discount_cents || 0);
  return {
    paid: true, transaction_id: order.id, currency: 'USD',
    ...(Number.isFinite(subtotal) && order.subtotal_cents != null && Number.isFinite(discount)
      ? { value: Math.max(0, subtotal - discount) / 100 } : {}),
  };
}
