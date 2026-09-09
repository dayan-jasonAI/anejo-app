// Owner-approved notice: standard catering 48h; custom printing 72h.
// Pure helper shared by server consumers. Never interpret a customer date in UTC
// or use the host timezone. Callers must explicitly supply their serving-window
// start when the checkout collects a date without an exact time.
export const CATERING_TIME_ZONE = 'America/New_York';
export const CATERING_NOTICE_HOURS = Object.freeze({ standard: 48, customPrinting: 72 });

const localClock = new Intl.DateTimeFormat('en-US', {
  timeZone: CATERING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function localParts(ms) {
  const values = {};
  for (const { type, value } of localClock.formatToParts(ms)) {
    if (type !== 'literal') values[type] = Number(value);
  }
  return values;
}

/** Resolve a strict local event date/time to epoch milliseconds, or null.
 * Fall-back clock overlaps use the earlier occurrence so notice is never
 * overstated. Spring-forward nonexistent clock times are rejected.
 */
export function cateringEventTimestamp(eventDate, eventTime) {
  if (typeof eventDate !== 'string' || typeof eventTime !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || !/^\d{2}:\d{2}$/.test(eventTime)) return null;
  const [year, month, day] = eventDate.split('-').map(Number);
  const [hour, minute] = eventTime.split(':').map(Number);
  if (year < 2000 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const calendar = new Date(wall);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null;

  // Offsets on both sides of any NY daylight-saving transition, determined by
  // the platform timezone database rather than hardcoded EDT/EST seasons.
  const offsets = new Set();
  for (const delta of [-36, 0, 36]) {
    const sample = wall + delta * 3600000;
    const p = localParts(sample);
    offsets.add(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - sample);
  }
  const matches = [];
  for (const offset of offsets) {
    const candidate = wall - offset;
    const p = localParts(candidate);
    if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) matches.push(candidate);
  }
  return matches.length ? Math.min(...matches) : null;
}

export function validateCateringNotice({ eventDate, eventTime, defaultEventTime, customPrinting = false, now = Date.now() } = {}) {
  if (typeof customPrinting !== 'boolean') return { ok: false, code: 'INVALID_PRINTING_OPTION', error: 'Choose a valid packaging option.' };
  const minHours = customPrinting ? CATERING_NOTICE_HOURS.customPrinting : CATERING_NOTICE_HOURS.standard;
  if (typeof now !== 'number' || !Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) {
    return { ok: false, code: 'INVALID_CLOCK', error: 'Order timing is temporarily unavailable.', minHours };
  }
  const time = eventTime === undefined || eventTime === null || eventTime === '' ? defaultEventTime : eventTime;
  const eventAt = cateringEventTimestamp(eventDate, time);
  if (eventAt === null) return { ok: false, code: 'INVALID_EVENT_TIME', error: 'Choose a valid event date and time in Eastern Time.', minHours };
  const earliestAt = now + minHours * 3600000;
  if (eventAt < earliestAt) {
    return {
      ok: false, code: 'CATERING_NOTICE_REQUIRED', minHours, eventAt, earliestAt,
      error: customPrinting ? 'Custom-printed catering requires at least 72 hours notice.' : 'Standard catering requires at least 48 hours notice.',
    };
  }
  return { ok: true, minHours, eventAt, earliestAt };
}
