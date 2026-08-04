// Instagram token-expiry warning (functions/_lib/instagram_token_expiry.js).
//
// The whole point of this feature is to fail LOUD before the token fails SILENT — Instagram gives
// no warning before a long-lived token dies, and when it does, publishing, the DM inbox, and
// insights all stop working at once with no error a human notices. Two things are pinned here:
//
//   1. 'unknown' must never look like 'ok'. A never-recorded expiry is the exact gap that let a
//      token die silently in the first place — this module must never paper over that gap.
//   2. The status math is a pure function, so every threshold boundary is a one-line assertion,
//      not a stubbed-network integration test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from '../helpers/d1.js';
import {
  tokenExpiryStatus,
  loadTokenExpiry,
  saveTokenExpiry,
  TOKEN_EXPIRY_KEY,
  EXPIRY_WARN_DAYS,
  EXPIRY_URGENT_DAYS,
} from '../../functions/_lib/instagram_token_expiry.js';

const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
// 2026-08-04: the expiry banner now renders inside the Create > Instagram tab of the unified
// marketing.html workspace (see that file's own header comment).
const PAGE = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');

const DAY = 86400000;
const NOW = 1785000000000; // fixed instant, so "days left" math is deterministic

// ---------- pure status math ----------

test('no recorded value is UNKNOWN, never OK — the honesty requirement', () => {
  assert.equal(tokenExpiryStatus(null, NOW).status, 'unknown');
  assert.equal(tokenExpiryStatus(undefined, NOW).status, 'unknown');
  assert.equal(tokenExpiryStatus(0, NOW).status, 'unknown');
  assert.equal(tokenExpiryStatus(-1, NOW).status, 'unknown');
  assert.equal(tokenExpiryStatus(NaN, NOW).status, 'unknown');
  assert.equal(tokenExpiryStatus('not-a-date', NOW).status, 'unknown');
  // 'unknown' carries no days_left — nothing downstream should render a number for it.
  assert.equal(tokenExpiryStatus(null, NOW).days_left, null);
});

test('far out (> 30 days) is OK — the quiet state', () => {
  const r = tokenExpiryStatus(NOW + 31 * DAY, NOW);
  assert.equal(r.status, 'ok');
  assert.equal(r.days_left, 31);
});

test('exactly at the 30-day boundary flips to WARNING', () => {
  assert.equal(tokenExpiryStatus(NOW + (EXPIRY_WARN_DAYS + 1) * DAY, NOW).status, 'ok');
  assert.equal(tokenExpiryStatus(NOW + EXPIRY_WARN_DAYS * DAY, NOW).status, 'warning');
});

test('exactly at the 7-day boundary flips to URGENT', () => {
  assert.equal(tokenExpiryStatus(NOW + (EXPIRY_URGENT_DAYS + 1) * DAY, NOW).status, 'warning');
  assert.equal(tokenExpiryStatus(NOW + EXPIRY_URGENT_DAYS * DAY, NOW).status, 'urgent');
});

test('the moment it passes is EXPIRED, and stays expired after', () => {
  assert.equal(tokenExpiryStatus(NOW, NOW).status, 'expired');
  assert.equal(tokenExpiryStatus(NOW - DAY, NOW).status, 'expired');
  assert.equal(tokenExpiryStatus(NOW - 400 * DAY, NOW).status, 'expired');
});

test('a token dying in ~12 hours still reads as "1 day left", not 0 — ceil, not floor', () => {
  const r = tokenExpiryStatus(NOW + 12 * 3600000, NOW);
  assert.equal(r.days_left, 1);
  assert.equal(r.status, 'urgent');
});

// ---------- storage round-trip (app_settings, no new table) ----------

test('loadTokenExpiry returns null when nothing was ever recorded', async () => {
  const DB = makeD1([[/SELECT value FROM app_settings WHERE key=\?/i, () => null]]);
  const r = await loadTokenExpiry({ DB });
  assert.equal(r.at, null);
});

test('loadTokenExpiry never throws on a broken settings read — degrades to unknown', async () => {
  const DB = makeD1([[/SELECT value FROM app_settings WHERE key=\?/i, () => { throw new Error('D1 down'); }]]);
  const r = await loadTokenExpiry({ DB });
  assert.equal(r.at, null);
});

test('saveTokenExpiry writes under the documented app_settings key, and loadTokenExpiry reads it back', async () => {
  let stored = null;
  const DB = makeD1([
    [/INSERT INTO app_settings/i, ({ args }) => { stored = args; return 1; }],
    [/SELECT value FROM app_settings WHERE key=\?/i, () => (stored ? { value: stored[1] } : null)],
  ]);
  const at = NOW + 60 * DAY;
  const saved = await saveTokenExpiry({ DB }, at, 'owner_1');
  assert.equal(saved.ok, true);
  assert.equal(stored[0], TOKEN_EXPIRY_KEY);
  assert.equal(Number(stored[1]), at);
  const loaded = await loadTokenExpiry({ DB });
  assert.equal(loaded.at, at);
});

test('saveTokenExpiry(null) clears it back to unknown rather than leaving a stale date', async () => {
  let stored = 'unset';
  const DB = makeD1([[/INSERT INTO app_settings/i, ({ args }) => { stored = args[1]; return 1; }]]);
  await saveTokenExpiry({ DB }, null, 'owner_1');
  assert.equal(stored, null, 'clearing must store NULL, not an empty string or stale number');
});

// ---------- wired into the owner API + page ----------

test('the owner API exposes token_expiry on GET and a set_token_expiry op on POST', () => {
  assert.match(API, /token_expiry:\s*\{/, 'GET response must carry the expiry block');
  assert.match(API, /op === 'set_token_expiry'/);
  // Recording a date must never touch the live token — no fetch/graph call in that branch.
  const opStart = API.indexOf("op === 'set_token_expiry'");
  const opEnd = API.indexOf("if (op ===", opStart + 1);
  const opBody = API.slice(opStart, opEnd === -1 ? opStart + 800 : opEnd);
  assert.doesNotMatch(opBody, /IG_ACCESS_TOKEN|graph\(|resolveTarget|accountInfo/, 'must not touch the live token');
});

test('the Social page renders an honest UNKNOWN state and links the swap doc', () => {
  assert.match(PAGE, /Token expiry not recorded/i);
  assert.match(PAGE, /INSTAGRAM_TOKEN_SWAP\.md/);
  // Every threshold state has a distinct CSS hook so unknown/ok/warning/urgent/expired can never
  // collapse into the same visual treatment by accident.
  for (const s of ['unknown', 'ok', 'warning', 'urgent', 'expired']) {
    assert.match(PAGE, new RegExp('expiry-' + s), `missing style hook for '${s}'`);
  }
});

test('the swap doc referenced by the banner actually exists', () => {
  // Throws (failing the test) if the file is missing — the whole point of the link.
  const doc = readFileSync(new URL('../../docs/INSTAGRAM_TOKEN_SWAP.md', import.meta.url), 'utf8');
  assert.ok(doc.length > 500, 'swap doc should not be a stub');
  assert.match(doc, /System User/i);
});
