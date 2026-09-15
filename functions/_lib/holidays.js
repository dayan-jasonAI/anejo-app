// US federal holidays, and the dates they are actually OBSERVED. Files under functions/_lib are NOT routed.
//
// WHY THIS EXISTS. Dayan's policy, 2026-09-14: ahead of every federal holiday Añejo writes to ask
// whether the program is open that day, and if Añejo's own kitchen is closed for a holiday it
// observes, the client hears it at least SEVEN DAYS beforehand. Both promises are made in writing on
// the prospect landing page, so the calendar underneath them has to be right — a reminder that
// arrives on the wrong Monday is worse than no reminder, because the client stops trusting the ones
// that do arrive.
//
// THE OBSERVED DATE IS NOT THE DATE. 5 U.S.C. §6103: when a holiday falls on a Saturday it is
// observed the preceding Friday, and on a Sunday the following Monday. That shift is the whole
// point for a lunch service — nobody delivers on the holiday itself, they deliver (or do not) on the
// weekday the office is shut. New Year's Day is the cruel one: 1 January 2028 is a Saturday, so it
// is observed on Friday 31 December 2027, in the previous year. Any scan of "the next 30 days" that
// only looks at one calendar year will miss it, which is why `upcomingHolidays()` spans years.
//
// Dates are plain 'YYYY-MM-DD' strings and every calculation is done at UTC noon. Añejo runs in one
// timezone and a Date built at midnight local is one of the classic ways a date silently becomes the
// day before.

/** The eleven, in calendar order. `rule` is read by dateOf() below and nowhere else. */
export const FEDERAL_HOLIDAYS = Object.freeze([
  { key: 'new_years_day', name: "New Year's Day", rule: { type: 'fixed', month: 1, day: 1 } },
  { key: 'mlk_day', name: 'Birthday of Martin Luther King, Jr.', rule: { type: 'nth_dow', month: 1, dow: 1, n: 3 } },
  { key: 'washingtons_birthday', name: "Washington's Birthday", rule: { type: 'nth_dow', month: 2, dow: 1, n: 3 } },
  { key: 'memorial_day', name: 'Memorial Day', rule: { type: 'last_dow', month: 5, dow: 1 } },
  { key: 'juneteenth', name: 'Juneteenth National Independence Day', rule: { type: 'fixed', month: 6, day: 19 } },
  { key: 'independence_day', name: 'Independence Day', rule: { type: 'fixed', month: 7, day: 4 } },
  { key: 'labor_day', name: 'Labor Day', rule: { type: 'nth_dow', month: 9, dow: 1, n: 1 } },
  { key: 'columbus_day', name: 'Columbus Day', rule: { type: 'nth_dow', month: 10, dow: 1, n: 2 } },
  { key: 'veterans_day', name: 'Veterans Day', rule: { type: 'fixed', month: 11, day: 11 } },
  { key: 'thanksgiving', name: 'Thanksgiving Day', rule: { type: 'nth_dow', month: 11, dow: 4, n: 4 } },
  { key: 'christmas_day', name: 'Christmas Day', rule: { type: 'fixed', month: 12, day: 25 } },
]);

export const HOLIDAY_KEYS = Object.freeze(FEDERAL_HOLIDAYS.map((h) => h.key));
export const holidayByKey = (k) => FEDERAL_HOLIDAYS.find((h) => h.key === k) || null;

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
const iso = (dt) => dt.toISOString().slice(0, 10);

/** The holiday's ACTUAL date in a given year, before any weekend shift. */
function dateOf(rule, year) {
  if (rule.type === 'fixed') return utc(year, rule.month, rule.day);
  if (rule.type === 'nth_dow') {
    const first = utc(year, rule.month, 1);
    const shift = (rule.dow - first.getUTCDay() + 7) % 7;
    return utc(year, rule.month, 1 + shift + (rule.n - 1) * 7);
  }
  // last_dow: walk back from the final day of the month to the wanted weekday.
  const lastDay = new Date(Date.UTC(year, rule.month, 0, 12)).getUTCDate();
  const last = utc(year, rule.month, lastDay);
  return utc(year, rule.month, lastDay - ((last.getUTCDay() - rule.dow + 7) % 7));
}

/**
 * The weekday a holiday is observed on: Saturday shifts BACK to Friday, Sunday FORWARD to Monday.
 * Returns a Date; may land in the adjacent calendar year (New Year's Day, see the header).
 */
export function observedDate(actual) {
  const dow = actual.getUTCDay();
  const shift = dow === 6 ? -1 : dow === 0 ? 1 : 0;
  return new Date(actual.getTime() + shift * 86400000);
}

/** Every federal holiday in `year`, with the date it actually falls on and the date it is observed. */
export function federalHolidays(year) {
  return FEDERAL_HOLIDAYS.map((h) => {
    const actual = dateOf(h.rule, year);
    const obs = observedDate(actual);
    return {
      key: h.key,
      name: h.name,
      date: iso(actual),
      observed: iso(obs),
      // True when the office closure lands on a different weekday than the holiday itself, which is
      // the case a human gets wrong and therefore the one worth saying out loud in the email.
      shifted: iso(obs) !== iso(actual),
    };
  });
}

/**
 * Holidays OBSERVED within [fromMs, fromMs + days]. Spans calendar years on purpose: a New Year's
 * Day observed on 31 December belongs to the December scan, not to next January's.
 */
export function upcomingHolidays(fromMs, days = 30) {
  const from = new Date(fromMs);
  const startYear = from.getUTCFullYear();
  const all = [...federalHolidays(startYear - 1), ...federalHolidays(startYear), ...federalHolidays(startYear + 1)];
  const start = iso(from);
  const end = iso(new Date(fromMs + days * 86400000));
  return all
    .filter((h) => h.observed >= start && h.observed <= end)
    .sort((a, b) => (a.observed < b.observed ? -1 : a.observed > b.observed ? 1 : 0));
}

/** Whole days from `fromMs` to an observed date. Negative once the date has passed. */
export function daysUntil(observedIso, fromMs) {
  const target = Date.parse(`${observedIso}T12:00:00Z`);
  return Math.round((target - new Date(new Date(fromMs).toISOString().slice(0, 10) + 'T12:00:00Z').getTime()) / 86400000);
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Thursday 26 November" — how a person writes a date they have to act on. */
export function longDay(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
