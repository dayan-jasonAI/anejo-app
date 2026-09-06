// Private catering design uploads: real bytes in R2, relationship metadata in D1, never a public URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../../functions/api/catering-uploads.js';

const PAGE = readFileSync(new URL('../../public/catering.html', import.meta.url), 'utf8');
const HUB = readFileSync(new URL('../../public/hub/owner/catering.html', import.meta.url), 'utf8');
const DOWNLOAD = readFileSync(new URL('../../functions/api/hub/owner/catering-attachments/[id].js', import.meta.url), 'utf8');
const MIGRATION = readFileSync(new URL('../../migrations/0097_catering_request_attachments.sql', import.meta.url), 'utf8');

function fixture() {
  const sessions = new Map();
  const attachments = [];
  const objects = new Map();
  const DB = {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async run() {
          if (/INSERT INTO catering_upload_sessions/.test(q)) {
            sessions.set(args[0], { id: args[0], created_at: args[1], expires_at: args[2], claimed_lead_id: null });
            return { meta: { changes: 1 } };
          }
          if (/INSERT INTO catering_attachments/.test(q)) {
            attachments.push({ id: args[0], session_id: args[1], slot: args[2], r2_key: args[3], filename: args[4], content_type: args[5], byte_size: args[6] });
            return { meta: { changes: 1 } };
          }
          throw new Error('Unrouted run: ' + q);
        },
        async first() {
          if (/FROM catering_upload_sessions WHERE id=/.test(q)) return sessions.get(args[0]) || null;
          if (/COUNT\(\*\) AS n FROM catering_attachments/.test(q)) return { n: attachments.filter((a) => a.session_id === args[0]).length };
          throw new Error('Unrouted first: ' + q);
        },
      };
      return statement;
    },
  };
  const MEDIA = {
    async put(key, body, options) { objects.set(key, { body: new Uint8Array(body), options }); },
    async delete(key) { objects.delete(key); },
  };
  return { env: { DB, MEDIA }, sessions, attachments, objects };
}

async function createSession(env) {
  const response = await onRequestPost({
    env,
    request: new Request('https://anejocateringco.com/api/catering-uploads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'create' }),
    }),
  });
  return { response, body: await response.json() };
}

test('a private upload session accepts a real PDF and stores no public URL', async () => {
  const f = fixture();
  const started = await createSession(f.env);
  assert.equal(started.response.status, 200);
  assert.match(started.body.session_id, /^cup_[0-9a-f]{20}$/);

  const bytes = new TextEncoder().encode('%PDF-1.7\nprivate design brief');
  const uploaded = await onRequestPost({
    env: f.env,
    request: new Request('https://anejocateringco.com/api/catering-uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/pdf',
        'X-Upload-Session': started.body.session_id,
        'X-File-Name': encodeURIComponent('Fiesta ideas.pdf'),
      },
      body: bytes,
    }),
  });
  const out = await uploaded.json();
  assert.equal(uploaded.status, 200);
  assert.equal(out.filename, 'Fiesta ideas.pdf');
  assert.equal(out.content_type, 'application/pdf');
  assert.equal(out.url, undefined, 'the public response never exposes a media URL');
  assert.equal(f.attachments.length, 1);
  assert.match(f.attachments[0].r2_key, /^catering-requests\/\d{4}-\d{2}\/cup_[0-9a-f]+\/cat_[0-9a-f]+\.pdf$/);
  assert.equal(f.objects.size, 1);
});

test('magic bytes reject a file that only claims to be a PNG', async () => {
  const f = fixture();
  const started = await createSession(f.env);
  const uploaded = await onRequestPost({
    env: f.env,
    request: new Request('https://anejocateringco.com/api/catering-uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', 'X-Upload-Session': started.body.session_id, 'X-File-Name': 'fake.png' },
      body: new TextEncoder().encode('not actually an image'),
    }),
  });
  assert.equal(uploaded.status, 400);
  assert.match((await uploaded.json()).error, /contents did not match/i);
  assert.equal(f.objects.size, 0);
});

test('the browser, database, and owner-only download path are wired together', () => {
  assert.match(PAGE, /id="design-files"[^>]+multiple/);
  assert.match(PAGE, /up to 5 private PDF, JPG, or PNG files, 10MB each/i);
  assert.match(PAGE, /fetch\('\/api\/catering-uploads'/);
  assert.match(PAGE, /upload_session_id/);
  assert.match(MIGRATION, /CREATE TABLE IF NOT EXISTS catering_attachments/);
  assert.match(MIGRATION, /UNIQUE\(session_id, slot\)/);
  assert.match(DOWNLOAD, /requireRole\(request, env, \['owner'\]\)/);
  assert.match(DOWNLOAD, /Cache-Control': 'private, no-store'/);
  assert.match(HUB, /Private design files · owner only/);
  assert.match(HUB, /catering-attachments/);
});
