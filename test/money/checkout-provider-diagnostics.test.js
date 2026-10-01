import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/checkout.js';
import { makeD1 } from '../helpers/d1.js';
async function attempt(providerStatus, responseBody) {
  const originalFetch = globalThis.fetch, originalError = console.error;
  const logs = []; let calls = 0;
  const DB = makeD1([]);
  globalThis.fetch = async url => {
    assert.match(String(url), /squareupsandbox/); calls++;
    return new Response(JSON.stringify(responseBody), { status: providerStatus });
  };
  console.error = value => logs.push(JSON.parse(value));
  try {
    const d = new Date(); d.setUTCDate(d.getUTCDate() + 10); if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
    const response = await onRequestPost({
      env: { DB, SQUARE_ENV: 'sandbox', SQUARE_ACCESS_TOKEN: 'DO_NOT_LOG_TOKEN', SQUARE_LOCATION_ID: 'test-only' },
      request: new Request('https://example.com/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        items: [{ id: 'vida', qty: 3 }], delivery: { date: d.toISOString().slice(0, 10), window: 'lunch' },
        address: { street: '123 Main St', city: 'West Palm Beach', zip: '33401' }, contact: { first_name: 'PRIVATE_NAME', email: 'private@example.com' },
      }) }),
    });
    return { response, logs, calls, sql: DB.sqlLog() };
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
}
test('Square rejection logs only machine diagnosis and does not echo details or retry', async () => {
  const result = await attempt(400, { errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'BAD_REQUEST', field: 'order.service_charges[0].calculation_phase', detail: 'private@example.com DO_NOT_LOG_TOKEN PRIVATE_NAME' }] });
  assert.equal(result.response.status, 502); const body = await result.response.text();
  assert.match(body, /contact Añejo/); assert.doesNotMatch(body, /private@example|DO_NOT_LOG|PRIVATE_NAME|BAD_REQUEST/);
  assert.deepEqual(result.logs, [{ event: 'checkout.square_rejected', status: 400, errors: [{ category: 'INVALID_REQUEST_ERROR', code: 'BAD_REQUEST', field: 'order.service_charges[0].calculation_phase' }] }]);
  assert.equal(result.calls, 1); assert.equal(result.sql.some(s => s.startsWith('INSERT INTO orders')), false);
});
test('unstructured and excessive provider errors are bounded and sanitized', async () => {
  const result = await attempt(502, { errors: Array.from({ length: 12 }, () => ({ code: 'secret@email.com', category: { token: 'secret' }, field: 'customer.email=private@example.com', detail: 'secret' })) });
  assert.equal(result.logs[0].errors.length, 5);
  assert.ok(result.logs[0].errors.every(e => e.code === null && e.category === null && e.field === null));
  assert.doesNotMatch(JSON.stringify(result.logs), /secret|private/);
});
test('missing checkout URL emits a distinct safe event without dumping provider data', async () => {
  const result = await attempt(200, { payment_link: { id: 'DO_NOT_LOG', order_id: 'DO_NOT_LOG' } });
  assert.equal(result.response.status, 502);
  assert.deepEqual(result.logs, [{ event: 'checkout.square_missing_payment_link', status: 200 }]);
  assert.equal(result.calls, 1); assert.equal(result.sql.some(s => s.startsWith('INSERT INTO orders')), false);
});
