import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost as upload, onRequestGet as library } from '../../functions/api/hub/owner/marketing-library.js';
import { onRequestPost as social } from '../../functions/api/hub/owner/social.js';
import { onRequestPost as saveRender } from '../../functions/api/hub/owner/marketing-branded-save.js';
import { auditSavedDraft, SOCIAL_AUDIT_CURRENT } from '../../functions/_lib/social_audit.js';
import { sha256 } from '../../functions/_lib/marketing_render_receipt.js';
import { VERSION } from '../../functions/_lib/visual_audit_rubric.js';
import { initialize } from '../../tools/marketing-render-prototype/core.mjs';
import { renderEditorial } from '../../tools/marketing-render-prototype/editorial.mjs';

// A continuous LOCAL handler rehearsal. resvg produces actual pixels, but its
// documented deviations do not establish production Canvas parity. OWNER_COOKIE
// is fixture authority: this cannot prove a human inspected or approved a preview.
const asset = name => new Uint8Array(readFileSync(new URL('../../tools/marketing-render-prototype/' + name, import.meta.url)));
const request = (path, body) => new Request('https://anejo.test' + path, {
  method: body === undefined ? 'GET' : 'POST',
  headers: { cookie: OWNER_COOKIE, 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
async function result(handler, env, path, body) {
  const response = await handler({ env, request: request(path, body) });
  const value = await response.json();
  assert.equal(response.status, 200, JSON.stringify(value));
  assert.equal(value.ok, true);
  return value;
}
const post = (env, body) => result(social, env, '/api/hub/owner/social', body);

function storage() {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes, options = {}) {
      objects.set(key, { bytes: new Uint8Array(bytes).slice(), metadata: { ...options.customMetadata } });
    },
    async get(key) {
      const object = objects.get(key);
      return object ? { size: object.bytes.length, customMetadata: { ...object.metadata }, arrayBuffer: async () => object.bytes.slice().buffer } : null;
    },
    async list({ prefix }) {
      return { objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, size: object.bytes.length, customMetadata: { ...object.metadata } })), truncated: false };
    },
  };
}

for (const available of [true, false]) test('continuous local library/render/audit/manual schedule flow: audit ' + (available ? 'stubbed pass' : 'unavailable'), async t => {
  const outbound = [];
  t.mock.method(globalThis, 'fetch', async url => { outbound.push(String(url)); throw Error('Outbound fetch forbidden in local rehearsal'); });
  await initialize(asset('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
  const media = storage(), env = ownerEnv({ MEDIA: media });
  t.after(() => env.DB.sqlite.close());
  const trustBefore = env.DB.rows('SELECT * FROM trust_ledger ORDER BY category');
  const original = asset('assets/source.jpg'), caption = 'Your Cajita.';
  const uploaded = await result(upload, env, '/api/hub/owner/marketing-library', {
    name: 'Local rehearsal source', folder: 'Internal QA', tags: ['qa'],
    data_url: 'data:image/jpeg;base64,' + Buffer.from(original).toString('base64'),
  });
  const sourceKey = uploaded.photo.media_key;
  const listed = await result(library, env, '/api/hub/owner/marketing-library');
  assert.deepEqual(listed.photos.map(photo => photo.media_key), [sourceKey]);
  assert.deepEqual(media.objects.get(sourceKey).bytes, original);
  const draft = await post(env, { op: 'draft', caption, media_key: sourceKey });
  assert.equal(draft.status, 'draft');
  const slide = env.DB.one('SELECT * FROM social_post_media WHERE post_id=?', draft.id);
  const rendered = renderEditorial({ source: original, emblem: asset('assets/emblem.png'), font: asset('assets/AnejoEditorialSerif-SemiBold.ttf'), kickerFont: asset('assets/AnejoEditorialSans-Medium.ttf'), title: caption, kicker: 'AÑEJO CATERING', templateId: 'reposado-cajita' });
  assert.equal(rendered.visualReviewRequired, true);
  assert.equal(rendered.pixelVerification, 'unverified');
  assert.ok(rendered.deviations.length > 0);
  assert.notDeepEqual(rendered.jpg, original);
  const saved = await result(saveRender, env, '/api/hub/owner/marketing-branded-save', {
    request_id: '12345678-1234-4123-8123-123456789abc', post_id: draft.id, media_id: slide.id,
    source_key: sourceKey, source_sha256: await sha256(original),
    data_url: 'data:image/jpeg;base64,' + Buffer.from(rendered.jpg).toString('base64'),
    declaration: { renderer_version: 'local-resvg-rehearsal-v1', template_id: 'reposado-cajita', options: { title: caption }, layout: { capture: 'local_resvg', pixel_verification: 'unverified' } },
  });
  assert.equal(saved.attached, true);
  assert.equal(saved.evidence_tier, 'browser_declared');
  assert.deepEqual(media.objects.get(saved.media_key).bytes, rendered.jpg);
  const receipt = env.DB.one('SELECT * FROM marketing_render_receipts WHERE id=?', saved.receipt_id);
  assert.equal(receipt.state, 'attached');
  assert.equal(receipt.actor_id, 'stf_owner');
  assert.equal(receipt.source_key, sourceKey);
  assert.equal(receipt.source_sha256, await sha256(original));
  assert.equal(receipt.output_sha256, await sha256(rendered.jpg));
  let judges = 0;
  const audit = await auditSavedDraft(env, draft.id, caption, async (_env, input) => {
    judges++;
    assert.equal(input.caption, caption);
    assert.equal(input.images.length, 1);
    const image = input.images[0], source = image.sourceReceipt;
    assert.deepEqual(Buffer.from(image.data, 'base64'), Buffer.from(rendered.jpg));
    assert.equal(source.sha256, receipt.output_sha256);
    assert.equal(source.render_receipt_status, 'browser_declared_bytes_matched');
    assert.equal(source.unreviewed_render.receipt_id, receipt.id);
    assert.equal(source.unreviewed_render.source_sha256, receipt.source_sha256);
    assert.equal(source.design_facts, null);
    return { brand_score: available ? 97 : null, verdict: available ? 'pass' : 'flag', flags: available ? [] : [{ type: 'audit_unavailable', detail: 'Explicit local provider-unavailable fixture' }], rubric_version: VERSION, input_coverage: { slide_sources: [{ slide: 1, ...source }] } };
  });
  assert.equal(judges, 1);
  assert.equal(audit.ok, true);
  assert.equal(audit.visual_review_required, true);
  const reviewed = env.DB.one(`SELECT *, ${SOCIAL_AUDIT_CURRENT} AS audit_current FROM social_posts WHERE id=?`, draft.id);
  assert.equal(reviewed.status, 'draft');
  assert.equal(reviewed.scheduled_at, null);
  assert.equal(reviewed.audit_score, available ? 97 : null);
  assert.equal(reviewed.audit_scope, available ? 'caption_and_media' : 'unavailable');
  assert.equal(reviewed.audit_status, available ? 'pass' : 'flag');
  assert.equal(reviewed.audit_current, 1);
  const reviewSlides = env.DB.rows('SELECT * FROM social_post_media WHERE post_id=? ORDER BY seq', draft.id);
  assert.equal(reviewSlides.length, 1);
  assert.equal(reviewSlides[0].id, slide.id);
  assert.equal(reviewSlides[0].media_key, saved.media_key);
  // Manual scheduling accepts an unavailable audit today. This tests that policy;
  // it does not convert unavailable evidence or a stubbed pass into human review.
  const when = Date.now() + 3600000;
  const scheduled = await post(env, { op: 'schedule', id: draft.id, caption: reviewed.caption, expected_caption: reviewed.caption, scheduled_at: when });
  assert.equal(scheduled.status, 'scheduled');
  let row = env.DB.one('SELECT * FROM social_posts WHERE id=?', draft.id);
  assert.equal(row.scheduled_at, when);
  assert.equal(row.auto_audit_required, null);
  assert.equal(row.ig_media_id, null);
  assert.equal(row.permalink, null);
  assert.equal(row.published_at, null);
  assert.deepEqual(env.DB.rows('SELECT * FROM trust_ledger ORDER BY category'), trustBefore);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_trust_approvals').n, 0);
  await post(env, { op: 'edit', id: draft.id, caption: 'Locally edited caption', expected_caption: caption });
  row = env.DB.one('SELECT * FROM social_posts WHERE id=?', draft.id);
  assert.equal(row.status, 'draft');
  for (const field of ['scheduled_at', 'audit_score', 'audit_status', 'audit_snapshot', 'audit_detail_json']) assert.equal(row[field], null, field);
  for (const op of ['schedule', 'edit']) {
    const response = await social({ env, request: request('/api/hub/owner/social', { op, id: draft.id, caption: 'Stale replacement', expected_caption: caption, scheduled_at: when }) });
    assert.equal(response.status, 409);
  }
  assert.equal(env.DB.one('SELECT caption FROM social_posts WHERE id=?', draft.id).caption, 'Locally edited caption');
  assert.deepEqual(media.objects.get(sourceKey).bytes, original);
  assert.equal(media.objects.size, 2);
  assert.deepEqual(outbound, []);
});
