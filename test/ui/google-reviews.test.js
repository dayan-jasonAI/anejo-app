import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const homepage = readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
const i18n = readFileSync(path.join(ROOT, 'public/assets/js/i18n.js'), 'utf8');
const start = homepage.indexOf('<section class="testi"');
const end = homepage.indexOf('</section>', start) + '</section>'.length;
const reviews = homepage.slice(start, end);

const expected = [
  ['The food was absolutely delicious everything was fresh, flavorful, and cooked perfectly.', 'WA WA', 'https://share.google/yhoMF3rSC82P140qA', 'en'],
  ['Absolutely amazing food and exceptional service!', 'Herduin Garcia Heal', 'https://share.google/wjOAoPjHXu8GDnRNb', 'en'],
  ['The best food in town by far, a taste like no other & very professional customer service.', 'Randy Sanchez', 'https://share.google/Pxi2BRwOCn6ctE2SE', 'en'],
  ['Me encanta la comida y si es saludable mucho mejor.tienen que probarla todo riquísimo.', 'Michel Diaz Mordoche', 'https://share.google/PvZ47z3bdcR9XXxPe', 'es'],
  ['Excelente calidad, si quieres comer saludable y delicioso tienes que probar Añejo!', 'Gabriela Barrios', 'https://share.google/jdBJZipGFgiN1TjhZ', 'es'],
  ['Dios mío tienen que probar las croquetas definitivamente volveré a pedir gracias añejo por tanta calidad', 'Barbaro Gonzalez', 'https://share.google/9og2RSX7UtOrQTaCD', 'es'],
];

function htmlText(value) {
  return value.replace(/&amp;/g, '&').trim();
}

test('homepage contains the six exact attributed Google review excerpts', () => {
  const cards = [...reviews.matchAll(/<blockquote[^>]*lang="([^"]+)"[^>]*translate="no"[^>]*>([\s\S]*?)<\/blockquote>\s*<div class="who"><cite[^>]*translate="no"[^>]*>([\s\S]*?)<\/cite><\/div>\s*<a class="testi-source" href="([^"]+)"/g)];
  assert.equal(cards.length, expected.length);
  cards.forEach((match, index) => {
    const [quote, name, href, lang] = expected[index];
    assert.deepEqual([htmlText(match[2]), htmlText(match[3]), match[4], match[1]], [quote, name, href, lang]);
  });
});

test('review sources are unique share.google links and cards preserve source language', () => {
  const links = [...reviews.matchAll(/class="testi-source" href="(https:\/\/share\.google\/[^"?]+)"/g)].map((m) => m[1]);
  assert.equal(links.length, 6);
  assert.equal(new Set(links).size, links.length);
  assert.match(reviews, /Review excerpts in their original language\./);
  assert.match(reviews, /Rating checked September 7, 2026; not a live feed\./);
  assert.doesNotMatch(reviews, /fetch\s*\(|\/api\//i);
});

test('homepage review area has no placeholder review copy', () => {
  assert.doesNotMatch(reviews, /your review could be here|verified customer reviews will appear here|coming soon/i);
});

test('i18n text and attribute guards honor translation exclusions', () => {
  assert.match(i18n, /c\.getAttribute\('translate'\) === 'no'/);
  assert.match(i18n, /closest\('\[translate="no"\]'\)/);
  assert.match(i18n, /e2\.closest\('\[translate="no"\]'\)/);
});

test('actual i18n walker never visits a protected quote or nested reviewer name', () => {
  const walker = i18n.slice(i18n.indexOf('  function walk('), i18n.indexOf('  function apply('));
  const text = (nodeValue) => ({ nodeType: 3, nodeValue, nextSibling: null });
  const element = (tagName, children, translate = null) => {
    children.forEach((child, index) => { child.nextSibling = children[index + 1] || null; });
    return { nodeType: 1, tagName, firstChild: children[0], getAttribute: (key) => key === 'translate' ? translate : null };
  };
  const body = element('BODY', [
    element('P', [text('Read review on Google ↗')]),
    element('BLOCKQUOTE', [text(expected[0][0])], 'no'),
    element('DIV', [element('CITE', [text(expected[0][1])], 'no')]),
  ]);
  const visited = [];
  vm.runInNewContext(`${walker}\nwalk(body, visit);`, { body, visit: (node) => visited.push(node.nodeValue) });
  assert.deepEqual(visited, ['Read review on Google ↗']);
});
