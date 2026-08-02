// The order-confirmation push opt-in — the first screen a real customer can turn push on from.
//
// The backend pipeline (VAPID sender, push_subscriptions, push-then-SMS notify) already existed
// and was already tested in test/money/customer-notifications.test.js. This file pins the piece
// that was actually missing: the confirmation-screen UI that calls it, the iOS Home Screen
// detour Apple forces on every browser there, and the promise that declining/failing push never
// leaves a customer with no way to hear about their order.
//
// These are source-pattern tests, matching the rest of test/ui — there is no DOM here to execute
// against, so the checks pin the literal code paths a browser would run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CONFIRMED = readFileSync(new URL('../../public/order/confirmed.html', import.meta.url), 'utf8');
const ORDER = readFileSync(new URL('../../public/order.html', import.meta.url), 'utf8');
const SUBSCRIBE = readFileSync(new URL('../../functions/api/push/subscribe.js', import.meta.url), 'utf8');

// Isolate the three render branches so a test can assert what markup EACH one produces, rather
// than grepping the whole file and risking a false pass because the string appears somewhere else.
function fnBody(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start > -1, `function ${name} not found`);
  const braceStart = src.indexOf('{', start);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  return src.slice(braceStart, i + 1);
}

// ---------- the checkout handoff ----------

test('checkout stashes the email and SMS-consent state, not just the GA4 value', () => {
  // /order/confirmed has no other way to learn who just paid — Square's redirect carries only
  // order/transaction ids. Losing this stash silently degrades the whole feature to the
  // no-email fallback for every single customer, so it is pinned here explicitly.
  const idx = ORDER.indexOf("sessionStorage.setItem('anejo:pendingOrder'");
  assert.ok(idx > -1, 'the pendingOrder stash must still exist');
  const chunk = ORDER.slice(idx, idx + 400);
  assert.match(chunk, /email:\s*contact\.email/);
  assert.match(chunk, /sms_consent:\s*!!contact\.sms_consent/);
});

test('the stash does NOT carry the raw phone number', () => {
  // The confirmation screen only ever needs to know WHICH fallback message to show (texts are
  // already covered, or they are not) — not the number itself. Less PII sitting in
  // sessionStorage for no functional gain.
  const idx = ORDER.indexOf("sessionStorage.setItem('anejo:pendingOrder'");
  const chunk = ORDER.slice(idx, idx + 400);
  assert.doesNotMatch(chunk, /contact\.phone/);
});

// ---------- iOS detection ----------

test('iOS is detected at the OS level, not by sniffing for the word "Safari"', () => {
  // Every iOS browser — Chrome, Firefox, Edge included — is forced onto WebKit and inherits the
  // exact same "must be added to the Home Screen" restriction Safari has. A brand check would
  // wrongly show a dead Enable button to anyone on iOS Chrome.
  assert.match(CONFIRMED, /iP\(hone\|od\|ad\)/);
  assert.doesNotMatch(CONFIRMED, /userAgent\.indexOf\(.Safari/);
});

test('iPadOS reporting itself as "Macintosh" is still caught, via touch points', () => {
  assert.match(CONFIRMED, /MacIntel/);
  assert.match(CONFIRMED, /maxTouchPoints > 1/);
});

test('standalone (already installed to Home Screen) is checked both ways', () => {
  assert.match(CONFIRMED, /navigator\.standalone === true/);
  assert.match(CONFIRMED, /display-mode:\s*standalone/);
});

// ---------- iOS non-standalone: instructions, never a dead button ----------

test('iOS + not installed shows Add-to-Home-Screen steps, not an Enable button', () => {
  const branch = fnBody(CONFIRMED, 'showIOSInstructions');
  assert.match(branch, /Add to Home Screen|Agregar a pantalla de inicio/);
  assert.doesNotMatch(branch, /id="pushBtn"/, 'no button that would just fail on iPhone Safari');
});

test('the iOS branch still tells the customer how they WILL be reached', () => {
  // Requirement: never a dead end, even mid-instructions.
  const branch = fnBody(CONFIRMED, 'showIOSInstructions');
  assert.match(branch, /fallbackHtml\(\)/);
});

test('the iOS branch is only reached when iOS is true and standalone is false', () => {
  assert.match(CONFIRMED, /isIOS && !isStandalone/);
  const guardIdx = CONFIRMED.indexOf('isIOS && !isStandalone');
  const iosCallIdx = CONFIRMED.indexOf('showIOSInstructions();', guardIdx);
  assert.ok(iosCallIdx > guardIdx && iosCallIdx - guardIdx < 200, 'the iOS branch call sits right behind its own guard');
});

// ---------- capable path: subscribe flow ----------

test('a capable browser is offered a real Enable button', () => {
  const branch = fnBody(CONFIRMED, 'showPrompt');
  assert.match(branch, /id="pushBtn"/);
});

test('enabling registers the STOREFRONT worker, not the staff /hub one', () => {
  // Two workers exist on purpose (public/sw.js vs public/hub/sw.js) so a customer is never woken
  // by a kitchen alert. Registering the wrong one here would be silent and hard to notice.
  assert.match(CONFIRMED, /serviceWorker\.register\('\/sw\.js'\)/);
  assert.doesNotMatch(CONFIRMED, /serviceWorker\.register\('\/hub\/sw\.js'\)/);
});

test('the VAPID key is fetched and checked before pushManager.subscribe is ever called', () => {
  const branch = fnBody(CONFIRMED, 'enable');
  const cfgIdx = branch.indexOf('cfg.vapid_public_key');
  const subIdx = branch.indexOf('pushManager.subscribe');
  assert.ok(cfgIdx > -1 && subIdx > -1 && cfgIdx < subIdx, 'must not attempt to subscribe with no key');
});

test('a missing/unconfigured VAPID key falls back instead of throwing to the console', () => {
  const branch = fnBody(CONFIRMED, 'enable');
  assert.match(branch, /cfg\.configured.*vapid_public_key|vapid_public_key.*cfg\.configured/);
  assert.match(branch, /not configured/);
});

test('the subscription is POSTed with the stashed email, matching /api/push/subscribe\'s contract', () => {
  const branch = fnBody(CONFIRMED, 'enable');
  assert.match(branch, /method:\s*'POST'/);
  assert.match(branch, /email:\s*email/);
  assert.match(branch, /subscription:\s*sub\.toJSON\(\)/);
});

// ---------- the "never a dead end" fallback contract ----------

test('every failure path in enable() ends at showFallback, not a swallowed error', () => {
  const chunk = fnBody(CONFIRMED, 'enable');
  assert.match(chunk, /\.catch\(function\(err\)\{/);
  // The catch body must actually call showFallback — an empty or log-only catch would be a
  // silently swallowed failure, which is explicitly the thing this feature must not do.
  const catchIdx = chunk.indexOf('.catch(function(err){');
  assert.ok(catchIdx > -1);
  assert.match(chunk.slice(catchIdx), /showFallback\(/);
});

test('permission denial is routed through the same fallback, not left stuck on "Enabling…"', () => {
  const branch = fnBody(CONFIRMED, 'enable');
  assert.match(branch, /perm !== 'granted'/);
  assert.match(branch, /Promise\.reject/);
});

test('declining the prompt ("Not now") still shows the fallback message, not a silent close', () => {
  const branch = fnBody(CONFIRMED, 'showPrompt');
  assert.match(branch, /pushSkip.*showFallback\(/s);
});

test('an unsupported browser never shows the Enable button', () => {
  const idx = CONFIRMED.indexOf('!pushCapable');
  assert.ok(idx > -1);
  const chunk = CONFIRMED.slice(idx, idx + 120);
  assert.match(chunk, /showFallback\(/);
});

test('no stashed email skips straight to the fallback rather than a button that cannot work', () => {
  // /api/push/subscribe requires an email; offering a button with nothing to send it would fail
  // silently on click. The dispatcher checks this case first, before even asking about iOS.
  const dispatchIdx = CONFIRMED.lastIndexOf('if (!email) {');
  assert.ok(dispatchIdx > -1);
  const chunk = CONFIRMED.slice(dispatchIdx, dispatchIdx + 350);
  assert.match(chunk, /showFallback\(/);
});

test('every fallback call names a reason — nothing fails without a trace', () => {
  const calls = [...CONFIRMED.matchAll(/showFallback\(('[^']*'|\([^)]*\))/g)];
  assert.ok(calls.length >= 5, 'expected several distinct fallback call sites');
  for (const m of calls) {
    assert.notEqual(m[1].trim(), '()', 'a fallback call with no reason at all');
  }
});

test('a fallback is logged, not silently swallowed', () => {
  assert.match(CONFIRMED, /console\.warn\('\[anejo\] push opt-in fell back/);
});

// ---------- the fallback message itself must match what the backend will actually do ----------

test('SMS-consented customers are told texts will cover them (not a generic "sorry")', () => {
  assert.match(CONFIRMED, /if \(smsConsent\)/);
  assert.match(CONFIRMED, /we'll text you the same order updates/);
});

test('customers with no SMS consent are pointed at the real SMS opt-in page, not a new form', () => {
  // Reuses the existing consented capture flow (public/sms.html -> /api/leads) instead of
  // re-implementing a phone/consent form inline on the confirmation screen.
  assert.match(CONFIRMED, /href="\/sms"/);
});

test('the no-consent fallback promises email, which only fires when RESEND is configured server-side — never an empty promise', () => {
  assert.match(CONFIRMED, /we\\'ll email you as your order status changes/);
});

// ---------- server side: functions/api/push/subscribe.js ----------

test('the public subscribe route is rate-limited (it has no session gating it)', () => {
  assert.match(SUBSCRIBE, /limitOr429\(env, request, \{ name: 'push_subscribe'/);
  // Applied on both POST and DELETE — the two writes an anonymous caller can trigger.
  const postIdx = SUBSCRIBE.indexOf('onRequestPost');
  const deleteIdx = SUBSCRIBE.indexOf('onRequestDelete');
  assert.ok(postIdx > -1 && deleteIdx > postIdx);
  assert.match(SUBSCRIBE.slice(postIdx, deleteIdx), /limitOr429/);
  assert.match(SUBSCRIBE.slice(deleteIdx), /limitOr429/);
});

test('input validation is unchanged: bad email or non-https endpoint is still refused', () => {
  assert.match(SUBSCRIBE, /if \(!isEmail\(email\)\) return bad/);
  assert.match(SUBSCRIBE, /if \(!endpoint \|\| !\/\^https:\\\/\\\/\//);
});

test('re-subscribing the same device is still idempotent (unchanged from the existing groundwork)', () => {
  assert.match(SUBSCRIBE, /ON CONFLICT\(endpoint\) DO UPDATE SET/);
});

test('the GET endpoint still reports whether push is configured, so the frontend never guesses', () => {
  assert.match(SUBSCRIBE, /configured: !!key/);
});
