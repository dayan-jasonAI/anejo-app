import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
import { createProposal, decideProposal, BRAND_DOC_ID } from '../../functions/_lib/brief.js';

async function fixture(existing = true) {
  const DB = makeSqliteD1(), env = { DB };
  if (existing) DB.sqlite.prepare("INSERT OR REPLACE INTO docs (id, doc_type, title, body, role_scope, version, active, created_at, updated_at) VALUES (?, 'brand', 'Brand', 'original', '[]', 7, 1, 1, 1)").run(BRAND_DOC_ID);
  else DB.sqlite.prepare('DELETE FROM docs WHERE id=?').run(BRAND_DOC_ID);
  const proposal = await createProposal(env, { proposed_body: 'replacement', title: 'Change', role: 'kitchen' });
  return { DB, env, args: { id: proposal.id, decision: 'approve', role: 'owner', owner: { id: 'owner_test' } } };
}

test('approval snapshots the current brief and applies the proposal together, once', async () => {
  const { DB, env, args } = await fixture();
  assert.equal((await decideProposal(env, args)).ok, true);
  assert.equal(DB.one('SELECT body FROM docs WHERE id=?', BRAND_DOC_ID).body, 'replacement');
  assert.equal(DB.one('SELECT version FROM docs WHERE id=?', BRAND_DOC_ID).version, 8);
  assert.equal(DB.one('SELECT body FROM doc_versions WHERE from_proposal=?', args.id).body, 'original');
  assert.equal(DB.one('SELECT status FROM brief_proposals WHERE id=?', args.id).status, 'approved');
  assert.ok((await decideProposal(env, args)).error);
  assert.equal(DB.one('SELECT COUNT(*) AS n FROM doc_versions WHERE from_proposal=?', args.id).n, 1);
});

test('an approval failure rolls back the document, snapshot, and proposal claim', async () => {
  const { DB, env, args } = await fixture();
  DB.exec("CREATE TRIGGER fail_approval BEFORE UPDATE OF status ON brief_proposals WHEN NEW.status='approved' BEGIN SELECT RAISE(ABORT, 'injected failure'); END;");
  assert.ok((await decideProposal(env, args)).error);
  assert.equal(DB.one('SELECT body FROM docs WHERE id=?', BRAND_DOC_ID).body, 'original');
  assert.equal(DB.one('SELECT COUNT(*) AS n FROM doc_versions WHERE from_proposal=?', args.id).n, 0);
  assert.equal(DB.one('SELECT status FROM brief_proposals WHERE id=?', args.id).status, 'pending');
});

test('a decision that loses a race cannot overwrite a rejected proposal or change the brief', async () => {
  const { DB, env, args } = await fixture();
  const batch = DB.batch.bind(DB);
  DB.batch = async (statements) => {
    DB.sqlite.prepare("UPDATE brief_proposals SET status='rejected' WHERE id=?").run(args.id);
    return batch(statements);
  };
  assert.ok((await decideProposal(env, args)).error);
  assert.equal(DB.one('SELECT body FROM docs WHERE id=?', BRAND_DOC_ID).body, 'original');
  assert.equal(DB.one('SELECT status FROM brief_proposals WHERE id=?', args.id).status, 'rejected');
  assert.equal(DB.one('SELECT COUNT(*) AS n FROM doc_versions WHERE from_proposal=?', args.id).n, 0);
});

test('approval can create a missing brief, but kitchen role cannot decide', async () => {
  const { DB, env, args } = await fixture(false);
  assert.ok((await decideProposal(env, { ...args, role: 'kitchen' })).error);
  assert.equal(DB.one('SELECT id FROM docs WHERE id=?', BRAND_DOC_ID), null);
  assert.equal((await decideProposal(env, args)).ok, true);
  assert.equal(DB.one('SELECT body FROM docs WHERE id=?', BRAND_DOC_ID).body, 'replacement');
});
