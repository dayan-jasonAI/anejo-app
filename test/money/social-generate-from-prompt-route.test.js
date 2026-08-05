// "Generate image of a single prompt" — the owner's own words for the gap this closes: the HUB
// could only ever generate a cover FROM a post's own caption/image_brief (the food-first repair)
// or restyle one of the 8 staged bowl photos (the reference-variant tool). There was no control
// where the owner just types a description and gets a picture.
//
// This drives the SAME `generate_cover` op — extended, not duplicated (see social.js's header
// note on that op) — with the new `prompt` field, and proves three things a source match alone
// cannot: the branch is REACHABLE through the real route (same lesson as
// social-generate-cover-route.test.js's own header), it never requires or touches a post (no
// postId, no DB row needed), and it never attaches anything — the caller gets back a bare
// media_key to preview, same contract as generate_reference_variant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/hub/owner/social.js';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);

function env({ ai = true } = {}) {
  const kv = new Map([['session:tok', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'o@t', la: Date.now(), created: Date.now() })]]);
  const rows = { media: [], inserted: [], postUpdates: [] };
  const db = {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...a) {
          return {
            async first() {
              if (q.includes('SELECT active FROM staff')) return { active: 1 };
              // No post lookup should ever fire in prompt mode — returning a row here would
              // mean the branch fell through to the postId path instead of short-circuiting.
              if (q.includes('FROM social_posts WHERE id')) { rows.postLookedUp = true; return null; }
              return null;
            },
            async all() { return { results: [] }; },
            async run() {
              if (q.startsWith('INSERT INTO social_post_media')) rows.inserted.push({ id: a[0], media_key: a[2] });
              else if (q.startsWith('UPDATE social_posts')) rows.postUpdates.push({ sql: q, args: a });
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  return {
    DB: db, _rows: rows,
    MEDIA: { put: async () => {} },
    ...(ai ? { AI: { run: async () => new Response(JPEG) } } : {}),
    IMAGE_PROVIDER_ORDER: 'workers_ai',
    SESSIONS: { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, v); }, async delete(k) { kv.delete(k); } },
  };
}

const post = (e, body, cookie = 'anejo_sess=tok') => onRequestPost({
  env: e,
  request: new Request('https://x.test/api/hub/owner/social', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
  }),
});

test('a typed prompt reaches the provider chain and returns an unattached preview key', async () => {
  const e = env();
  const r = await post(e, { op: 'generate_cover', prompt: 'FUEGO bowl on a rustic wood table, morning light' });
  const out = await r.json();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.ok(out.media_key, 'must hand back a key the owner can preview');
  assert.equal(out.provider, 'workers_ai');
  assert.deepEqual(e._rows.inserted, [], 'never attached to any post — the owner previews then chooses');
  assert.deepEqual(e._rows.postUpdates, []);
  assert.ok(!e._rows.postLookedUp, 'a standalone prompt must never require a post row to exist');
});

test('an id may ride along with a prompt — it is simply unused, never a post lookup', async () => {
  const e = env();
  const r = await post(e, { op: 'generate_cover', id: 'sp_some_draft', prompt: 'RAÍZ bowl, slate board, soft light' });
  const out = await r.json();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.ok(!e._rows.postLookedUp, 'prompt mode short-circuits before the postId branch ever runs');
});

test('blank prompt falls through to the ordinary postId-required repair flow, unchanged', async () => {
  const e = env();
  const r = await post(e, { op: 'generate_cover', prompt: '   ' });
  const out = await r.json();
  assert.equal(r.status, 400);
  assert.match(out.error, /missing id/i);
});

test('every provider unavailable in prompt mode returns an actionable reason, still unattached', async () => {
  const e = env({ ai: false });
  const r = await post(e, { op: 'generate_cover', prompt: 'a bowl, studio light' });
  const out = await r.json();
  assert.equal(r.status, 502, 'a provider outage is not the owner’s mistake');
  assert.match(out.error, /budget|provider/i);
  assert.deepEqual(e._rows.inserted, []);
});

test('an unauthenticated request never reaches the provider chain', async () => {
  const e = env();
  const r = await post(e, { op: 'generate_cover', prompt: 'a bowl on a table' }, '');
  assert.equal(r.status, 401);
  assert.deepEqual(e._rows.inserted, []);
});
