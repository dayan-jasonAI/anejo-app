import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost as ideaPost } from '../../functions/api/hub/owner/operator-brief.js';
import { onRequestPost as previewPost, onRequestPatch as previewPatch } from '../../functions/api/hub/owner/operator-campaign-preview.js';
import { onRequestPost as promotePost } from '../../functions/api/hub/owner/operator-campaign-promote.js';
import { onRequestPost as upload } from '../../functions/api/hub/owner/marketing-library.js';
import { onRequestPost as register } from '../../functions/api/hub/owner/marketing-asset-registry.js';
import { onRequestPost as saveRender } from '../../functions/api/hub/owner/marketing-branded-save.js';
import { onRequestPost as social } from '../../functions/api/hub/owner/social.js';
import { currentPromotionAuthority } from '../../functions/_lib/operator_campaign_promotion.js';
import { inspectMarketingAsset } from '../../functions/_lib/marketing_asset_selection.js';
import { runAutomation } from '../../functions/_lib/automations.js';
import { auditSavedDraft, SOCIAL_AUDIT_CURRENT } from '../../functions/_lib/social_audit.js';
import { sha256 } from '../../functions/_lib/marketing_render_receipt.js';
import { VERSION } from '../../functions/_lib/visual_audit_rubric.js';
import { initialize } from '../../tools/marketing-render-prototype/core.mjs';
import { renderEditorial } from '../../tools/marketing-render-prototype/editorial.mjs';

// Continuous LOCAL handler/storage fixture, not live model obedience or human
// preview approval. Actual resvg pixels retain documented Canvas deviations.
const asset = name => new Uint8Array(readFileSync(new URL('../../tools/marketing-render-prototype/' + name, import.meta.url)));
function storage() {
 const objects = new Map();
 return { objects,
  async put(key, bytes, options = {}) { objects.set(key, { bytes: new Uint8Array(bytes).slice(), metadata: { ...options.customMetadata } }); },
  async get(key) { const object = objects.get(key); return object ? { size: object.bytes.length, customMetadata: { ...object.metadata }, arrayBuffer: async () => object.bytes.slice().buffer } : null; },
  async list({ prefix }) { return { objects: [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, object]) => ({ key, size: object.bytes.length, customMetadata: { ...object.metadata } })), truncated: false }; },
 };
}
const request = (path, body, method = 'POST') => new Request('https://anejo.test' + path, {
 method, headers: { cookie: OWNER_COOKIE, 'content-type': 'application/json' }, body: JSON.stringify(body),
});
async function invoke(handler, env, path, body, method) {
 const response = await handler({ env, request: request(path, body, method) });
 const value = await response.json(); assert.equal(response.status, 200, JSON.stringify(value)); assert.equal(value.ok, true); return value;
}

for (const available of [true, false]) test('continuous local reviewed strategy/photo/render/audit/manual schedule: judge ' + (available ? 'synthetic pass' : 'unavailable'), async t => {
 const media = storage(), env = ownerEnv({ MEDIA: media, ANTHROPIC_API_KEY: 'synthetic-only' });
 t.after(() => env.DB.sqlite.close());
 await env.SESSIONS.put('cfg:social_cadence', JSON.stringify({ feed_per_week: 1 }));
 env.DB.exec("UPDATE trust_ledger SET auto_publish=1,approved_clean=5 WHERE category='menu'");
 const trustBefore = env.DB.rows('SELECT * FROM trust_ledger ORDER BY category');
 const authority = await currentPromotionAuthority(env); assert.equal(authority.ok, true);
 const productId = authority.available_product_ids[0]; assert.ok(productId);
 const original = asset('assets/source.jpg'), originalHash = await sha256(original);
 await initialize(asset('node_modules/@resvg/resvg-wasm/index_bg.wasm'));
 const ownerWords = 'Use our existing food photograph for a private catering draft. Do not invent dates, capacity or coverage.';
 const generated = { title: 'Synthetic private campaign', objective: 'Prepare a reviewed draft', audience: 'Hosts considering catering', angle: 'Initial synthetic direction', cadence: 'One draft for review', success_metric: 'Qualified inquiries', channels: ['instagram'], product_ids: [productId], assets: [], assumptions: ['Capacity remains unverified.'], questions: ['Which date and city does the owner approve?'] };
 const reviewed = { ...generated, angle: ('Preserve full-frame food photography and exact owner wording. '.repeat(20)).slice(0,1084) };
 const caption = 'Your Cajita.';
 let stage = 'preview', briefId, requirements, plannerRequest;
 const outbound = [];
 t.mock.method(globalThis, 'fetch', async (url, options) => {
  outbound.push({ url: String(url), stage });
  assert.equal(String(url), 'https://api.anthropic.com/v1/messages');
  assert.equal(options.method, 'POST');
  const input = JSON.parse(options.body); let output;
  if (stage === 'preview') {
   assert.equal(outbound.length, 1); assert.equal(input.messages.at(-1).content, ownerWords); output = generated;
  } else if (stage === 'planner') {
   assert.equal(outbound.length, 2); assert.match(input.system, /You are the content writer/); plannerRequest = options.body;
   output = [{ caption, image_brief: 'Preserve the supplied photograph', day_offset: 0, hour: 12, category: 'menu', brief_id: briefId, intel_id: null, asset_requirements: requirements }];
   // Fixture-only key removal forces the planner's initial audit into explicit
   // unavailable review; only preview and caption inference receive synthetic output.
   delete env.ANTHROPIC_API_KEY; stage = 'forbidden';
  } else throw Error('All image, social and additional provider requests are forbidden');
  return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(output) }], usage: { input_tokens: 10, output_tokens: 10 } }));
 });
 const idea = await invoke(ideaPost, env, '/api/hub/owner/operator-brief', { request_id: '11111111-1111-4111-8111-111111111111', topic: ownerWords });
 assert.equal(idea.generated, false);
 assert.equal(env.DB.one('SELECT objective FROM operator_brief_ideas WHERE id=?', idea.brief.id).objective, ownerWords);
 const first = await invoke(previewPost, env, '/api/hub/owner/operator-campaign-preview', { request_id: '22222222-2222-4222-8222-222222222222', idea_id: idea.brief.id });
 const revision = await invoke(previewPatch, env, '/api/hub/owner/operator-campaign-preview', { request_id: '33333333-3333-4333-8333-333333333333', preview_id: first.preview.id, expected_proposal_sha256: first.preview.proposal_sha256, proposal: reviewed }, 'PATCH');
 const promoted = await invoke(promotePost, env, '/api/hub/owner/operator-campaign-promote', { request_id: '44444444-4444-4444-8444-444444444444', preview_id: revision.preview.id, expected_proposal_sha256: revision.preview.proposal_sha256, acknowledge_open_questions: true });
 briefId = promoted.brief_id;
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n, 0);
 assert.equal(outbound.length, 1);
 const promotion = env.DB.one('SELECT * FROM operator_campaign_promotions WHERE brief_id=?', briefId);
 assert.equal(promotion.preview_id, revision.preview.id);
 assert.deepEqual(JSON.parse(promotion.proposal_json), reviewed);
 assert.equal(env.DB.one('SELECT angle FROM team_briefs WHERE id=?', briefId).angle, reviewed.angle);
 const uploaded = await invoke(upload, env, '/api/hub/owner/marketing-library', { name: 'Internal continuity fixture', folder: 'Internal QA', tags: ['qa'], data_url: 'data:image/jpeg;base64,' + Buffer.from(original).toString('base64') });
 const sourceKey = uploaded.photo.media_key;
 const shape = await inspectMarketingAsset(env, sourceKey); assert.equal(shape.ok, true); assert.equal(shape.content_sha256, originalHash);
 requirements = { productIds: [productId], format: shape.format, theme: 'Internal fixture', visualType: 'product' };
 const registered = await invoke(register, env, '/api/hub/owner/marketing-asset-registry', { asset_key: sourceKey, expected_revision: 0, menu_item_ids: [productId], theme: requirements.theme, visual_type: requirements.visualType, approved_for_draft_selection: true });
 assert.equal(registered.publication_approved, false);
 stage = 'planner';
 const run = await runAutomation(env, 'social_plan', { date: '2026-12-07' });
 assert.equal(run.output.drafted, 1); assert.equal(run.output.illustrated, 1); assert.equal(run.output.auto_scheduled, 0);
 assert.equal(run.output.campaign_review_required, true); assert.equal(run.output.campaign_read_status, 'ok');
 assert.ok(plannerRequest);
 const inputText = JSON.parse(plannerRequest).messages[0].content;
 for (const exact of [reviewed.angle, reviewed.assumptions[0], reviewed.questions[0], productId, '[brief_id: ' + briefId + ']']) assert.ok(inputText.includes(exact), exact);
 assert.match(inputText, /UNVERIFIED ASSUMPTIONS \(never business facts\)/); assert.match(inputText, /No approval to publish, schedule, send/);
 const posts = env.DB.rows('SELECT * FROM social_posts'); assert.equal(posts.length, 1);
 const post = posts[0]; assert.equal(post.source, 'planner'); assert.equal(post.caption, caption); assert.equal(post.status, 'draft');
 for (const field of ['scheduled_at','original_caption_hash','original_design_snapshot','published_at','ig_media_id','permalink']) assert.equal(post[field], null, field);
 assert.equal(env.DB.one('SELECT request_json FROM inference_receipts WHERE id=?', post.inference_receipt_id).request_json, plannerRequest);
 assert.equal(env.DB.one('SELECT brief_id FROM post_provenance WHERE post_id=?', post.id).brief_id, briefId);
 const slide = env.DB.one('SELECT * FROM social_post_media WHERE post_id=?', post.id);
 assert.equal(slide.media_key, sourceKey); assert.equal(slide.origin, 'reviewed_library');
 const use = env.DB.one('SELECT * FROM marketing_asset_uses WHERE post_id=?', post.id);
 assert.equal(use.media_id, slide.id); assert.equal(use.asset_id, registered.id); assert.equal(use.asset_revision, registered.revision); assert.equal(use.content_sha256, originalHash);
 assert.deepEqual(JSON.parse(use.requirements_json), requirements);
 const rendered = renderEditorial({ source: original, emblem: asset('assets/emblem.png'), font: asset('assets/AnejoEditorialSerif-SemiBold.ttf'), kickerFont: asset('assets/AnejoEditorialSans-Medium.ttf'), title: caption, kicker: 'AÑEJO CATERING', templateId: 'reposado-cajita' });
 assert.equal(rendered.visualReviewRequired, true); assert.equal(rendered.pixelVerification, 'unverified'); assert.ok(rendered.deviations.length); assert.notDeepEqual(rendered.jpg, original);
 const saved = await invoke(saveRender, env, '/api/hub/owner/marketing-branded-save', { request_id: '55555555-5555-4555-8555-555555555555', post_id: post.id, media_id: slide.id, source_key: sourceKey, source_sha256: originalHash, data_url: 'data:image/jpeg;base64,' + Buffer.from(rendered.jpg).toString('base64'), declaration: { renderer_version: 'local-resvg-rehearsal-v1', template_id: 'reposado-cajita', options: { title: caption }, layout: { capture: 'local_resvg', pixel_verification: 'unverified' } } });
 assert.equal(saved.attached, true); assert.equal(saved.evidence_tier, 'browser_declared');
 const receipt = env.DB.one('SELECT * FROM marketing_render_receipts WHERE id=?', saved.receipt_id);
 assert.equal(receipt.post_id, post.id); assert.equal(receipt.media_id, slide.id); assert.equal(receipt.source_key, sourceKey); assert.equal(receipt.source_sha256, originalHash); assert.equal(receipt.output_sha256, await sha256(rendered.jpg)); assert.equal(receipt.state, 'attached');
 let row = env.DB.one('SELECT * FROM social_posts WHERE id=?', post.id);
 for (const field of ['scheduled_at','audit_score','audit_status','audit_snapshot','audit_detail_json']) assert.equal(row[field], null, field);
 let judges = 0;
 const audit = await auditSavedDraft(env, post.id, caption, async (_env, input) => {
  judges++; assert.equal(input.caption, caption); assert.equal(input.images.length, 1);
  const image = input.images[0], source = image.sourceReceipt;
  assert.deepEqual(Buffer.from(image.data, 'base64'), Buffer.from(rendered.jpg));
  assert.equal(source.sha256, receipt.output_sha256); assert.equal(source.render_receipt_status, 'browser_declared_bytes_matched');
  assert.equal(source.unreviewed_render.receipt_id, receipt.id); assert.equal(source.unreviewed_render.source_sha256, originalHash); assert.equal(source.design_facts, null);
  return { brand_score: available ? 97 : null, verdict: available ? 'pass' : 'flag', flags: available ? [] : [{ type: 'audit_unavailable', detail: 'Explicit injected local unavailable fixture' }], rubric_version: VERSION, input_coverage: { slide_sources: [{ slide: 1, ...source }] } };
 });
 assert.equal(judges, 1); assert.equal(audit.ok, true); assert.equal(audit.visual_review_required, true);
 row = env.DB.one(`SELECT *, ${SOCIAL_AUDIT_CURRENT} AS audit_current FROM social_posts WHERE id=?`, post.id);
 assert.equal(row.audit_current, 1); assert.equal(row.audit_scope, available ? 'caption_and_media' : 'unavailable'); assert.equal(row.audit_status, available ? 'pass' : 'flag');
 assert.equal(env.DB.one('SELECT media_key FROM social_post_media WHERE id=?', slide.id).media_key, saved.media_key);
 // Actual manual schedule policy accepts unavailable audits. Fixture identity
 // does not prove a human inspected the preview or authorize live publication.
 const when = Date.now() + 3600000;
 await invoke(social, env, '/api/hub/owner/social', { op: 'schedule', id: post.id, caption, expected_caption: caption, scheduled_at: when });
 row = env.DB.one('SELECT * FROM social_posts WHERE id=?', post.id); assert.equal(row.status, 'scheduled'); assert.equal(row.scheduled_at, when); assert.equal(row.auto_audit_required, null);
 for (const field of ['published_at','ig_media_id','permalink']) assert.equal(row[field], null, field);
 assert.deepEqual(env.DB.rows('SELECT * FROM trust_ledger ORDER BY category'), trustBefore); assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_trust_approvals').n, 0);
 await invoke(social, env, '/api/hub/owner/social', { op: 'edit', id: post.id, caption: 'Locally revised caption', expected_caption: caption });
 row = env.DB.one('SELECT * FROM social_posts WHERE id=?', post.id); assert.equal(row.status, 'draft');
 for (const field of ['scheduled_at','audit_score','audit_status','audit_snapshot','audit_detail_json']) assert.equal(row[field], null, field);
 const stale = await social({ env, request: request('/api/hub/owner/social', { op: 'schedule', id: post.id, caption, expected_caption: caption, scheduled_at: when }) }); assert.equal(stale.status, 409);
 assert.deepEqual(media.objects.get(sourceKey).bytes, original); assert.deepEqual(media.objects.get(saved.media_key).bytes, rendered.jpg); assert.equal(media.objects.size, 2);
 assert.deepEqual(outbound, [{ url: 'https://api.anthropic.com/v1/messages', stage: 'preview' }, { url: 'https://api.anthropic.com/v1/messages', stage: 'planner' }]);
});
