// Saving a menu item whose photo lives in a subfolder.
//
// WHAT HAPPENED (Dayan, 2026-09-09). He typed $120 over the $290 on "Bocaditos Cubanos — 150
// piezas", pressed Guardar, and got a red line about the IMAGE — a field he had never touched.
// The price did not save. Production still read 29000 afterwards.
//
// The cause was one character missing from a regex:
//
//     const IMAGE = /^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|avif)$/;   // no "/"
//
// That item's photo is 'menu-launch/combo-bites.webp'. A save posts EVERY field together, so a
// single field-level rejection returned 400 and wrote nothing — price included. 134 of the 144
// live menu rows keep their photo in a subfolder, so 93% of the menu could not be edited at all,
// and the error always pointed at the wrong field. That is where a whole menu re-price went.
//
// These tests run the real endpoint against real SQLite and then READ THE ROW BACK. A structural
// assertion over the source would not have caught the original bug — the code looked fine; it was
// the data it had to accept that it got wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost } from '../../functions/api/hub/owner/menu.js';
import { makeKV } from '../helpers/d1.js';

// The live schema, as read from production D1 on 2026-09-09.
const SCHEMA = `
  CREATE TABLE menu_items (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL, name_es TEXT,
    price_cents INTEGER NOT NULL, description TEXT, description_es TEXT, image TEXT,
    sort INTEGER NOT NULL DEFAULT 100, active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    availability TEXT NOT NULL DEFAULT 'available', stock_count INTEGER);
  CREATE TABLE menu_price_log (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL, field TEXT NOT NULL, old_cents INTEGER,
    new_cents INTEGER, changed_by TEXT, created_at INTEGER NOT NULL);
  CREATE TABLE menu_modifier_prices (key TEXT PRIMARY KEY, price_cents INTEGER NOT NULL);
  CREATE TABLE staff (email TEXT PRIMARY KEY, role TEXT, active INTEGER);`;

function makeDB() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(SCHEMA);
  sqlite.prepare('INSERT INTO staff (email, role, active) VALUES (?,?,?)')
    .run('dayan@dayanrealtyhub.com', 'owner', 1);
  // The real row, with the real photo path that broke it.
  sqlite.prepare(`INSERT INTO menu_items
      (id,kind,name,name_es,price_cents,description,description_es,image,sort,active,created_at,updated_at,availability)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('catering_combo_bites150', 'addon', 'Cuban Bites — 150 pieces', 'Bocaditos Cubanos — 150 piezas',
         29000, null, null, 'menu-launch/combo-bites.webp', 100, 1, 1, 1, 'available');
  // And a bare-filename row, to prove the simple case never regressed.
  sqlite.prepare(`INSERT INTO menu_items
      (id,kind,name,price_cents,image,sort,active,created_at,updated_at,availability)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run('vida', 'bowl', 'VIDA', 2299, 'bowl_vida.jpg', 10, 1, 1, 1, 'available');

  const exec = (kind, sql, args) => {
    const stmt = sqlite.prepare(sql);
    if (kind === 'first') return stmt.get(...args) || null;
    if (kind === 'all') return { results: stmt.all(...args) };
    return { success: true, meta: { changes: Number(stmt.run(...args).changes) } };
  };
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...v) => statement(sql, v),
    first: async () => exec('first', sql, args),
    all: async () => exec('all', sql, args),
    run: async () => exec('run', sql, args),
  });
  return {
    sqlite,
    prepare: statement,
    async batch(stmts) {
      sqlite.exec('BEGIN');
      try {
        const r = stmts.map((s) => exec('run', s.sql, s.args));
        sqlite.exec('COMMIT');
        return r;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
}

function makeEnv(DB) {
  return {
    DB,
    SESSIONS: makeKV({
      // A staff session as session.js mints one: no `uid`, so requireRole re-checks staff by
      // email against the fixture's staff row.
      'session:tok-owner': JSON.stringify({
        type: 'staff', role: 'owner', email: 'dayan@dayanrealtyhub.com', created: Date.now(), la: Date.now(),
      }),
    }),
  };
}

// One save, exactly as the Hub sends it: every field of the row, together.
function saveRequest(body) {
  return new Request('https://anejocateringco.com/api/hub/owner/menu', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Cookie: 'anejo_sess=tok-owner' },
    body: JSON.stringify(body),
  });
}

const priceOf = (DB, id) =>
  DB.sqlite.prepare('SELECT price_cents FROM menu_items WHERE id = ?').get(id).price_cents;

// ------------------------------------------------------------ the bug, end to end

test('the $290 → $120 save Dayan actually made lands in the database', async () => {
  const DB = makeDB();
  assert.equal(priceOf(DB, 'catering_combo_bites150'), 29000, 'fixture starts where production was');

  const res = await onRequestPost({
    request: saveRequest({
      op: 'update_item',
      id: 'catering_combo_bites150',
      // Cents on the wire: the Hub's dollars box is converted by toCents() before the POST.
      price_cents: 12000,
      // The Hub posts the image back untouched. This is the value that used to reject the save.
      image: 'menu-launch/combo-bites.webp',
      name: 'Cuban Bites — 150 pieces',
      availability: 'available',
      stock_count: '',
      active: true,
      sort: 100,
    }),
    env: makeEnv(DB),
  });

  assert.equal(res.status, 200, 'a subfolder photo must not reject the save');
  assert.equal(priceOf(DB, 'catering_combo_bites150'), 12000, 'the price must actually be written');
});

test('a subfolder photo is not rejected, and is not silently rewritten either', async () => {
  const DB = makeDB();
  await onRequestPost({
    request: saveRequest({
      op: 'update_item', id: 'catering_combo_bites150', price_cents: 12000,
      image: 'menu-launch/combo-bites.webp',
    }),
    env: makeEnv(DB),
  });
  const row = DB.sqlite.prepare('SELECT image, price_cents FROM menu_items WHERE id = ?').get('catering_combo_bites150');
  assert.equal(row.image, 'menu-launch/combo-bites.webp', 'the path must round-trip exactly');
  // Without this the test would pass on a rejected save, since the fixture already holds that path.
  assert.equal(row.price_cents, 12000, 'and the save must have happened at all');
});

test('a bare filename still saves — the simple case never regressed', async () => {
  const DB = makeDB();
  const res = await onRequestPost({
    request: saveRequest({ op: 'update_item', id: 'vida', price_cents: 2499, image: 'bowl_vida.jpg' }),
    env: makeEnv(DB),
  });
  assert.equal(res.status, 200);
  assert.equal(priceOf(DB, 'vida'), 2499);
});

test('the price change is still written to the audit log', async () => {
  // The log is how "who dropped this to $120, and when" gets answered. A fix to the image rule
  // must not cost the money trail.
  const DB = makeDB();
  await onRequestPost({
    request: saveRequest({
      op: 'update_item', id: 'catering_combo_bites150', price_cents: 12000,
      image: 'menu-launch/combo-bites.webp',
    }),
    env: makeEnv(DB),
  });
  const log = DB.sqlite.prepare(
    "SELECT * FROM menu_price_log WHERE item_id = ? AND field = 'price_cents'"
  ).get('catering_combo_bites150');
  assert.ok(log, 'a price move must leave a row');
  assert.equal(log.old_cents, 29000);
  assert.equal(log.new_cents, 12000);
  assert.equal(log.changed_by, 'dayan@dayanrealtyhub.com');
});

// ------------------------------------------------------------ every shape the live menu uses

test('every image path in the live menu is accepted', async () => {
  // Sampled from production D1 on 2026-09-09: 134 of 144 rows sit in a subfolder, all under
  // menu-launch/. If any of these is refused, that many items become uneditable again.
  const real = [
    'menu-launch/combo-bites.webp', 'menu-launch/food-lechon.webp', 'menu-launch/arroz-frito.webp',
    'menu-launch/cajitas-collection.webp', 'menu-launch/cake-chocolate.webp', 'bowl_vida.jpg',
    'bowl_congreen.jpg', 'emblem.png', 'menu-launch/tres-leches.avif', 'a/b/c/deep.jpeg',
  ];
  for (const image of real) {
    const DB = makeDB();
    const res = await onRequestPost({
      request: saveRequest({ op: 'update_item', id: 'vida', price_cents: 2500, image }),
      env: makeEnv(DB),
    });
    assert.equal(res.status, 200, `${image} must be accepted`);
    assert.equal(priceOf(DB, 'vida'), 2500, `${image} must not block the price`);
  }
});

// ------------------------------------------------------------ the guard that must still hold

test('a path cannot climb out of /assets/img/', async () => {
  // The value is concatenated onto /assets/img/. Loosening the rule to allow subfolders must not
  // also allow "../../" out of the image directory, or an absolute URL onto someone else's host.
  const attacks = [
    '../secret.png', 'menu-launch/../../secret.png', '..%2Fsecret.png', '/etc/passwd.png',
    '//evil.example.com/x.png', 'https://evil.example.com/x.png', './x.png', 'a//b.png',
  ];
  for (const image of attacks) {
    const DB = makeDB();
    const res = await onRequestPost({
      request: saveRequest({ op: 'update_item', id: 'vida', price_cents: 2500, image }),
      env: makeEnv(DB),
    });
    assert.equal(res.status, 400, `${image} must be refused`);
    assert.equal(priceOf(DB, 'vida'), 2299, `${image} must not write anything`);
  }
});

test('a non-image file is still refused', async () => {
  for (const image of ['payload.svg', 'script.js', 'menu-launch/x.html', 'noextension', 'x.webp.js']) {
    const DB = makeDB();
    const res = await onRequestPost({
      request: saveRequest({ op: 'update_item', id: 'vida', price_cents: 2500, image }),
      env: makeEnv(DB),
    });
    assert.equal(res.status, 400, `${image} must be refused`);
  }
});

test('clearing the photo is allowed — an empty box means "no photo", not an error', async () => {
  const DB = makeDB();
  const res = await onRequestPost({
    request: saveRequest({ op: 'update_item', id: 'vida', price_cents: 2500, image: '' }),
    env: makeEnv(DB),
  });
  assert.equal(res.status, 200);
  assert.equal(priceOf(DB, 'vida'), 2500);
});

// ------------------------------------------------------------ the error text

test('a rejection names both accepted shapes', async () => {
  // The old message said "must be a filename", which is what sent Dayan looking for a fault in a
  // field that was correct. Whatever it refuses, it has to show a subfolder example.
  const DB = makeDB();
  const res = await onRequestPost({
    request: saveRequest({ op: 'update_item', id: 'vida', image: 'payload.svg' }),
    env: makeEnv(DB),
  });
  const body = await res.json();
  const msg = body.errors.join(' ');
  assert.match(msg, /menu-launch\/combo-bites\.webp/, 'must show a subfolder example');
  assert.match(msg, /bowl_vida\.jpg/, 'and the bare-filename one');
});
