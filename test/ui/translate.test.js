// On-demand translation: the input filter and cache behaviour.
//
// The language toggle used to be a hand-maintained EN->ES dictionary, so any string nobody
// remembered to add stayed English and a Spanish speaker got Spanglish. /api/translate is the
// self-healing layer underneath it. These tests pin the parts that can silently corrupt the UI:
// what we refuse to send (prices, separators, empties), and that a cached string is never re-billed.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// The sanitizer exactly as translate.js applies it.
const MAX_CHARS = 1200;
function sanitize(list) {
  const texts = [];
  for (const raw of list) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s || s.length > MAX_CHARS) continue;
    if (!/[a-zA-ZÀ-ÿ]/.test(s)) continue;
    if (texts.indexOf(s) === -1) texts.push(s);
  }
  return texts;
}

test('strings with no letters are never sent to a translator', () => {
  // A translator asked to "translate" $22.99 can return 22,99 $ — a wrong price rendered to a
  // customer. Same risk for times, counts and the · separators used throughout the site.
  assert.deepEqual(sanitize(['$22.99', '·', '10:00 – 19:30', '2026-07-27', '5', '— —']), []);
});

test('real UI copy passes through', () => {
  assert.deepEqual(
    sanitize(['Add to order', 'Only 3 left today']),
    ['Add to order', 'Only 3 left today'],
  );
});

test('accented Spanish already on the page still counts as translatable text', () => {
  assert.deepEqual(sanitize(['Añejo Fit — Gold Vitality']), ['Añejo Fit — Gold Vitality']);
});

test('duplicates collapse — a repeated label is paid for once', () => {
  assert.deepEqual(sanitize(['Save', 'Save', ' Save ', 'Cancel']), ['Save', 'Cancel']);
});

test('whitespace-only and non-strings are dropped without throwing', () => {
  assert.deepEqual(sanitize(['   ', '', null, undefined, 42, {}, []]), []);
});

test('over-long blobs are skipped — that is page content, not a label', () => {
  const long = 'a'.repeat(MAX_CHARS + 1);
  assert.deepEqual(sanitize([long, 'Menu']), ['Menu']);
});

// ---- client-side queue behaviour ----

// Mirrors the guard in i18n.js: never request the same string twice, even if it came back
// untranslated. Without this, a string the API cannot translate is re-requested on every
// re-render — an infinite billing loop on a page that never finishes translating.
function makeQueue() {
  const REMOTE = {}, asked = {}, pending = {};
  return {
    REMOTE, asked, pending,
    queue(s) {
      if (!s || !/[a-zA-ZÀ-ÿ]/.test(s)) return false;
      if (REMOTE[s] || asked[s] || pending[s]) return false;
      pending[s] = 1;
      return true;
    },
    flush(answers) {
      for (const s of Object.keys(pending)) { delete pending[s]; asked[s] = 1; }
      Object.assign(REMOTE, answers || {});
    },
  };
}

test('a string already translated is never requested again', () => {
  const q = makeQueue();
  assert.equal(q.queue('Add to order'), true);
  q.flush({ 'Add to order': 'Añadir al pedido' });
  assert.equal(q.queue('Add to order'), false, 'served from cache');
});

test('a string the API could NOT translate is still never re-requested', () => {
  const q = makeQueue();
  q.queue('Untranslatable thing');
  q.flush({});                       // came back with nothing
  assert.equal(q.queue('Untranslatable thing'), false, 'otherwise every re-render re-asks forever');
});

test('the same string queued twice before a flush only sends once', () => {
  const q = makeQueue();
  assert.equal(q.queue('Save'), true);
  assert.equal(q.queue('Save'), false);
  assert.deepEqual(Object.keys(q.pending), ['Save']);
});
