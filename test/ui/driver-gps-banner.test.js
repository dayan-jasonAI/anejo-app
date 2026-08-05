// Two owner rulings implemented on the driver route screen (public/hub/driver/route.html):
//   A) GPS tracks any active route, not just one flagged status='started' (a driver who skips
//      pickup confirmation and taps "Mark delivered" directly never sets that status — the
//      2026-08-04 incident's other half, alongside functions/api/hub/driver/location.js).
//   B) A persistent, plainly-worded banner shows exactly while location is being shared, in
//      both English and Spanish (the drivers are Spanish speakers).
//
// There is no DOM here to execute against — these are source-pattern tests, matching the rest
// of test/ui, pinning the literal code a browser would run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROUTE = readFileSync(new URL('../../public/hub/driver/route.html', import.meta.url), 'utf8');
const I18N = readFileSync(new URL('../../public/assets/js/i18n.js', import.meta.url), 'utf8');

// ---------- Part A: tracking is no longer gated on status==='started' ----------

test('the old start/stop condition (status===\'started\' before allHandled) is gone', () => {
  assert.doesNotMatch(ROUTE, /status === 'started' && !allHandled\) startGps\(\)/);
});

test('tracking is driven by "not completed/canceled and not all-handled", not a driver tap', () => {
  const idx = ROUTE.indexOf('var stillOpen');
  assert.ok(idx > -1, 'the unified tracking condition must exist');
  const line = ROUTE.slice(idx, ROUTE.indexOf(';', idx) + 1);
  assert.match(line, /r\.status !== 'completed'/);
  assert.match(line, /r\.status !== 'canceled'/);
  assert.match(line, /!allHandled/);
});

test('every early-return render() branch turns tracking off, not just stopGps()', () => {
  // setTracking(false) is what also hides the banner; a stray stopGps() would silently leave
  // the banner showing "location sharing is ON" while nothing is actually pinging.
  const branches = ROUTE.match(/pickSection\.hidden = true; delivSection\.hidden = true;[^\n]*/g) || [];
  assert.ok(branches.length >= 3, 'expected the network-error, no-route, and offer-pending branches');
  for (const line of branches) assert.match(line, /setTracking\(false\)/);
});

test('visibility-regain re-pings only while gpsTimer says tracking is actually on', () => {
  assert.match(ROUTE, /document\.hidden && gpsTimer\)/);
  assert.doesNotMatch(ROUTE, /routeData\.route\.status === 'started'\)\s*\{\s*pingOnce/, 'must not resurrect the old status check here');
});

// ---------- Part B: the banner ----------

test('the banner element exists and starts hidden (no .show class) until setTracking(true) adds it', () => {
  assert.match(ROUTE, /<div id="gps-banner" class="gps-banner">/);
  assert.doesNotMatch(ROUTE, /<div id="gps-banner" class="gps-banner show/);
});

test('setTracking is the ONLY thing that toggles the banner, keeping it in lockstep with gpsTimer', () => {
  const start = ROUTE.indexOf('function setTracking');
  assert.ok(start > -1);
  const body = ROUTE.slice(start, ROUTE.indexOf('\n\n', start));
  assert.match(body, /startGps\(\)/);
  assert.match(body, /stopGps\(\)/);
  assert.match(body, /gpsBanner\.classList\.toggle\('show'/);
  // Nowhere else in the file should gpsBanner be touched directly — that would let the banner
  // drift out of sync with whether GPS is actually running.
  const otherTouches = (ROUTE.match(/gpsBanner\./g) || []).length;
  assert.equal(otherTouches, 1, 'gpsBanner must only be touched inside setTracking()');
});

test('the banner text is plain, states both the ON condition and the automatic OFF condition, and has no dismiss/consent control', () => {
  const idx = ROUTE.indexOf('id="gps-banner"');
  const block = ROUTE.slice(idx, ROUTE.indexOf('</div>', idx));
  assert.match(block, /Location sharing is ON/i);
  assert.match(block, /turns off automatically/i);
  assert.doesNotMatch(block, /<input/i, 'no consent checkbox — sharing is a condition of the route, not a choice');
  assert.doesNotMatch(block, /<button/i, 'no dismiss control — it must track reality, not be closeable');
});

test('the banner Spanish translation exists and is reachable through the shared i18n engine', () => {
  const enMatch = ROUTE.match(/<span data-i18n>(📍[^<]*Location sharing[^<]*)<\/span>/);
  assert.ok(enMatch, 'could not find the exact English banner string in route.html');
  const enText = enMatch[1];
  assert.ok(I18N.includes(JSON.stringify(enText).slice(1, -1)) || I18N.includes(enText),
    'the exact banner string (including the emoji) must have a Spanish entry in i18n.js so the shared engine can translate it verbatim');
  assert.match(I18N, /Compartir ubicación está ACTIVADO/);
});
