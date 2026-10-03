import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { runAutomation } from '../../functions/_lib/automations.js';
import { onRequestGet as socialGet } from '../../functions/api/hub/owner/social.js';

const jpeg = new Uint8Array([255,216,255,192,0,11,8,0,10,0,10,1,1,17,0,255,217]);
const sha256 = value => createHash('sha256').update(value).digest('hex');

test('reviewed strategy, live menu, owner rules and reviewed library survive planner draft, receipts, provenance and social readback', async t => {
  const env = ownerEnv({ ANTHROPIC_API_KEY: 'synthetic-only' });
  t.after(() => env.DB.sqlite.close());
  const mediaKey = 'marketing-library/planner-continuity.jpg';
  env.MEDIA = { async get(key) { return key === mediaKey ? { size: jpeg.length, arrayBuffer: async () => jpeg.slice().buffer } : null; } };
  await env.SESSIONS.put('cfg:social_cadence', JSON.stringify({ feed_per_week: 1 }));

  env.DB.exec("UPDATE menu_items SET price_cents=2049,description='Synthetic live-menu description' WHERE id='vida'");
  env.DB.sqlite.prepare(`INSERT INTO team_briefs (id,title,objective,audience,angle,channels,assets_json,cadence,success_metric,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'draft','stf_owner',10,10)`)
    .run('brief_continuity','Reviewed catering strategy','Prepare owner-reviewed campaign direction','Local hosts','Exact reviewed angle for continuity','["instagram"]','[]','One draft','Qualified inquiries');
  const proposal = { title: 'Reviewed catering strategy', objective: 'Prepare owner-reviewed campaign direction', audience: 'Local hosts', angle: 'Exact reviewed angle for continuity', cadence: 'One draft', success_metric: 'Qualified inquiries', channels: ['instagram'], product_ids: ['vida'], assets: [], assumptions: [], questions: [] };
  env.DB.sqlite.prepare(`INSERT INTO operator_campaign_promotions (id,preview_id,owner_id,request_id,brief_id,proposal_sha256,proposal_json,source_receipts_json,authority_json,review_scope,acknowledged_open_questions,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,'team_planning_only',1,?)`).run('promotion_continuity','preview_continuity','stf_owner','request_continuity','brief_continuity',sha256(JSON.stringify(proposal)),JSON.stringify(proposal),'{}','{}',11);
  env.DB.sqlite.prepare("INSERT INTO training_rules (id,text,active,created_by,created_at,updated_at) VALUES ('rule_continuity','Owner rule: keep food central and do not invent urgency.',1,'stf_owner',12,12)").run();
  env.DB.sqlite.prepare("INSERT INTO training_examples (id,media_key,note,flag,active,created_by,created_at,updated_at) VALUES ('example_continuity','training/example.jpg','Reviewed reference: warm, natural food light.','good',1,'stf_owner',13,13)").run();

  env.DB.sqlite.prepare(`INSERT INTO marketing_asset_registry (id,asset_key,content_sha256,byte_size,width,height,format,menu_item_ids_json,theme,visual_type,approved_for_draft_selection,revision,reviewed_by,reviewed_at,created_at)
    VALUES (?,?,?,?,10,10,'square','["vida"]','warm-table','product',1,1,'stf_owner',14,14)`)
    .run('asset_continuity',mediaKey,sha256(jpeg),jpeg.length);
  env.DB.sqlite.prepare("INSERT INTO marketing_asset_registry_reviews (id,asset_id,revision,reviewed_by,reviewed_at,metadata_json) VALUES ('asset_review_continuity','asset_continuity',1,'stf_owner',14,'{}')").run();

  const caption = 'A thoughtful bowl, prepared with care. #anejo';
  const requirements = { productIds: ['vida'], format: 'square', theme: 'warm-table', visualType: 'product' };
  let plannerRequest = null;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://api.anthropic.com/v1/messages', 'all provider traffic stays intercepted');
    const request = JSON.parse(options.body);
    if (String(request.system).includes('You are the content writer on the Añejo Marketing Team')) {
      plannerRequest = options.body;
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify([{
        caption, image_brief: 'Warm natural light over the VIDA bowl.', day_offset: 0, hour: 12,
        category: 'menu', brief_id: 'brief_continuity', asset_requirements: requirements,
      }]) }], usage: { input_tokens: 12, output_tokens: 9 } }));
    }
    // Audit is deliberately synthetic. This test checks continuity and private persistence,
    // not whether a provider's semantic assessment is accurate.
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 1, output_tokens: 1 } }));
  });

  const result = await runAutomation(env, 'social_plan', { date: '2026-10-05' });
  assert.ok(plannerRequest, 'planner inference was reached through runAutomation');
  assert.equal(result.outcome, 'success');
  assert.equal(result.output.drafted, 1);
  const requestJson = JSON.parse(plannerRequest);
  const plannerInput = requestJson.messages[0].content;
  for (const text of [
    'Exact reviewed angle for continuity', 'Owner rule: keep food central and do not invent urgency.',
    'Reviewed reference: warm, natural food light.', '[vida] VIDA ($20.49) — Synthetic live-menu description',
    'asset_continuity', 'brief_continuity', 'warm-table',
  ]) assert.ok(plannerInput.includes(text), `planner input retained ${text}`);

  const post = env.DB.one("SELECT * FROM social_posts WHERE source='planner'");
  assert.ok(post, 'planner draft persisted');
  assert.equal(post.caption, caption);
  assert.equal(post.status, 'draft');
  assert.equal(post.scheduled_at, null, 'reviewed strategy and library request do not create a schedule');
  assert.ok(post.inference_receipt_id);
  const receipt = env.DB.one('SELECT * FROM inference_receipts WHERE id=?', post.inference_receipt_id);
  assert.equal(receipt.surface, 'social_plan');
  assert.equal(receipt.request_json, plannerRequest, 'persisted receipt is the exact planner request');
  const components = JSON.parse(receipt.components_json);
  assert.ok(components.briefs.source_ids.includes('brief_continuity'));
  assert.ok(components.menu.source_ids.includes('vida'));
  assert.ok(components.training.rules.some(rule => rule.id === 'rule_continuity'));
  assert.ok(components.asset_registry.source_ids.includes('asset_continuity'));
  const provenance = env.DB.one('SELECT * FROM post_provenance WHERE post_id=?', post.id);
  assert.equal(provenance.brief_id, 'brief_continuity');
  assert.deepEqual(JSON.parse(provenance.rule_ids), ['rule_continuity']);
  assert.equal(env.DB.one('SELECT asset_id FROM marketing_asset_uses WHERE post_id=?', post.id).asset_id, 'asset_continuity');

  const response = await socialGet({ env, request: new Request('https://anejo.test/api/hub/owner/social', { headers: { cookie: OWNER_COOKIE } }) });
  assert.equal(response.status, 200);
  const readback = await response.json();
  const visible = readback.posts.find(row => row.id === post.id);
  assert.ok(visible, 'saved draft is returned by the actual owner social GET handler');
  assert.equal(visible.caption, caption);
  assert.equal(visible.status, 'draft');
  assert.equal(visible.scheduled_at, null);
  assert.equal(visible.provenance.brief_id, 'brief_continuity');
  assert.equal(visible.provenance.brief_title, 'Reviewed catering strategy');
  assert.deepEqual(visible.provenance.rule_ids, ['rule_continuity']);
  for (const field of ['ig_media_id', 'published_at', 'permalink']) assert.equal(post[field], null);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_trust_approvals').n, 0);
  assert.deepEqual(visible.media.map(slide => slide.media_key), [mediaKey]);
});
