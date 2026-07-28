// Owner-editable copy in named slots.
//
// Deliberately NOT a page editor: pages carry SEO schema, hreflang pairing and a CLS budget, and a
// free-form editor lets someone break all three without knowing. Slots are the safe subset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLive, render, isSlot, normalizeTone } from '../../functions/_lib/content.js';

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
  const js = readFileSync(new URL('../../public/assets/js/announce.js', import.meta.url), 'utf8');
  assert.match(js, /textContent = b\.body/, 'textContent, not innerHTML');
  assert.ok(!/innerHTML\s*=\s*b\./.test(js), 'no path writes owner copy as markup');
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
  assert.match(api, /live_now: isLive\(row\)/, 'saved and showing are different once scheduling exists');
});
