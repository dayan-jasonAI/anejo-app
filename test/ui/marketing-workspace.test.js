// The 2026-08-04 marketing consolidation: "Team + Social + Campaign + Train the Team all in
// different tabs... it should all be one smooth automation under one tab" (the owner's own
// words). team.html, team-training.html, social.html and campaigns.html were merged into
// /hub/owner/marketing.html as one workspace — Today / Teach / Create — and the four old
// filenames became thin compat redirects.
//
// What this file pins, because a UI restructure this size is exactly the kind of change that
// can quietly weaken something while looking like it still works:
//   1. The page is still owner-gated the same way every other HUB surface is.
//   2. Email and Instagram are structurally separate lanes — different mount points, different
//      modules, never a shared compose form or a shared send button.
//   3. Nothing lost its confirmation dialog in the move.
//   4. The four old URLs still go somewhere real, and the nav no longer lists them separately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');
const NAV = readFileSync(new URL('../../public/hub/owner/assets/owner.js', import.meta.url), 'utf8');
const INDEX = readFileSync(new URL('../../public/hub/owner/index.html', import.meta.url), 'utf8');

// ---------- shared HUB shell + gate ----------

test('is private (noindex) and owner-gated like every other HUB page', () => {
  assert.match(PAGE, /<meta\s+name="robots"\s+content="noindex">/);
  assert.match(PAGE, /<link rel="stylesheet" href="\/hub\/assets\/hub\.css">/);
  assert.match(PAGE, /<script src="\/hub\/assets\/hub\.js"><\/script>/);
  assert.match(PAGE, /<script src="\/hub\/owner\/assets\/owner\.js"><\/script>/);
  // ONE Owner.init call for the whole page — Hub.guard(['owner']) runs once, not once per tab.
  const initCalls = PAGE.match(/Owner\.init\(/g) || [];
  assert.equal(initCalls.length, 1, 'exactly one Owner.init call — the four merged modules must not each guard separately');
  assert.match(PAGE, /Owner\.init\('marketing', load\)/);
  assert.match(PAGE, /id="owner-nav"/, 'shares the bottom nav shell');
});

test('mobile viewport is declared — this runs the business from a phone', () => {
  assert.match(PAGE, /<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/);
});

test('a settings gear reaches the rarely-changed config one level down', () => {
  assert.match(PAGE, /href="\/hub\/owner\/marketing-settings\.html"/);
  assert.match(PAGE, /title="Marketing settings"/);
});

// ---------- the loop is legible: three tabs, not six pages ----------

test('the workspace has exactly three top-level tabs: Today, Teach, Create', () => {
  const tabs = [...PAGE.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ['today', 'teach', 'create']);
});

test('hash routing recognises all four legacy deep-link targets', () => {
  assert.match(PAGE, /h === 'teach'/);
  assert.match(PAGE, /h === 'create-email'/);
  assert.match(PAGE, /h === 'create' \|\| h === 'create-instagram'/);
});

test('each merged module is exposed and started lazily, not all at once on page load', () => {
  for (const key of ['teachTeam', 'teachTraining', 'createInstagram', 'createEmail']) {
    assert.match(PAGE, new RegExp('window\\.MarketingTabs\\.' + key + '\\s*='), `${key} module must be exposed`);
  }
  // loadToday() (the results cockpit) runs eagerly on boot; the other three only after their
  // tab/lane is opened at least once — verified by the loadedOnce guards existing.
  assert.match(PAGE, /var loadedOnce = \{ teach: false, ig: false, email: false \};/);
});

// ---------- channel safety: Instagram and Email cannot be confused ----------

test('Create has exactly two lanes, and neither is the default for the other', () => {
  const lanes = [...PAGE.matchAll(/data-lane="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(lanes, ['instagram', 'email']);
});

test('the channel-safety warning is stated in the copy itself, not left implicit', () => {
  assert.match(PAGE, /Different channels, different rules/);
  assert.match(PAGE, /never go out thinking it was the other/);
});

test('Instagram and Email are two separate DOM mounts with two separate modules', () => {
  assert.match(PAGE, /id="social-root"/);
  assert.match(PAGE, /id="campaigns-root"/);
  // Regression guard: an id collision here would mean the two lanes fight over one element and
  // one of them silently stops rendering.
  const socialRootCount = (PAGE.match(/id="social-root"/g) || []).length;
  const campaignsRootCount = (PAGE.match(/id="campaigns-root"/g) || []).length;
  assert.equal(socialRootCount, 1);
  assert.equal(campaignsRootCount, 1);
});

test('no id is duplicated across the merged page — the exact bug that would let one tab silently overwrite another', () => {
  const ids = [...PAGE.matchAll(/\bid="([a-zA-Z0-9_-]+)"/g)]
    .map((m) => m[1])
    .filter((id) => !/^(cap_|file_|mk_|wh_)/.test(id))   // per-post dynamic ids, expected to repeat across cards
    // "prog" repeats within the Email module's OWN compose/detail sub-views — pre-existing in the
    // old campaigns.html, and harmless because that module only ever renders one of those views
    // into #campaigns-root at a time, never both.
    .filter((id) => id !== 'prog');
  const seen = new Map();
  for (const id of ids) seen.set(id, (seen.get(id) || 0) + 1);
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  assert.deepEqual(dupes, [], `duplicate static ids: ${dupes.join(', ')}`);
});

test('Instagram publish and Email send stay on their own distinct confirm dialogs', () => {
  assert.match(PAGE, /Publish this to Instagram now\? It goes on the public profile\./);
  assert.match(PAGE, /Publish this Reel now\? It goes on your public profile\./);
  assert.match(PAGE, /Publish this to your Story now\? It is public for 24 hours, then gone\./);
  assert.match(PAGE, /var line = 'Send "' \+ draft\.name \+ '" — ' \+ p\.count/);
  assert.match(PAGE, /This cannot be undone\. Send now\?/);
});

// ---------- nothing got easier to publish/send than it was ----------

test('every destructive/irreversible action kept its window.confirm gate', () => {
  const confirmCount = (PAGE.match(/window\.confirm\(/g) || []).length;
  // Instagram: publish, schedule, delete = 3. Email: template overwrite, template delete = 2
  // (send confirm is templated into `line` then passed to confirm — counted separately below).
  // Training: remove rule, remove example = 2.
  assert.ok(confirmCount >= 7, `expected at least 7 window.confirm() call sites, found ${confirmCount}`);
});

test('the email send confirm still runs through window.confirm, not a weaker gate', () => {
  assert.match(PAGE, /if \(!window\.confirm\(line\)\) return;/);
});

test('turning on auto-publish autonomy still asks first', () => {
  assert.match(PAGE, /Let ' \+ \(CAT_WORD\[cat\] \|\| cat\) \+ ' posts schedule themselves once the audit clears them\?/);
});

// ---------- old destinations forward, and the nav no longer lists them separately ----------

test('the nav collapsed from four entries to one', () => {
  assert.match(NAV, /\{ view: 'marketing', href: '\/hub\/owner\/marketing\.html'/);
  for (const href of [
    '/hub/owner/team.html',
    '/hub/owner/team-training.html',
    '/hub/owner/social.html',
    '/hub/owner/campaigns.html',
  ]) {
    assert.doesNotMatch(NAV, new RegExp(`href: '${href.replace(/[./]/g, '\\$&')}'`));
  }
});

test('the owner overview tiles point at the new hash destinations, not the retired pages', () => {
  assert.match(INDEX, /href:\s*'\/hub\/owner\/marketing\.html#teach'/);
  assert.match(INDEX, /href:\s*'\/hub\/owner\/marketing\.html#create-email'/);
  assert.doesNotMatch(INDEX, /href:\s*'\/hub\/owner\/team-training\.html'/);
  assert.doesNotMatch(INDEX, /href:\s*'\/hub\/owner\/campaigns\.html'/);
});

for (const [file, target] of [
  ['team.html', '/hub/owner/marketing.html#teach'],
  ['team-training.html', '/hub/owner/marketing.html#teach'],
  ['social.html', '/hub/owner/marketing.html#create-instagram'],
  ['campaigns.html', '/hub/owner/marketing.html#create-email'],
]) {
  test(`${file} is a noindex compat redirect into marketing.html`, () => {
    const src = readFileSync(new URL('../../public/hub/owner/' + file, import.meta.url), 'utf8');
    assert.match(src, /<meta\s+name="robots"\s+content="noindex">/);
    assert.match(src, new RegExp(`location\\.replace\\('${target.replace(/[.#/]/g, '\\$&')}'\\)`));
    // Accessible/no-JS fallback: a real link, not only a script tag.
    assert.match(src, new RegExp(`href="${target.replace(/[.#/]/g, '\\$&')}"`));
  });
}
