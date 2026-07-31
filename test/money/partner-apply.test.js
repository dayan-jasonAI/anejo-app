// The /affiliate page is APPLICATION-ONLY — a strategy decision, pinned so a future edit cannot
// quietly undo it. Dayan pulled the public terms because: a published rate ANCHORS every
// negotiation under a dial that is deliberately per-partner (10-50% in the HUB); the
// renewals-included mechanic is the growth playbook and a public page hands it to competitors;
// and curated programs read premium precisely because they do not post terms. Terms travel ONLY
// in the private welcome email at approval (partners.js), where they always lived.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../../public/affiliate.html', import.meta.url), 'utf8');
const GO = readFileSync(new URL('../../public/go.html', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/partner-apply.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0068_partner_applications.sql', import.meta.url), 'utf8');

test('no commission terms appear on ANY public page', () => {
  for (const [name, src] of [['affiliate.html', PAGE], ['go.html', GO]]) {
    // 1.5 alone false-positives on CSS letter-spacing — match the terms as they were written.
    assert.ok(!/10%|1\.5[×x]|commission|renewals included/i.test(src), `${name} publishes no terms`);
  }
  // The private welcome email is the one place terms belong — and it still has them.
  const PARTNERS = readFileSync(new URL('../../functions/api/hub/owner/partners.js', import.meta.url), 'utf8');
  assert.match(PARTNERS, /commission_pct.*of every sale/, 'terms live in the approval email');
});

test('the page owns the posture: personally reviewed, terms shared privately on yes', () => {
  assert.match(PAGE, /reviewed personally/i);
  assert.match(PAGE, /shared privately/i);
  assert.match(PAGE, /submitting is not acceptance/i);
});

test('the mailto is gone — applications go through the form', () => {
  assert.ok(!/mailto:/.test(PAGE), 'no scrapable address, no untrackable applications');
  assert.match(PAGE, /fetch\('\/api\/partner-apply'/);
});

test('the endpoint validates server-side and never trusts the page', () => {
  assert.match(API, /if \(!name\) return bad/);
  assert.match(API, /if \(!isEmail\(email\)\) return bad/);
  assert.match(API, /if \(!instagram && type === 'creator'\) return bad/, 'a creator without a handle is not reviewable');
  assert.match(API, /if \(!reason\) return bad/);
});

test('a public write is rate-limited and the IP is hashed, never stored raw', () => {
  assert.match(API, /limitOr429\(env, request, \{ name: 'partner-apply', limit: 5, windowSec: 3600 \}\)/);
  assert.match(API, /SHA-256/);
  assert.ok(!/INSERT[\s\S]*cf-connecting-ip/.test(API), 'the raw IP never reaches the insert');
});

test('the owner hears about every application; the applicant is promised only a review', () => {
  assert.match(API, /type: 'partner_application'/);
  assert.match(API, /sendPushTickle\(env, \{ roles: \['owner'\] \}\)/);
  assert.ok(!/approved|welcome/i.test(API.split('return json')[1] || ''), 'the response promises nothing');
});

test('the trainers deep-link preselects the gym/trainer path', () => {
  assert.match(PAGE, /location\.hash === '#trainers'/);
  assert.match(MIG, /'creator' \| 'gym_trainer'/);
});
