import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cajitaLeadId, cajitaPayloadHash, validCajitaRequestId } from '../../functions/_lib/cajita-idempotency.js';

test('Cajita request IDs are UUIDs and map to deterministic lead IDs', () => {
  const requestId = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(validCajitaRequestId(requestId), true);
  assert.equal(validCajitaRequestId('not-a-uuid'), false);
  assert.equal(cajitaLeadId(requestId), 'ld_cj_123e4567e89b12d3a456426614174000');
});

test('payload hash is stable across object key order and changes with details', async () => {
  assert.equal(await cajitaPayloadHash({ b: 2, a: 1 }), await cajitaPayloadHash({ a: 1, b: 2 }));
  assert.notEqual(await cajitaPayloadHash({ a: 1 }), await cajitaPayloadHash({ a: 2 }));
});

test('draft migration atomically reserves the request key and stores the payload fingerprint', () => {
  const sql = readFileSync(new URL('../../docs/evidence/cajita-3d-2026-09-07/draft-idempotency.sql', import.meta.url), 'utf8');
  assert.match(sql, /request_id TEXT PRIMARY KEY/);
  assert.match(sql, /payload_hash TEXT NOT NULL/);
  assert.match(sql, /lead_id TEXT NOT NULL UNIQUE/);
});
