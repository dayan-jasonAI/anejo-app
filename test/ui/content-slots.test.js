// Owner-editable copy in named slots.
//
// Deliberately NOT a page editor: pages carry SEO schema, hreflang pairing and a CLS budget, and a
// free-form editor lets someone break all three without knowing. Slots are the safe subset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLive, render, isSlot, normalizeTone, normalizePlacement, pickLive, stateOf } from '../../functions/_lib/content.js';

const NOW = 1785300000000;
const row = (o) => Object.assign({ slot: 'announcement', body_en: 'We deliver Saturdays now.', active: 1 }, o);

test('an inactive slot never renders', () => {
  assert.equal(isLive(row({ active: 0 }), NOW), false);
  assert.equal(render(row({ active: 0 }), 'en', NOW), null);
});

test('scheduling is an expiry — it switches itself off', () => {
  // A promo bar nobody remembers to remove is worse than no bar.
  assert.equal(isLive(row({ ends_at: NOW - 1 }), NOW), false, 'past its end');
  assert.equal(isLive(row({ ends_at: NOW + 1000 }), NOW), true, 'still inside');
});

test('a future start does not show early', () => {
  assert.equal(isLive(row({ starts_at: NOW + 5000 }), NOW), false);
  assert.equal(isLive(row({ starts_at: NOW - 5000 }), NOW), true);
});

test('no window set means simply on', () => {
  assert.equal(isLive(row(), NOW), true);
});

test('Spanish missing falls back to English AND flags it for translation', () => {
  // Never a lone English sentence on a Spanish page — that is the defect the language work fixed.
  const r = render(row({ body_es: '' }), 'es', NOW);
  assert.equal(r.body, 'We deliver Saturdays now.');
  assert.equal(r.needsTranslation, true, 'the page must hand this to the translator');
});

test('Spanish written by the owner is used verbatim, not translated', () => {
  const r = render(row({ body_es: 'Ahora entregamos los sábados.' }), 'es', NOW);
  assert.equal(r.body, 'Ahora entregamos los sábados.');
  assert.equal(r.needsTranslation, false);
});

test('an empty body renders nothing rather than a bar of colour', () => {
  assert.equal(render(row({ body_en: '' }), 'en', NOW), null);
});

test('tone falls back to info rather than emitting an unknown class', () => {
  assert.equal(normalizeTone('urgent'), 'urgent');
  assert.equal(normalizeTone('rainbow'), 'info');
  assert.equal(normalizeTone(undefined), 'info');
});

test('only known slots are writable', () => {
  assert.equal(isSlot('announcement'), true);
  assert.equal(isSlot('anything_else'), false, 'an open slot namespace is a CMS by accident');
});

test('the bar never renders inside the HUB', () => {
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /pathname\.indexOf\('\/hub'\) === 0\) return/, 'staff app is excluded');
});

test('owner copy is injected as text, never as HTML', () => {
  // Pins the RULE rather than one line of it: owner copy reaches the DOM only through text nodes.
  // (It used to assert `textContent = b.body` literally, which broke the moment the renderer
  // learned to split on newlines — a test pinned to an implementation, not to the invariant.)
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /createTextNode\(line\)/, 'body text goes in as text nodes');
  assert.ok(!/innerHTML/.test(js), 'no innerHTML anywhere in the announcement renderer');
});

test('a newline in the owner copy becomes a line break, not a lost space', () => {
  // The live announcement is two sentences separated by a newline; joined blind it reads as one
  // run-on line, which is how it looked on the phone screenshot.
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /split\('\\n'\)/);
  assert.match(js, /createElement\('br'\)/);
});

test('a failed fetch renders nothing instead of breaking the page', () => {
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /catch\(function \(\) \{ \/\* silent/, 'copy must never break a storefront');
});

test('publishing an empty slot is refused server-side', () => {
  const api = readFileSync(new URL('../../functions/api/hub/owner/site-copy.js', import.meta.url), 'utf8');
  assert.match(api, /if \(active && !en\) return bad/, 'no empty coloured band');
});

test('the save response reports whether it is VISIBLE, not merely saved', () => {
  const api = readFileSync(new URL('../../functions/api/hub/owner/site-copy.js', import.meta.url), 'utf8');
  assert.match(api, /this_one_live/, 'saved and showing are different once scheduling exists');
  assert.match(api, /await slotState\(env, slot, entryId\)/, 're-read after the write, not echo the request');
});

// ---------- the queue (migrations/0052) ----------
//
// One message per slot meant the owner had to be at a keyboard at the moment a message became
// true: "closed July 4th" written on the 3rd, taken down on the 5th, or wrong in one direction.
// Nobody writes announcements in advance because there is nowhere to put one. A slot now holds
// many, each with its own window, and the live one is whichever window contains now.

const q = (o) => Object.assign({ id: 'cb_x', slot: 'announcement', body_en: 'x', active: 1 }, o);

test('an empty queue shows nothing', () => {
  assert.equal(pickLive([], NOW), null);
  assert.equal(pickLive(null, NOW), null);
});

test('only the entry whose window contains NOW is picked', () => {
  const past = q({ id: 'a', ends_at: NOW - 1 });
  const future = q({ id: 'b', starts_at: NOW + 10000 });
  const current = q({ id: 'c', starts_at: NOW - 10000, ends_at: NOW + 10000 });
  assert.equal(pickLive([past, future, current], NOW).id, 'c');
});

test('a whole month can be written in advance and each takes its turn', () => {
  const day = 86400000;
  const week1 = q({ id: 'w1', starts_at: NOW, ends_at: NOW + 7 * day });
  const week2 = q({ id: 'w2', starts_at: NOW + 7 * day, ends_at: NOW + 14 * day });
  const week3 = q({ id: 'w3', starts_at: NOW + 14 * day, ends_at: NOW + 21 * day });
  const all = [week3, week1, week2];   // deliberately out of order
  assert.equal(pickLive(all, NOW + day).id, 'w1');
  assert.equal(pickLive(all, NOW + 8 * day).id, 'w2');
  assert.equal(pickLive(all, NOW + 15 * day).id, 'w3');
  assert.equal(pickLive(all, NOW + 30 * day), null, 'and then it goes quiet by itself');
});

test('a dated notice displaces an evergreen one, then gives it back', () => {
  // The whole reason to allow overlap: the standing line stays written, a holiday notice covers
  // it for two days, and nobody has to remember to retype the standing line afterwards.
  const evergreen = q({ id: 'ever', body_en: 'Order by 9am for same-day.' });
  const holiday = q({ id: 'hol', body_en: 'Closed July 4th.', starts_at: NOW, ends_at: NOW + 2000 });
  assert.equal(pickLive([evergreen, holiday], NOW).id, 'hol', 'the dated one wins while it runs');
  assert.equal(pickLive([evergreen, holiday], NOW + 3000).id, 'ever', 'the standing one returns');
});

test('two overlapping dated notices resolve deterministically, never flicker', () => {
  // Same window shape, so the tie falls to the later start, then the later edit. Whatever the rule
  // is, it must be STABLE — a bar alternating between page loads is worse than either message.
  const a = q({ id: 'a', starts_at: NOW - 5000, ends_at: NOW + 5000, updated_at: 1 });
  const b = q({ id: 'b', starts_at: NOW - 1000, ends_at: NOW + 5000, updated_at: 2 });
  assert.equal(pickLive([a, b], NOW).id, 'b');
  assert.equal(pickLive([b, a], NOW).id, 'b', 'input order must not change the answer');
});

test('a switched-off entry never wins, however specific its window', () => {
  const off = q({ id: 'off', active: 0, starts_at: NOW - 1, ends_at: NOW + 1 });
  const on = q({ id: 'on' });
  assert.equal(pickLive([off, on], NOW).id, 'on');
});

test('the four not-showing reasons are told apart', () => {
  // "Switched on but invisible" has three different causes and three different fixes.
  assert.equal(stateOf(q({ active: 0 }), NOW), 'off');
  assert.equal(stateOf(q({ ends_at: NOW - 1 }), NOW), 'ended');
  assert.equal(stateOf(q({ starts_at: NOW + 1 }), NOW), 'scheduled');
  assert.equal(stateOf(q({ id: 'me' }), NOW, 'someone_else'), 'waiting');
  assert.equal(stateOf(q({ id: 'me' }), NOW, 'me'), 'showing');
});

test('the page names all five states rather than just on/off', () => {
  const page = readFileSync(new URL('../../public/hub/owner/site-copy.html', import.meta.url), 'utf8');
  for (const s of ['showing', 'scheduled', 'waiting', 'ended', 'off']) {
    assert.ok(page.includes(s + ':'), `${s} must be labelled for the owner`);
  }
});

test('the page can add, edit and delete queued messages', () => {
  const page = readFileSync(new URL('../../public/hub/owner/site-copy.html', import.meta.url), 'utf8');
  assert.match(page, /data-add=/, 'write another message');
  assert.match(page, /data-edit=/, 'edit an existing one');
  assert.match(page, /op: 'delete'/, 'remove one');
  assert.match(page, /window\.confirm\('Delete this message\?/, 'deleting asks first');
});

test('a delete that matched nothing is an error, not a success', () => {
  // Reporting success while the message stays on the site is the worst possible outcome here.
  const api = readFileSync(new URL('../../functions/api/hub/owner/site-copy.js', import.meta.url), 'utf8');
  assert.match(api, /changes !== 1\) return bad\('That message no longer exists\.', 404\)/);
});

test('an update is scoped to its slot as well as its id', () => {
  const api = readFileSync(new URL('../../functions/api/hub/owner/site-copy.js', import.meta.url), 'utf8');
  assert.match(api, /WHERE id = \? AND slot = \?/, 'delete');
  assert.match(api, /WHERE id=\? AND slot=\?/, 'update');
});

test('the migration carries the existing announcement across, not a fresh row', () => {
  // Production has a live bar. A rebuild that regenerated ids would drop it.
  const sql = readFileSync(new URL('../../migrations/0052_content_blocks_queue.sql', import.meta.url), 'utf8');
  assert.match(sql, /'cb_' \|\| slot/, 'deterministic id derived from the old primary key');
  assert.match(sql, /INSERT OR IGNORE INTO content_blocks_v2/);
  assert.match(sql, /ALTER TABLE content_blocks_v2 RENAME TO content_blocks/);
});

// ---------- the two bugs the phone screenshot exposed ----------

test('the bar is taken OUT of flow, so a flex page cannot lay it out', () => {
  // /login sets `body{display:flex;align-items:center}` to centre its card. The bar used to be
  // inserted as body.firstChild, which made it a FLEX ITEM sitting BESIDE the sign-in card and
  // squashing it sideways — that is what the screenshot showed. Any flex or grid body broke the
  // same way, so the fix cannot be a special case for /login.
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /position:fixed;top:0;left:0;right:0/, 'fixed, not a child of the flow');
  assert.ok(!/insertBefore\(bar, document\.body\.firstChild\)/.test(js), 'the flow insertion is gone');
});

test('the space the fixed bar covers is given back to the page', () => {
  // Fixed positioning alone would overlay the top of the page. The body is padded by exactly the
  // bar height, with border-box so a min-height:100dvh page does not grow and gain a scrollbar.
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /boxSizing = 'border-box'/);
  assert.match(js, /basePad \+ bar\.offsetHeight/);
  assert.match(js, /addEventListener\('resize'/, 'a wrapped bar changes height on rotate');
});

test('dismissing the bar releases the padding it reserved', () => {
  // Otherwise the page keeps a strip of dead space where the bar used to be.
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /function releaseSpace/);
  assert.match(js, /releaseSpace\(\);\n\s*setTimeout/);
});

test('Spanish pages get Spanish WITHOUT the i18n engine', () => {
  // The real "Spanish never publishes" cause: /es/ pages load announce.js but NOT i18n.js, so
  // window.AnejoLang was undefined and the language fell back to 'en' — English copy on a Spanish
  // page, while the API had the Spanish text all along.
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /document\.documentElement\.getAttribute\('lang'\)/, 'trust <html lang="es">');
  assert.match(js, /\^\\\/es\(\\\/\|\$\)/, 'and the /es/ path as a last resort');
});

test('an /es/ page really does declare Spanish', () => {
  // The fix above relies on it, so pin the assumption rather than trusting it.
  const es = readFileSync(new URL('../../public/es/index.html', import.meta.url), 'utf8');
  assert.match(es, /<html lang="es">/);
  assert.match(es, /assets\/js\/announce\.js/);
});

// ---------- pop-up placement ----------

test('placement falls back to the QUIETER option', () => {
  // A bad value must never escalate a standing line into an interruption.
  assert.equal(normalizePlacement('modal'), 'modal');
  assert.equal(normalizePlacement('bar'), 'bar');
  assert.equal(normalizePlacement('takeover'), 'bar');
  assert.equal(normalizePlacement(undefined), 'bar');
});

test('placement and id reach the storefront', () => {
  const r = render(q({ placement: 'modal', id: 'cb_x' }), 'en', NOW);
  assert.equal(r.placement, 'modal');
  assert.equal(r.id, 'cb_x', 'the storefront remembers a dismissed pop-up by id');
});

test('a pop-up is shown once per message, and an EDIT counts as new', () => {
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /function alreadySeen/);
  assert.match(js, /seenKeyFor\(b\)/);
  assert.match(js, /return b\.id \|\| b\.body/, 'keyed on the entry, not a global "seen" flag');
});

test('the pop-up can always be closed', () => {
  // A dialog with no way out is a trap — backdrop click, a button, and Escape.
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /e\.key === 'Escape'/);
  assert.match(js, /if \(e\.target === wrap\) dismiss\(\)/);
  assert.match(js, /aria-modal/);
});

test('the owner picks the placement and can see it on each queued entry', () => {
  const page = readFileSync(new URL('../../public/hub/owner/site-copy.html', import.meta.url), 'utf8');
  assert.match(page, /id="place"/);
  assert.match(page, /Pop-up in the middle \(shown once\)/);
  assert.match(page, /placement: \(document\.getElementById\('place'\)/);
  assert.match(page, /'◧ Pop-up' : '▭ Top bar'/, 'the list says which each one is');
});

test('the migration defaults every existing row to the bar', () => {
  // Nothing already written may change how it behaves because a column appeared.
  const sql = readFileSync(new URL('../../migrations/0054_content_blocks_placement.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN placement TEXT NOT NULL DEFAULT 'bar'/);
});

test('the pop-up reveal cannot depend on requestAnimationFrame alone', () => {
  // It starts at opacity:0 and fades in. rAF does not fire while a tab is backgrounded or the
  // renderer is throttled — caught live: the modal sat at opacity 0 indefinitely and the message
  // simply never appeared. A silent no-show is the worst failure this feature has.
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /requestAnimationFrame\(reveal\)/);
  assert.match(js, /setTimeout\(reveal, \d+\)/, 'a timer must race the frame callback');
  assert.match(js, /if \(revealed\) return;/, 'and reveal must be idempotent so both can fire');
});

test('the announcement sits below the cookie consent banner', () => {
  // The storefront runs a 99999 z-index scale. A marketing message must never cover a legal
  // consent gate, and must not sit UNDER ordinary page content either (9000 did).
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  const bar = Number((js.match(/z-index:(\d+);box-sizing/) || [])[1]);
  const modal = Number((js.match(/inset:0;z-index:(\d+)/) || [])[1]);
  assert.ok(bar > 1000 && modal > 1000, 'above page content');
  assert.ok(bar < 99998 && modal < 99998, 'below the cookie consent banner at 99998');
  assert.ok(modal > bar, 'the pop-up sits above the bar');
});
