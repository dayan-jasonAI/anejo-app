// GENERATED FILE — do not edit by hand.
// Source: .telemetry/tracking-plan.yaml → client_allowlist.currently_allowed
// Regenerate: node scripts/gen-track-allowlist.mjs
// A stale copy fails the test suite (test/telemetry/allowlist.test.js), which gates deploy.
//
// These are the ONLY event names the browser may post to /api/hub/track. Server-side capture()
// calls are not affected — they are code-reviewed. This guards the one rail that accepts a name
// from outside the codebase.
// Files under functions/_lib are not routed.

export const CLIENT_ALLOWED = Object.freeze([
  'app.installed',
  'customer.login_link_sent',
  'customer.viewed',
  'dashboard.viewed',
  'lead.converted',
]);

const SET = new Set(CLIENT_ALLOWED);

/** True if the browser is permitted to emit this event name. */
export function isClientEventAllowed(name) {
  return typeof name === 'string' && SET.has(name);
}
