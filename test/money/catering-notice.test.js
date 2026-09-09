import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cateringEventTimestamp, validateCateringNotice } from '../../functions/_lib/catering-notice.js';

test('catering time uses Eastern winter, summer, and midnight rather than host timezone', () => {
  for (const [date, time, expected] of [
    ['2026-01-15', '12:00', '2026-01-15T17:00:00Z'],
    ['2026-07-15', '12:00', '2026-07-15T16:00:00Z'],
    ['2026-07-15', '00:00', '2026-07-15T04:00:00Z'],
  ]) assert.equal(cateringEventTimestamp(date, time), Date.parse(expected));
});

test('notice accepts the exact boundary and rejects even one millisecond short', () => {
  const eventAt = Date.parse('2026-09-12T16:00:00Z');
  for (const customPrinting of [false, true]) {
    const hours = customPrinting ? 72 : 48;
    const args = { eventDate: '2026-09-12', eventTime: '12:00', customPrinting, now: eventAt - hours * 3600000 };
    assert.equal(validateCateringNotice(args).ok, true);
    const rejected = validateCateringNotice({ ...args, now: args.now + 1 });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, 'CATERING_NOTICE_REQUIRED');
    assert.equal(rejected.minHours, hours);
  }
});

test('custom printing cannot use the standard 48 hour rule', () => {
  const args = { eventDate: '2026-09-12', eventTime: '12:00', now: Date.parse('2026-09-10T16:00:00Z') };
  assert.equal(validateCateringNotice(args).ok, true);
  assert.equal(validateCateringNotice({ ...args, customPrinting: true }).ok, false);
});

test('spring forward is elapsed hours, not two calendar days', () => {
  const args = { eventDate: '2026-03-09', eventTime: '12:00', now: Date.parse('2026-03-07T17:00:00Z') };
  assert.equal(validateCateringNotice(args).ok, false, '47 elapsed hours is insufficient');
  assert.equal(validateCateringNotice({ ...args, now: Date.parse('2026-03-07T16:00:00Z') }).ok, true);
  assert.equal(cateringEventTimestamp('2026-03-08', '02:30'), null);
});

test('fall back chooses earlier ambiguous time and respects the additional elapsed hour', () => {
  assert.equal(cateringEventTimestamp('2026-11-01', '01:30'), Date.parse('2026-11-01T05:30:00Z'));
  assert.equal(validateCateringNotice({ eventDate: '2026-11-02', eventTime: '12:00', now: Date.parse('2026-10-31T17:00:00Z') }).ok, true);
});

test('date-only callers must explicitly provide their serving-window start', () => {
  const args = { eventDate: '2026-09-12', now: Date.parse('2026-09-01T00:00:00Z') };
  assert.equal(validateCateringNotice(args).code, 'INVALID_EVENT_TIME');
  assert.equal(validateCateringNotice({ ...args, defaultEventTime: '11:00' }).eventAt, Date.parse('2026-09-12T15:00:00Z'));
  assert.equal(validateCateringNotice({ ...args, eventTime: '13:00', defaultEventTime: '11:00' }).eventAt, Date.parse('2026-09-12T17:00:00Z'));
});

test('invalid dates, times, caller clocks, and nonboolean printing fail closed', () => {
  for (const [date, time] of [['2026-02-30', '12:00'], ['2026-13-01', '12:00'], ['2026-01-00', '12:00'], ['2026-01-01', '24:00'], ['2026-01-01', '12:60'], ['2026-01-01', '1:00'], ['2026-01-01', '12:00Z'], ['2026-1-1', '12:00'], [null, '12:00']]) {
    assert.equal(cateringEventTimestamp(date, time), null);
  }
  const args = { eventDate: '2026-09-12', eventTime: '12:00', now: 0 };
  for (const customPrinting of ['false', 'true', 0, 1, null]) assert.equal(validateCateringNotice({ ...args, customPrinting }).code, 'INVALID_PRINTING_OPTION');
  for (const now of [NaN, Infinity, null, '2026-01-01', 1e20]) assert.equal(validateCateringNotice({ ...args, now }).code, 'INVALID_CLOCK');
  assert.equal(validateCateringNotice().ok, false);
});
