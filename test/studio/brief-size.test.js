import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProposal, MAX_BODY } from '../../functions/_lib/brief.js';

test('oversized and empty Brief proposals are rejected before any database access', async () => {
  const env = { DB: { prepare() { throw new Error('Database must not be touched'); } } };
  for (const body of [' ', 'x'.repeat(MAX_BODY + 1)]) {
    assert.equal(await createProposal(env, { proposed_body: body }), null);
  }
});

test('a maximum-size Brief is persisted without silently dropping its ending', async () => {
  let saved;
  const body = 'x'.repeat(MAX_BODY - 8) + 'THE END.';
  const env = { DB: { prepare(sql) {
    return { bind(...args) {
      return {
        async run() { assert.match(sql, /INSERT INTO brief_proposals/); saved = args[7]; },
        async first() { return { id: args[0], status: 'pending' }; },
      };
    } };
  } } };
  const proposal = await createProposal(env, { proposed_body: body, role: 'kitchen' });
  assert.equal(proposal.status, 'pending');
  assert.equal(saved, body);
  assert.equal(saved.length, MAX_BODY);
});
