// Team Training API (functions/api/hub/owner/team-training.js + team-training-upload.js) — the
// owner-facing CRUD that writes the rows functions/_lib/training.js renders for the marketing
// team's prompts.
//
// What matters here:
//   · OWNER-GATED, same as every other owner route — no session, no access.
//   · The upload endpoint validates by MAGIC BYTES, not the client's mime label, and accepts
//     JPEG/PNG/WebP (unlike social-upload.js's Instagram-only JPEG restriction, because a
//     training reference photo is not going to Instagram).
//   · add_example refuses a media_key that didn't just come out of this upload endpoint — a
//     private proof/receipt/docimg key must never become reachable through the training library.
//   · Deleting is honest: a removed rule/example must stop appearing (soft-deleted, active=0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet as trainingGet, onRequestPost as trainingPost } from '../../functions/api/hub/owner/team-training.js';
import { onRequestPost as uploadPost } from '../../functions/api/hub/owner/team-training-upload.js';
import { makeD1, makeKV } from '../helpers/d1.js';

const API = readFileSync(new URL('../../functions/api/hub/owner/team-training.js', import.meta.url), 'utf8');
const UPLOAD = readFileSync(new URL('../../functions/api/hub/owner/team-training-upload.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0075_team_training.sql', import.meta.url), 'utf8');

// ---------- shared fixtures ----------

function ownerEnv(routes = [], { media } = {}) {
  const sess = JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_owner', email: 'dayan@anejocateringco.com', la: Date.now(), created: Date.now() });
  return {
    SESSIONS: makeKV({ 'session:tok': sess }),
    DB: makeD1([
      [/^SELECT active FROM staff WHERE id=\?/, () => ({ active: 1 })],
      ...routes,
    ]),
    MEDIA: media,
  };
}
const req = (path, init = {}) => new Request('https://anejocateringco.com' + path, {
  headers: { Cookie: 'anejo_sess=tok', 'Content-Type': 'application/json' }, ...init,
});
const post = (path, body) => req(path, { method: 'POST', body: JSON.stringify(body) });

function fakeR2(objects = {}) {
  const deleted = [];
  return {
    deleted,
    async get(key) { return objects[key] ? { body: 'x', httpMetadata: {} } : null; },
    async put(key, bytes, opts) { objects[key] = { bytes, meta: opts }; },
    async delete(key) { deleted.push(key); delete objects[key]; },
  };
}

// ---------- auth gate ----------

test('GET is gated to the marketing desk', async () => {
  const env = { SESSIONS: makeKV({}), DB: makeD1([]) };
  const res = await trainingGet({ request: new Request('https://anejocateringco.com/api/hub/owner/team-training'), env });
  assert.equal(res.status, 401);
  assert.match(API, /requireRole\(request, env, MARKETING_DESK\)/);
});

test('POST is gated to the marketing desk', async () => {
  const env = { SESSIONS: makeKV({}), DB: makeD1([]) };
  const res = await trainingPost({ request: post('/api/hub/owner/team-training', { op: 'add_rule', text: 'x' }), env });
  assert.equal(res.status, 401);
});

test('upload is gated to the marketing desk', async () => {
  const env = { SESSIONS: makeKV({}), DB: makeD1([]) };
  const res = await uploadPost({ request: post('/api/hub/owner/team-training-upload', { data_url: 'data:image/jpeg;base64,AAAA' }), env });
  assert.equal(res.status, 401);
  assert.match(UPLOAD, /requireRole\(request, env, MARKETING_DESK\)/);
});

// ---------- honest when empty ----------

test('GET on a fresh install reports trained:false and an empty preview', async () => {
  const env = ownerEnv([
    [/FROM training_rules WHERE active = 1/, () => []],
    [/FROM training_examples WHERE active = 1/, () => []],
  ]);
  const res = await trainingGet({ request: req('/api/hub/owner/team-training'), env });
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.equal(d.trained, false);
  assert.equal(d.preview.text, '', 'a fresh install must never imply guidance exists');
  assert.deepEqual(d.rules, []);
  assert.deepEqual(d.examples, []);
});

test('GET with real rows reports trained:true and the rendered preview text', async () => {
  const env = ownerEnv([
    [/FROM training_rules WHERE active = 1/, () => [{ id: 'rul_1', text: 'Always show food first.', created_by: 'owner', created_at: 1, updated_at: 1 }]],
    [/FROM training_examples WHERE active = 1/, () => [{ id: 'trex_1', media_key: 'training/2026-08/x.jpg', note: 'Bright light.', flag: 'good', created_by: 'owner', created_at: 1, updated_at: 1 }]],
  ]);
  const res = await trainingGet({ request: req('/api/hub/owner/team-training'), env });
  const d = await res.json();
  assert.equal(d.trained, true);
  assert.match(d.preview.text, /Always show food first\./);
  assert.equal(d.examples[0].url, '/api/hub/media/training/2026-08/x.jpg');
});

// ---------- rules CRUD ----------

test('add_rule rejects an empty rule', async () => {
  const env = ownerEnv([]);
  const res = await trainingPost({ request: post('/api/hub/owner/team-training', { op: 'add_rule', text: '   ' }), env });
  assert.equal(res.status, 400);
});

test('add_rule inserts an active row stamped with who wrote it', async () => {
  let captured = null;
  const env = ownerEnv([
    [/INSERT INTO training_rules/, ({ args }) => { captured = args; return 1; }],
  ]);
  const res = await trainingPost({ request: post('/api/hub/owner/team-training', { op: 'add_rule', text: 'Always show food in the first slide.' }), env });
  const d = await res.json();
  assert.equal(d.ok, true);
  // bind order: (id, text, created_by, created_at, updated_at) — `active` is a literal 1 in the
  // SQL text, not a bound param (see the INSERT's VALUES clause).
  assert.equal(captured[1], 'Always show food in the first slide.');
  assert.equal(captured[2], 'dayan@anejocateringco.com', 'created_by is the signed-in owner');
  assert.equal(captured[3], captured[4], 'created_at and updated_at start equal');
});

test('update_rule 404s on an id that does not exist (or is already deleted)', async () => {
  const env = ownerEnv([[/UPDATE training_rules SET text/, () => 0]]);
  const res = await trainingPost({ request: post('/api/hub/owner/team-training', { op: 'update_rule', id: 'rul_ghost', text: 'new text' }), env });
  assert.equal(res.status, 404);
});

test('delete_rule soft-deletes (active=0), never a hard DELETE', async () => {
  let captured = null;
  const env = ownerEnv([
    [/UPDATE training_rules SET active = 0/, ({ sql, args }) => { captured = { sql, args }; return 1; }],
  ]);
  const res = await trainingPost({ request: post('/api/hub/owner/team-training', { op: 'delete_rule', id: 'rul_1' }), env });
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.match(captured.sql, /UPDATE training_rules SET active = 0/);
  assert.ok(!/DELETE FROM training_rules/.test(API), 'rules are soft-deleted so created_at history is never lost');
});

// ---------- examples CRUD ----------

test('add_example requires a note — an unlabeled photo teaches nothing', async () => {
  const env = ownerEnv([], { media: fakeR2({ 'training/2026-08/a.jpg': {} }) });
  const res = await trainingPost({ request: post('/api/hub/owner/team-training', { op: 'add_example', media_key: 'training/2026-08/a.jpg', note: '' }), env });
  assert.equal(res.status, 400);
});

test('add_example refuses a media_key outside the training/ prefix (no leaking proof/receipt photos)', async () => {
  const env = ownerEnv([], { media: fakeR2({ 'proof/2026-08/a.jpg': {} }) });
  const res = await trainingPost({
    request: post('/api/hub/owner/team-training', { op: 'add_example', media_key: 'proof/2026-08/a.jpg', note: 'sneaky' }),
    env,
  });
  assert.equal(res.status, 400);
});

test('add_example 404s when the uploaded key cannot actually be found in R2', async () => {
  const env = ownerEnv([], { media: fakeR2({}) });
  const res = await trainingPost({
    request: post('/api/hub/owner/team-training', { op: 'add_example', media_key: 'training/2026-08/missing.jpg', note: 'good plating' }),
    env,
  });
  assert.equal(res.status, 404);
});

test('add_example defaults an unrecognized flag to good, never bad by accident', async () => {
  let captured = null;
  const env = ownerEnv(
    [[/INSERT INTO training_examples/, ({ args }) => { captured = args; return 1; }]],
    { media: fakeR2({ 'training/2026-08/a.jpg': {} }) },
  );
  await trainingPost({
    request: post('/api/hub/owner/team-training', { op: 'add_example', media_key: 'training/2026-08/a.jpg', note: 'nice bowl', flag: 'not-a-real-flag' }),
    env,
  });
  assert.equal(captured[3], 'good');
});

test('delete_example soft-deletes the row AND best-effort removes the R2 object', async () => {
  const r2 = fakeR2({ 'training/2026-08/a.jpg': {} });
  const env = ownerEnv(
    [
      [/SELECT media_key FROM training_examples WHERE id = \?/, () => ({ media_key: 'training/2026-08/a.jpg' })],
      [/UPDATE training_examples SET active = 0/, () => 1],
    ],
    { media: r2 },
  );
  const res = await trainingPost({ request: post('/api/hub/owner/team-training', { op: 'delete_example', id: 'trex_1' }), env });
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.deepEqual(r2.deleted, ['training/2026-08/a.jpg']);
});

test('delete_example still succeeds even if the R2 delete throws (best-effort, row is the source of truth)', async () => {
  const env = ownerEnv(
    [
      [/SELECT media_key FROM training_examples WHERE id = \?/, () => ({ media_key: 'training/x.jpg' })],
      [/UPDATE training_examples SET active = 0/, () => 1],
    ],
    { media: { get: async () => null, put: async () => {}, delete: async () => { throw new Error('R2 down'); } } },
  );
  const res = await trainingPost({ request: post('/api/hub/owner/team-training', { op: 'delete_example', id: 'trex_1' }), env });
  assert.equal(res.status, 200);
});

test('unknown op is rejected', async () => {
  const env = ownerEnv([]);
  const res = await trainingPost({ request: post('/api/hub/owner/team-training', { op: 'wat' }), env });
  assert.equal(res.status, 400);
});

// ---------- upload: magic-byte validation ----------

const JPEG_BYTES = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]).toString('base64');
const PNG_BYTES = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]).toString('base64');
const WEBP_BYTES = 'data:image/webp;base64,' + Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(200, 1)]).toString('base64');
const HEIC_BYTES = 'data:image/heic;base64,' + Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic'), Buffer.alloc(200, 1)]).toString('base64');

function uploadEnv() {
  const sess = JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_owner', la: Date.now(), created: Date.now() });
  return {
    SESSIONS: makeKV({ 'session:tok': sess }),
    DB: makeD1([[/^SELECT active FROM staff WHERE id=\?/, () => ({ active: 1 })]]),
    MEDIA: fakeR2(),
  };
}

test('a real JPEG is accepted regardless of the mime label — checked on bytes', async () => {
  const env = uploadEnv();
  const res = await uploadPost({ request: post('/api/hub/owner/team-training-upload', { data_url: JPEG_BYTES.replace('image/jpeg', 'image/png') }), env });
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.equal(d.content_type, 'image/jpeg', 'the sniffed type wins, not the claimed one');
  assert.match(d.media_key, /^training\//);
});

test('PNG is accepted (unlike the JPEG-only social-upload.js)', async () => {
  const res = await uploadPost({ request: post('/api/hub/owner/team-training-upload', { data_url: PNG_BYTES }), env: uploadEnv() });
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.equal(d.content_type, 'image/png');
});

test('WebP is accepted', async () => {
  const res = await uploadPost({ request: post('/api/hub/owner/team-training-upload', { data_url: WEBP_BYTES }), env: uploadEnv() });
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.equal(d.content_type, 'image/webp');
});

test('a mislabeled non-image is rejected even if the data URL claims image/jpeg', async () => {
  const notAnImage = 'data:image/jpeg;base64,' + Buffer.from('this is definitely not image bytes, just text').toString('base64');
  const res = await uploadPost({ request: post('/api/hub/owner/team-training-upload', { data_url: notAnImage }), env: uploadEnv() });
  assert.equal(res.status, 400);
});

test('HEIC gets the specific "share as JPEG" guidance, not a generic error', async () => {
  const res = await uploadPost({ request: post('/api/hub/owner/team-training-upload', { data_url: HEIC_BYTES }), env: uploadEnv() });
  const d = await res.json();
  assert.match(d.error, /HEIC/);
  assert.match(d.error, /Copy Photo/);
});

test('an oversized file is rejected with the size named', async () => {
  const big = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(9 * 1024 * 1024, 1)]).toString('base64');
  const res = await uploadPost({ request: post('/api/hub/owner/team-training-upload', { data_url: big }), env: uploadEnv() });
  const d = await res.json();
  assert.equal(res.status, 400);
  assert.match(d.error, /MB/);
});

test('a missing MEDIA binding fails clearly rather than silently no-opping', async () => {
  const env = uploadEnv();
  delete env.MEDIA;
  const res = await uploadPost({ request: post('/api/hub/owner/team-training-upload', { data_url: JPEG_BYTES }), env });
  assert.equal(res.status, 500);
});

// ---------- schema ----------

test('migration defines both tables with active + created_by/created_at/updated_at', () => {
  assert.match(MIG, /CREATE TABLE IF NOT EXISTS training_rules/);
  assert.match(MIG, /CREATE TABLE IF NOT EXISTS training_examples/);
  assert.match(MIG, /flag\s+TEXT NOT NULL DEFAULT 'good' CHECK \(flag IN \('good','bad'\)\)/);
});
