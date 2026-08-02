// POST /api/checkout — à-la-carte ordering via Square hosted checkout (Payment Links).
// The client sends { items: [{id, qty}], fulfillment } using catalog IDs only; prices are
// resolved SERVER-SIDE via loadMenu(env) (D1, defaults in _lib/menu.js) so they can't be
// tampered with from the browser.
import { json, bad, id, appBaseUrl, normalizePhone, isEmail } from '../_lib/util.js';
import { square, squareConfigured } from '../_lib/square.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { geocode, formatAddress, geoConfigured, lastGeocodeFailure, addressWasCorrected } from '../_lib/geo.js';
import { loadOrderingSettings, onDemandConfig, windowState, remainingByBowl } from '../_lib/ondemand.js';
import { loadOperating, zipAllowed, scheduleOpenFor } from '../_lib/operating.js';
import { BOWL_BY_NAME, BOWL_LABEL, scaledBowlMacros } from '../_lib/bowlspec.js';
import { currentUser } from '../_lib/session.js';
import { rewardsSummary } from '../_lib/rewards.js';
import { evaluatePromo, recordRedemption, autoCustomerCodeFor, claimPromoUse, releasePromoUse } from '../_lib/promo.js';
import { loadMenu, AVAILABILITY } from '../_lib/menu.js';

// "11" → "11 AM", "19" → "7 PM" — for friendly window messaging.
function fmtHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
}

// Validate + normalize a delivery address from the order form. Returns { addr } or { error }.
// Street, city, and a 5-digit ZIP are required (we deliver within Palm Beach County).
function parseAddress(raw) {
  const a = raw || {};
  const street = (a.street || '').trim();
  const city = (a.city || '').trim();
  const zip = (a.zip || '').trim();
  if (!street) return { error: 'Please enter your delivery street address.' };
  if (!city) return { error: 'Please enter your delivery city.' };
  if (!/^\d{5}$/.test(zip)) return { error: 'Please enter a valid 5-digit ZIP code.' };
  return {
    addr: {
      street: street.slice(0, 160),
      unit: (a.unit || '').trim().slice(0, 60) || null,
      city: city.slice(0, 80),
      state: ((a.state || 'FL').trim() || 'FL').slice(0, 20),
      zip,
      notes: (a.notes || '').trim().slice(0, 240) || null,
    },
  };
}

// Campaign attribution (0044) — optional {attribution:{src,utm_*}} from the browser, recorded on
// the order so ad spend and creator links can be measured even when no promo code is typed.
// Purely descriptive: it never touches pricing, so tampering buys nothing.
function parseAttribution(raw) {
  const a = raw || {};
  const s = (v, n) => (String(v == null ? '' : v).trim().slice(0, n) || null);
  return {
    src: s(a.src, 64),
    utm_source: s(a.utm_source, 120),
    utm_medium: s(a.utm_medium, 120),
    utm_campaign: s(a.utm_campaign, 120),
  };
}

// The non-bowl catalog (drinks + side sauce) USED to be duplicated here as a const in dollars.
// It was dead code: checkout resolves every price through `loadMenu(env)` below, which reads D1
// with `_lib/menu.js` module constants as defaults — and menu.js already carries the same items at
// the same prices in cents (fit_gold 999 = $9.99). Two copies of a price is how a price drifts, so
// the duplicate is gone and menu.js is the single source. Removed 2026-07-28.

// Bowl base prices in cents (authoritative). Each bowl can be customized per-instance.
const BOWL_BASE = { vida: 1999, fuego: 2299, ligero: 1899, mar: 2299, coco: 2299, congreen: 2099, raiz: 1899 };
const HOUSE_SAUCES = ['Mango Omega', 'Ajo Cítrico', 'Chimichurri Vital', 'Golden Turmeric', 'Aguacate Cilantro'];
// Extra of an on-bowl ingredient: veg/grain/garnish $1.50, protein/premium $3.00.
const EXTRA_STD_CENTS = 150, EXTRA_PREMIUM_CENTS = 300;
// Added house sauces: the FIRST one is free, each ADDITIONAL one is $1.50.
const EXTRA_SAUCE_CENTS = 150;
// Plurals matter: bowlspec ships "Toasted almonds"/"Toasted pecans", and \b…\b made the singular
// forms miss them — so an extra almond billed at the $1.50 standard rate instead of $3.00.
const PREMIUM_RE = /\b(tuna|salmon|steak|shrimp|chicken|tofu|beef|pork|avocado|queso|cheese|almonds?|pecans?)\b/i;
const ADDON_PRICE = { avocado_half: 200, extra_protein: 450, sweet_potato: 200, sauce_cup: 150 };
const ADDON_NAME = { avocado_half: '½ avocado', extra_protein: 'extra protein (4 oz)', sweet_potato: 'sweet potato', sauce_cup: 'extra sauce cup (2 oz)' };

function bowlLabel(key) { const N = String(key || '').toUpperCase(); return BOWL_LABEL[N] || N; }

// Validate + price ONE customized bowl against bowlspec. The protein (build[0]) can't be removed
// and only ingredients actually on the bowl can be removed or added-extra. Brown-rice swap is free
// and the FIRST added house sauce is free (each additional sauce is $1.50); addons + extra
// ingredients are priced server-side. Returns a priced
// snapshot with kitchen-facing fields (removals/addons/notes/build/macros) or { error }.
// `pricing` comes from D1 via _lib/menu.js at request time; it defaults to the module constants
// so unit tests and the D1-unreachable fallback both price identically.
export function priceCustomBowl(key, mods, pricing) {
  const bowls = (pricing && pricing.bowls) || BOWL_BASE;
  const mp = (pricing && pricing.modifiers) || {
    extra_std: EXTRA_STD_CENTS, extra_premium: EXTRA_PREMIUM_CENTS, extra_sauce: EXTRA_SAUCE_CENTS,
    ...ADDON_PRICE,
  };
  const baseCents = bowls[key];
  if (baseCents == null) return { error: `Unknown bowl: ${key}` };
  const spec = BOWL_BY_NAME[String(key).toUpperCase()];
  if (!spec || spec.hidden) return { error: `Unknown bowl: ${key}` };

  // TEMPORARILY 86'd. This is the enforcement, not the badge on the order page — checkout accepts
  // whatever id is in the request body, so a cart built before the owner marked it sold out, a
  // stale tab, the 60s menu cache, or a hand-crafted POST all arrive here. Without this the flag
  // is decoration and the bowl still sells.
  //
  // Absent `pricing` (unit tests, D1 unreachable) there is nothing to check and it prices as
  // before — a sold-out state that fails CLOSED when the database is down would take the whole
  // storefront off sale over one missing column.
  const availability = (pricing && pricing.availability && pricing.availability[key]) || 'available';
  if (availability !== 'available') {
    const label = (AVAILABILITY[availability] || AVAILABILITY.unavailable).label.toLowerCase();
    // Named, and separated from "Unknown bowl" on purpose: that message means a typo or a bad
    // request, this one means the kitchen. Whoever reads it should not have to guess which.
    return { error: `${spec.name} is ${label} right now — please remove it from your order.`, unavailable: true };
  }
  const buildNames = spec.build.map((x) => x.item);
  const protein = buildNames[0];
  const m = mods || {};

  const removed = [];
  for (const r of (Array.isArray(m.removed) ? m.removed : [])) {
    if (typeof r !== 'string' || !buildNames.includes(r)) return { error: `Can't remove "${r}" from ${spec.name}.` };
    if (r === protein) return { error: `The protein can't be removed from ${spec.name}.` };
    if (!removed.includes(r)) removed.push(r);
  }
  const base = m.base === 'brown_rice' ? 'brown_rice' : null;
  const sauces = [];
  for (const s of (Array.isArray(m.sauces) ? m.sauces : [])) {
    if (HOUSE_SAUCES.includes(s) && !sauces.includes(s)) sauces.push(s);
  }
  // First added sauce is free; each additional sauce is $1.50.
  let extraCents = Math.max(0, sauces.length - 1) * mp.extra_sauce;
  let avocado = false;
  const addonLabels = [];
  for (const e of (Array.isArray(m.extras) ? m.extras.slice(0, 12) : [])) {
    if (e && e.type === 'ingredient') {
      if (!buildNames.includes(e.name)) return { error: `Can't add extra "${e && e.name}".` };
      extraCents += PREMIUM_RE.test(e.name) ? mp.extra_premium : mp.extra_std;
      addonLabels.push('extra ' + e.name);
    // Allowlist against ADDON_PRICE, not the whole modifier map: mp carries EVERY row of
    // menu_modifier_prices, which since 0045 includes plan_5/10/12_weekly. Without this, a crafted
    // cart could send {type:'addon', id:'plan_12_weekly'} and bolt +$219 onto a bowl — a real Square
    // charge on an unfulfillable line the kitchen would read as "+undefined".
    } else if (e && e.type === 'addon' && Object.prototype.hasOwnProperty.call(ADDON_PRICE, e.id) && mp[e.id] != null) {
      extraCents += mp[e.id];
      addonLabels.push(ADDON_NAME[e.id]);
      if (e.id === 'avocado_half') avocado = true;
    } else {
      return { error: `Invalid extra on ${spec.name}.` };
    }
  }

  const noteParts = [];
  removed.forEach((r) => noteParts.push('no ' + r.toLowerCase()));
  if (base === 'brown_rice') noteParts.push('base→brown rice');
  sauces.forEach((s, i) => noteParts.push('+' + s + (i === 0 ? '' : ' ($1.50)')));
  addonLabels.forEach((l) => noteParts.push('+' + l));
  const keptBuild = spec.build.filter((x) => !removed.includes(x.item)).map((x) => ({ item: x.item, oz: x.oz }));

  return {
    unitCents: baseCents + extraCents,
    removed, base, sauces, avocado,
    addons: [...sauces.map((s, i) => '+' + s + (i === 0 ? '' : ' ($1.50)')), ...addonLabels.map((l) => '+' + l)],
    notes: noteParts.join(' · ') || null,
    build: keptBuild,
    ingredients: keptBuild.map((x) => x.item),
    macros: scaledBowlMacros(spec.name, 1),
    label: bowlLabel(key),
  };
}

// Location types Google itself marks imprecise — it found the block or the neighborhood, not the
// building. Still real data (never a fabricated pin), just not proof this exact address exists.
const COARSE_LOCATION_TYPES = new Set(['APPROXIMATE', 'GEOMETRIC_CENTER']);

// Decide whether a geocode() result (or its absence) should stop checkout to ask the customer to
// confirm their delivery address, and why. Pure — no fetch, no D1 — so the exact rule that has to
// catch "10330 City Center Blvb, Pembroke Pines" (Google returns status OK, having silently
// corrected "Blvb" to "Blvd") can be pinned by name, not just exercised end-to-end through a
// mocked HTTP call. A plain "did geocode() return something?" check would have let that typo
// straight through — Google resolved it.
//
// Compares STREET (number + route) and ZIP only — never the unit, never the whole formatted
// line. formatAddress() folds the unit into line 1, and Google very often can't verify an
// apartment/suite: it just omits it from formatted_address and sets partial_match:true. Comparing
// whole lines (or trusting a bare partial_match) turned THAT into a false "we couldn't match this
// address" on a large share of real, apartment-heavy South Florida orders — which trains
// customers to tap through the one warning that actually matters. What decides which BUILDING the
// driver drives to is the street + zip; the unit is real information the kitchen/driver still
// get (order.html's acceptAddressSuggestion() never touches addrUnit), it's just not part of
// THIS check.
//   g          — geocode() result, or null when nothing came back at all
//   addr       — the parsed delivery address ({ street, unit, zip, … } from parseAddress())
//   failStatus — lastGeocodeFailure().status when g is null; unused when g is set
// Returns { suspect, reason, suggestion } — reason is 'not_found' | 'corrected' | 'coarse'.
export function classifyAddressCheck(g, addr, failStatus) {
  if (g) {
    const a = addr || {};
    const hasUnit = !!(a.unit && String(a.unit).trim());
    const gStreet = g.components && g.components.street;
    const gZip = g.components && g.components.zip;
    // Only compared when Google actually returned a structured street/zip to compare against —
    // without one there is nothing to diff, so it is never treated as a mismatch by default.
    const streetChanged = gStreet ? addressWasCorrected(a.street, gStreet) : false;
    const zipChanged = !!(a.zip && gZip && String(a.zip).slice(0, 5) !== String(gZip).slice(0, 5));
    // A bare partial_match only counts when NO unit was typed. With a unit, partial_match is
    // overwhelmingly "I couldn't verify the apartment" — not the street — and is not worth
    // interrupting checkout for.
    const partialSuspect = g.partialMatch && !hasUnit;
    const corrected = streetChanged || zipChanged || partialSuspect;
    const coarse = COARSE_LOCATION_TYPES.has(g.locationType);
    if (!corrected && !coarse) return { suspect: false, reason: null, suggestion: null };
    return {
      suspect: true,
      reason: corrected ? 'corrected' : 'coarse',
      // A one-tap alternative only when there IS a different address to offer — a coarse-but-
      // matching result has nothing new to suggest, just less confidence in the pin itself.
      //
      // A street is REQUIRED for the offer. Google answers an unrecognised street with the
      // surrounding city ("Palm Springs, FL 33461, USA" — street_number and route both absent),
      // which is not an alternative address, it is a shrug. Offering it as "Use this address"
      // meant a tap could overwrite the customer's CITY while leaving their street untouched,
      // producing an address neither of them meant and sending a driver to the wrong town. With
      // no street we fall through to the plain "deliver here anyway" confirmation instead, which
      // is the honest option when we have nothing better to propose.
      suggestion: corrected && g.components && g.components.street
        ? { formatted: g.formatted, ...g.components }
        : null,
    };
  }
  // Nothing came back. A genuinely nonexistent address (ZERO_RESULTS/NOT_FOUND) is exactly the
  // class this feature exists to ask about. A PROVIDER problem — billing, quota, a dead fetch, a
  // bad key — is NOT evidence the customer typed anything wrong, so it must never be treated the
  // same; the caller fails open on those before a "reason" is even needed.
  if (failStatus === 'ZERO_RESULTS' || failStatus === 'NOT_FOUND') {
    return { suspect: true, reason: 'not_found', suggestion: null };
  }
  return { suspect: false, reason: null, suggestion: null };
}

export const onRequestPost = async ({ request, env }) => {
  // Abuse guard: cap checkout creations per IP (each creates a Square order/payment link).
  const limited = await limitOr429(env, request, { name: 'checkout', limit: 15, windowSec: 60 });
  if (limited) return limited;

  if (!squareConfigured(env)) return bad('Checkout is not configured yet.', 503);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return bad('Your cart is empty.');

  // Prices come from D1 so the owner can change them from the HUB without a deploy. loadMenu
  // falls back to the module constants if D1 is unreachable — a database hiccup must not stop us
  // taking money at the last known-good price.
  const menu = await loadMenu(env);

  const lineItems = [];
  const orderItems = [];
  let subtotalCents = 0;
  for (const it of items) {
    if (menu.bowls[it && it.id] != null) {
      // Customized bowl: qty units of one configuration. Re-priced + re-validated server-side.
      const qty = Math.floor(Number(it.qty));
      if (!Number.isFinite(qty) || qty < 1 || qty > 20) return bad('Invalid bowl quantity.');
      const pr = priceCustomBowl(it.id, it.mods, menu);
      if (pr.error) return bad(pr.error);
      subtotalCents += pr.unitCents * qty;
      const lineName = pr.label + ' Bowl';
      const li = { name: lineName, quantity: String(qty), base_price_money: { amount: pr.unitCents, currency: 'USD' } };
      if (pr.notes) li.note = pr.notes.slice(0, 500);   // per-line mods for the kitchen on the Square order
      lineItems.push(li);
      orderItems.push({
        id: it.id, name: lineName + (pr.notes ? ' — ' + pr.notes : ''), qty, price_cents: pr.unitCents,
        size_oz: 16, size_pct: 100, macros: pr.macros, build: pr.build, ingredients: pr.ingredients,
        removals: pr.removed, addons: pr.addons, notes: pr.notes, avocado: pr.avocado, base: pr.base,
      });
    } else {
      const prod = menu.nonBowls[it && it.id];
      if (!prod) return bad(`Unknown item: ${it && it.id}`);
      // A drink or add-on can be 86'd too — the kitchen runs out of guava soda the same way it
      // runs out of tuna. Same enforcement as the bowl branch, same open-on-missing-data rule.
      const av = (menu.availability && menu.availability[it.id]) || 'available';
      if (av !== 'available') {
        const label = (AVAILABILITY[av] || AVAILABILITY.unavailable).label.toLowerCase();
        return bad(`${prod.name} is ${label} right now — please remove it from your order.`);
      }
      const qty = Math.floor(Number(it.qty));
      if (!Number.isFinite(qty) || qty < 1 || qty > 20) return bad(`Invalid quantity for ${prod.name}.`);
      const cents = prod.price_cents;
      subtotalCents += cents * qty;
      lineItems.push({ name: prod.name, quantity: String(qty), base_price_money: { amount: cents, currency: 'USD' } });
      orderItems.push({ id: it.id, name: prod.name, qty, price_cents: cents });
    }
  }

  // Two fulfillment modes:
  //   on_demand → make-now, delivered today. Only accepted inside the ET ordering window
  //               (default 11 AM–7 PM) and capped per bowl per day (launch throttle).
  //   scheduled → an upcoming Mon–Sat delivery, ordered before the 6 PM day-before cutoff.
  const WINDOWS = { lunch: 'Lunch (11:00 AM–1:00 PM)', dinner: 'Dinner (5:00 PM–7:00 PM)', asap: 'ASAP · today' };
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const onDemand = !!(b.fulfillment && b.fulfillment.mode === 'on_demand') || b.mode === 'on_demand';

  let win, dateStr, fulfillmentMode, fulfillLabel;
  // Hoisted: assigned on the scheduled branch, reused for the zip check on BOTH branches. As a
  // const inside the else-block it made every on-demand order throw ReferenceError at the reuse.
  let schedOps = null;
  if (onDemand) {
    fulfillmentMode = 'on_demand';
    // Same overrides as the storefront. If only the display honored scheduled-only, a crafted
    // request could still place a same-day order — the gate has to read the same setting.
    const orderingSettings = await loadOrderingSettings(env);
    const w = windowState(env, new Date(), orderingSettings);
    if (!w.open) {
      const closeDisp = w.closeMinute ? `${w.closeHour % 12 === 0 ? 12 : w.closeHour % 12}:${String(w.closeMinute).padStart(2, '0')} ${w.closeHour >= 12 ? 'PM' : 'AM'}` : fmtHour(w.closeHour);
      return bad(`On-demand ordering is open ${fmtHour(w.openHour)}–${closeDisp} ET. Please schedule a delivery instead, or order again during ordering hours.`, 409);
    }
    // Daily production cap. Two sources, one gate: the global launch throttle, and the owner's
    // manual per-item count when they have set one (which overrides it, in both directions).
    const { limit } = onDemandConfig(env, orderingSettings);
    // `menu` is already loaded — passing it avoids a second read AND makes the counts here the
    // same ones that priced the cart, rather than a snapshot taken a moment later.
    const remaining = await remainingByBowl(env, w.dateStr, limit, menu).catch(() => null);
    if (remaining) {
      const want = {};
      // Tally against whatever is actually CAPPED, not a hardcoded bowl list. The old list meant a
      // bowl the owner added in the HUB was silently uncapped, and it would now also miss a drink
      // the owner had put a count on.
      for (const it of orderItems) if (remaining[it.id] != null) want[it.id] = (want[it.id] || 0) + it.qty;
      for (const itemId of Object.keys(want)) {
        const left = Math.max(0, remaining[itemId]);
        if (want[itemId] > left) {
          // Name it as what it is. "Gold Vitality Bowl" would be wrong now that a drink can carry
          // a count, and a customer reading it would think we had lost track of our own menu.
          const isBowl = menu.bowls[itemId] != null;
          const nm = isBowl ? bowlLabel(itemId) + ' Bowl' : ((menu.nonBowls[itemId] || {}).name || itemId);
          const cap = menu.stock && menu.stock[itemId] != null ? menu.stock[itemId] : limit;
          return bad(
            left > 0
              ? `${nm}: only ${left} left today (we have ${cap}). Lower the quantity or schedule a delivery.`
              : `${nm} is sold out for today. Try something else, or schedule a delivery.`,
            409
          );
        }
      }
    }
    dateStr = w.dateStr;     // today (ET) — kitchen makes it now, driver delivers same day
    win = 'asap';
    fulfillLabel = `On-demand (ASAP today ${w.dateStr})`;
  } else {
    fulfillmentMode = 'scheduled';
    const dlv = b.delivery || {};
    win = (dlv.window === 'lunch' || dlv.window === 'dinner') ? dlv.window : null;
    dateStr = (typeof dlv.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dlv.date)) ? dlv.date : null;
    if (!dateStr || !win) return bad('Please choose a delivery date and time window.');
    const midnightUtc = Date.parse(dateStr + 'T00:00:00Z');
    if (Number.isNaN(midnightUtc)) return bad('Invalid delivery date.');
    const dow = new Date(midnightUtc).getUTCDay();
    if (dow === 0) return bad('We deliver Monday–Saturday. Please pick another date.');
    // THE OWNER'S CUTOFF, not a hard-coded one. scheduleOpenFor was built settings-aware,
    // imported here, and never wired in — the lint warning that sat on this file all month was
    // the receipt. With it unwired, the page could promise the owner's configured hour while
    // checkout silently refused at a fossilised 6 PM: worse than either bug alone, because every
    // customer between the two hours is told the site lied to them.
    schedOps = await loadOperating(env);
    const gate = scheduleOpenFor(schedOps, dateStr);
    if (!gate.ok) {
      const hr = Number(schedOps.order_by_hour) || 18;
      const hh = `${hr % 12 || 12} ${hr >= 12 ? 'PM' : 'AM'}`;
      if (gate.reason === 'past_deadline') return bad(`That date has passed its order cutoff (${hh} the day before). Pick a later date.`);
      if (gate.reason === 'no_delivery_day' || gate.reason === 'closed') return bad('We are not delivering that day. Please pick another date.');
      return bad('Please choose an upcoming delivery date.');
    }
    if (midnightUtc - Date.now() > 24 * 24 * 3600 * 1000) return bad('Please choose a delivery date within the next few weeks.');
    fulfillLabel = `${DOW[dow]} ${dateStr} · ${WINDOWS[win]}`;
  }
  // Delivery address (we collect it ourselves now and store it for routing).
  const parsed = parseAddress(b.address);
  if (parsed.error) return bad(parsed.error);
  const addr = parsed.addr;

  // SERVICE AREA. Until now this was a comment ("we deliver within Palm Beach County") and nothing
  // else — every 5-digit ZIP was accepted, which is how an order arrived from Miami. Someone out
  // of state could pay for food that cannot reach them and we would be holding their money.
  //
  // Empty setting = unrestricted, i.e. exactly today's behaviour, so this cannot start rejecting
  // real customers the moment it deploys. The owner turns it on in the HUB.
  const ops = schedOps || await loadOperating(env);
  const area = zipAllowed(ops, addr.zip);
  if (!area.ok) {
    return bad(
      `We don't deliver to ${addr.zip} yet. We're adding areas as we grow — email hola@anejocateringco.com and we'll tell you the moment we reach you.`,
      422,
    );
  }
  const addrLine = formatAddress({ street: addr.street, unit: addr.unit, city: addr.city, state: addr.state, zip: addr.zip });

  // ---- Server-side address verification. WARN AND ASK, NEVER HARD-BLOCK. A real order once
  // shipped to "10330 City Center Blvb" — a typo for Blvd — and nobody caught it; a client-only
  // check is bypassable (and untested), so this runs here, server-side, before Square ever sees
  // the order. New construction and gated communities are real orders Google's index has
  // genuinely never heard of, so an unresolved/corrected/imprecise address is a QUESTION back to
  // the customer (409 + needs_confirmation), never a refusal — the browser resends with
  // `address_confirmed:true` (or the accepted suggestion, which will simply verify clean) to go
  // through. If the provider itself is unreachable, unkeyed, rate-limited or misconfigured this
  // stays 'unavailable' and checkout proceeds exactly as it always has — an outage at Google must
  // never cost the business an order.
  let addressVerifyStatus = 'unavailable', addressVerifyReason = null, verifiedGeo = null;
  if (geoConfigured(env)) {
    const g = await geocode(env, addrLine).catch(() => null);
    const failStatus = g ? null : ((lastGeocodeFailure() || {}).status || null);
    const check = classifyAddressCheck(g, addr, failStatus);
    if (check.suspect) {
      if (!b.address_confirmed) {
        const MSG = {
          not_found: "We couldn't find this delivery address — is it right?",
          corrected: "We couldn't quite match this address — is it right?",
          coarse: 'We could only find the general area for this address, not the exact building — is it right?',
        };
        return json({
          error: MSG[check.reason],
          needs_confirmation: true,
          address_check: { reason: check.reason, typed: addrLine, suggestion: check.suggestion },
        }, 409);
      }
      // The customer said "use it anyway" (or accepted the suggestion and this IS that resend).
      // Record the outcome on the order so the kitchen/driver side can see this pin — if any —
      // was never confidently confirmed, rather than silently trusting it like a clean match.
      addressVerifyStatus = 'unverified_confirmed';
      addressVerifyReason = check.reason;
      if (g) verifiedGeo = g;   // still real data from the provider — worth a pin, just flagged
    } else if (g) {
      addressVerifyStatus = 'verified';
      verifiedGeo = g;
    }
    // else: provider trouble (REQUEST_DENIED, OVER_QUERY_LIMIT, FETCH_FAILED, …) — 'unavailable'
    // stands and checkout proceeds. Google being down is not evidence the address is wrong.
  }

  // Customer contact — a first name is REQUIRED so every order is identifiable for the kitchen
  // and the delivery driver. Phone + SMS consent are optional; with consent we can text delivery
  // updates (otherwise we fall back to email). We never text a number without an explicit opt-in.
  const contact = b.contact || {};
  const firstName = (contact.first_name || contact.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!firstName) return bad('Please enter your first name so we can label your order.');
  const custPhone = normalizePhone(contact.phone);
  // Guest email. Until now the order only recorded an email when the buyer happened to be SIGNED
  // IN, so every guest order stored NULL — and everything keyed on it silently did nothing:
  // awardOrderPoints returns 0 without an email, order notifications had nobody to reach, and an
  // abandoned cart could never be followed up. That is why points_ledger had one row against real
  // orders.
  const typedEmail = String(contact.email || '').trim().toLowerCase().slice(0, 160);
  const smsConsent = ((contact.sms_consent === true || contact.sms_consent === 1) && custPhone) ? 1 : 0;
  // Marketing SMS consent is a SEPARATE permission (0047/0048). `sms_consent` above was collected
  // with order-and-delivery wording — transactional only — and a promotional text needs its own
  // express opt-in under the TCPA. Requires the box AND a number; the _at/_src stamps written
  // below are the proof of consent, so they are never set without it.
  const mktgSmsConsent = ((contact.marketing_sms_consent === true || contact.marketing_sms_consent === 1) && custPhone) ? 1 : 0;

  let deliveryNote = `${onDemand ? 'ON-DEMAND' : 'Delivery'} for ${firstName}: ${fulfillLabel} · ${addrLine}`;

  // Order minimum + flat delivery fee (configurable via env).
  const orderMinCents = Math.round(Number(env.ORDER_MIN_USD || 25) * 100);
  if (subtotalCents < orderMinCents) return bad(`Order minimum is $${(orderMinCents / 100).toFixed(2)}. Please add a little more.`);
  let feeCents = Math.round(Number(env.DELIVERY_FEE_USD || 5) * 100);

  // FL state 6% + Palm Beach County 1% surtax = 7% by default; override via SALES_TAX_PCT.
  const taxPct = String(env.SALES_TAX_PCT || '7.0');

  const base = appBaseUrl(env, request);

  // ---- Añejo Rewards redemption — ONLY for a signed-in client, validated against THEIR OWN
  // balance (server-side; the browser can't redeem someone else's points or more than it holds).
  let redeemPts = 0, discountCents = 0, sessEmail = null;
  try {
    const sess = await currentUser(env, request);
    if (sess && sess.type === 'client' && sess.email) {
      sessEmail = String(sess.email).trim().toLowerCase();
      const sum = await rewardsSummary(env, sessEmail);
      if (sum.free_delivery) feeCents = 0;   // owner-configured tier perk: free delivery
      const want = Math.floor(Number(b.redeem_points) || 0);
      if (want > 0) {
        const pc = sum.redeem_point_cents || 5;
        discountCents = Math.floor(Math.max(0, Math.min(Math.min(want, sum.points) * pc, subtotalCents)));
        redeemPts = Math.ceil(discountCents / pc);
      }
    }
  } catch (_) { redeemPts = 0; discountCents = 0; }

  // ---- Promo / affiliate code. Server-authoritative: the browser sends only a string; the
  // percentage, expiry, account-binding and commission all come from D1. A 'customer' code is
  // non-shareable — evaluatePromo requires the signed-in email to match the code's bound_email.
  // A typed code wins (e.g. an influencer's code); otherwise a signed-in Founding Legacy Member's
  // lifetime 2x-points benefit auto-applies with nothing to remember or type.
  let promoInput = b.promo_code;
  if (!promoInput && sessEmail) {
    try { promoInput = await autoCustomerCodeFor(env, sessEmail); } catch { promoInput = null; }
  }
  let promo = null, promoDiscountCents = 0;
  if (promoInput) {
    try {
      const ev = await evaluatePromo(env, {
        code: promoInput,
        sessionEmail: sessEmail,
        // Guest identifiers so the anti-self-referral check works logged-out too.
        guestPhone: custPhone,
        // Apply the % to the subtotal AFTER any points redemption, so the two never over-discount.
        subtotalCents: Math.max(0, subtotalCents - discountCents),
      });
      if (ev.ok) { promo = ev; promoDiscountCents = Math.max(0, ev.discount_cents || 0); }
      // Only a code the customer TYPED may block checkout. An auto-applied member benefit that
      // doesn't validate is silently skipped — never strand a paying customer over a perk.
      else if (b.promo_code) {
        if (ev.reason === 'signin_required') return bad('Sign in with the email your code was sent to, then apply it.');
        if (ev.reason === 'not_your_code') return bad('That code belongs to another account. Codes cannot be shared.');
        if (ev.reason === 'expired') return bad('That code has expired.');
        if (ev.reason === 'self_referral') return bad('Partners cannot use their own referral code.');
        if (ev.reason === 'not_found' || ev.reason === 'disabled') return bad('That code is not valid.');
        // Without these two, a typed code that lost the use-cap race fell through every branch and
        // the customer was silently charged full price with no explanation.
        if (ev.reason === 'exhausted') return bad('That code has reached its limit.');
        if (ev.reason === 'not_started') return bad('That code is not active yet.');
        return bad('That code cannot be applied.');
      }
    } catch (_) { promo = null; promoDiscountCents = 0; }
  }
  // Never discount below zero once both discounts are combined.
  const totalDiscountCents = Math.min(subtotalCents, discountCents + promoDiscountCents);

  // ATOMIC use-cap claim. evaluatePromo's max_uses check is advisory — a Square round-trip sits
  // between it and the increment, so concurrent checkouts could all pass a 1-use gate. Claim the
  // slot here (conditional UPDATE, exactly one winner) and release it if anything downstream fails.
  let promoClaimed = false;
  if (promo) {
    promoClaimed = await claimPromoUse(env, promo.code);
    if (!promoClaimed) {
      if (b.promo_code) return bad('That code has reached its limit.');
      promo = null; promoDiscountCents = 0;   // auto-applied benefit: degrade silently
    }
  }
  const finalDiscountCents = promo ? totalDiscountCents : Math.min(subtotalCents, discountCents);

  // A granted perk has to reach the people who pack the bag — otherwise we've promised a customer
  // something the kitchen never sees. Add it as a $0 line item (kitchen board reads orderItems)
  // AND onto the Square ticket note.
  if (promo && promo.perk === 'fit_drink') {
    orderItems.push({ id: 'perk_fit_drink', name: 'Añejo Fit drink — FREE (partner perk)', qty: 1, price_cents: 0, perk: true });
    deliveryNote += ' · 🎁 INCLUDE 1 FREE Añejo Fit drink (partner perk)';
  }

  const { ok, status, data } = await square(env, '/v2/online-checkout/payment-links', {
    method: 'POST',
    body: {
      idempotency_key: id('co'),
      order: {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: lineItems,
        service_charges: feeCents > 0 ? [{
          uid: 'delivery-fee', name: 'Delivery fee',
          amount_money: { amount: feeCents, currency: 'USD' },
          calculation_phase: 'SUBTOTAL_PHASE', taxable: false,
        }] : undefined,
        taxes: [{
          uid: 'sales-tax',
          name: `Sales Tax (FL · Palm Beach County · ${taxPct}%)`,
          percentage: taxPct,
          scope: 'ORDER',   // applies to every line item on the order
        }],
        discounts: (() => {
          const ds = [];
          if (discountCents > 0) ds.push({
            uid: 'anejo-rewards',
            name: `Añejo Rewards (${redeemPts} pts)`,
            amount_money: { amount: discountCents, currency: 'USD' },
            scope: 'ORDER',
          });
          if (promo && promoDiscountCents > 0) ds.push({
            uid: 'anejo-promo',
            name: `${promo.code} (${promo.pct_off}% off)`,
            amount_money: { amount: promoDiscountCents, currency: 'USD' },
            scope: 'ORDER',
          });
          return ds.length ? ds : undefined;
        })(),
        reference_id: onDemand ? 'web-ondemand' : 'web-delivery',
        note: deliveryNote,   // shows on the Square order for the kitchen
      },
      // Pre-fill Square's contact fields with what the client already gave us on /order,
      // so the hosted page is "confirm" not "retype". Square still owns the receipt email.
      pre_populated_data: (() => {
        const pp = {};
        const digits = (custPhone || '').replace(/[^0-9]/g, '');
        if (digits.length === 10) pp.buyer_phone_number = `+1${digits}`;
        else if (digits.length === 11 && digits.startsWith('1')) pp.buyer_phone_number = `+${digits}`;
        if (sessEmail) pp.buyer_email = sessEmail;
        return Object.keys(pp).length ? pp : undefined;
      })(),
      checkout_options: {
        redirect_url: `${base}/order/confirmed`,
        // We collect the delivery address ourselves (stored for routing), so don't ask twice.
        ask_for_shipping_address: false,
        // Show a tip prompt at checkout — driver gratuities. Tip lands in the Square order's
        // total_tip_money; the webhook records it on the order for owner/driver payout.
        allow_tipping: true,
      },
    },
  });

  // Give the promo slot back on any failure past the claim — otherwise a Square hiccup
  // permanently burns a use from a capped code.
  if (!ok) {
    if (promoClaimed) await releasePromoUse(env, promo.code);
    const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
    return bad(detail || `Square checkout failed (${status}).`, 502);
  }

  const pl = data && data.payment_link;
  const url = pl && (pl.long_url || pl.url);
  if (!url) {
    if (promoClaimed) await releasePromoUse(env, promo.code);
    return bad('Square did not return a checkout URL.', 502);
  }

  // Persist a pending order for the kitchen view; the webhook marks it paid.
  const attribution = parseAttribution(b.attribution);
  if (env.DB) {
    try {
      const t = Date.now();
      // Geocode already ran above (the verification gate) — reuse it rather than call Google
      // twice for the same address. lat/lng stay NULL when nothing came back at all; a suspect-
      // but-real result the customer confirmed anyway still carries real coordinates (see
      // addressVerifyStatus below for the trust signal the kitchen/driver side reads).
      const lat = verifiedGeo ? verifiedGeo.lat : null;
      const lng = verifiedGeo ? verifiedGeo.lng : null;
      const geocodedAt = verifiedGeo ? t : null;
      const orderId = id('ord');
      await env.DB.prepare(
        `INSERT INTO orders (id, square_order_id, payment_link_id, items, delivery_date, delivery_window,
            fulfillment_mode, subtotal_cents, fee_cents, tax_pct, total_estimate_cents, redeem_points, discount_cents,
            customer_name, customer_email, customer_phone, sms_consent,
            marketing_sms_consent, marketing_sms_consent_at, marketing_sms_consent_src,
            delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes,
            delivery_lat, delivery_lng, geocoded_at, address_verify_status, address_verify_reason,
            promo_code, promo_points_mult,
            src, utm_source, utm_medium, utm_campaign, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`
      ).bind(
        orderId, pl.order_id || null, pl.id || null, JSON.stringify(orderItems), dateStr, win,
        fulfillmentMode, subtotalCents, feeCents, Number(taxPct),
        // Mirror Square exactly: tax applies to the discounted subtotal ONLY — the delivery fee
        // is sent to Square as `taxable: false`, so taxing it here overstated every order's
        // revenue by fee×tax and skewed rewards tiers, P&L and COGS snapshots that read this field.
        Math.round(Math.max(0, subtotalCents - finalDiscountCents) * (1 + Number(taxPct) / 100)) + feeCents,
        redeemPts || null, finalDiscountCents || null,
        // A proven session wins over a typed address; otherwise the typed one is what we have.
        firstName, (sessEmail || (isEmail(typedEmail) ? typedEmail : null)), custPhone, smsConsent,
        mktgSmsConsent, mktgSmsConsent ? t : null, mktgSmsConsent ? 'checkout:order' : null,
        addr.street, addr.unit, addr.city, addr.state, addr.zip, addr.notes,
        lat, lng, geocodedAt, addressVerifyStatus, addressVerifyReason,
        promo ? promo.code : null, promo ? promo.points_mult : null,
        attribution.src, attribution.utm_source, attribution.utm_medium, attribution.utm_campaign, t, t
      ).run();
      // Consume the code against this order (idempotent per order). The webhook later reads the
      // order's promo_code to apply the points multiplier and pay any affiliate commission.
      if (promo) await recordRedemption(env, { evaluated: promo, orderId, customerEmail: sessEmail }).catch(() => {});
    } catch (_) { /* never fail checkout on the order-log write */ }
  }

  return json({ url });
};
