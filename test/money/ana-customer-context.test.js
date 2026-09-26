import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { onRequestPost as chat } from '../../functions/api/chat.js';
import { draftReply, anaCustomerContext } from '../../functions/_lib/ana_social.js';

test('website and Instagram use only customer-eligible live training and knowledge; revocation reaches both', async t => {
  const DB = makeSqliteD1(); t.after(() => DB.sqlite.close());
  for (const [id, eligible] of [['PUBLIC_NOTE', 1], ['INTERNAL_NOTE', 0]]) {
    DB.sqlite.prepare('INSERT INTO training_rules(id,text,active,created_at,updated_at,customer_eligible) VALUES(?,?,1,1,1,?)').run(id, id + ' guidance', eligible);
    DB.sqlite.prepare('INSERT INTO kb_documents(id,title,active,status,created_at,updated_at,customer_eligible) VALUES(?,?,1,\'ready\',1,1,?)').run(id, id + ' reference', eligible);
    DB.sqlite.prepare('INSERT INTO kb_chunks(id,doc_id,ord,text,chars,embedded,created_at) VALUES(?,?,0,?,30,1,1)').run(id, id, id + ' source passage');
  }
  DB.sqlite.prepare('INSERT INTO training_examples(id,media_key,note,flag,active,created_at,updated_at) VALUES(?,?,?,\'good\',1,1,1)').run('example', 'training/private.jpg', 'PRIVATE_PHOTO_NOTE');
  const env = { DB, ANTHROPIC_API_KEY: 'fixture', AI: { run: async () => ({ data: [[1, 2]] }) }, VECTORIZE: { query: async () => ({ matches: ['PUBLIC_NOTE', 'INTERNAL_NOTE'].map(id => ({ id, score: .95, metadata: { customer_eligible: true } })) }) } };
  const prompts = [];
  const prior = globalThis.fetch; t.after(() => { globalThis.fetch = prior; });
  globalThis.fetch = async (url, opts) => {
    assert.equal(String(url), 'https://api.anthropic.com/v1/messages', 'no real provider or customer send');
    prompts.push(JSON.parse(opts.body).system);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Fixture response.' }], usage: { input_tokens: 1, output_tokens: 1 } }));
  };
  async function both() {
    const response = await chat({ env, request: new Request('https://example.test/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: 'What food options do you offer?' }] }) }) });
    assert.equal(response.status, 200);
    const draft = await draftReply(env, { text: 'What food options do you offer?', kind: 'dm' });
    assert.equal(draft.ok, true);
  }
  await both();
  assert.equal(prompts.length, 2);
  for (const prompt of prompts) {
    assert.match(prompt, /PUBLIC_NOTE guidance/);
    assert.match(prompt, /PUBLIC_NOTE source passage/);
    assert.doesNotMatch(prompt, /INTERNAL_NOTE|PRIVATE_PHOTO_NOTE/);
  }
  DB.sqlite.prepare('UPDATE training_rules SET customer_eligible=0').run();
  DB.sqlite.prepare('UPDATE kb_documents SET customer_eligible=0').run();
  await both();
  for (const prompt of prompts.slice(2)) assert.doesNotMatch(prompt, /PUBLIC_NOTE|INTERNAL_NOTE|PRIVATE_PHOTO_NOTE/);
});

test('missing supplemental sources never widen customer context to internal data', async () => {
  assert.equal(await anaCustomerContext({}, 'food'), '');
});
