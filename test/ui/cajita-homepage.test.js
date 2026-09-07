import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');

test('homepage features Cajita with bounded process and release CTA', () => {
  assert.match(page, /href="\/cajita-builder"/);
  assert.match(page, /href="\/catering"/);
  assert.match(page, /Choose bites/);
  assert.match(page, /Set the theme/);
  assert.match(page, /Request a quote/);
});

test('homepage Cajita gallery uses existing real assets and reduced-motion script', () => {
  assert.match(page, /cajita\/event-gallery\/event-1\.jpg/);
  assert.match(page, /cajita\/themes\/anejo-signature\.jpg/);
  assert.match(page, /assets\/js\/cajita-hero\.js/);
  assert.match(readFileSync(new URL('../../public/assets/js/cajita-hero.js', import.meta.url), 'utf8'), /prefers-reduced-motion/);
});
