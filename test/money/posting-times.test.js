// Posting-time table (functions/_lib/posting_times.js): the researched default slots, and
// assignSlot — the enforcement the planner's prompt always ASKED the model for ("never two
// posts in the same hour") but nothing ever checked, so a model repeat used to collide silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_POSTING_SLOTS, MIN_HOUR, MAX_HOUR, assignSlot, getPostingTimes, setPostingTimes, weekdayIndexOf,
} from '../../functions/_lib/posting_times.js';
import { makeKV } from '../helpers/d1.js';

const LIB = readFileSync(new URL('../../functions/_lib/posting_times.js', import.meta.url), 'utf8');

test('the default table covers every weekday and matches the researched windows', () => {
  for (let d = 0; d <= 6; d++) assert.ok(Array.isArray(DEFAULT_POSTING_SLOTS[d]) && DEFAULT_POSTING_SLOTS[d].length, `day ${d} has slots`);
  // Weekday core (11-13 lunch decision) + secondary (17-19 dinner decision).
  for (const d of [1, 2, 3, 4, 5]) {
    assert.ok(DEFAULT_POSTING_SLOTS[d].some((h) => h >= 11 && h <= 13), `weekday ${d} has a lunch-window slot`);
    assert.ok(DEFAULT_POSTING_SLOTS[d].some((h) => h >= 17 && h <= 19), `weekday ${d} has a dinner-window slot`);
  }
  // Weekends: weakest for feed — only the evening window, not a lunch slot too.
  for (const d of [0, 6]) {
    assert.equal(DEFAULT_POSTING_SLOTS[d].length, 1, 'weekend gets one slot, not two');
    assert.ok(DEFAULT_POSTING_SLOTS[d][0] >= 17 && DEFAULT_POSTING_SLOTS[d][0] <= 19, 'and it is the evening window');
  }
});

test('weekdayIndexOf agrees with Date#getUTCDay for known dates', () => {
  assert.equal(weekdayIndexOf('2026-08-03'), 1, 'Monday');
  assert.equal(weekdayIndexOf('2026-08-02'), 0, 'Sunday');
  assert.equal(weekdayIndexOf('2026-08-07'), 5, 'Friday');
});

test('assignSlot picks the nearest free table slot to what was requested', () => {
  const monday = assignSlot(DEFAULT_POSTING_SLOTS, 1, 13, new Set());
  assert.equal(monday, 12, 'nearest slot to 13 on a weekday is the noon slot, not the evening one');
  const evening = assignSlot(DEFAULT_POSTING_SLOTS, 1, 17, new Set());
  assert.equal(evening, 18);
});

test('assignSlot NEVER double-books a slot — the second request for a taken hour moves to the other slot', () => {
  const used = new Set();
  const first = assignSlot(DEFAULT_POSTING_SLOTS, 1, 12, used);
  used.add(first);
  const second = assignSlot(DEFAULT_POSTING_SLOTS, 1, 12, used); // model repeats itself
  assert.notEqual(second, first, 'a repeated request for the same hour must not collide');
  used.add(second);
  assert.deepEqual([...used].sort((a, b) => a - b), [12, 18]);
});

test('assignSlot keeps assigning UNIQUE hours even once every table slot for the day is spoken for', () => {
  const used = new Set();
  const hours = [];
  // Ask for the same hour six times running on one weekend day, which only has ONE table slot.
  for (let i = 0; i < 6; i++) {
    const h = assignSlot(DEFAULT_POSTING_SLOTS, 6, 18, used); // Saturday
    assert.ok(!used.has(h), `hour ${h} was already claimed on request #${i + 1}`);
    used.add(h);
    hours.push(h);
  }
  assert.equal(new Set(hours).size, hours.length, 'six requests, six distinct hours');
  for (const h of hours) assert.ok(h >= MIN_HOUR && h <= MAX_HOUR, 'still clamped to the server window');
});

test('assignSlot clamps an out-of-range or garbage requested hour before using it', () => {
  const h1 = assignSlot(DEFAULT_POSTING_SLOTS, 1, 3, new Set());   // below MIN_HOUR
  const h2 = assignSlot(DEFAULT_POSTING_SLOTS, 1, 23, new Set());  // above MAX_HOUR
  const h3 = assignSlot(DEFAULT_POSTING_SLOTS, 1, NaN, new Set()); // not a number
  for (const h of [h1, h2, h3]) assert.ok(h >= MIN_HOUR && h <= MAX_HOUR);
});

test('getPostingTimes falls back to defaults with no KV entry, and setPostingTimes round-trips', async () => {
  const env = { SESSIONS: makeKV({}) };
  assert.deepEqual(await getPostingTimes(env), DEFAULT_POSTING_SLOTS);
  const r = await setPostingTimes(env, { 5: [11, 19] });
  assert.equal(r.ok, true);
  const table = await getPostingTimes(env);
  assert.deepEqual(table[5], [11, 19], 'Friday overridden');
  assert.deepEqual(table[1], DEFAULT_POSTING_SLOTS[1], 'Monday untouched, still the default');
});

test('an invalid slot table entry (out of range hours, non-array) falls back to that day\'s default', async () => {
  const env = { SESSIONS: makeKV({ 'cfg:social_posting_times': JSON.stringify({ 2: [3, 40, 'x'], 3: 'not-an-array' }) }) };
  const table = await getPostingTimes(env);
  assert.deepEqual(table[2], DEFAULT_POSTING_SLOTS[2], 'every candidate hour was out of range');
  assert.deepEqual(table[3], DEFAULT_POSTING_SLOTS[3], 'not even an array');
});

test('the module documents the research behind the default windows', () => {
  assert.match(LIB, /11:00-13:00|11-13/);
  assert.match(LIB, /Friday/);
  assert.match(LIB, /weekends are the weakest/i);
});
