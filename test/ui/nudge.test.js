// The clock-out nudge.
//
// Built after the owner hand-wrote one: eight lines ending with a warning that repeated lapses
// would get the account disconnected — aimed at a new driver who had never been shown the routine.
// A nudge should ask for one thing, in the person's own language, and read like a teammate.
//
// These tests pin the tone as much as the mechanics, because tone is the whole feature.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const API = readFileSync(new URL('../../functions/api/hub/owner/nudge.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/staff.html', import.meta.url), 'utf8');
const STAFF = readFileSync(new URL('../../functions/api/hub/owner/staff/index.js', import.meta.url), 'utf8');

// Pull the message strings out of the NUDGES table.
const MESSAGES = [...API.matchAll(/=> `([^`]+)`/g)].map((m) => m[1]);

test('there are messages in both languages for each nudge', () => {
  assert.ok(MESSAGES.length >= 8, 'first + repeat, EN + ES, for each kind');
});

test('every message is short enough to read on a lock screen', () => {
  for (const m of MESSAGES) {
    assert.ok(m.length <= 220, `too long (${m.length}): ${m.slice(0, 60)}…`);
  }
});

test('no message threatens, warns, or disciplines', () => {
  // The point of a button is that it stays kind every time. If something needs to be said
  // sternly, that is a conversation — not a template someone fires while annoyed.
  const FORBIDDEN = /disconnect|desconect|infracc|violation|warning|advertencia|suspend|terminat|penalt|sanci|consequen|consecuenc|must comply|obligator/i;
  for (const m of MESSAGES) {
    assert.ok(!FORBIDDEN.test(m), `message reads as a warning: ${m.slice(0, 70)}…`);
  }
});

test('every message says thank you', () => {
  for (const m of MESSAGES) {
    assert.ok(/thank|gracias/i.test(m), `no thanks in: ${m.slice(0, 60)}…`);
  }
});

test('a first-time nudge explains why; the repeat is shorter', () => {
  const firstEn = MESSAGES.find((m) => /closes your shift/i.test(m));
  assert.ok(firstEn, 'the first-time message explains what clocking out actually does');
  const repeatEn = MESSAGES.find((m) => /still clocked in/i.test(m));
  assert.ok(repeatEn && repeatEn.length < firstEn.length, 'the repeat does not re-explain');
});

test('the message goes out in the staff member’s language, not the owner’s', () => {
  assert.ok(/st\.lang/.test(API), 'reads the recipient language');
  assert.ok(/startsWith\('es'\)/.test(API));
});

test('a missing phone number fails with something actionable', () => {
  assert.ok(/no mobile number on file/.test(API), 'says what to do, not just "failed"');
});

test('the owner sees exactly what was sent', () => {
  assert.ok(/preview: body/.test(API), 'API returns the text');
  assert.ok(/r\.preview/.test(PAGE), 'and the page shows it');
});

test('the button is on the row of whoever is still clocked in', () => {
  assert.ok(/__nudge/.test(PAGE) && /Remind to clock out/.test(PAGE));
});

test('a long-running shift is described in hours or days, not raw minutes', () => {
  // "6203m" is technically correct and tells you nothing.
  assert.ok(/hrs >= 24/.test(PAGE) && /days/.test(PAGE), 'converts to a human unit');
});

test('staff language is editable after creation', () => {
  assert.ok(/b\.lang !== undefined/.test(STAFF), 'update op accepts lang');
  assert.ok(/active,lang,/.test(STAFF), 'and the roster returns it so the control can show state');
  assert.ok(/data-act="lang"/.test(PAGE), 'with a control on the roster');
});
