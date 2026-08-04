// Public pages must be indexable; private ones must not be.
//
// Google Search Console flagged "Excluded by 'noindex' tag" and the cause was /business.html —
// the B2B office-catering page, linked from the homepage, and the route the first office account
// came in through. It carried noindex with no description and no canonical, so the one commercial
// page aimed at exactly the customer Añejo wants could never rank.
//
// The rest of the noindexed pages (HUB, client portal, login, token pages) are correct and must
// STAY noindexed — this test pins both directions so a future sweep can't flip the wrong ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../../public/' + p, import.meta.url), 'utf8');
const noindexed = (html) => /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);

// Marketing pages: a customer could plausibly arrive here from a search.
const PUBLIC = ['index.html', 'business.html', 'order.html', 'subscribe.html'];

// Private: internal tools, authenticated areas, token links, post-transaction pages.
const PRIVATE = [
  'login.html', 'lunch-count.html', 'preferences.html', 'feedback.html',
  'client/dashboard.html', 'trainer/dashboard.html',
  'hub/index.html', 'hub/owner/index.html', 'hub/owner/contracts.html',
  'hub/owner/knowledge.html', 'hub/owner/marketing-settings.html',
  'hub/kitchen/index.html', 'hub/driver/index.html',
];

for (const p of PUBLIC) {
  test(`/${p} is indexable`, () => {
    assert.ok(!noindexed(read(p)), `${p} is a public page and must not carry noindex`);
  });
}

for (const p of PRIVATE) {
  test(`/${p} stays out of the index`, () => {
    assert.ok(noindexed(read(p)), `${p} is private and MUST keep noindex`);
  });
}

test('the business page has the SEO a commercial page needs', () => {
  const h = read('business.html');
  assert.match(h, /<meta name="description" content="[^"]{80,}"/, 'a real description, not a stub');
  assert.match(h, /<link rel="canonical" href="https:\/\/anejocateringco\.com\/business">/);
  assert.match(h, /og:title/, 'shareable on social');
  assert.match(h, /Palm Beach County/i, 'names the market it is competing in');
});

test('the business page is in the sitemap', () => {
  const sm = readFileSync(new URL('../../public/sitemap.xml', import.meta.url), 'utf8');
  assert.ok(sm.includes('https://anejocateringco.com/business'), 'submitted for crawling');
});

test('no page is both in the sitemap and noindexed', () => {
  // This exact contradiction is what makes Search Console complain: a URL submitted for indexing
  // that then refuses to be indexed.
  const sm = readFileSync(new URL('../../public/sitemap.xml', import.meta.url), 'utf8');
  const locs = [...sm.matchAll(/<loc>https:\/\/anejocateringco\.com([^<]*)<\/loc>/g)].map((m) => m[1]);
  for (const loc of locs) {
    const clean = loc.replace(/^\//, '').replace(/\/$/, '');
    for (const cand of [clean + '.html', clean + '/index.html', (clean || 'index') + '.html']) {
      const url = new URL('../../public/' + cand, import.meta.url);
      if (existsSync(url)) {
        assert.ok(!noindexed(readFileSync(url, 'utf8')), `${loc} is in the sitemap but noindexed`);
        break;
      }
    }
  }
});

test('the stale duplicate client dashboard is gone', () => {
  // An older copy of the client dashboard was live and serving 200 while referenced by nothing.
  assert.ok(!existsSync(new URL('../../public/client/dashboard 2.html', import.meta.url)));
});
