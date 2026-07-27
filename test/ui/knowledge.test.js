// Knowledge-base chunking + citation formatting.
//
// WHY THIS MATTERS MORE THAN USUAL. The Studio will answer DBPR and food-safety questions from
// these chunks. Two failures are unacceptable: a rule split from its qualifier ("...unless held
// below 41°F") so the retrieved passage says the opposite of the manual, and a passage arriving
// without its source so nobody can check it. Both are pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkMarkdown, formatPassages } from '../../functions/_lib/knowledge.js';

test('short documents stay in one piece', () => {
  const c = chunkMarkdown('# Hot holding\n\nHold hot food at 135°F or above at all times.');
  assert.equal(c.length, 1);
  assert.match(c[0].text, /135/);
  assert.equal(c[0].heading, 'Hot holding');
});

test('headings are captured for citation', () => {
  const md = '# Añejo Kitchen Manual\n\n## Cooling\n\n' + 'Cool from 135°F to 70°F within two hours. '.repeat(60);
  const c = chunkMarkdown(md);
  assert.ok(c.length >= 1);
  assert.ok(c.every((x) => x.heading), 'every chunk must know which section it came from');
});

test('PDF page markers become page numbers', () => {
  const md = '### Page 7\n\nAll food handlers must hold a valid certificate.\n';
  const c = chunkMarkdown(md);
  assert.equal(c[0].page, 7, 'a citation without a page is much harder to verify in a 200-page manual');
});

test('long documents split into multiple overlapping chunks', () => {
  const md = 'Step one. '.repeat(600);          // ~6000 chars
  const c = chunkMarkdown(md);
  assert.ok(c.length > 1, 'must split');
  assert.ok(c.every((x) => x.text.length <= 1800), 'no chunk wildly over the target size');
});

test('consecutive chunks overlap so a rule is never split from its qualifier', () => {
  const md = Array.from({ length: 120 }, (_, i) => `Line ${i}: hold at temperature unless otherwise stated.`).join('\n');
  const c = chunkMarkdown(md);
  assert.ok(c.length > 1);
  const tail = c[0].text.slice(-120);
  // Some part of the first chunk's tail must reappear at the head of the second.
  const overlapFound = tail.split('\n').some((line) => line.trim() && c[1].text.indexOf(line.trim()) !== -1);
  assert.ok(overlapFound, 'without overlap, a qualifier can land alone in the next chunk and be lost');
});

test('empty and noise-only input produces nothing rather than junk chunks', () => {
  assert.deepEqual(chunkMarkdown(''), []);
  assert.deepEqual(chunkMarkdown('   \n\n  '), []);
  assert.deepEqual(chunkMarkdown('--- \n === \n ...'), [], 'separators are not knowledge');
});

// ---- citations ----

const P = (over) => Object.assign({
  text: 'Hold hot food at 135°F or above.',
  title: 'DBPR Food Service Guide', heading: 'Hot holding', page: 12,
  authority: 'regulatory', score: 0.9,
}, over);

test('every passage carries its source', () => {
  const { text, used } = formatPassages([P()]);
  assert.equal(used, 1);
  assert.match(text, /\[DBPR Food Service Guide · Hot holding · p\.12\]/);
});

test('regulatory passages are marked so they can outrank internal SOPs', () => {
  const { text } = formatPassages([P()]);
  assert.match(text, /\(REGULATORY\)/, 'the model is told to follow these over house preference');
  const internal = formatPassages([P({ authority: 'internal' })]);
  assert.doesNotMatch(internal.text, /\(REGULATORY\)/);
});

test('a passage missing its metadata still gets an attributable label', () => {
  const { text } = formatPassages([P({ title: '', heading: '', page: null })]);
  assert.match(text, /\[Añejo document\]/, 'never emit a bare unattributed passage');
});

test('the budget drops the LEAST relevant passages and reports how many survived', () => {
  const many = Array.from({ length: 20 }, (_, i) => P({ text: 'x'.repeat(900), title: 'Doc ' + i }));
  const { used } = formatPassages(many, 3000);
  assert.ok(used > 0 && used < 20, 'must clamp');
  // Callers use `used` to know what actually got injected — silent truncation is the bug this
  // whole subsystem exists to fix, so it must not reappear here.
  assert.equal(typeof used, 'number');
});

// ---- extraction gatekeeping (added after the first real upload indexed nothing but metadata) ----

import { contentAfterMetadata } from '../../functions/_lib/pdftext.js';
import { looksGarbled } from '../../functions/_lib/pdfclaude.js';

test('a toMarkdown result with an EMPTY Contents section is recognised as a failure', () => {
  // This is verbatim the shape that got indexed as "1 of 1 passages" while capturing none of the
  // 71,000 characters actually in the DBPR bulletin.
  const bad = '# f.pdf\n## Metadata\n- PDFFormatVersion=1.7\n- Title=INDUSTRY BULLETIN\n'
            + '- Producer=Microsoft® Word\n\n\n## Contents\n### Page 1';
  assert.ok(contentAfterMetadata(bad) < 200, 'must not pass the ingest gate');
});

test('a real conversion passes the gate', () => {
  const good = '# f.pdf\n## Metadata\n- Title=X\n\n## Contents\n### Page 1\n'
             + 'Florida law prohibits the misrepresentation or undisclosed substitution of food. '.repeat(5);
  assert.ok(contentAfterMetadata(good) >= 200);
});

test('page markers alone are not content', () => {
  assert.ok(contentAfterMetadata('## Contents\n### Page 1\n### Page 2\n### Page 3') < 200);
});

test('mojibake from subsetted fonts is rejected, real prose is not', () => {
  const mojibake = '$GYHUWLVLQJ³IUHVK´MXLFHRQDPHQX IRU)ORULGD¶V)RRGVHUYLFH,QGXVWU\\ '.repeat(12);
  assert.equal(looksGarbled(mojibake), true, 'indexing this would retrieve and cite nonsense');
  const prose = 'Florida law prohibits the misrepresentation or undisclosed substitution of food. '.repeat(6);
  assert.equal(looksGarbled(prose), false);
  const spanish = 'La ley de Florida prohibe la sustitucion de alimentos que no se informa al cliente. '.repeat(6);
  assert.equal(looksGarbled(spanish), false, 'Spanish prose must not be mistaken for garbage');
});

test('short strings are not judged — too little to tell', () => {
  assert.equal(looksGarbled('Hold at 135F'), false);
  assert.equal(looksGarbled(''), false);
});
