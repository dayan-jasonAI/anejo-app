// The time trace's arithmetic, exercised rather than grepped.
//
// Dayan asked for "a time log or time trace of her activity and time actively working in the
// hub" — explicitly NOT a clock-in. The number is only worth having if it cannot be inflated by
// leaving a tab open, so these are the cases that decide whether it is honest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accrue, IDLE_GAP_MS } from '../../functions/api/hub/marketing/session.js';

const MIN = 60 * 1000;

test('a normal heartbeat contributes its own interval', () => {
  const t = 1_700_000_000_000;
  assert.equal(accrue(t, t + 60 * 1000), 60);
  assert.equal(accrue(t, t + 90 * 1000), 90);
});

test('a gap wider than the idle window contributes NOTHING', () => {
  // The tab left open over lunch, or overnight. This is the case the whole design exists for:
  // counting it would make "6h worked" mean "the browser was open for 6h".
  const t = 1_700_000_000_000;
  assert.equal(accrue(t, t + IDLE_GAP_MS + 1), 0);
  assert.equal(accrue(t, t + 8 * 60 * MIN), 0, 'an overnight gap is worth zero, not eight hours');
});

test('the boundary itself still counts — the cut is above the window, not at it', () => {
  const t = 1_700_000_000_000;
  assert.equal(accrue(t, t + IDLE_GAP_MS), IDLE_GAP_MS / 1000);
});

test('clock skew and replays cannot add time', () => {
  const t = 1_700_000_000_000;
  assert.equal(accrue(t, t), 0, 'a repeated heartbeat at the same instant adds nothing');
  assert.equal(accrue(t, t - 5000), 0, 'a heartbeat from the past adds nothing');
  assert.equal(accrue(null, t), 0);
  assert.equal(accrue(undefined, t), 0);
  assert.equal(accrue('nonsense', t), 0);
});

test('a full working day accrues to roughly that day, not to the hours the tab was open', () => {
  // Simulate: 90 min of steady work, a 2-hour lunch with the tab open, 45 min more.
  let last = 1_700_000_000_000;
  let total = 0;
  const beat = (deltaMs) => { const now = last + deltaMs; total += accrue(last, now); last = now; };

  for (let i = 0; i < 90; i++) beat(MIN);   // 90 one-minute heartbeats
  beat(120 * MIN);                          // lunch — one heartbeat two hours later
  for (let i = 0; i < 45; i++) beat(MIN);

  assert.equal(total, 135 * 60, '135 minutes of work, not 255 minutes of open tab');
});

test('the idle window is minutes, not hours — a value that large would defeat the point', () => {
  assert.ok(IDLE_GAP_MS >= 2 * MIN, 'too tight and a slow network reads as walking away');
  assert.ok(IDLE_GAP_MS <= 15 * MIN, 'too loose and "still at the desk" stops being a fair claim');
});
