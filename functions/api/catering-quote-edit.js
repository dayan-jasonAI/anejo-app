import { json } from '../_lib/util.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { getCustomerEdit, customerQuote, previewCustomerEdit, applyCustomerEdit, quoteEditBase } from '../_lib/catering_customer_edit.js';
const reply = (body, status = 200) => json(body, status, { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
async function allowed(env, request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== quoteEditBase(env)) return reply({ error: 'Origin not allowed.' }, 403);
  const limit = await rateLimit(env, request, { name: 'catering-customer-edit', limit: 30, windowSec: 60 });
  return limit.ok ? null : reply({ error: 'Please wait before trying again.' }, 429);
}
export async function onRequestGet({ env, request }) {
  const rejected = await allowed(env, request); if (rejected) return rejected;
  try { const result = await getCustomerEdit(env, new URL(request.url).searchParams.get('token')); return reply(result, result.ok ? 200 : 404); }
  catch { return reply({ error: 'Quote editing is temporarily unavailable.' }, 503); }
}
export async function onRequestPost({ env, request }) {
  const rejected = await allowed(env, request); if (rejected) return rejected;
  if (!request.headers.get('Content-Type')?.includes('application/json')) return reply({ error: 'Send JSON.' }, 415);
  let body; try { const text = await request.text(); if (text.length > 20000) return reply({ error: 'Request too large.' }, 413); body = JSON.parse(text); } catch { return reply({ error: 'Send valid JSON.' }, 400); }
  try {
    let result;
    if (body?.action === 'apply') result = await applyCustomerEdit(env, body);
    else if (body?.action === 'preview') { const quote = await customerQuote(env, body.token); result = quote ? await previewCustomerEdit(env, quote, body) : { ok: false, error: 'That link is not valid.' }; }
    else return reply({ error: 'Choose preview or apply.' }, 400);
    return reply(result, result.ok ? 200 : 409);
  } catch { return reply({ error: 'Could not finish the revision. Retry the same preview to recover safely.' }, 503); }
}
