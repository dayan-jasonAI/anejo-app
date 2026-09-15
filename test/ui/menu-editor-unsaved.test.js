// The menu editor must not throw away edits it never told anyone about.
//
// WHAT HAPPENED (Dayan, 2026-09-09). He updated the entire menu from the Hub and none of it
// saved — not on the website, not in the Hub itself. Reproduced in a browser against the shipped
// page: type a new price into FUEGO and a new name into MAR, click Save on VIDA, and FUEGO and
// MAR silently revert to their old values. Switching from Bowls to Drinks and back does the same.
//
// The cause was two ordinary decisions meeting badly:
//   · every row has its OWN Save button, and there was no way to save more than one row at a time
//   · render() rebuilds every input from server data, and it runs after ANY save and on every
//     category tab switch
// so saving one row discarded every other row's work. Nothing was buffered, nothing was flagged
// except a small "not saved" beside a changed PRICE, and nothing stopped the tab from closing.
//
// These tests pin the four properties that make that impossible now. They are structural
// assertions over the page source — the editor is an inline script in an owner-authenticated Hub
// page, so the behavioural proof is a browser run recorded in the handoff rather than something
// this suite can execute. What is checked here is that the machinery cannot be quietly removed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../../public/hub/owner/menu.html', import.meta.url), 'utf8');

test('edits live in a buffer that survives a re-render', () => {
  assert.match(PAGE, /var pending = \{\};/, 'there must be somewhere for an unsaved edit to live');
  assert.match(PAGE, /function shown\(it, key\)/, 'and the inputs must read through it');
  // Every editable input has to be seeded from the buffer, not straight from the server row —
  // that is the single line that makes a re-render non-destructive.
  const wired = [['p_', 'price'], ['q_', 'stock_count'], ['n_', 'name'], ['ne_', 'name_es'],
                 ['d_', 'description'], ['de_', 'description_es'], ['i_', 'image'], ['s_', 'sort']];
  for (const [id, field] of wired) {
    // Ties THIS input to THIS field, tolerating the markup wrapping across lines.
    const re = new RegExp(`id="${id}' \\+ it\\.id \\+ '"[\\s\\S]{0,240}?shown\\(it, '${field}'\\)`);
    assert.match(PAGE, re, `input ${id} must render from the buffer (${field})`);
  }
  assert.match(PAGE, /\(shown\(it, 'active'\) \? 'checked' : ''\)/, 'the visibility checkbox too');
  assert.match(PAGE, /o\.key === shown\(it, 'availability'\)/, 'and the availability dropdown');
});

test('a save on one row clears only that row', () => {
  assert.match(PAGE, /delete pending\[it\.id\];\s+\/\/ this row is now saved/,
    'saving VIDA must not touch the edits pending on FUEGO');
  assert.ok(!/pending = \{\};\s*\n\s*post\(/.test(PAGE), 'a single save must never clear the whole buffer');
});

test('every field is tracked, not just the price', () => {
  // The original only listened to the price input, so a renamed bowl gave no signal at all.
  assert.match(PAGE, /var FIELDS = \[/);
  for (const key of ['price', 'stock_count', 'availability', 'name', 'name_es', 'description', 'description_es', 'image', 'sort', 'active']) {
    assert.match(PAGE, new RegExp("k: '" + key + "'"), `${key} must be tracked`);
  }
  assert.match(PAGE, /FIELDS\.forEach\(function \(f\) \{/, 'and every one of them wired to the buffer');
  assert.match(PAGE, /id="dirty_' \+ it\.id \+ '"/, 'a changed row must say so on the row');
});

test('there is a way to save the whole menu at once', () => {
  assert.match(PAGE, /function saveAll\(\)/);
  assert.match(PAGE, /id="mn-save-all"/);
  assert.match(PAGE, /Save all changes/);
  // A batch must still show what customers will feel, and in ONE dialog — thirty confirms in a
  // row is a thing people dismiss without reading.
  assert.match(PAGE, /Customers are charged these on the next order/);
  assert.match(PAGE, /These stop being orderable/);
  assert.match(PAGE, /function sendItem\(it\)/, 'batched saves must not re-render between rows');
});

test('unsaved work is visible and cannot be closed away silently', () => {
  assert.match(PAGE, /id="mn-unsaved"/, 'a bar that counts what is outstanding');
  assert.match(PAGE, /unsaved change/, 'named in words, not just a dot');
  assert.match(PAGE, /window\.addEventListener\('beforeunload'/, 'and the browser asks before the tab goes');
  assert.match(PAGE, /if \(!dirtyItems\(\)\.length\) return;/, 'without nagging when nothing is pending');
});

test('discarding is deliberate, never a side effect', () => {
  assert.match(PAGE, /id="mn-discard"/);
  assert.match(PAGE, /Throw away ' \+ n \+ ' unsaved change/, 'and it says how much is being thrown away');
});
