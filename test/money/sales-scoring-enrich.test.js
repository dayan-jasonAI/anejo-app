// Sales OS — deterministic scoring with reasons, website extraction, the SSRF guard, robots.txt,
// and the discovery provider interface. All pure or network-stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreOrganization, classifyCategory, haversineMiles } from '../../functions/_lib/sales/scoring.js';
// (sales-fixture and store are imported inside the one end-to-end test that needs a database)
import { DEFAULT_ICP, DEFAULT_SERVICE_AREA, ICP_CATEGORIES } from '../../functions/_lib/sales/anejo.js';
import {
  checkUrlSafe, robotsRules, extractEmails, extractPeople, extractSignals, crawlOrganization, visibleText, pickResearchPages, extractLinks,
} from '../../functions/_lib/sales/enrich.js';
import { discoverOrganizations, normalizePlace, parseCsv, csvRowToRecord, providerStatus } from '../../functions/_lib/sales/discovery.js';
import { dedupeKey, domainOf, normalizeOrgName } from '../../functions/_lib/sales/normalize.js';

const SITE = 'https://sunriserecovery.org/';
const STRONG = {
  organization: { name: 'Sunrise Recovery Center', business_category: 'addiction_treatment', city: 'Delray Beach', county: 'Palm Beach', status: 'discovered' },
  signals: [
    { kind: 'day_program', snippet: 'Our partial hospitalization program runs Monday through Friday.', url: SITE + 'programs' },
    { kind: 'weekday_schedule', snippet: 'Monday through Friday', url: SITE + 'programs' },
    { kind: 'meals_provided', snippet: 'Lunch is provided daily.', url: SITE + 'programs' },
    { kind: 'capacity', value: 60, snippet: 'Up to 60 clients a day.', url: SITE + 'about' },
  ],
  contacts: [{ full_name: 'Maria Ruiz', role_category: 'executive_director', email: 'mruiz@sunriserecovery.org', email_status: 'public_site', suppressed: 0 }],
  sibling_count: 1,
  distance_miles: 6,
};

test('a well-evidenced prospect scores A — and every criterion carries a reason the owner can read', () => {
  const r = scoreOrganization(STRONG, DEFAULT_ICP, DEFAULT_SERVICE_AREA);
  assert.equal(r.tier, 'A');
  assert.ok(r.score >= 80 && r.score <= 100);
  assert.equal(r.criteria.length, 7);
  for (const c of r.criteria) {
    assert.ok(c.reasons.length > 0 && c.reasons.every((x) => typeof x === 'string' && x.length > 5), `${c.key} explains itself`);
    assert.ok(c.points <= c.max);
  }
  assert.ok(r.criteria.find((c) => c.key === 'recurring_meal').evidence.some((e) => e.url === SITE + 'programs'), 'evidence links back to the page');
});

test('unknown capacity earns zero volume points and SAYS it is unknown', () => {
  const r = scoreOrganization({ ...STRONG, signals: STRONG.signals.filter((s) => s.kind !== 'capacity') }, DEFAULT_ICP, DEFAULT_SERVICE_AREA);
  const v = r.criteria.find((c) => c.key === 'volume');
  assert.equal(v.points, 0);
  assert.match(v.reasons[0], /no public capacity/i);
});

test('unknown coordinates earn NO distance points — a missing distance is not "0.0 mi" (Number(null) === 0)', () => {
  for (const missing of [null, undefined, '']) {
    const r = scoreOrganization({ ...STRONG, distance_miles: missing }, DEFAULT_ICP, DEFAULT_SERVICE_AREA);
    const route = r.criteria.find((c) => c.key === 'route_fit');
    assert.equal(route.fraction, 0.7, `in-area only, no distance bonus for ${JSON.stringify(missing)}`);
    assert.doesNotMatch(route.reasons.join(' '), /0\.0 mi/);
    assert.match(route.reasons.join(' '), /Distance not measured/);
  }
  assert.equal(haversineMiles({ lat: null, lng: null }, { lat: 26.4, lng: -80.1 }), null);
  assert.equal(haversineMiles({ lat: 26.4, lng: -80.1 }, { lat: '', lng: -80.1 }), null);
});

test('an organization stored without coordinates is scored as unlocated, end to end', async () => {
  const { readyEnv, OWNER } = await import('../helpers/sales-fixture.js');
  const { upsertOrganization, scoreAndStore } = await import('../../functions/_lib/sales/store.js');
  const { env, cfg } = await readyEnv();
  const u = await upsertOrganization(env, { name: 'Unlocated Adult Day', city: 'Boynton Beach', county: 'Palm Beach', source: 'manual' }, { ctx: OWNER });
  const s = await scoreAndStore(env, u.organization_id, { cfg, ctx: OWNER });
  const route = s.criteria.find((c) => c.key === 'route_fit');
  assert.equal(route.points, 10.5, '0.7 × 15 for being in the area, and nothing for a distance never measured');
});

test('out of the service area is a hard disqualifier (tier D) with the reason recorded', () => {
  const r = scoreOrganization({ ...STRONG, organization: { ...STRONG.organization, city: 'Orlando', county: 'Orange' }, distance_miles: null }, DEFAULT_ICP, DEFAULT_SERVICE_AREA);
  assert.equal(r.tier, 'D');
  assert.match(r.disqualified_by.join(' '), /outside/i);
});

test('a permanently closed place and a do-not-contact organization are tier D', () => {
  assert.equal(scoreOrganization({ ...STRONG, organization: { ...STRONG.organization, provider_status: 'CLOSED_PERMANENTLY' } }, DEFAULT_ICP, DEFAULT_SERVICE_AREA).tier, 'D');
  assert.equal(scoreOrganization({ ...STRONG, organization: { ...STRONG.organization, do_not_contact: 1 } }, DEFAULT_ICP, DEFAULT_SERVICE_AREA).tier, 'D');
});

test('owner reweighting keeps the score on 0–100', () => {
  const heavy = { ...DEFAULT_ICP, weights: Object.fromEntries(Object.keys(DEFAULT_ICP.weights).map((k) => [k, 50])) };
  const r = scoreOrganization(STRONG, heavy, DEFAULT_SERVICE_AREA);
  assert.ok(r.score <= 100 && r.score >= 0);
});

test('categories classify most-specific first', () => {
  const c = (name, text) => classifyCategory({ name, text }, ICP_CATEGORIES).key;
  assert.equal(c('Coral Adult Day Center'), 'adult_day');
  assert.equal(c('Palm Beach Recovery Center'), 'addiction_treatment');
  assert.equal(c('Serenity Rehab'), 'rehabilitation');
  assert.equal(c('Oceanside Behavioral Health'), 'behavioral_health');
  assert.equal(c('Golf Pediatrics'), 'medical_office', 'a plural still matches its singular keyword');
  assert.equal(c('Jupiter Recovery Centers'), 'addiction_treatment');
  assert.equal(c('Prerehabilitation Labs'), null, 'a keyword inside another word does not match');
  assert.equal(c('Acme Widgets'), null);
});

test('haversine distance is sane (Delray → Pompano ≈ 16 mi)', () => {
  const d = haversineMiles({ lat: 26.4615, lng: -80.0728 }, { lat: 26.2379, lng: -80.1248 });
  assert.ok(d > 14 && d < 18, String(d));
});

// ---------------------------------------------------------------- SSRF guard

test('the fetcher refuses IPs, private names, odd ports, credentials, non-http schemes and other domains', () => {
  const blocked = [
    ['http://127.0.0.1/', {}], ['http://localhost/', {}], ['https://10.0.0.1/x', {}], ['http://[::1]/', {}],
    ['https://clinic.org:8080/', {}], ['https://user:pw@clinic.org/', {}], ['ftp://clinic.org/', {}],
    ['file:///etc/passwd', {}], ['https://printer.local/', {}], ['https://metadata.internal/', {}],
    ['https://evil.com/steal', { allowHost: 'clinic.org' }], ['https://clinic.org.evil.com/', { allowHost: 'clinic.org' }],
  ];
  for (const [u, o] of blocked) assert.equal(checkUrlSafe(u, o).ok, false, u);
  assert.equal(checkUrlSafe('https://www.clinic.org/about', { allowHost: 'clinic.org' }).ok, true);
  assert.equal(checkUrlSafe('https://intake.clinic.org/', { allowHost: 'clinic.org' }).ok, true);
});

test('robots.txt is honoured with longest-match rules', () => {
  const allowed = robotsRules('User-agent: *\nDisallow: /team\nAllow: /team/public\n\nUser-agent: OtherBot\nDisallow: /');
  assert.equal(allowed('/team'), false);
  assert.equal(allowed('/team/staff'), false);
  assert.equal(allowed('/team/public'), true);
  assert.equal(allowed('/about'), true);
  const ours = robotsRules('User-agent: AnejoSalesResearch\nDisallow: /\n\nUser-agent: *\nAllow: /');
  assert.equal(ours('/about'), false, 'a group for our agent wins over *');
});

// ---------------------------------------------------------------- extraction

test('only the organization’s own (or published free-mail) addresses are kept — never the web designer’s', () => {
  const html = '<a href="mailto:info@clinic.org">Email</a><a href="mailto:hello@webagency.com">Site by WebAgency</a> logo@2x.png noreply@clinic.org';
  const text = 'Contact Jane at jane.doe@clinic.org or clinicfrontdesk@gmail.com';
  const got = extractEmails(html, text, { orgDomain: 'clinic.org' }).map((e) => e.email).sort();
  assert.deepEqual(got, ['clinicfrontdesk@gmail.com', 'info@clinic.org', 'jane.doe@clinic.org']);
});

test('people are recorded only when named WITH a leadership title', () => {
  const text = 'Our Team\nMaria Ruiz\nExecutive Director\nJohn Smith, LCSW - Clinical Director\nPalm Beach County\nOffice Manager: Ana Perez\nCall Today';
  const p = extractPeople(text, { pageUrl: 'https://clinic.org/our-team' });
  const names = p.map((x) => x.full_name);
  assert.deepEqual(names.sort(), ['Ana Perez', 'John Smith', 'Maria Ruiz']);
  assert.equal(p.find((x) => x.full_name === 'Maria Ruiz').role_category, 'executive_director');
  assert.equal(p.find((x) => x.full_name === 'John Smith').role_category, 'program_director');
  assert.equal(p.find((x) => x.full_name === 'Ana Perez').role_category, 'office_manager');
  assert.ok(p.every((x) => x.confidence === 'medium'), 'a team page is medium confidence, never "verified"');
});

test('signals carry their sentence; a year is not a capacity', () => {
  const s = extractSignals('Since 2009 clients have trusted us.\nWe have 48 beds.\nLunch is provided daily.\nWe operate five days a week.', 'u');
  const caps = s.filter((x) => x.kind === 'capacity');
  assert.deepEqual(caps.map((c) => c.value), [48]);
  assert.ok(s.some((x) => x.kind === 'meals_provided' && /Lunch is provided/.test(x.snippet)));
  assert.ok(s.some((x) => x.kind === 'weekday_schedule'));
});

test('visible text drops scripts/styles and keeps line structure', () => {
  const t = visibleText('<head><title>x</title></head><script>var a=1</script><p>Maria Ruiz</p><p>Executive&nbsp;Director</p>');
  assert.equal(t, 'Maria Ruiz\nExecutive Director');
});

test('research pages are same-host and prioritise team/leadership pages', () => {
  const links = extractLinks('<a href="/contact">Contact</a><a href="/our-team">Team</a><a href="https://other.org/about">x</a><a href="/blog/post">Blog</a><a href="/brochure.pdf">About PDF</a>', 'https://clinic.org/');
  assert.deepEqual(pickResearchPages(links, 'clinic.org'), ['https://clinic.org/our-team', 'https://clinic.org/contact']);
});

test('a crawl stays on the organization’s domain, honours robots.txt, and refuses an off-domain redirect', async () => {
  const requested = [];
  const pages = {
    'https://clinic.org/robots.txt': [200, 'text/plain', 'User-agent: *\nDisallow: /team'],
    'https://clinic.org/': [200, 'text/html', '<a href="/about">About us</a><a href="/team">Our team</a><a href="/contact">Contact</a><a href="https://evil.com/about">x</a><p>We have 30 beds. Lunch is provided daily.</p>'],
    'https://clinic.org/about': [301, 'text/html', '', 'https://evil.com/about'],
    'https://clinic.org/contact': [200, 'text/html', '<a href="mailto:info@clinic.org">info@clinic.org</a>'],
  };
  const fetchImpl = async (url) => {
    requested.push(url);
    const p = pages[url];
    if (!p) return new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } });
    const headers = { 'content-type': p[1] };
    if (p[3]) headers.location = p[3];
    return new Response(p[2], { status: p[0], headers });
  };
  const r = await crawlOrganization({ website: 'https://clinic.org/', domain: 'clinic.org' }, { fetchImpl });
  assert.equal(r.ok, true);
  assert.ok(!requested.some((u) => u.includes('evil.com')), 'never fetched another domain');
  assert.ok(!requested.includes('https://clinic.org/team'), 'robots.txt disallowed /team');
  assert.ok(r.skipped.some((s) => /robots/.test(s.reason)));
  assert.ok(r.skipped.some((s) => /off-domain/.test(s.reason)));
  assert.ok(r.pages.some((p) => p.emails.some((e) => e.email === 'info@clinic.org')));
  assert.ok(r.pages[0].signals.some((s) => s.kind === 'capacity' && s.value === 30));
});

// ---------------------------------------------------------------- discovery

test('with no provider configured, discovery FAILS CLEARLY — it never returns sample prospects', async () => {
  const r = await discoverOrganizations({}, { query: 'behavioral health center', area: 'Palm Beach County, FL' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'not_configured');
  assert.equal(r.results, undefined);
  assert.equal(providerStatus({}).find((p) => p.key === 'google_places').configured, false);
});

test('a Places result normalises into the shared record shape, keyed by place_id', async () => {
  const place = {
    id: 'ChIJabc', displayName: { text: 'Harbor Behavioral Health' }, websiteUri: 'https://harborbh.org/', nationalPhoneNumber: '(954) 555-0100',
    businessStatus: 'OPERATIONAL', types: ['health', 'point_of_interest'], location: { latitude: 26.1, longitude: -80.1 },
    addressComponents: [
      { longText: '12', shortText: '12', types: ['street_number'] }, { longText: 'Harbor Drive', shortText: 'Harbor Dr', types: ['route'] },
      { longText: 'Fort Lauderdale', shortText: 'Fort Lauderdale', types: ['locality'] },
      { longText: 'Broward County', shortText: 'Broward County', types: ['administrative_area_level_2'] },
      { longText: 'Florida', shortText: 'FL', types: ['administrative_area_level_1'] }, { longText: '33301', shortText: '33301', types: ['postal_code'] },
    ],
  };
  const n = normalizePlace(place);
  assert.equal(n.name, 'Harbor Behavioral Health');
  assert.equal(n.street, '12 Harbor Drive');
  assert.equal(n.county, 'Broward');
  assert.equal(n.state, 'FL');
  assert.equal(n.source_external_id, 'ChIJabc');
  let body = null;
  const r = await discoverOrganizations({ GOOGLE_PLACES_API_KEY: 'k' }, {
    query: 'behavioral health center', area: 'Broward County, FL',
    fetchImpl: async (url, init) => { body = JSON.parse(init.body); assert.equal(init.headers['X-Goog-Api-Key'], 'k'); return new Response(JSON.stringify({ places: [place], nextPageToken: 'n2' }), { status: 200 }); },
  });
  assert.equal(r.ok, true);
  assert.equal(r.results.length, 1);
  assert.equal(r.next_cursor, 'n2');
  assert.equal(body.textQuery, 'behavioral health center in Broward County, FL');
});

test('a provider error is reported, not swallowed into an empty success', async () => {
  const r = await discoverOrganizations({ GOOGLE_PLACES_API_KEY: 'k' }, {
    query: 'x', fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'Places API (New) has not been used in project' } }), { status: 403 }),
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /Places API \(New\)/);
});

test('CSV parsing handles quotes, commas and escaped quotes, and maps common headers', () => {
  const { rows } = parseCsv('Facility Name,Website,City,Contact Email\n"Harbor Day Program, Inc.",harbor.org,"Boynton Beach","leo@harbor.org"\n"Says ""Hi""",x.org,Jupiter,\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].facility_name, 'Harbor Day Program, Inc.');
  assert.equal(rows[1].facility_name, 'Says "Hi"');
  const rec = csvRowToRecord(rows[0]);
  assert.equal(rec.org.name, 'Harbor Day Program, Inc.');
  assert.equal(rec.contact.email, 'leo@harbor.org');
});

test('dedupe keys: an external id wins; own domain + street next; social hosts are never a domain', () => {
  assert.equal(domainOf('https://www.facebook.com/sunrise'), null);
  assert.equal(domainOf('WWW.SunriseRecovery.org/about'), 'sunriserecovery.org');
  assert.equal(normalizeOrgName('The Recovery Center of Delray, LLC'), 'recovery center delray');
  assert.equal(dedupeKey({ source: 'google_places', source_external_id: 'P1', name: 'x' }), 'x:google_places:P1');
  assert.equal(dedupeKey({ domain: 'a.org', street: '500 Clematis Street, Suite 2', zip: '33401' }), dedupeKey({ domain: 'a.org', street: '500 Clematis St', zip: '33401-1234' }));
});
