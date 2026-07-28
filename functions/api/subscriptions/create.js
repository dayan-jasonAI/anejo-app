// POST /api/subscriptions/create  { clientId, planTier, sourceId }
// Starts a Square subscription for an existing trainer-client: creates a Square customer,
// saves the tokenized card (sourceId from the Web Payments SDK; sandbox accepts
// 'cnon:card-nonce-ok'), starts the subscription, and writes a subscriptions row.
// Trainer attribution + 10% rev-share live in OUR D1 (provider_subscription_id → trainer_id).
import { json, bad, id, now, isEmail, normalizePhone } from '../../_lib/util.js';
import { square, squareConfigured } from '../../_lib/square.js';
import { PLAN_TIERS, isPlanTier, planVariationId, tierWindows, loadPlanTiers, catalogWeeklyCents } from '../../_lib/plans.js';
import { limitOr429 } from '../../_lib/ratelimit.js';
import { materializeSubscriptionPrep } from '../../_lib/suborders.js';
import { clampPerBowlCents, perBowlCentsFromOz } from '../../_lib/sizing.js';
import { sendSms } from '../../_lib/twilio.js';
import { geocode, formatAddress } from '../../_lib/geo.js';
import { AVOCADO_ADDON_CENTS, BOWL_BY_NAME } from '../../_lib/bowlspec.js';
import { evaluatePromo, recordRedemption } from '../../_lib/promo.js';
import { raiseAlert } from '../../_lib/alerts.js';

// Keep only real bowl keys with positive integer counts (defends the kitchen itemization +
// the saved plan from a tampered/garbage rotation coming off the browser).
function sanitizeRotation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {}; let total = 0;
  for (const [k, v] of Object.entries(raw)) {
    const key = String(k).toUpperCase();
    if (!BOWL_BY_NAME[key]) continue;
    const n = Math.floor(Number(v));
    if (Number.isFinite(n) && n > 0 && n <= 50) { out[key] = n; total += n; }
  }
  return total > 0 ? out : null;
}

// Persist the calculator-generated plan for a DIRECT subscriber (no trainer-saved plan), so the
// weekly kitchen delivery itemizes each bowl with this client's scaled macros + ingredient weights.
async function saveGeneratedPlan(env, clientId, raw) {
  const rotation = sanitizeRotation(raw && raw.bowl_rotation);
  if (!rotation) return; // nothing usable → caller falls back to a generic line
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  let factor = num(raw.bowl_size_factor);
  if (factor != null) factor = Math.min(2, Math.max(0.5, factor));
  const pbpCents = raw.per_bowl_price_usd != null ? Math.round(Number(raw.per_bowl_price_usd) * 100) : num(raw.per_bowl_price_cents);
  const weekly = Object.values(rotation).reduce((s, n) => s + n, 0);
  const t = now();
  try {
    await env.DB.prepare(
      `INSERT INTO plans (id, client_id, version, daily_calories, daily_protein_g, daily_carbs_g,
          daily_fat_g, daily_fiber_g, weekly_bowl_count, meal_plan_tier, bowl_rotation,
          rationale, lifestyle_notes, ai_model, status, public_token,
          meals_per_day, bowl_size_oz, bowl_size_factor, per_bowl_price_cents, recommended_bowl_count,
          created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id('pl'), clientId, 1, num(raw.daily_calories), num(raw.daily_protein_g), num(raw.daily_carbs_g),
      num(raw.daily_fat_g), num(raw.daily_fiber_g), weekly, (raw.meal_plan_tier || null),
      JSON.stringify(rotation), (raw.rationale || null),
      JSON.stringify(Array.isArray(raw.lifestyle_notes) ? raw.lifestyle_notes : []), 'direct', 'draft', id('pt'),
      num(raw.meals_per_day), num(raw.bowl_size_oz), factor, pbpCents, num(raw.recommended_bowl_count),
      t, t
    ).run();
  } catch (_) { /* best-effort; kitchen falls back to a generic line */ }
}

// Validate a subscriber's delivery address (street/city/5-digit ZIP required).
function parseAddr(raw) {
  const a = raw || {};
  const street = (a.street || '').trim();
  const city = (a.city || '').trim();
  const zip = (a.zip || '').trim();
  if (!street || !city || !/^\d{5}$/.test(zip)) return null;
  return {
    street: street.slice(0, 160), unit: (a.unit || '').trim().slice(0, 60) || null,
    city: city.slice(0, 80), state: ((a.state || 'FL').trim() || 'FL').slice(0, 20),
    zip, notes: (a.notes || '').trim().slice(0, 240) || null,
  };
}

const sqErr = (r) => r.data && r.data.errors && r.data.errors[0] && r.data.errors[0].detail;

// Direct/public subscribers (no trainer) attach to a single "house" trainer account.
async function getOrCreateHouseTrainer(env) {
  const existing = await env.DB.prepare("SELECT id FROM trainers WHERE affiliate_code = 'HOUSE'").first();
  if (existing) return existing.id;
  const tid = id('tr'), t = now();
  try {
    await env.DB.prepare('INSERT INTO trainers (id, email, name, affiliate_code, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .bind(tid, 'house@anejocateringco.com', 'Añejo (Direct)', 'HOUSE', t, t).run();
    return tid;
  } catch (_) {
    const again = await env.DB.prepare("SELECT id FROM trainers WHERE affiliate_code = 'HOUSE'").first();
    return again ? again.id : tid;
  }
}

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'subscribe', limit: 10, windowSec: 60 });
  if (limited) return limited;

  if (!squareConfigured(env)) return bad('Subscriptions are not configured yet.', 503);
  if (!env.DB) return bad('Server not configured (DB binding missing).', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const planTier = b.planTier;
  if (!isPlanTier(planTier)) return bad('Unknown meal-plan tier.');
  // Delivery window. 2-bowl tiers always get lunch+dinner; the 1-bowl tier REQUIRES a choice.
  const chosenWindow = (b.delivery && (b.delivery.window
    || (Array.isArray(b.delivery.windows) && b.delivery.windows.length === 1 && b.delivery.windows[0]))) || '';
  if (PLAN_TIERS[planTier].chooseWindow && chosenWindow !== 'lunch' && chosenWindow !== 'dinner') {
    return bad('Please choose a delivery window (Lunch or Dinner) for this plan.');
  }
  const windows = tierWindows(planTier, chosenWindow);
  const sourceId = (b.sourceId || '').trim();
  if (!sourceId) return bad('Missing payment source. Please re-enter your card.');
  let client;
  const clientId = (b.clientId || '').trim();
  if (clientId) {
    client = await env.DB
      .prepare('SELECT id, trainer_id, name, email, phone, sms_consent FROM clients WHERE id = ?')
      .bind(clientId).first();
    if (!client) return bad('Client not found.', 404);
  } else {
    // Direct/public subscriber — create a client under the house trainer.
    const buyer = b.buyer || {};
    const email = (buyer.email || '').trim().toLowerCase();
    const name = (buyer.name || '').trim();
    const phone = normalizePhone(buyer.phone);
    const smsConsent = buyer.sms_consent === true || buyer.sms_consent === 1 ? 1 : 0;
    if (!isEmail(email) || !name) return bad('Please enter your name and a valid email.');
    const houseId = await getOrCreateHouseTrainer(env);
    const cid = id('cl'), t0 = now();
    try {
      await env.DB.prepare('INSERT INTO clients (id, trainer_id, email, name, phone, sms_consent, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(cid, houseId, email, name, phone, smsConsent, 'pending', t0, t0).run();
      client = { id: cid, trainer_id: houseId, name, email, phone, sms_consent: smsConsent };
    } catch (_) {
      const ex = await env.DB.prepare('SELECT id, trainer_id, name, email, phone FROM clients WHERE trainer_id = ? AND email = ?')
        .bind(houseId, email).first();
      if (!ex) return bad('Could not create your account. Please try again.', 500);
      client = ex;
    }
  }

  // Delivery address — required to subscribe (every weekly order must be routable). Saved as
  // the client's default and reused for each auto-generated delivery. Geocode is best-effort.
  //
  // SECURITY (broken-access-control hardening): the `clientId` path is unauthenticated (a member
  // subscribes via their trainer's link, no session). So we must NEVER let a request OVERWRITE an
  // EXISTING client's saved address — otherwise anyone holding a clientId could redirect that
  // customer's deliveries. Read the existing address first; only write request-supplied address
  // when the client has none on file (first-time setup) or for a brand-new direct buyer.
  let deliveryAddr = parseAddr(b.address);
  let existingAddr = null;
  if (clientId) {
    try {
      const c = await env.DB.prepare(
        'SELECT delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes, delivery_lat, delivery_lng FROM clients WHERE id = ?'
      ).bind(client.id).first();
      if (c && c.delivery_street) {
        existingAddr = {
          street: c.delivery_street, unit: c.delivery_unit, city: c.delivery_city, state: c.delivery_state,
          zip: c.delivery_zip, notes: c.delivery_notes, lat: c.delivery_lat, lng: c.delivery_lng,
        };
      }
    } catch (_) { /* leave null */ }
  }
  if (existingAddr) {
    // Existing customer already has a saved address — use it, ignore any request-supplied address.
    deliveryAddr = existingAddr;
  } else if (deliveryAddr) {
    // First-time setup (new direct buyer, or trainer member with no address yet): persist it.
    const g = await geocode(env, formatAddress(deliveryAddr)).catch(() => null);
    if (g) { deliveryAddr.lat = g.lat; deliveryAddr.lng = g.lng; }
    try {
      await env.DB.prepare(
        `UPDATE clients SET delivery_street=?, delivery_unit=?, delivery_city=?, delivery_state=?,
            delivery_zip=?, delivery_notes=?, delivery_lat=?, delivery_lng=?, updated_at=? WHERE id=?`
      ).bind(
        deliveryAddr.street, deliveryAddr.unit, deliveryAddr.city, deliveryAddr.state,
        deliveryAddr.zip, deliveryAddr.notes, deliveryAddr.lat != null ? deliveryAddr.lat : null,
        deliveryAddr.lng != null ? deliveryAddr.lng : null, now(), client.id
      ).run();
    } catch (_) { /* address is best-effort persistence; don't fail the subscription */ }
  }
  // Direct/public subscribers must provide an address; trainer-referred members may have the
  // owner add it later, so only hard-require it when there's no clientId and none on file.
  if (!deliveryAddr && !clientId) return bad('Please enter your delivery address (street, city, and ZIP).');

  const planSelect = 'SELECT id, bowl_rotation, per_bowl_price_cents, bowl_size_oz, bowl_size_factor FROM plans WHERE client_id = ? ORDER BY created_at DESC LIMIT 1';
  let plan = await env.DB.prepare(planSelect).bind(client.id).first();
  // Direct subscriber with no saved plan but a calculator-generated one in the request → persist it
  // now so the weekly delivery can be itemized with this client's macros + per-ingredient weights.
  if (!plan && b.plan) {
    await saveGeneratedPlan(env, client.id, b.plan);
    plan = await env.DB.prepare(planSelect).bind(client.id).first();
  }

  // Avocado add-on (+$2/bowl): a calorie-neutral swap (kitchen reduces other fats), priced flat.
  const avocado = b.avocado === true || b.avocado === 1;

  // Weekly price comes from D1 when the owner has set one (falls back to the code constant on any
  // degraded path), so /subscribe and the charge are driven by the same number.
  const { tiers: resolvedTiers } = await loadPlanTiers(env);
  const tier = resolvedTiers[planTier] || PLAN_TIERS[planTier];
  const variationId = planVariationId(env, planTier);
  if (!variationId) return bad('Plan not available in this environment.', 503);

  // Dynamic bowl sizing: each bowl is portion-sized to the member's goal, so we charge the
  // member's sized per-bowl price × the chosen bowl count — not the fixed standard-bowl tier.
  // Source the per-bowl price server-side (never trust a raw client amount):
  //   • trainer-client → the saved plan's per_bowl_price_cents
  //   • direct buyer    → recomputed from the bowl size (oz) they came in with (factor-clamped)
  let perBowlCents = null;
  if (plan && plan.per_bowl_price_cents != null) perBowlCents = clampPerBowlCents(plan.per_bowl_price_cents);
  else if (b.bowlSizeOz) perBowlCents = perBowlCentsFromOz(b.bowlSizeOz);
  let weeklyCents = perBowlCents != null ? perBowlCents * tier.bowls : tier.weeklyCents;
  if (avocado) weeklyCents += AVOCADO_ADDON_CENTS * tier.bowls;
  // NOTE: there is deliberately no "should we override?" test any more. We always send our price
  // to Square (step 3), because the conditional was itself a source of bugs — every variant of it
  // had to correctly predict which of {sized bowls, avocado add-on, owner price change in D1}
  // counted as "different", and getting that wrong meant Square quietly billing a stale catalog
  // amount while /subscribe advertised the new one. Sending it unconditionally cannot be wrong.

  // 1) Square customer
  let r = await square(env, '/v2/customers', {
    method: 'POST',
    body: { idempotency_key: id('cust'), given_name: client.name || 'Añejo Member', email_address: client.email || undefined },
  });
  if (!r.ok) return bad(sqErr(r) || 'Could not create customer.', 500);
  const customerId = r.data.customer.id;

  // 2) Card on file (PCI-safe token from the Web Payments SDK)
  r = await square(env, '/v2/cards', {
    method: 'POST',
    body: { idempotency_key: id('card'), source_id: sourceId, card: { customer_id: customerId } },
  });
  if (!r.ok) return bad(sqErr(r) || 'Your card could not be saved.', 500);
  const cardId = r.data.card.id;

  // 3) Start the subscription at OUR price.
  //
  // `price_override_money` is a documented Subscription field: "A custom price which overrides the
  // cost of a subscription plan variation with STATIC pricing" — and ours are STATIC. Square
  // confirms it overrides every phase, so it holds on renewals, not just the first charge.
  //
  // We send it on EVERY subscription, not only sized ones. That is the point: the amount charged is
  // always the amount we computed from D1, so an owner editing a plan price in the HUB changes what
  // new subscribers pay without anyone touching the Square catalog — the same way bowls and drinks
  // already work with ad-hoc `base_price_money`.
  //
  // This replaces minting a throwaway SUBSCRIPTION_PLAN_VARIATION per distinct sized price. The
  // macro portal prices bowls on a continuum (0.6x–1.8x of the base), so that approach wrote a
  // permanent catalog object for every portion size anyone ever picked, permanently cluttering the
  // POS catalog with entries nobody can safely delete.
  const subBody = {
    idempotency_key: id('sub'),
    location_id: env.SQUARE_LOCATION_ID,
    plan_variation_id: variationId,
    customer_id: customerId,
    card_id: cardId,
    price_override_money: { amount: weeklyCents, currency: 'USD' },
  };
  r = await square(env, '/v2/subscriptions', { method: 'POST', body: subBody });

  // TRANSITIONAL SAFETY NET. `price_override_money` is documented on the Subscription object and
  // Square support describes using it exactly this way, but this project has never run a live
  // subscription through it. If this account or API version rejects the field, EVERY new
  // subscription would fail — and subscriptions are the recurring revenue the whole affiliate
  // program is built on, so "fails cleanly" is still an outage.
  //
  // So on rejection we fall back once to the previous mechanism (mint a variation at our price) and
  // alert, rather than turning a customer away. Delete this block once a real subscription has been
  // confirmed on the override path — it exists only to make the transition unable to lose a sale.
  let usedLegacyVariation = false;
  if (!r.ok) {
    let sized = null;
    try {
      const vr0 = await square(env, `/v2/catalog/object/${variationId}`);
      const parentPlanId = vr0.ok && vr0.data.object && vr0.data.object.subscription_plan_variation_data
        && vr0.data.object.subscription_plan_variation_data.subscription_plan_id;
      if (parentPlanId) {
        const vr = await square(env, '/v2/catalog/object', {
          method: 'POST',
          body: {
            idempotency_key: id('var'),
            object: {
              type: 'SUBSCRIPTION_PLAN_VARIATION', id: '#sized',
              subscription_plan_variation_data: {
                name: `${tier.label} · sized ${(weeklyCents / 100).toFixed(2)}/wk`,
                subscription_plan_id: parentPlanId,
                phases: [{ cadence: 'WEEKLY', ordinal: 0, pricing: { type: 'STATIC', price_money: { amount: weeklyCents, currency: 'USD' } } }],
              },
            },
          },
        });
        if (vr.ok && vr.data.catalog_object) sized = vr.data.catalog_object.id;
      }
    } catch (_) { sized = null; }

    if (sized) {
      r = await square(env, '/v2/subscriptions', {
        method: 'POST',
        body: { idempotency_key: id('sub'), location_id: env.SQUARE_LOCATION_ID, plan_variation_id: sized, customer_id: customerId, card_id: cardId },
      });
      if (r.ok) {
        // The sized variation IS provisioned at weeklyCents, so the price is already correct on this
        // path — it just arrives without an echoed override. Skip the echo check below, which would
        // otherwise misread a correctly-priced subscription as a mismatch and rewrite our books to
        // the catalog price.
        usedLegacyVariation = true;
        try {
          await raiseAlert(env, {
            alert_type: 'delivery_failed', severity: 'critical',
            dedupe_key: 'sub_override_unsupported',
            title: 'Square rejected our subscription price override',
            body: 'A subscription was created via the legacy per-price catalog variation instead. '
              + 'Billing is correct, but the POS catalog will accumulate an entry per price until '
              + 'the override path is fixed. Check the Square API version on this account.',
            ref_type: 'subscription', ref_id: 'price_override',
          });
        } catch (_) { /* never lose the sale over an alert */ }
      }
    }
  }

  if (!r.ok) return bad(sqErr(r) || 'Subscription could not be started.', 500);
  const sub = r.data.subscription;

  // READ BACK what Square will actually bill. Square echoes the override on the created
  // subscription; if it is absent or different, Square is going to charge the catalog amount and
  // our books would otherwise claim a price that never gets billed. Record what Square will really
  // take and shout about it — a subscription that silently bills the wrong amount every week is the
  // worst failure this file can produce.
  const echoed = sub && sub.price_override_money && Number(sub.price_override_money.amount);
  if (!usedLegacyVariation && (!Number.isFinite(echoed) || echoed !== weeklyCents)) {
    const actual = Number.isFinite(echoed) ? echoed : catalogWeeklyCents(planTier);
    try {
      await raiseAlert(env, {
        alert_type: 'delivery_failed', severity: 'critical',
        dedupe_key: 'sub_price_mismatch:' + sub.id,
        title: 'Subscription is billing the wrong price',
        body: `Square did not apply our price override on subscription ${sub.id}. We intended `
          + `$${(weeklyCents / 100).toFixed(2)}/wk; Square will bill $${((actual || 0) / 100).toFixed(2)}/wk. `
          + `Fix it in Square or cancel and re-create.`,
        ref_type: 'subscription', ref_id: sub.id,
      });
    } catch (_) { /* the alert failing must not also lose the corrected number below */ }
    // Books follow the money, never the intention.
    if (Number.isFinite(actual) && actual > 0) weeklyCents = actual;
  }

  // 4) Persist + attribute to the trainer (the rev-share link)
  const t = now();
  const localSubId = id('lsub');
  // `windows` (resolved above from the tier + customer choice) + `tier` drive the fulfillment
  // schedule in suborders.js: which weekdays deliver and how many bowls land per day.
  // ---- Influencer/affiliate attribution. A subscription signed up with a partner's code is
  // attributed to that partner, so the EXISTING per-invoice rev-share path pays them on every
  // renewal (not just the first charge) — the recurring income that makes the program worth
  // a creator's time. Falls back to the client's own trainer (or HOUSE) when no code is used.
  let subTrainerId = client.trainer_id, subSharePct = 10, affiliateEval = null;
  if (b.promo_code) {
    try {
      const ev = await evaluatePromo(env, { code: b.promo_code, sessionEmail: client.email, subtotalCents: weeklyCents });
      if (ev.ok && ev.kind === 'affiliate' && ev.partner_id) {
        affiliateEval = ev;
        subTrainerId = ev.partner_id;
        subSharePct = ev.commission_pct || 10;
      }
    } catch (_) { affiliateEval = null; }
  }

  await env.DB.prepare(
    `INSERT INTO subscriptions
       (id, client_id, trainer_id, plan_id, provider, provider_subscription_id, provider_customer_id,
        status, weekly_amount_cents, trainer_share_pct, avocado, windows, tier, started_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    localSubId, client.id, subTrainerId, plan ? plan.id : null, 'square',
    sub.id, customerId, (sub.status || 'ACTIVE').toLowerCase(), weeklyCents, subSharePct, avocado ? 1 : 0, windows, planTier, t, t
  ).run();

  // Audit trail + usage count for the partner's code (keyed by subscription id).
  if (affiliateEval) {
    try { await recordRedemption(env, { evaluated: affiliateEval, orderId: localSubId, customerEmail: client.email }); }
    catch (_) { /* non-fatal */ }
  }

  await env.DB.prepare('UPDATE clients SET status = ?, updated_at = ? WHERE id = ?')
    .bind('subscribed', t, client.id).run();

  // Seed the rolling fresh-prep window now so the kitchen immediately sees the upcoming
  // daily "Subscription" orders (one bowl per chosen window, each delivery day Mon–Sat,
  // starting next Monday). The daily cron tick rolls it forward from here.
  try {
    await materializeSubscriptionPrep(env, { subscriptionId: localSubId, horizonDays: 7 });
  } catch (_) { /* never fail the subscription on the kitchen-order write */ }

  // Best-effort confirmation text — ONLY to customers who opted in (checked the consent box).
  // No-op + logged when TWILIO_* creds aren't set. A2P 10DLC compliance: never text without consent.
  if (client.phone && (client.sms_consent === 1 || client.sms_consent === true)) {
    try {
      await sendSms(env, {
        to: client.phone,
        body: `Añejo: your ${tier.bowls}-bowl weekly plan is active — $${(weeklyCents / 100).toFixed(2)}/wk, delivered in Palm Beach County. We'll text you when your order is out for delivery and when it's delivered. Reply STOP to opt out.`,
      });
    } catch (_) { /* SMS must never fail the subscription */ }
  }

  return json({ ok: true, subscriptionId: sub.id, status: sub.status, tier: planTier, weeklyUsd: weeklyCents / 100 });
};
