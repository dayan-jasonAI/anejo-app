import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { retrieve, formatPassages } from '../../functions/_lib/knowledge.js';

test('retrieval checks current document state and citations instead of stale vector metadata', async t => {
  const DB = makeSqliteD1(); t.after(() => DB.sqlite.close());
  const states = [ ['ready', 1, 1], ['partial', 1, 1], ['ready', 0, 1], ['failed', 1, 1], ['pending', 1, 1], ['indexing', 1, 1], ['ready', 1, 0] ];
  for (const [i, [status, active, embedded]] of states.entries()) {
    DB.sqlite.prepare('INSERT INTO kb_documents(id,title,status,active,authority,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(`doc${i}`, `Current title ${i}`, status, active, 'internal', 1, 1);
    DB.sqlite.prepare('INSERT INTO kb_chunks(id,doc_id,ord,text,chars,embedded,created_at,heading,page) VALUES(?,?,?,?,?,?,?,?,?)').run(`chunk${i}`, `doc${i}`, 0, `Saved passage ${i}`, 15, embedded, 1, 'Current heading', 2);
  }
  DB.sqlite.prepare('INSERT INTO kb_chunks(id,doc_id,ord,text,chars,embedded,created_at) VALUES(?,?,?,?,?,?,?)').run('orphan', 'deleted-parent', 0, 'Removed document', 16, 1, 1);
  const ids = [...states.keys()].map(i => `chunk${i}`).concat('orphan', 'deleted-chunk');
  const env = { DB, AI: { run: async () => ({ data: [[1, 2]] }) }, VECTORIZE: { query: async () => ({ matches: ids.map(id => ({ id, score: .9, metadata: { title: 'Stale title', authority: 'regulatory', heading: 'Stale heading', page: 99 } })) }) } };
  const rows = await retrieve(env, 'question');
  assert.deepEqual(rows.map(r => r.text), ['Saved passage 0', 'Saved passage 1']);
  assert.equal(rows[0].title, 'Current title 0');
  assert.equal(rows[0].authority, 'internal');
  assert.equal(rows[0].heading, 'Current heading');
  assert.equal(rows[0].page, 2);
  const rendered = formatPassages(rows).text;
  assert.match(rendered, /PARTIALLY INDEXED/);
  assert.doesNotMatch(rendered, /REGULATORY|Stale|Removed document/);
  DB.sqlite.prepare("UPDATE kb_documents SET active=0 WHERE id IN ('doc0','doc1')").run();
  assert.deepEqual(await retrieve(env, 'question'), [], 'same vector results cannot revive disabled sources');
});

test('database read failure never falls back to vector citation or text', async () => {
  const env = { DB: { prepare() { throw Error('unavailable'); } }, AI: { run: async () => ({ data: [[1]] }) }, VECTORIZE: { query: async () => ({ matches: [{ id: 'old', score: .9, metadata: { text: 'Stale private text', authority: 'regulatory' } }] }) } };
  assert.deepEqual(await retrieve(env, 'question'), []);
});
