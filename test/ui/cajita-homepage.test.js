// The homepage as Dayan set it on 2026-09-15: La Cajita is the star and sits right under the hero, its
// slideshow is Cajitas only ("I don't want to see the aluminum trays"), the big milestone events are front and
// center, and Wholesale is hidden because Añejo is not licensed to sell bulk frozen product.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const page = read('public/index.html');
const section = (id) => {
  const m = page.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`));
  assert.ok(m, `section #${id} is on the page`);
  return m[0];
};

test('La Cajita has its own hero button and sits right under the hero, before every other section', () => {
  assert.match(section('top'), /<a href="\/cajita-builder" class="btn ahero-star">/);
  const order = ['id="top"', 'id="cajitas"', 'id="catering-menu"', 'id="traditional"'].map((s) => page.indexOf(s));
  assert.ok(order.every((at) => at > 0), 'every section exists');
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'hero, then La Cajita, then celebrations, then Traditional');
  assert.match(section('cajitas'), /href="\/cajita-builder"/);
});

test('the Cajita slideshow shows Cajitas only: no trays, no event photos', () => {
  const cajitas = section('cajitas');
  const srcs = [...cajitas.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(srcs.length, 8, 'the eight holiday and occasion Cajitas');
  for (const src of srcs) assert.match(src, /^\/assets\/img\/cajita\/themes\/web\/[a-z-]+\.webp$/, src);
  for (const src of srcs) assert.ok(readFileSync(new URL(`../../public${src}`, import.meta.url)).length > 0, src);
  assert.doesNotMatch(page, /event-gallery/, 'the tray photos are gone from the homepage');
});

test('milestone celebrations lead catering, and each card opens the form already knowing the occasion', () => {
  const cards = [...section('catering-menu').matchAll(/<a class="celebrate-card[^"]*" href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(cards[0], '/catering?occasion=wedding', 'Weddings is the featured card');
  for (const occasion of ['quinceanera', 'sweet-sixteen', 'baby-shower', 'birthday', 'holiday']) {
    assert.ok(cards.includes(`/catering?occasion=${occasion}`), occasion);
  }
  const catering = read('public/catering.html');
  assert.match(catering, /<option>Quinceañera or sweet sixteen<\/option>/);
  assert.match(catering, /params\.get\('occasion'\)/);
});

test('every service card is a link to its landing page', () => {
  const links = [...section('services').matchAll(/<a class="serve-card" href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(links.length, 6);
  for (const href of links) assert.ok(readFileSync(new URL(`../../public${href}.html`.replace('/.html', '/index.html'), import.meta.url)), href);
});

test('Wholesale is hidden everywhere a visitor or the assistants could find it', () => {
  // Not one mention, anywhere on the page. The section went first, but the footer still SOLD it
  // ("longevity bowls, catering, and wholesale bites") and the removed form's submit handler was
  // still sitting in the page naming the offer. Añejo is not licensed for any of it.
  assert.doesNotMatch(page, /wholesale/i);
  assert.doesNotMatch(read('public/assets/js/chat.js'), /#wholesale/);
  const social = read('functions/_lib/ana_social.js');
  assert.doesNotMatch(social, /\/#wholesale|wholesale for venues/);
  assert.match(social, /does NOT sell wholesale/);
  assert.doesNotMatch(read('public/sms.html'), /wholesale forms/);
});

test('the moving parts respect reduced motion, can be paused, and every new line has curated Spanish', () => {
  assert.match(page, /\/assets\/js\/home-premium\.js/);
  assert.doesNotMatch(page, /cajita-hero\.js|home-background\.js/, 'one script, not three fighting over the page');
  const js = read('public/assets/js/home-premium.js');
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(section('top'), /class="ahero-pause"/);
  assert.match(read('public/assets/css/home-family.css'), /@media\(prefers-reduced-motion:reduce\)/);

  const dictionary = {};
  vm.runInNewContext(read('public/assets/js/catering-i18n.js'), { window: { AnejoI18n: { extend: (e) => Object.assign(dictionary, e) } } });
  const decode = (v) => v.replaceAll('&amp;', '&').replaceAll('&#39;', "'").replaceAll('&quot;', '"').replace(/\s+/g, ' ').trim();
  const missing = [];
  for (const id of ['top', 'cajitas', 'catering-menu', 'services', 'story']) {
    const html = section(id).replace(/<!--[\s\S]*?-->/g, '');
    const values = [...html.matchAll(/>([^<>]+)</g), ...html.matchAll(/(?:alt|aria-label|data-label|data-theme)="([^"]+)"/g)].map((m) => decode(m[1]));
    for (const value of values) if (/[a-z]/i.test(value) && !dictionary[value]) missing.push(`#${id}: ${value}`);
  }
  for (const s of js.matchAll(/\bt\('([^']+)'\)/g)) if (!dictionary[s[1]]) missing.push(`home-premium.js: ${s[1]}`);
  assert.deepEqual(missing, []);
});
