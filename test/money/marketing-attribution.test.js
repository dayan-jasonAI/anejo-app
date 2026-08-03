// /api/hub/owner/marketing-attribution (0076) — owner-only forwarding of
// functions/_lib/instagram_insights.js:attributionRollup. This route does no math of its own;
// it only gates access, so the tests here check the gate and the pass-through, not the rollup
// math (that's attribution-rollup.test.js's job).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet } from '../../functions/api/hub/owner/marketing-attribution.js';
import { makeD1, makeKV } from '../helpers/d1.js';

const API = readFileSync(new URL('../../functions/api/hub/owner/marketing-attribution.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');

function ownerEnv(routes = []) {
  const sess = JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_owner', email: 'dayan@anejocateringco.com', la: Date.now(), created: Date.now() });
  return {
    SESSIONS: makeKV({ 'session:tok': sess }),
    DB: makeD1([[/^SELECT active FROM staff WHERE id=\?/, () => ({ active: 1 })], ...routes]),
  };
}
const req = () => new Request('https://anejocateringco.com/api/hub/owner/marketing-attribution', {
  headers: { Cookie: 'anejo_sess=tok' },
});

test('GET is owner-gated', async () => {
  const env = { SESSIONS: makeKV({}), DB: makeD1([]) };
  const res = await onRequestGet({ request: req(), env });
  assert.equal(res.status, 401);
  assert.match(API, /requireRole\(request, env, \['owner'\]\)/);
});

test('GET forwards the rollup as-is on a fresh install (no published posts)', async () => {
  const env = ownerEnv([[/FROM social_posts p[\s\S]*JOIN ig_media_metrics m/, () => []]]);
  const res = await onRequestGet({ request: req(), env });
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.equal(d.totalPublished, 0);
  assert.deepEqual(d.byRule, []);
});

test('the marketing HUB page fetches the rollup and renders a card that can say "not enough data"', () => {
  assert.match(PAGE, /\/api\/hub\/owner\/marketing-attribution/, 'the page must actually call the new endpoint');
  assert.match(PAGE, /Reach by cause/);
  assert.match(PAGE, /Not enough data yet/, 'the refusal-to-rank case must be a real rendered state, not just a number');
});
