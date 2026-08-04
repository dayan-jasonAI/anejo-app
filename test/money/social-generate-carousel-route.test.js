// The "Generate the rest of a carousel" control must actually REACH its handler.
//
// social-generate-cover-route.test.js pins the same lesson for generate_cover: a source match
// proves the op exists, never that a real signed-in request can get to it. This file drives
// functions/api/hub/owner/social.js itself for the `generate_carousel` op, exactly as the HUB
// calls it, so a future refactor that quietly detaches the route from its handler fails HERE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/hub/owner/social.js';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);

function env({ post, media = [], ai = true } = {}) {
  const kv = new Map([['session:tok', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'o@t', la: Date.now(), created: Date.now() })]]);
  const rows = { media: media.map((m) => ({ ...m })), inserted: [], postUpdates: [], provenance: [] };
  const db = {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...a) {
          return {
            async first() {
              if (q.includes('SELECT active FROM staff')) return { active: 1 };
              if (q.includes('SELECT status, caption, image_brief FROM social_posts WHERE id')) return post || null;
              if (q.includes('FROM ai_spend WHERE week')) return { c: 0 };
              return null;
            },
            async all() {
              if (q.includes('FROM social_post_media WHERE post_id')) {
                return { results: rows.media.slice().sort((x, y) => x.seq - y.seq).map((r) => ({ ...r })) };
              }
              return { results: [] };
            },
            async run() {
              if (q.startsWith('INSERT INTO social_post_media')) {
                const row = { id: a[0], seq: a[2], media_key: a[3], public_token: a[4], origin: /origin/.test(q) ? a[6] : null };
                rows.media.push(row); rows.inserted.push(row);
              } else if (q.startsWith('UPDATE social_posts')) {
                rows.postUpdates.push({ sql: q, args: a });
              } else if (q.startsWith('INSERT INTO post_provenance')) {
                rows.provenance.push({ sql: q, args: a });
              }
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

test('generate_carousel is REACHABLE and appends slides up to the requested count', async () => {
  const e = env({
    post: { status: 'draft', caption: 'Every Añejo bowl targets 40/30/30 protein carbs fat', image_brief: 'a fuego bowl in daylight' },
    media: [{ id: 'm1', seq: 0, media_key: 'studio/2026-07/p1_photo.jpg', public_token: 't1' }],
  });
  const r = await post(e, { op: 'generate_carousel', id: 'sp1', count: 4 });
  const out = await r.json();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.added, 3);
  assert.equal(out.slides, 4);
  assert.equal(e._rows.media.length, 4);
  // The original owner/generated slide 0 is exactly where it was.
  assert.equal(e._rows.media.find((m) => m.id === 'm1').media_key, 'studio/2026-07/p1_photo.jpg');
});

test('the route never advances the post — generating slides is not approval', async () => {
  const e = env({
    post: { status: 'draft', caption: 'x'.repeat(40), image_brief: 'a raiz bowl' },
    media: [],
  });
  await post(e, { op: 'generate_carousel', id: 'sp1', count: 3 });
  for (const u of e._rows.postUpdates) {
    assert.ok(!/status\s*=/i.test(u.sql), `must not write status: ${u.sql}`);
  }
});

test('a live post is refused — its slides are the public record of what went out', async () => {
  const e = env({ post: { status: 'published', caption: 'x'.repeat(40), image_brief: 'a mar bowl' }, media: [] });
  const r = await post(e, { op: 'generate_carousel', id: 'sp1', count: 4 });
  assert.equal(r.status, 409);
  assert.deepEqual(e._rows.inserted, []);
});

test('an out-of-range count is refused before any provider call runs', async () => {
  const e = env({ post: { status: 'draft', caption: 'x'.repeat(40), image_brief: 'a coco bowl' }, media: [] });
  const r = await post(e, { op: 'generate_carousel', id: 'sp1', count: 25 });
  assert.equal(r.status, 400);
  const out = await r.json();
  assert.match(out.error, /between 2 and/i);
  assert.deepEqual(e._rows.inserted, []);
});

test('every provider unavailable answers 502 with a reason the owner can act on', async () => {
  const e = env({ post: { status: 'draft', caption: 'x'.repeat(40), image_brief: 'a ligero bowl' }, media: [], ai: false });
  const r = await post(e, { op: 'generate_carousel', id: 'sp1', count: 3 });
  const out = await r.json();
  assert.equal(r.status, 502);
  assert.match(out.error, /budget|provider/i);
  assert.deepEqual(e._rows.inserted, []);
});

test('an unauthenticated request never reaches any of it', async () => {
  const e = env({ post: { status: 'draft', caption: 'x'.repeat(40), image_brief: 'a vida bowl' }, media: [] });
  const r = await post(e, { op: 'generate_carousel', id: 'sp1', count: 3 }, '');
  assert.equal(r.status, 401);
  assert.deepEqual(e._rows.inserted, []);
});

test('a successful batch stamps carousel provenance (format + slide count)', async () => {
  const e = env({
    post: { status: 'draft', caption: 'x'.repeat(40), image_brief: 'a fuerza bowl' },
    media: [],
  });
  const r = await post(e, { op: 'generate_carousel', id: 'sp1', count: 3 });
  const out = await r.json();
  assert.equal(out.ok, true);
  assert.equal(e._rows.provenance.length, 1, 'stampPostProvenance must actually be called on success');
});
