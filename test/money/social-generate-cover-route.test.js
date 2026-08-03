// The "Generate a food photo" button must actually REACH its handler.
//
// social-food-photo.test.js proves the food-first repair works as a function, and pins the op's
// existence with `assert.match(API, /op === 'generate_cover'/)`. That is the exact shape of test
// that let three broken surfaces ship green on 2026-08-03 (see contract-owner-ops-reachable.test.js
// and DEPLOY_CHECKLIST.md §0.9): a source match proves code is PRESENT, never that a request can
// get to it. The owner's roster ops were unreachable for a week behind an argument guard while
// their tests passed.
//
// So this file drives functions/api/hub/owner/social.js itself, with a real signed-in owner
// session, exactly as the HUB calls it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost } from '../../functions/api/hub/owner/social.js';

// One JPEG-returning provider (Workers AI is the only one in the chain that natively does), so
// the requireJpeg gate in plate_image.js is satisfied the same way it is in production.
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);

function env({ post, media = [], ai = true } = {}) {
  const kv = new Map([['session:tok', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'o@t', la: Date.now(), created: Date.now() })]]);
  const rows = { media: media.map((m) => ({ ...m })), inserted: [], seqWrites: [], postUpdates: [] };
  const db = {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      return {
        bind(...a) {
          return {
            async first() {
              if (q.includes('SELECT active FROM staff')) return { active: 1 };
              if (q.includes('FROM social_posts WHERE id')) return post || null;
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
                const row = { id: a[0], seq: -1, media_key: a[2], public_token: a[3], origin: /origin/.test(q) ? a[5] : null };
                rows.media.push(row); rows.inserted.push(row);
              } else if (q.startsWith('UPDATE social_post_media SET seq=?')) {
                const r = rows.media.find((m) => m.id === a[1]); if (r) r.seq = a[0];
                rows.seqWrites.push({ id: a[1], seq: a[0] });
              } else if (q.startsWith('UPDATE social_posts')) {
                rows.postUpdates.push({ sql: q, args: a });
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

const CARDS = [
  { id: 'm1', seq: 0, media_key: 'studio/2026-07/series/p4_rule.jpg', public_token: 't1' },
  { id: 'm2', seq: 1, media_key: 'studio/2026-07/series/p4_hook.jpg', public_token: 't2' },
  { id: 'm3', seq: 2, media_key: 'studio/2026-07/series/p4_cta.jpg', public_token: 't3' },
];

test('generate_cover is REACHABLE and attaches a food photo as slide 1', async () => {
  const e = env({
    post: { status: 'draft', caption: 'Every Añejo bowl targets 40/30/30 protein carbs fat', image_brief: 'a fuego bowl in daylight' },
    media: CARDS,
  });
  const out = await (await post(e, { op: 'generate_cover', id: 'sp_p4' })).json();
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.match(out.media_key, /_photo\.jpg$/, 'the guard reads the role suffix — without it the warning survives its own fix');
  const order = e._rows.media.slice().sort((a, b) => a.seq - b.seq).map((m) => m.media_key);
  assert.equal(order[0], out.media_key, 'Instagram’s grid shows only slide 1');
  assert.deepEqual(order.slice(1), CARDS.map((c) => c.media_key), 'the text cards keep their order behind it');
  assert.equal(e._rows.inserted[0].origin, 'ai_generated', 'badged, so a placeholder is never taken for real photography');
});

test('the route NEVER advances the post — attaching an image is not approval', async () => {
  const e = env({ post: { status: 'draft', caption: 'x'.repeat(40), image_brief: 'a raiz bowl' }, media: CARDS });
  await post(e, { op: 'generate_cover', id: 'sp_p4' });
  for (const u of e._rows.postUpdates) {
    assert.ok(!/status\s*=/i.test(u.sql), `must not write status: ${u.sql}`);
  }
});

test('a live post is refused — its slides are the public record of what went out', async () => {
  const e = env({ post: { status: 'published', caption: 'x'.repeat(40), image_brief: 'a mar bowl' }, media: CARDS });
  const r = await post(e, { op: 'generate_cover', id: 'sp_p4' });
  assert.equal(r.status, 409);
  assert.deepEqual(e._rows.inserted, [], 'and nothing is generated — that would be paid-for waste');
});

test('a post that already has a photo is refused by NAME, not silently', async () => {
  const e = env({
    post: { status: 'draft', caption: 'x'.repeat(40), image_brief: 'a coco bowl' },
    media: [...CARDS, { id: 'm4', seq: 3, media_key: 'studio/2026-07/series/p4_photo.jpg', public_token: 't4' }],
  });
  const r = await post(e, { op: 'generate_cover', id: 'sp_p4' });
  const out = await r.json();
  assert.equal(r.status, 409);
  assert.match(out.error, /already has a food photo/i, 'the owner must be told why, not just refused');
  assert.deepEqual(e._rows.inserted, []);
});

test('every provider unavailable returns a reason the owner can act on', async () => {
  const e = env({ post: { status: 'draft', caption: 'x'.repeat(40), image_brief: 'a ligero bowl' }, media: CARDS, ai: false });
  const r = await post(e, { op: 'generate_cover', id: 'sp_p4' });
  const out = await r.json();
  // bad() answers with { error } and no `ok` field — asserting ok:false here passed on a
  // response that never existed. Check what the route actually returns.
  assert.equal(r.status, 502, 'a provider outage is not the owner’s mistake — do not answer 400');
  assert.match(out.error, /budget|provider|Upload a real photo/i, 'the message must name a next move');
  assert.deepEqual(e._rows.inserted, [], 'the post keeps the exact state it already had');
});

test('an unauthenticated request never reaches any of it', async () => {
  const e = env({ post: { status: 'draft', caption: 'x'.repeat(40), image_brief: 'a vida bowl' }, media: CARDS });
  const r = await post(e, { op: 'generate_cover', id: 'sp_p4' }, '');
  assert.equal(r.status, 401);
  assert.deepEqual(e._rows.inserted, []);
});
