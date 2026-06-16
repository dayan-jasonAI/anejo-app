// GET /api/square-config — publishable Square identifiers for the Web Payments SDK.
// applicationId + locationId are client-side IDs by design (not secrets); the access token
// stays server-side. Used by the subscribe page to render the hosted card field.
import { json } from '../_lib/util.js';
import { PLAN_TIERS } from '../_lib/plans.js';

export const onRequestGet = ({ env }) => {
  // Publish the per-tier delivery schedule so /subscribe renders it from ONE source (here)
  // instead of a hand-kept copy — no drift if PLAN_TIERS changes.
  const tiers = {};
  for (const [k, t] of Object.entries(PLAN_TIERS)) {
    tiers[k] = { bowls: t.bowls, bowlsPerDay: t.bowlsPerDay, days: t.days, chooseWindow: t.chooseWindow };
  }
  return json({
    applicationId: env.SQUARE_APPLICATION_ID || null,
    locationId: env.SQUARE_LOCATION_ID || null,
    env: env.SQUARE_ENV === 'production' ? 'production' : 'sandbox',
    tiers,
  });
};
