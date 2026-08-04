// The "Reference variant" tool must actually REACH its handler.
//
// social-generate-cover-route.test.js and social-food-photo.test.js established why this class of
// test exists: a source-text match proves an op's code is PRESENT, never that a request can get to
// it (see contract-owner-ops-reachable.test.js — three broken surfaces shipped green behind an
// argument guard while their tests passed). So this file drives functions/api/hub/owner/social.js
// itself, with a real signed-in owner session, exactly as the HUB calls it — and, distinctly from
// generate_cover, proves the op NEVER attaches the image it makes: the owner previews and commits
// via the ordinary 'attach' op, same posture as the branding tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onRequestPost, onRequestGet } from '../../functions/api/hub/owner/social.js';

function makeMedia(objects = {}) {
  const puts = [];
  return {
    async get(key) {
      const obj = objects[key];
      if (!obj) return null;
      return { async arrayBuffer() { return obj.bytes.buffer; }, httpMetadata: { contentType: obj.contentType || 'image/jpeg' } };
    },
    async put(key, body, opts) { puts.push({ key, body, opts }); },
    _puts: puts,
  };
}

function env({ post, media = [], openai = true, refBytes } = {}) {
  const kv = new Map([['session:tok', JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_1', email: 'o@t', la: Date.now(), created: Date.now() })]]);
  const rows = { media: media.map((m) => ({ ...m })) };
  const db = {
    prepare(sql) {
      const q = sql.replace(/\s+/g, ' ').trim();
      return {
        bind() {
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
            async run() { return { meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
  return {
    DB: db, _rows: rows,
    MEDIA: makeMedia({ 'studio/bowls/coco.jpg': { bytes: refBytes || new Uint8Array([1, 2, 3, 4]), contentType: 'image/jpeg' } }),
    ...(openai ? { OPENAI_API_KEY: 'sk-test' } : {}),
    SESSIONS: { async get(k) { return kv.get(k) || null; }, async put(k, v) { kv.set(k, v); }, async delete(k) { kv.delete(k); } },
  };
}

const post = (e, body, cookie = 'anejo_sess=tok') => onRequestPost({
  env: e,
  request: new Request('https://x.test/api/hub/owner/social', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body),
  }),
});

const get = (e, cookie = 'anejo_sess=tok') => onRequestGet({
  env: e,
  request: new Request('https://x.test/api/hub/owner/social', { headers: { Cookie: cookie } }),
});

function withFetch(handler, fn) {
  const real = global.fetch;
  global.fetch = handler;
  return Promise.resolve(fn()).finally(() => { global.fetch = real; });
}
function openaiOk() {
  return new Response(JSON.stringify({ data: [{ b64_json: 'AAAA' }] }), { status: 200 });
}

test('generate_reference_variant is REACHABLE and makes a JPEG, but does NOT attach it to the post', async () => {
  const e = env({ post: { status: 'draft' } });
  const out = await withFetch(
    () => openaiOk(),
    () => post(e, { op: 'generate_reference_variant', id: 'sp_1', bowl: 'coco', look: 'beach picnic, golden hour' })
  ).then((r) => r.json());
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.match(out.media_key, /_photo\.jpg$/);
  assert.equal(out.provider, 'openai');
  assert.equal(out.source_bowl, 'coco');
  assert.deepEqual(e._rows.media, [], 'NOT attached — the caller previews it and attaches explicitly, same as the branding tool');
});

test('bad_bowl is refused by name — not one of the 8 known bowls', async () => {
  const e = env({ post: { status: 'draft' } });
  const r = await post(e, { op: 'generate_reference_variant', id: 'sp_1', bowl: 'burrito', look: 'sunset' });
  const out = await r.json();
  assert.equal(r.status, 400);
  assert.match(out.error, /eight Añejo bowls/i);
});

test('no_look is refused before any provider is ever called', async () => {
  const e = env({ post: { status: 'draft' } });
  const r = await withFetch(
    () => { throw new Error('must not fetch — nothing to vary the surroundings to'); },
    () => post(e, { op: 'generate_reference_variant', id: 'sp_1', bowl: 'coco', look: '' })
  );
  const out = await r.json();
  assert.equal(r.status, 400);
  assert.match(out.error, /campaign look/i);
});

test('a live post is refused — its slides are the public record of what went out', async () => {
  const e = env({ post: { status: 'published' } });
  const r = await withFetch(
    () => { throw new Error('must not fetch — a published post is refused before generating anything'); },
    () => post(e, { op: 'generate_reference_variant', id: 'sp_1', bowl: 'coco', look: 'sunset' })
  );
  assert.equal(r.status, 409);
});

test('a full carousel is refused before spending anything', async () => {
  const media = Array.from({ length: 10 }, (_, i) => ({ id: 'm' + i, seq: i, media_key: 'studio/x_' + i + '.jpg', public_token: 't' + i }));
  const e = env({ post: { status: 'draft' }, media });
  const r = await withFetch(
    () => { throw new Error('must not fetch — the carousel is already full'); },
    () => post(e, { op: 'generate_reference_variant', id: 'sp_1', bowl: 'coco', look: 'sunset' })
  );
  const out = await r.json();
  assert.equal(r.status, 409);
  assert.match(out.error, /10 photos/i);
});

test('the bowl not being staged in R2 is refused by name — never a generic failure', async () => {
  const e = env({ post: { status: 'draft' } });
  const r = await post(e, { op: 'generate_reference_variant', id: 'sp_1', bowl: 'mar', look: 'sunset' }); // 'mar' not staged in this fixture
  const out = await r.json();
  assert.equal(r.status, 404);
  assert.match(out.error, /not staged/i);
});

test('every reference-capable provider unavailable returns a reason the owner can act on', async () => {
  const e = env({ post: { status: 'draft' }, openai: false }); // no OPENAI_API_KEY, no GEMINI_API_KEY, no AI binding used for reference
  const r = await post(e, { op: 'generate_reference_variant', id: 'sp_1', bowl: 'coco', look: 'sunset' });
  const out = await r.json();
  assert.equal(r.status, 502);
  assert.match(out.error, /Gemini|budget|unreachable/i);
});

test('an unauthenticated request never reaches any of it', async () => {
  const e = env({ post: { status: 'draft' } });
  const r = await withFetch(
    () => { throw new Error('must not fetch — unauthenticated'); },
    () => post(e, { op: 'generate_reference_variant', id: 'sp_1', bowl: 'coco', look: 'sunset' }, '')
  );
  assert.equal(r.status, 401);
});

// ---------------------------------------------------------------------------
// GET: the bowl picker's data source, and the plain honesty line's config surface
// ---------------------------------------------------------------------------

test('GET exposes the 8 bowls for the picker and whether Gemini is configured — no client-side duplicate list', async () => {
  const e = env({ post: null });
  const r = await get(e);
  const out = await r.json();
  assert.equal(out.reference_bowls.length, 8);
  assert.ok(out.reference_bowls.some((b) => b.key === 'raiz' && b.label === 'RAÍZ'));
  assert.equal(out.reference_gemini_configured, false);
});
