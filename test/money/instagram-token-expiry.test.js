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
  lastObservedTokenUse,
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

// ---------- the stale record: a warning that cried wolf ----------
//
// 2026-09-28, found while checking whether Instagram posting still worked: the Social page was
// showing "token expired since September 20" while the daily insights sweep had pulled live media
// and follower counts on that same token at 10:02 that morning. The token had been regenerated and
// nobody re-recorded the date. The danger is not the wrong pixel — it is that the NEXT warning,
// the real one, gets ignored.

test('a recorded expiry the token outlived is a STALE RECORD, not an outage', () => {
  const expiredAt = NOW - 8 * DAY;        // what the record claimed
  const workedAt = NOW - 10 * 60 * 1000;  // but it was working ten minutes ago
  const r = tokenExpiryStatus(expiredAt, NOW, workedAt);
  assert.equal(r.status, 'stale_record');
  assert.equal(r.recorded_expiry_at, expiredAt, 'keeps the wrong date, so it can be shown and corrected');
  assert.equal(r.last_used_at, workedAt);
  assert.equal(r.days_left, null, 'there is no honest countdown against a date known to be wrong');
});

test('stale_record is NOT ok — the token is still on an unknown 60-day clock', () => {
  const r = tokenExpiryStatus(NOW - 8 * DAY, NOW, NOW - 60 * 1000);
  assert.notEqual(r.status, 'ok');
  assert.notEqual(r.status, 'expired');
});

test('an observation from BEFORE the recorded expiry does not excuse it — still expired', () => {
  const expiredAt = NOW - 2 * DAY;
  // Last seen working three days ago, i.e. a day BEFORE the recorded expiry. That is consistent
  // with the token having died on schedule, so the alarm must stand.
  const r = tokenExpiryStatus(expiredAt, NOW, NOW - 3 * DAY);
  assert.equal(r.status, 'expired');
});

test('an observation can never rescue a token that has not expired yet, or invent a record', () => {
  // A live token stays in its own band regardless of observations.
  assert.equal(tokenExpiryStatus(NOW + 40 * DAY, NOW, NOW).status, 'ok');
  assert.equal(tokenExpiryStatus(NOW + 3 * DAY, NOW, NOW).status, 'urgent');
  assert.equal(tokenExpiryStatus(NOW + 20 * DAY, NOW, NOW).status, 'warning');
  // And 'unknown' stays 'unknown' — the honesty requirement is not weakened by an observation.
  const unk = tokenExpiryStatus(null, NOW, NOW);
  assert.equal(unk.status, 'unknown');
  assert.equal(unk.last_used_at, NOW, 'but it may report what it saw');
});

test('a junk observation is ignored rather than trusted', () => {
  for (const bad of [0, -1, NaN, 'yesterday', null, undefined]) {
    const r = tokenExpiryStatus(NOW - 8 * DAY, NOW, bad);
    assert.equal(r.status, 'expired', `observation ${String(bad)} must not create a stale_record`);
    assert.equal(r.last_used_at, null);
  }
});

test('the observation comes from the insights sweep, and anything else reports nothing seen', async () => {
  // The witness is ig_account_metrics — one row per day, and writing it required a successful
  // authenticated Graph call on the same token the publish path uses.
  const ok = { DB: makeD1([[/MAX\(captured_at\)\s+AS at\s+FROM ig_account_metrics/, () => ({ at: 1790589724920 })]]) };
  assert.equal((await lastObservedTokenUse(ok)).at, 1790589724920);

  // An empty table (MAX over no rows is NULL) is "nothing observed", not a zero date.
  const empty = { DB: makeD1([[/ig_account_metrics/, () => ({ at: null })]]) };
  assert.equal((await lastObservedTokenUse(empty)).at, null);

  // No DB, no binding, and a throwing DB all report "no observation" — never a false one, because
  // a false observation here would silence a REAL expiry.
  assert.equal((await lastObservedTokenUse({})).at, null);
  assert.equal((await lastObservedTokenUse(null)).at, null);
  const boom = { DB: { prepare() { throw new Error('no such table: ig_account_metrics'); } } };
  assert.equal((await lastObservedTokenUse(boom)).at, null);
});

test('the real 2026-09-28 production state resolves to stale_record, not expired', () => {
  // Verbatim from prod: record set 2026-08-02 claiming expiry 2026-09-20 04:00Z; insights sweep
  // captured followers=80 at 2026-09-28 10:02Z on that same token.
  const recorded = 1789876800000;
  const observed = 1790589724920;
  const nowThen = 1790626915905;   // the 20:21Z cron run that day
  const r = tokenExpiryStatus(recorded, nowThen, observed);
  assert.equal(r.status, 'stale_record');
  assert.ok(observed > recorded, 'the observation is after the recorded expiry — that is the proof');
  // Before this fix the same inputs produced a flat "expired", and the page painted it red.
  assert.equal(tokenExpiryStatus(recorded, nowThen).status, 'expired');
});

test('the API cross-checks the record against the observation, and ships both', () => {
  assert.match(API, /lastObservedTokenUse/, 'the endpoint must consult the observation');
  assert.match(API, /tokenExpiryStatus\(recordedExpiry\.at, Date\.now\(\), observedUse\.at\)/);
  assert.match(API, /last_used_at: expiry\.last_used_at/, 'and pass it to the page');
});

test('the page never lets an unknown status inherit the reassuring green line', () => {
  // The original bug shape: EXPIRY_MSG had no 'stale_record' key, the render keyed off "no
  // template found", and so a brand-new status rendered as "🟢 all good (null days)".
  assert.match(PAGE, /if \(te\.status === 'ok'\)/, 'the green branch must key on ok itself');
  assert.match(PAGE, /stale_record: '/, 'and the new state needs its own words');
  assert.match(PAGE, /EXPIRY_MSG\[te\.status\] \|\| EXPIRY_MSG\.unknown/, 'unrecognised falls back to the honest message');
  assert.match(PAGE, /\.live\.expiry-stale_record/, 'and its own colour — amber, not the red of an outage');
});
