// Account history is scoped exclusively to the email established by the session.
// Never accept an email, order id, or customer id from a public query parameter.
export async function customerOrders(env, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !env.DB) return [];
  const rows = await env.DB.prepare(
    `SELECT id, status, items, delivery_date, delivery_window, subtotal_cents,
            fee_cents, discount_cents, total_estimate_cents, created_at
       FROM orders WHERE LOWER(TRIM(customer_email))=?
       ORDER BY created_at DESC LIMIT 30`
  ).bind(normalized).all();
  return (rows.results || []).map((row) => {
    let items = [];
    try { const parsed = JSON.parse(row.items || '[]'); if (Array.isArray(parsed)) items = parsed; } catch { /* malformed legacy items */ }
    return {
      id: row.id, status: row.status || 'pending', delivery_date: row.delivery_date,
      delivery_window: row.delivery_window, created_at: row.created_at,
      subtotal_cents: row.subtotal_cents, fee_cents: row.fee_cents,
      discount_cents: row.discount_cents, total_estimate_cents: row.total_estimate_cents,
      // Only customer-facing item fields; exclude internal fulfillment/provider metadata.
      items: items.filter((item) => item && typeof item === 'object').map((item) => ({
        name: item.name || item.name_es || 'Menu item', qty: item.qty, price_cents: item.price_cents,
      })),
    };
  });
}
