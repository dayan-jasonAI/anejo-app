// GET /api/square-config — publishable Square identifiers for the Web Payments SDK.
// applicationId + locationId are client-side IDs by design (not secrets); the access token
// stays server-side. Used by the subscribe page to render the hosted card field.
import { json } from '../_lib/util.js';
import { loadPlanTiers } from '../_lib/plans.js';

export const onRequestGet = async ({ env }) => {
  // Publish the per-tier delivery schedule AND weekly price so /subscribe renders from ONE source
  // instead of a hand-kept copy.
  //
  // Publishing the D1-resolved price is only safe because subscriptions/create.js and manage.js now
  // decide "do we need an ad-hoc Square variation?" by comparing against catalogWeeklyCents() — the
  // amount the STATIC catalog variation was provisioned at — rather than against the resolved tier.
  // Without that, an owner price change would show here and never reach the charge. These three
  // files must stay in step; changing this one alone reintroduces a display-vs-charge split.
  const { tiers: resolved, source } = await loadPlanTiers(env);
  const tiers = {};
  for (const [k, t] of Object.entries(resolved)) {
    tiers[k] = {
      bowls: t.bowls, bowlsPerDay: t.bowlsPerDay, days: t.days, chooseWindow: t.chooseWindow,
      weeklyCents: t.weeklyCents, label: t.label,
    };
  }
  return json({
    applicationId: env.SQUARE_APPLICATION_ID || null,
    locationId: env.SQUARE_LOCATION_ID || null,
    env: env.SQUARE_ENV === 'production' ? 'production' : 'sandbox',
    tiers,
    plan_price_source: source,
  });
};
