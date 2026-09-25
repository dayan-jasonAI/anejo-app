// Public-registry discovery: Florida AHCA FloridaHealthFinder and SAMHSA FindTreatment.gov.
// The fixtures below are cut down from LIVE responses captured 2026-09-18, not invented shapes —
// the SAMHSA importer once shipped reading `name` from a file whose column is `name1`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyEnv, setting, reload } from '../helpers/sales-fixture.js';
import {
  tidyName, tidyCity, parseAhcaResults, normalizeAhca, normalizeSamhsa, ahcaHealthfinder, samhsaFindTreatment,
} from '../../functions/_lib/sales/registries.js';
import { runDiscoveryTick } from '../../functions/_lib/sales/jobs.js';

const AHCA_ROWS = [
  { Address: '1515 W PALMETTO PARK RD', Address2: '', BedCount: '102', City: 'BOCA RATON', FacilityType: 'Adult Day Care Center', FileNumber: '12911550', IsClosed: 'False', Latitude: '26.3509', LicenseID: '9001', LicenseNumber: '9006', LicenseStatus: 'LICENSED', Longitude: '-80.1103', Name: 'THE VOLEN CENTER', PhoneNumber: '(561) 395-8920', State: 'FL', Zip: '33486-3307' },
  { Address: '1141 ROYAL PALM BEACH BLVD', Address2: '', BedCount: '60', City: 'ROYAL PLM BCH', FacilityType: 'Adult Day Care Center', FileNumber: '12962665', IsClosed: 'False', Latitude: '26.7050', LicenseID: '9002', LicenseNumber: '9102', LicenseStatus: 'LICENSED', Longitude: '-80.2250', Name: 'ROYAL PALM ADULT DAY CARE CENTER, INC', PhoneNumber: '(561) 484-7707', State: 'FL', Zip: '33411-1669' },
  { Address: '1 GONE WAY', BedCount: '40', City: 'DELRAY BEACH', IsClosed: 'True', LicenseID: '9003', LicenseStatus: 'LICENSED', Name: 'CLOSED ADULT DAY LLC', Zip: '33444' },
  { Address: '2 LAPSED RD', BedCount: '40', City: 'DELRAY BEACH', IsClosed: 'False', LicenseID: '9004', LicenseStatus: 'INACTIVE', Name: 'LAPSED ADULT DAY LLC', Zip: '33444' },
];
const ahcaPage = (rows) => `<html><body><table id="locateTable"></table><script>
        $(document).ready(function () {
            const data = [${JSON.stringify(rows)}];
            console.log(data);
</script></body></html>`;
const SEARCH_PAGE = '<form><input name="__RequestVerificationToken" type="hidden" value="tok-123" /></form>';

const svc = (setting, care) => [{ f1: 'Type of Care', f2: 'TC', f3: care }, { f1: 'Service Setting', f2: 'SET', f3: setting }];
const SAMHSA = {
  page: 1, totalPages: 2, recordCount: 4,
  rows: [
    { name1: 'Banyan Boca', name2: '', street1: '1000 NW 15th Street', street2: '', city: 'Boca Raton', state: 'FL', zip: '33486', phone: '800-547-4615', intake1: '855-722-6926', website: 'https://www.banyantreatmentcenter.com', latitude: '26.3629227', longitude: '-80.1061519', miles: 1.5, typeFacility: 'SA', services: svc('Residential/24-hour residential', 'Substance use treatment; Detoxification') },
    { name1: 'Thrive Mental Health LLC', name2: '', street1: '2 Main', city: 'Boca Raton', state: 'FL', zip: '33431', latitude: '26.37', longitude: '-80.11', miles: 1.4, typeFacility: 'MH', services: svc('Outpatient; Partial hospitalization/day treatment', 'Mental health treatment') },
    { name1: 'Therapist Suite', name2: '', street1: '3 Main', city: 'Boca Raton', state: 'FL', zip: '33431', latitude: '26.38', longitude: '-80.12', miles: 2.0, typeFacility: 'MH', services: svc('Outpatient', 'Mental health treatment') },
    { name1: 'Banyan Boca', name2: '', street1: '1000 NW 15th Street', city: 'Boca Raton', state: 'FL', zip: '33486', latitude: '26.3629227', longitude: '-80.1061519', miles: 1.5, typeFacility: 'SA', services: svc('Residential/24-hour residential', 'Substance use treatment') },
  ],
};

function registryFetch({ ahcaRows = AHCA_ROWS, samhsa = SAMHSA } = {}) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith('/Facility-Search/FacilityLocateSearch')) {
      return new Response(SEARCH_PAGE, { status: 200, headers: { 'set-cookie': 'sess=abc; path=/' } });
    }
    if (u.includes('handler=AdvancedSearch')) {
      return new Response('', { status: 302, headers: { location: '/Facility-Provider/Adult-DayCare?&type=1', 'set-cookie': 'res=1; path=/' } });
    }
    if (u.includes('/Facility-Provider/')) return new Response(ahcaPage(ahcaRows), { status: 200 });
    if (u.includes('findtreatment.gov')) return new Response(JSON.stringify(samhsa), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response('not found', { status: 404 });
  };
  return { fn, calls };
}

test('registry capitals become names a person would write, legal suffixes kept', () => {
  assert.equal(tidyName('THE VOLEN CENTER'), 'The Volen Center');
  assert.equal(tidyName('ROYAL PALM ADULT DAY CARE CENTER, INC'), 'Royal Palm Adult Day Care Center, INC');
  assert.equal(tidyName("ALZHEIMER'S COMMUNITY CARE, INC"), "Alzheimer's Community Care, INC");
  assert.equal(tidyName('MEMORY & WELLNESS CENTER AT FLORIDA ATLANTIC UNIVERSITY'), 'Memory & Wellness Center at Florida Atlantic University');
  assert.equal(tidyName('Already Mixed Case'), 'Already Mixed Case', 'a typed name is left alone');
});

test('abbreviated registry cities are expanded so the service-area check recognises them', () => {
  assert.equal(tidyCity('WEST PALM BCH'), 'West Palm Beach');
  assert.equal(tidyCity('ROYAL PLM BCH'), 'Royal Palm Beach');
  assert.equal(tidyCity('N PALM BEACH'), 'North Palm Beach');
  assert.equal(tidyCity('GREEN ACRES'), 'Greenacres');
});

test('AHCA: embedded rows are parsed; closed and inactive licenses are dropped; capacity and license kept', () => {
  const rows = parseAhcaResults(ahcaPage(AHCA_ROWS));
  assert.equal(rows.length, 4);
  const recs = rows.map((r) => normalizeAhca(r, 'Adult-DayCare')).filter(Boolean);
  assert.deepEqual(recs.map((r) => r.name), ['The Volen Center', 'Royal Palm Adult Day Care Center, INC']);
  const v = recs[0];
  assert.equal(v.business_category, 'adult_day');
  assert.equal(v.zip, '33486');
  assert.equal(v.employee_or_capacity_hint, '102 licensed capacity (AHCA)');
  assert.equal(v.source, 'ahca_healthfinder');
  assert.equal(v.source_external_id, 'ahca:9001');
  assert.equal(v.captured.license_status, 'LICENSED');
  assert.equal(v.captured.licensed_beds, 102);
  assert.equal(recs[1].city, 'Royal Palm Beach');
  assert.equal(parseAhcaResults('<html>no data here</html>'), null, 'a changed page is detected, not read as zero facilities');
});

test('AHCA: the provider does token → POST → redirect with cookies, and reports a changed page as an error', async () => {
  const { fn, calls } = registryFetch();
  const r = await ahcaHealthfinder({}, { facility_type: 'Adult-DayCare', county: 'palm beach', fetchImpl: fn });
  assert.equal(r.ok, true);
  assert.equal(r.results.length, 2);
  assert.equal(r.results[0].county, 'Palm Beach');
  const post = calls.find((c) => c.url.includes('AdvancedSearch'));
  assert.match(post.init.body, /FacilityTypeSelection=Adult-DayCare/);
  assert.match(post.init.body, /countySelection=50/);
  assert.match(post.init.body, /__RequestVerificationToken=tok-123/);
  assert.match(post.init.headers.Cookie, /sess=abc/);
  const results = calls.find((c) => c.url.includes('/Facility-Provider/'));
  assert.match(results.init.headers.Cookie, /sess=abc/);
  assert.match(results.init.headers.Cookie, /res=1/);

  const broken = async (u) => (String(u).includes('AdvancedSearch')
    ? new Response('', { status: 302, headers: { location: '/x' } })
    : new Response(String(u).endsWith('LocateSearch') ? SEARCH_PAGE : '<html>redesigned</html>', { status: 200 }));
  const b = await ahcaHealthfinder({}, { facility_type: 'Adult-DayCare', county: 'palm beach', fetchImpl: broken });
  assert.equal(b.ok, false);
  assert.equal(b.code, 'provider_changed');
  const bad = await ahcaHealthfinder({}, { facility_type: 'Hospital', county: 'palm beach', fetchImpl: fn });
  assert.equal(bad.ok, false, 'types that run their own kitchens are not in the plan');
});

test('SAMHSA: only programs that feed people on site are kept; the point is sent as coordinates', async () => {
  const { fn, calls } = registryFetch();
  const r = await samhsaFindTreatment({}, { lat: 26.3683, lng: -80.1289, radius_miles: 10, fetchImpl: fn });
  assert.equal(r.ok, true);
  assert.match(calls[0].url, /sAddr=26\.3683,-80\.1289/);
  assert.match(calls[0].url, /limitValue=16093/);
  assert.deepEqual(r.results.map((x) => x.name), ['Banyan Boca', 'Thrive Mental Health LLC', 'Banyan Boca'], 'outpatient-only suite dropped');
  assert.equal(r.results[0].business_category, 'addiction_treatment');
  assert.equal(r.results[0].captured.residential, true);
  assert.equal(r.results[1].business_category, 'behavioral_health');
  assert.equal(r.next_cursor, '2');
  assert.equal(normalizeSamhsa({ name1: 'X', services: svc('Outpatient', 'Mental health') }), null);
});

test('SAMHSA: a page of only far-away facilities is refused rather than imported as nearby', async () => {
  const far = { ...SAMHSA, rows: SAMHSA.rows.map((x) => ({ ...x, miles: 900, state: 'MD' })) };
  const { fn } = registryFetch({ samhsa: far });
  const r = await samhsaFindTreatment({}, { lat: 26.36, lng: -80.12, radius_miles: 10, fetchImpl: fn });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'provider_changed');
});

test('a discovery pass imports registry facilities, scores them, and a second pass duplicates nothing', async () => {
  const { env } = await readyEnv();
  setting(env, 'sales.discovery_enabled', 'true');
  setting(env, 'sales.max_discovery_calls_per_day', '30');
  const cfg = await reload(env);
  const { fn } = registryFetch();
  const first = await runDiscoveryTick(env, { cfg, fetchImpl: fn, maxCalls: 3 });
  assert.equal(first.errors.length, 0, JSON.stringify(first.errors));
  assert.ok(first.created >= 4, `created ${first.created}`);
  const orgs = env.DB.rows("SELECT name, source, business_category, category_locked, employee_or_capacity_hint, current_score FROM sales_organizations ORDER BY name");
  const volen = orgs.find((o) => o.name === 'The Volen Center');
  assert.equal(volen.source, 'ahca_healthfinder');
  assert.equal(volen.category_locked, 1);
  assert.ok(volen.current_score > 0, 'scored on import');
  assert.equal(orgs.filter((o) => o.name === 'Banyan Boca').length, 1, 'the same program listed twice is one organization');
  const ev = env.DB.rows("SELECT source_type FROM sales_prospect_sources WHERE source_type = 'public_registry'");
  assert.ok(ev.length >= 1, 'the registry record is kept as evidence');

  const before = orgs.length;
  // Walk the whole plan again from the start: nothing new.
  setting(env, 'sales.discovery_cursor', JSON.stringify({ pi: 0, token: null }));
  const again = await runDiscoveryTick(env, { cfg: await reload(env), fetchImpl: fn, maxCalls: 3 });
  assert.equal(again.created, 0);
  assert.equal(env.DB.rows('SELECT id FROM sales_organizations').length, before);
});

test('the daily new-prospect cap is respected across registry steps', async () => {
  const { env } = await readyEnv();
  setting(env, 'sales.discovery_enabled', 'true');
  setting(env, 'sales.max_new_prospects_per_day', '1');
  const cfg = await reload(env);
  const { fn } = registryFetch();
  const r = await runDiscoveryTick(env, { cfg, fetchImpl: fn, maxCalls: 5 });
  assert.equal(r.created, 1);
  assert.equal(env.DB.rows('SELECT id FROM sales_organizations').length, 1);
});

test('a license is evidence: a registry adult day care scores the meal and program points by rule', async () => {
  const { env } = await readyEnv();
  setting(env, 'sales.discovery_enabled', 'true');
  const cfg = await reload(env);
  const { fn } = registryFetch();
  await runDiscoveryTick(env, { cfg, fetchImpl: fn, maxCalls: 1 });
  const org = env.DB.rows("SELECT id FROM sales_organizations WHERE name = 'The Volen Center'")[0];
  const sc = env.DB.rows('SELECT criteria_json FROM sales_scores WHERE organization_id = ? ORDER BY created_at DESC LIMIT 1', org.id)[0];
  const crit = Object.fromEntries(JSON.parse(sc.criteria_json).map((c) => [c.key, c]));
  assert.equal(crit.recurring_meal.points, crit.recurring_meal.max, 'program + meals established by the license');
  assert.match(crit.recurring_meal.reasons.join(' '), /day or residential program/);
  assert.equal(crit.volume.points, crit.volume.max, '102 licensed capacity');
});

test('a prospect already on the list is rescored when the registry matches it', async () => {
  const { env } = await readyEnv();
  const { upsertOrganization, scoreAndStore } = await import('../../functions/_lib/sales/store.js');
  const cfg0 = await reload(env);
  const u = await upsertOrganization(env, { name: 'The Volen Center', street: '1515 W Palmetto Park Rd', city: 'Boca Raton', state: 'FL', zip: '33486', source: 'csv' }, {});
  await scoreAndStore(env, u.organization_id, { cfg: cfg0 });
  const before = env.DB.rows('SELECT current_score FROM sales_organizations WHERE id = ?', u.organization_id)[0].current_score;
  setting(env, 'sales.discovery_enabled', 'true');
  const { fn } = registryFetch();
  const r = await runDiscoveryTick(env, { cfg: await reload(env), fetchImpl: fn, maxCalls: 1 });
  assert.ok(r.merged >= 1);
  const after = env.DB.rows('SELECT current_score, employee_or_capacity_hint FROM sales_organizations WHERE id = ?', u.organization_id)[0];
  assert.ok(after.current_score > before, `${before} → ${after.current_score}`);
  assert.equal(after.employee_or_capacity_hint, '102 licensed capacity (AHCA)', 'the missing capacity was filled from the license');
});
