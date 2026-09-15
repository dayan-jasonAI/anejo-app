import { json } from '../_lib/util.js';
import { readOrderReceipt } from '../_lib/order-receipt.js';

export async function onRequestGet({ request, env }) {
  const headers = { 'Cache-Control': 'no-store', 'Vary': 'Authorization' };
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  try {
    const receipt = await readOrderReceipt(env, token);
    return receipt ? json(receipt, 200, headers) : json({ error: 'Receipt unavailable.' }, 404, headers);
  } catch {
    return json({ error: 'Payment confirmation is temporarily unavailable.' }, 503, headers);
  }
}
