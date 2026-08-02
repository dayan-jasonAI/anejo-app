// Server-side delivery-address verification at /order checkout (functions/api/checkout.js +
// functions/_lib/geo.js).
//
// The motivating incident: a real order shipped to "10330 City Center Blvb" (Pembroke Pines) — a
// typo for "Blvd" — and nobody caught it. Production evidence (a real Google Geocoding API call
// against that exact string) showed Google resolves it anyway: status OK, a real lat/lng, having
// silently corrected "Blvb" to "Blvd" in `formatted_address`. That means a naive "did geocode()
// return something?" check is NOT the feature — it would let the motivating typo straight through.
// The tests below pin the actual signal: comparing what the customer typed against what Google
// formatted back, plus `partial_match` and result precision (`location_type`).
//
// Three behaviors are load-bearing here and each gets its own test:
//   · WARN AND ASK, NEVER HARD-BLOCK — an unresolved/corrected/imprecise address returns 409 +
//     needs_confirmation, never a bare rejection; address_confirmed:true always gets through.
//   · FAIL OPEN — a provider outage, a missing/bad key, rate-limiting, or a dead fetch must never
//     be treated as "the address is wrong". Only a clean ZERO_RESULTS (or a resolved-but-suspect
//     result) triggers a warning; everything else proceeds silently, exactly as before this file.
//   · NEVER 0,0 — an address that failed to resolve at all stores NULL coordinates, never a
//     fabricated default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { geocode, addressWasCorrected, lastGeocodeFailure } from '../../functions/_lib/geo.js';
import { onRequestPost as checkoutPost, classifyAddressCheck } from '../../functions/api/checkout.js';
import { makeD1 } from '../helpers/d1.js';

const CHECKOUT_SRC = readFileSync(new URL('../../functions/api/checkout.js', import.meta.url), 'utf8');
const ORDER_HTML = readFileSync(new URL('../../public/order.html', import.meta.url), 'utf8');
const MIGRATIONS = readFileSync(new URL('../../migrations/0073_address_verify.sql', import.meta.url), 'utf8');

// ---- geo.js: geocode() surfaces the signal, addressWasCorrected() reads it ------------------

function googleResult({ formatted, partialMatch = false, locationType = 'ROOFTOP', components = {} } = {}) {
  const comp = (type, short) => ({ types: [type], short_name: short, long_name: short });
  return {
    status: 'OK',
    results: [{
      formatted_address: formatted,
      partial_match: partialMatch || undefined,
      geometry: { location: { lat: 26.0059265, lng: -80.2850607 }, location_type: locationType },
      types: ['street_address'],
      address_components: [
        components.streetNumber && comp('street_number', components.streetNumber),
        components.route && comp('route', components.route),
        components.city && comp('locality', components.city),
        components.state && comp('administrative_area_level_1', components.state),
        components.zip && comp('postal_code', components.zip),
      ].filter(Boolean),
    }],
  };
}

function withFetch(handler, fn) {
  const real = global.fetch;
  global.fetch = handler;
  return Promise.resolve(fn()).finally(() => { global.fetch = real; });
}

test('geocode() with no key configured no-ops (never calls fetch)', async () => {
  await withFetch(() => { throw new Error('must not fetch'); }, async () => {
    assert.equal(await geocode({}, '10330 City Center Blvb, Pembroke Pines, FL 33025'), null);
  });
});

test('geocode() surfaces partial_match, location_type and structured components', async () => {
  await withFetch(
    async () => new Response(JSON.stringify(googleResult({
      formatted: '10330 City Center Blvd, Pembroke Pines, FL 33025, USA',
      partialMatch: true,
      locationType: 'ROOFTOP',
      components: { streetNumber: '10330', route: 'City Center Blvd', city: 'Pembroke Pines', state: 'FL', zip: '33025' },
    }))),
    async () => {
      const g = await geocode({ GOOGLE_MAPS_API_KEY: 'k' }, '10330 City Center Blvb, Pembroke Pines, FL 33025');
      assert.equal(g.partialMatch, true);
      assert.equal(g.locationType, 'ROOFTOP');
      assert.equal(g.components.street, '10330 City Center Blvd');
      assert.equal(g.components.city, 'Pembroke Pines');
      assert.equal(g.components.zip, '33025');
    }
  );
});

test('geocode() records WHY it failed — a provider problem must be distinguishable from a bad address', async () => {
  await withFetch(
    async () => new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] })),
    async () => {
      assert.equal(await geocode({ GOOGLE_MAPS_API_KEY: 'k' }, 'nowhere real'), null);
      assert.equal(lastGeocodeFailure().status, 'ZERO_RESULTS');
    }
  );
  await withFetch(
    async () => new Response(JSON.stringify({ status: 'REQUEST_DENIED', error_message: 'billing not enabled' })),
    async () => {
      assert.equal(await geocode({ GOOGLE_MAPS_API_KEY: 'k' }, '123 Main St'), null);
      assert.equal(lastGeocodeFailure().status, 'REQUEST_DENIED');
    }
  );
  await withFetch(
    async () => { throw new TypeError('network down'); },
    async () => {
      assert.equal(await geocode({ GOOGLE_MAPS_API_KEY: 'k' }, '123 Main St'), null);
      assert.equal(lastGeocodeFailure().status, 'FETCH_FAILED');
    }
  );
});

// THE motivating case. Google returns status OK — it resolved — but formatted_address corrects
// the typo. A resolves/doesn't-resolve check alone would say "fine" here; addressWasCorrected()
// is what actually catches it.
test('addressWasCorrected: "Blvb" → "Blvd" from the real incident IS a correction', () => {
  assert.equal(
    addressWasCorrected(
      '10330 City Center Blvb, Pembroke Pines, FL 33025',
      '10330 City Center Blvd, Pembroke Pines, FL 33025, USA'
    ),
    true
  );
});

test('addressWasCorrected ignores benign formatting differences (abbreviations, ", USA", punctuation)', () => {
  assert.equal(
    addressWasCorrected('123 Main Street, West Palm Beach, FL 33401', '123 Main St, West Palm Beach, FL 33401, USA'),
    false
  );
  assert.equal(
    addressWasCorrected('456 North Ocean Dr Apt 2, Delray Beach, FL 33483', '456 N Ocean Dr, Apt 2, Delray Beach, FL 33483, USA'),
    false
  );
});

test('addressWasCorrected catches a genuinely different street', () => {
  assert.equal(
    addressWasCorrected('100 Elm Street, Boca Raton, FL 33432', '100 Oak Street, Boca Raton, FL 33432, USA'),
    true
  );
});

// ---- checkout.js: classifyAddressCheck() — the WARN AND ASK / FAIL OPEN boundary --------------
//
// classifyAddressCheck(g, addr, failStatus) compares STREET + ZIP only, never the unit and never
// the whole formatted line — see the header comment on the function itself for why: formatAddress
// folds the unit into line 1, and Google routinely can't verify an apartment/suite (it just omits
// it and sets partial_match:true). A whole-line or bare-partial_match comparison turned that into
// a false "we couldn't match this address" on a large share of real, apartment-heavy South
// Florida orders.

const addr = (street, unit, zip) => ({ street, unit: unit || '', city: 'x', state: 'FL', zip, notes: null });

const ROOFTOP_EXACT = { formatted: '123 Main St, West Palm Beach, FL 33401', partialMatch: false, locationType: 'ROOFTOP', components: {} };
const CORRECTED_TYPO = { formatted: '10330 City Center Blvd, Pembroke Pines, FL 33025, USA', partialMatch: false, locationType: 'ROOFTOP', components: { street: '10330 City Center Blvd', city: 'Pembroke Pines', state: 'FL', zip: '33025' } };
const COARSE = { formatted: '500 New Build Way, Boynton Beach, FL 33437', partialMatch: false, locationType: 'GEOMETRIC_CENTER', components: {} };

test('an exact, ROOFTOP, non-partial match is NOT suspect', () => {
  const r = classifyAddressCheck(ROOFTOP_EXACT, addr('123 Main St', '', '33401'), null);
  assert.equal(r.suspect, false);
});

// THE test the lead specifically asked for: geocode SUCCEEDS (status OK, a real result) but the
// formatted address was silently corrected — this must still warn and ask.
test('resolved-but-corrected (the "Blvb"→"Blvd" shape) IS suspect, reason "corrected", and offers the suggestion', () => {
  const r = classifyAddressCheck(CORRECTED_TYPO, addr('10330 City Center Blvb', '', '33025'), null);
  assert.equal(r.suspect, true);
  assert.equal(r.reason, 'corrected');
  assert.equal(r.suggestion.formatted, CORRECTED_TYPO.formatted);
  assert.equal(r.suggestion.street, '10330 City Center Blvd');
});

// THE regression test for the lead's review comment. A customer at a real apartment types a
// perfectly good address; Google can't verify the unit, drops it from formatted_address, and sets
// partial_match:true — but the STREET and ZIP it returned match exactly what was typed. This must
// NOT interrupt checkout. Do not delete this test.
test('REGRESSION: a typed UNIT that Google cannot verify (partial_match, street/zip otherwise identical) is NOT suspect', () => {
  const g = {
    formatted: '4342 Clinton Blvd, Lake Worth, FL 33461, USA',   // unit dropped by Google
    partialMatch: true,
    locationType: 'ROOFTOP',
    components: { street: '4342 Clinton Blvd', city: 'Lake Worth', state: 'FL', zip: '33461' },
  };
  const r = classifyAddressCheck(g, addr('4342 Clinton Blvd', 'Unit F8', '33461'), null);
  assert.equal(r.suspect, false, 'an unverifiable apartment must never trigger the warning');
});

test('partial_match:true with NO unit typed IS suspect (there is nothing else it could be about)', () => {
  const g = {
    formatted: '9 Some Other St, Lake Worth, FL 33460',
    partialMatch: true,
    locationType: 'ROOFTOP',
    components: { street: '9 Some Other St', city: 'Lake Worth', state: 'FL', zip: '33460' },
  };
  const r = classifyAddressCheck(g, addr('9 Some Other St', '', '33460'), null);
  assert.equal(r.suspect, true);
  assert.equal(r.reason, 'corrected');
  assert.ok(r.suggestion);
});

// Taken from a REAL production response. Posting "99999 Nonexistent Fakestreet Blvd, Lake Worth,
// FL 33461" to the live endpoint came back partial_match with the surrounding city and NO street:
// formatted "Palm Springs, FL 33461, USA", street_number and route both absent. That is Google
// shrugging, not proposing an address. Offered as a one-tap "Use this address" it would have
// overwritten the customer's CITY while leaving their street alone — an address neither party
// meant, pointing a driver at the wrong town.
test('a city-level result with no street is still suspect but offers NO suggestion to accept', () => {
  const g = {
    formatted: 'Palm Springs, FL 33461, USA',
    partialMatch: true,
    locationType: 'APPROXIMATE',
    components: { street: null, city: 'Palm Springs', state: 'FL', zip: '33461' },
  };
  const r = classifyAddressCheck(g, addr('99999 Nonexistent Fakestreet Blvd', '', '33461'), null);
  assert.equal(r.suspect, true, 'a street Google cannot find must still ask the customer');
  assert.equal(r.suggestion, null, 'never offer a city as a replacement for a street address');
});

test('a genuinely different street (not a unit issue) IS suspect, even with no partial_match flag', () => {
  const g = {
    formatted: '100 Oak Street, Boca Raton, FL 33432',
    partialMatch: false,
    locationType: 'ROOFTOP',
    components: { street: '100 Oak Street', city: 'Boca Raton', state: 'FL', zip: '33432' },
  };
  const r = classifyAddressCheck(g, addr('100 Elm Street', '', '33432'), null);
  assert.equal(r.suspect, true);
  assert.equal(r.reason, 'corrected');
});

test('a ZIP mismatch with an otherwise-matching street IS suspect', () => {
  const g = {
    formatted: '100 Main St, Delray Beach, FL 33445',
    partialMatch: false,
    locationType: 'ROOFTOP',
    components: { street: '100 Main St', city: 'Delray Beach', state: 'FL', zip: '33445' },
  };
  const r = classifyAddressCheck(g, addr('100 Main St', 'Apt 4', '33483'), null);   // typed a different zip
  assert.equal(r.suspect, true);
  assert.equal(r.reason, 'corrected', 'a real zip mismatch must still warn even WITH a unit typed');
});

test('a coarse/imprecise match (APPROXIMATE, GEOMETRIC_CENTER) is suspect with NO suggestion to offer', () => {
  const r = classifyAddressCheck(COARSE, addr('500 New Build Way', '', '33437'), null);
  assert.equal(r.suspect, true);
  assert.equal(r.reason, 'coarse');
  assert.equal(r.suggestion, null, 'nothing DIFFERENT to suggest — the text already matched');
});

test('no result at all + ZERO_RESULTS/NOT_FOUND is suspect ("not_found")', () => {
  for (const status of ['ZERO_RESULTS', 'NOT_FOUND']) {
    const r = classifyAddressCheck(null, addr('999 Imaginary Ave', '', '00000'), status);
    assert.equal(r.suspect, true, status);
    assert.equal(r.reason, 'not_found', status);
    assert.equal(r.suggestion, null);
  }
});

// FAIL OPEN — a provider problem must never masquerade as a bad address.
test('a PROVIDER problem (no result, but not a clean not-found) is NEVER suspect — fails open', () => {
  for (const status of ['REQUEST_DENIED', 'OVER_QUERY_LIMIT', 'FETCH_FAILED', 'UNKNOWN_ERROR', null, undefined]) {
    const r = classifyAddressCheck(null, addr('123 Main St', '', '33401'), status);
    assert.equal(r.suspect, false, `status=${status} must fail open`);
  }
});

// ---- onRequestPost: the actual 409 / fail-open / confirm-bypass wiring ------------------------

const SQUARE_ENV = { SQUARE_ACCESS_TOKEN: 'sandbox-token', SQUARE_LOCATION_ID: 'loc_1' };
const GOOD_ORDER_BODY = () => {
  // 10 days out lands well past the next-day cutoff regardless of what time this test runs, and
  // on a Mon–Sat default delivery day (skip Sunday just in case the +10 lands there).
  const d = new Date(); d.setDate(d.getDate() + 10);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  const dateStr = d.toISOString().slice(0, 10);
  return {
    items: [{ id: 'vida', qty: 2 }],
    fulfillment: { mode: 'scheduled' },
    delivery: { date: dateStr, window: 'lunch' },
    contact: { first_name: 'Pat', email: 'pat@example.com' },
    address: { street: '10330 City Center Blvb', city: 'Pembroke Pines', zip: '33025' },
  };
};

function postCheckout(env, body) {
  return checkoutPost({
    request: new Request('https://anejocateringco.com/api/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }),
    env,
  });
}

// Routes fetch by host: Google Geocoding vs Square, so one mock serves the whole request.
function fetchRouter({ geo, square } = {}) {
  return async (url) => {
    const u = String(url);
    if (u.includes('maps.googleapis.com')) return geo ? geo(u) : new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] }));
    if (u.includes('squareup')) return square ? square(u) : new Response(JSON.stringify({ payment_link: { id: 'pl_1', order_id: 'sqo_1', url: 'https://square.example/pay/pl_1' } }));
    throw new Error('unexpected fetch: ' + u);
  };
}
const SQUARE_OK = () => new Response(JSON.stringify({ payment_link: { id: 'pl_1', order_id: 'sqo_1', url: 'https://square.example/pay/pl_1' } }));

test('checkout warns and asks (409 + needs_confirmation) on the real "Blvb" typo — Square is NEVER called', async () => {
  let squareCalled = false;
  await withFetch(
    fetchRouter({
      geo: () => new Response(JSON.stringify(googleResult({
        formatted: '10330 City Center Blvd, Pembroke Pines, FL 33025, USA',
        components: { streetNumber: '10330', route: 'City Center Blvd', city: 'Pembroke Pines', state: 'FL', zip: '33025' },
      }))),
      square: () => { squareCalled = true; return SQUARE_OK(); },
    }),
    async () => {
      const res = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k' }, GOOD_ORDER_BODY());
      assert.equal(res.status, 409);
      const j = await res.json();
      assert.equal(j.needs_confirmation, true);
      assert.equal(j.address_check.reason, 'corrected');
      assert.match(j.address_check.suggestion.formatted, /Blvd/);
      assert.equal(squareCalled, false, 'must not spend a Square payment-link creation before the customer confirms');
    }
  );
});

// End-to-end regression for the lead's review comment, through the REAL onRequestPost handler
// (not just classifyAddressCheck in isolation) — an apartment-heavy South Florida order must sail
// through checkout with no 409 at all, even though Google can't verify the unit.
test('REGRESSION: a real apartment order (unit Google cannot verify) never sees the 409 warning', async () => {
  await withFetch(
    fetchRouter({
      geo: () => new Response(JSON.stringify(googleResult({
        formatted: '4342 Clinton Blvd, Lake Worth, FL 33461, USA',   // unit dropped by Google
        partialMatch: true,
        components: { streetNumber: '4342', route: 'Clinton Blvd', city: 'Lake Worth', state: 'FL', zip: '33461' },
      }))),
      square: SQUARE_OK,
    }),
    async () => {
      const body = GOOD_ORDER_BODY();
      body.address = { street: '4342 Clinton Blvd', unit: 'Unit F8', city: 'Lake Worth', zip: '33461' };
      const res = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k' }, body);
      assert.equal(res.status, 200, 'must not warn over an unverifiable apartment unit');
      const j = await res.json();
      assert.equal(j.url, 'https://square.example/pay/pl_1');
    }
  );
});

test('address_confirmed:true bypasses the warning and completes checkout — never a hard block', async () => {
  await withFetch(
    fetchRouter({
      // Components included so this actually exercises the suspect+confirmed path (a street
      // correction), not just an absence of data to compare against.
      geo: () => new Response(JSON.stringify(googleResult({
        formatted: '10330 City Center Blvd, Pembroke Pines, FL 33025, USA',
        components: { streetNumber: '10330', route: 'City Center Blvd', city: 'Pembroke Pines', state: 'FL', zip: '33025' },
      }))),
      square: SQUARE_OK,
    }),
    async () => {
      const body = GOOD_ORDER_BODY();
      body.address_confirmed = true;
      const res = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k' }, body);
      assert.equal(res.status, 200);
      const j = await res.json();
      assert.equal(j.url, 'https://square.example/pay/pl_1');
    }
  );
});

test('FAIL OPEN: no GOOGLE_MAPS_API_KEY configured — checkout proceeds with no warning at all', async () => {
  await withFetch(
    fetchRouter({ square: SQUARE_OK }),   // geo() unset would throw if it were ever called
    async () => {
      const res = await postCheckout({ ...SQUARE_ENV }, GOOD_ORDER_BODY());   // no GOOGLE_MAPS_API_KEY
      assert.equal(res.status, 200);
      const j = await res.json();
      assert.equal(j.url, 'https://square.example/pay/pl_1');
    }
  );
});

test('FAIL OPEN: the geocoder itself is down (network error) — checkout proceeds, not a 409', async () => {
  await withFetch(
    fetchRouter({ geo: () => { throw new TypeError('fetch failed'); }, square: SQUARE_OK }),
    async () => {
      const res = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k' }, GOOD_ORDER_BODY());
      assert.equal(res.status, 200, 'an outage at Google must never cost the business an order');
    }
  );
});

test('FAIL OPEN: Google REQUEST_DENIED (bad key / billing / quota) — checkout proceeds, not a 409', async () => {
  await withFetch(
    fetchRouter({
      geo: () => new Response(JSON.stringify({ status: 'REQUEST_DENIED', error_message: 'billing not enabled' })),
      square: SQUARE_OK,
    }),
    async () => {
      const res = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k' }, GOOD_ORDER_BODY());
      assert.equal(res.status, 200, 'Google being down is not evidence the address is wrong');
    }
  );
});

test('a genuinely unresolvable address (ZERO_RESULTS) still warns and asks, and confirming still works', async () => {
  await withFetch(
    fetchRouter({ geo: () => new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] })), square: SQUARE_OK }),
    async () => {
      const first = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k' }, GOOD_ORDER_BODY());
      assert.equal(first.status, 409);
      const j1 = await first.json();
      assert.equal(j1.address_check.reason, 'not_found');
      assert.equal(j1.address_check.suggestion, null, 'nothing was found — there is nothing to suggest');

      const body = GOOD_ORDER_BODY(); body.address_confirmed = true;
      const second = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k' }, body);
      assert.equal(second.status, 200, 'WARN AND ASK, never a permanent block');
    }
  );
});

test('an exact, verified match never interrupts checkout (no needs_confirmation)', async () => {
  await withFetch(
    fetchRouter({
      // Components echo exactly what was typed (no street/zip diff) — a genuine clean match,
      // not just an absence of structured data to compare against.
      geo: () => new Response(JSON.stringify(googleResult({
        formatted: '10330 City Center Blvb, Pembroke Pines, FL 33025, USA',
        components: { streetNumber: '10330', route: 'City Center Blvb', city: 'Pembroke Pines', state: 'FL', zip: '33025' },
      }))),
      square: SQUARE_OK,
    }),
    async () => {
      const res = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k' }, GOOD_ORDER_BODY());
      assert.equal(res.status, 200);
    }
  );
});

// ---- what actually lands in the orders row (this is the "record it for the kitchen/driver" rule) --

// Pulls the column list straight out of the real INSERT statement and zips it with the bound args,
// so this stays correct if a later change adds/reorders columns rather than silently misreading them.
function insertedRow(db) {
  const sql = db.sqlLog().find((s) => /^INSERT INTO orders/.test(s));
  const args = db.calls.find((c) => c.kind === 'run' && /^INSERT INTO orders/.test(c.sql)).args;
  const cols = sql.match(/\(([\s\S]+?)\)\s*VALUES/)[1].split(',').map((s) => s.trim());
  return Object.fromEntries(cols.map((c, i) => [c, args[i]]));
}
function menuAndOpsD1(extraRoutes = []) {
  return makeD1([
    [/SELECT \* FROM menu_items/, () => []],
    [/SELECT key, cents FROM menu_modifier_prices/, () => []],
    [/SELECT key, value FROM app_settings/, () => []],
    ...extraRoutes,
  ]);
}

test('a confirmed-but-unresolved address is recorded as unverified_confirmed with NULL coordinates — never 0,0', async () => {
  const DB = menuAndOpsD1([[/^INSERT INTO orders/, () => 1]]);
  await withFetch(
    fetchRouter({ geo: () => new Response(JSON.stringify({ status: 'ZERO_RESULTS', results: [] })), square: SQUARE_OK }),
    async () => {
      const body = GOOD_ORDER_BODY(); body.address_confirmed = true;
      const res = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k', DB }, body);
      assert.equal(res.status, 200);
    }
  );
  const row = insertedRow(DB);
  assert.equal(row.address_verify_status, 'unverified_confirmed');
  assert.equal(row.address_verify_reason, 'not_found');
  assert.equal(row.delivery_lat, null, 'nothing resolved — must be NULL, never 0');
  assert.equal(row.delivery_lng, null, 'nothing resolved — must be NULL, never 0');
  assert.notEqual(row.delivery_lat, 0);
  assert.notEqual(row.delivery_lng, 0);
});

test('a clean, verified address is recorded as verified WITH its real coordinates', async () => {
  const DB = menuAndOpsD1([[/^INSERT INTO orders/, () => 1]]);
  await withFetch(
    fetchRouter({
      geo: () => new Response(JSON.stringify(googleResult({
        formatted: '10330 City Center Blvb, Pembroke Pines, FL 33025, USA',
        components: { streetNumber: '10330', route: 'City Center Blvb', city: 'Pembroke Pines', state: 'FL', zip: '33025' },
      }))),
      square: SQUARE_OK,
    }),
    async () => {
      const res = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k', DB }, GOOD_ORDER_BODY());
      assert.equal(res.status, 200);
    }
  );
  const row = insertedRow(DB);
  assert.equal(row.address_verify_status, 'verified');
  assert.equal(row.address_verify_reason, null);
  assert.equal(row.delivery_lat, 26.0059265);
  assert.equal(row.delivery_lng, -80.2850607);
});

test('a confirmed correction (customer accepted the suggested address, verified on resend) is recorded verified with real coordinates', async () => {
  const DB = menuAndOpsD1([[/^INSERT INTO orders/, () => 1]]);
  await withFetch(
    fetchRouter({
      geo: () => new Response(JSON.stringify(googleResult({
        formatted: '10330 City Center Blvd, Pembroke Pines, FL 33025, USA',
        components: { streetNumber: '10330', route: 'City Center Blvd', city: 'Pembroke Pines', state: 'FL', zip: '33025' },
      }))),
      square: SQUARE_OK,
    }),
    async () => {
      // The browser filled the fields from the suggestion (see acceptAddressSuggestion in
      // order.html), so what's typed now already matches what Google would say.
      const body = GOOD_ORDER_BODY();
      body.address = { street: '10330 City Center Blvd', city: 'Pembroke Pines', zip: '33025' };
      const res = await postCheckout({ ...SQUARE_ENV, GOOGLE_MAPS_API_KEY: 'k', DB }, body);
      assert.equal(res.status, 200);
    }
  );
  const row = insertedRow(DB);
  assert.equal(row.address_verify_status, 'verified');
  assert.equal(row.delivery_lat, 26.0059265);
});

// ---- source + migration drift guards (never store 0,0 / kitchen-driver signal is wired) -------

test('checkout.js never has a fabricated 0,0 fallback for delivery coordinates', () => {
  assert.ok(!/delivery_lat.*0.*delivery_lng.*0/.test(CHECKOUT_SRC.replace(/\s/g, '')));
  assert.match(CHECKOUT_SRC, /const lat = verifiedGeo \? verifiedGeo\.lat : null;/);
  assert.match(CHECKOUT_SRC, /const lng = verifiedGeo \? verifiedGeo\.lng : null;/);
});

test('the outcome is recorded on the order for the kitchen/driver side (address_verify_status column)', () => {
  assert.match(CHECKOUT_SRC, /address_verify_status/);
  assert.match(CHECKOUT_SRC, /address_verify_reason/);
  assert.match(MIGRATIONS, /ALTER TABLE orders ADD COLUMN address_verify_status/);
  assert.match(MIGRATIONS, /ALTER TABLE orders ADD COLUMN address_verify_reason/);
});

test('/order sends address_confirmed and handles the 409 needs_confirmation response', () => {
  assert.match(ORDER_HTML, /payload\.address_confirmed\s*=\s*true/);
  assert.match(ORDER_HTML, /needs_confirmation/);
  assert.match(ORDER_HTML, /showAddressCheck/);
});
