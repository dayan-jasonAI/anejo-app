// A signed-in customer can open only their own current outstanding balance. Identity comes
// exclusively from the verified-email session; no amount, customer email or payment URL is input.
import { currentUser } from '../../_lib/session.js';
import { json as responseJson, appBaseUrl } from '../../_lib/util.js';
import { createBalanceCheckout } from '../../_lib/catering_balance.js';

const json = (body, status = 200) => responseJson(body, status, { 'Cache-Control': 'no-store, private' });
export const onRequestPost = async ({ request, env }) => {
  const session = await currentUser(env, request);
  if (!session || session.type !== 'client') return json({ ok: false, error: 'Sign in to your account first.' }, 401);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json({ ok: false, error: 'Please open your Añejo account to continue.' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Invalid request.' }, 400); }
  if (!body || !/^cq_[A-Za-z0-9_-]{1,100}$/.test(String(body.quote_id || ''))) return json({ ok: false, error: 'Event unavailable.' }, 404);
  try {
    const quote = await env.DB.prepare(
      "SELECT id,deposit_status,balance_status FROM catering_quotes WHERE id=? AND LOWER(TRIM(customer_email))=? AND deposit_status!='void'"
    ).bind(body.quote_id, String(session.email || '').trim().toLowerCase()).first();
    if (!quote) return json({ ok: false, error: 'Event unavailable.' }, 404);
    if (quote.balance_status === 'paid' || quote.balance_status === 'waived') return json({ ok: false, settled: true, error: 'No payment is due. Refresh your account for the latest status.' }, 409);
    if (quote.deposit_status !== 'paid') return json({ ok: false, error: 'Please review your quote and booking deposit first.' }, 409);
    const result = await createBalanceCheckout(env, quote.id, appBaseUrl(env, request));
    if (!result.ok) return json({ ok: false, error: result.error || 'The payment link is unavailable. Please try again.' }, 409);
    const current = await env.DB.prepare(`SELECT q.deposit_status,q.balance_status,q.balance_cents,
      b.amount_cents AS checkout_amount,b.payment_link_url,b.paid_at
      FROM catering_quotes q LEFT JOIN catering_balance_checkouts b ON b.quote_id=q.id
      WHERE q.id=? AND LOWER(TRIM(q.customer_email))=?`
    ).bind(quote.id, String(session.email || '').trim().toLowerCase()).first();
    if (!current || current.deposit_status !== 'paid' || current.balance_status !== 'due' || current.balance_cents <= 0 || current.checkout_amount !== current.balance_cents || current.paid_at || current.payment_link_url !== result.url) return json({ ok: false, refresh_required: true, error: 'Payment status changed. Refresh your account before continuing.' }, 409);
    const checkout = new URL(result.url);
    if (checkout.protocol !== 'https:' || !['square.link', 'squareup.com', 'checkout.square.site'].includes(checkout.hostname)) return json({ ok: false, error: 'The payment link needs review. Please contact Añejo.' }, 409);
    return json({ ok: true, url: result.url });
  } catch {
    return json({ ok: false, error: 'We could not open payment right now. Please try again.' }, 503);
  }
};
