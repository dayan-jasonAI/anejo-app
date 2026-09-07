import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanThemePrompt, sameOrigin, themeCore } from '../../functions/_lib/cajita-theme.js';
import { onRequestGet, onRequestPost } from '../../functions/api/cajita-theme.js';

test('theme prompt is bounded and control characters are removed', () => {
  const out = cleanThemePrompt('  dark\nforest\u0000 pattern  ');
  assert.equal(out, 'dark forest pattern');
  assert.equal(cleanThemePrompt('x'.repeat(800)).length, 500);
});

test('theme core makes the no-logo/no-words boundary explicit', () => {
  const core = themeCore('terracotta and palm shadows');
  assert.match(core.positive, /background and subtle repeating pattern/i);
  assert.match(core.negative, /logos/);
  assert.match(core.negative, /typography/);
  assert.match(core.negative, /food/);
});

test('origin check accepts same origin and rejects foreign origin', () => {
  const env = { APP_BASE_URL: 'https://anejocateringco.com' };
  assert.equal(sameOrigin(new Request('https://anejocateringco.com/api/cajita-theme', { headers: { Origin: 'https://anejocateringco.com' } }), env), true);
  assert.equal(sameOrigin(new Request('https://anejocateringco.com/api/cajita-theme', { headers: { Origin: 'https://evil.example' } }), env), false);
});

test('GET reports capability without exposing secrets', async () => {
  const response = await onRequestGet({ env: { DB: {}, MEDIA: {}, SESSIONS: {}, CAJITA_AI_PREVIEW_ENABLED: 'true', OPENAI_API_KEY: 'secret' } });
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.capability.available, true);
  assert.equal(JSON.stringify(body).includes('secret'), false);
});

test('GET is unavailable until the owner explicitly enables the feature', async () => {
  const response = await onRequestGet({ env: { DB: {}, MEDIA: {}, SESSIONS: {}, OPENAI_API_KEY: 'secret' } });
  const body = await response.json();
  assert.equal(body.capability.available, false);
});

test('POST fails closed when budget/storage state is unavailable', async () => {
  const response = await onRequestPost({
    request: new Request('https://anejocateringco.com/api/cajita-theme', { method: 'POST', body: JSON.stringify({ prompt: 'green linen' }), headers: { Origin: 'https://anejocateringco.com', 'content-type': 'application/json' } }),
    env: {},
  });
  assert.equal(response.status, 503);
});

test('POST rejects oversized bodies and missing rate-limit binding', async () => {
  const request = new Request('https://anejocateringco.com/api/cajita-theme', { method: 'POST', body: 'x'.repeat(5000), headers: { Origin: 'https://anejocateringco.com' } });
  const response = await onRequestPost({ request, env: { DB: {}, MEDIA: {} } });
  assert.equal(response.status, 503);
  const bounded = await onRequestPost({ request, env: { DB: {}, MEDIA: {}, SESSIONS: { get: async () => '0', put: async () => {} }, CAJITA_AI_PREVIEW_ENABLED: 'true' } });
  assert.equal(bounded.status, 413);
});
