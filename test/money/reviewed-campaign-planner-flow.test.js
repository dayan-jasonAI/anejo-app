// Actual local handlers + fully migrated SQLite. Provider output is synthetic;
// retained inference input is evidence of supplied direction, not model obedience.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost as previewPost, onRequestPatch as previewPatch } from '../../functions/api/hub/owner/operator-campaign-preview.js';
import { onRequestPost as promotePost } from '../../functions/api/hub/owner/operator-campaign-promote.js';
import { currentPromotionAuthority } from '../../functions/_lib/operator_campaign_promotion.js';
import { runAutomation } from '../../functions/_lib/automations.js';
import { SOCIAL_AUDIT_SNAPSHOT, SOCIAL_AUDIT_CONTEXT, SOCIAL_AUDIT_CURRENT } from '../../functions/_lib/social_audit.js';
import { VERSION } from '../../functions/_lib/visual_audit_rubric.js';

for (const mode of ['auto_off', 'auto_selected', 'auto_omitted', 'unavailable']) test(`reviewed strategy remains draft-only through planner with exact input evidence: ${mode}`, async (t) => {
  const env = ownerEnv({ ANTHROPIC_API_KEY: 'synthetic-only' });
  t.after(() => env.DB.sqlite.close());
  await env.SESSIONS.put('cfg:social_cadence', JSON.stringify({ feed_per_week: 1 }));
  if (mode !== 'auto_off') {
    env.DB.exec("UPDATE trust_ledger SET auto_publish=1,approved_clean=5 WHERE category='menu'");
    assert.equal(env.DB.one("SELECT auto_publish FROM trust_ledger WHERE category='menu'").auto_publish, 1);
    // Synthetic positive audit isolates the permission boundary, not visual/model quality.
    // Actual saved-draft audit runs, then this local fixture supplies a current pass so only
    // the planner's planning-scope restriction can prevent the real scheduling UPDATE.
    env.DB.exec(`CREATE TRIGGER synthetic_passing_audit AFTER UPDATE OF audit_status ON social_posts
      WHEN NEW.source='planner' BEGIN UPDATE social_posts SET audit_status='pass',audit_scope='caption_and_media',
      audit_detail_json='{"rubric_version":"${VERSION}"}',audit_snapshot=${SOCIAL_AUDIT_SNAPSHOT},
      audit_context_snapshot=${SOCIAL_AUDIT_CONTEXT} WHERE id=NEW.id; END`);
  }
  const authority = await currentPromotionAuthority(env);
  assert.equal(authority.ok, true);
  const productId = authority.available_product_ids[0];
  const ideaId = 'obi_' + 'a'.repeat(64);
  const ownerWords = 'Build an internal catering direction. Do not invent date, coverage or capacity.';
  env.DB.sqlite.prepare("INSERT INTO operator_brief_ideas VALUES (?, 'Synthetic idea',?,'draft','stf_owner',1,1)").run(ideaId, ownerWords);
  const generated = {
    title: 'Synthetic private campaign', objective: 'Prepare a reviewed draft', audience: 'Hosts considering catering',
    angle: 'Initial generated direction', cadence: 'One draft for review', success_metric: 'Qualified inquiries, not assumed sales',
    channels: ['instagram'], product_ids: [productId], assets: [],
    assumptions: ['Event capacity remains unverified.'], questions: ['Which date and city does the owner approve?'],
  };
  const reviewed = { ...generated, angle: ('Preserve full-frame food photography and exact owner wording. '.repeat(20)).slice(0,1084) };
  let stage = 'preview', briefId, plannerRequest;
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    // Catch all outbound attempts: nothing reaches a live model, image or social API.
    calls.push({ url: String(url), stage });
    assert.equal(String(url), 'https://api.anthropic.com/v1/messages');
    assert.equal(options.method, 'POST');
    const input = JSON.parse(options.body);
    let output;
    if (stage === 'preview') {
      assert.equal(input.messages.at(-1).content, ownerWords);
      output = generated;
    } else {
      assert.match(input.system, /You are the content writer/);
      plannerRequest = options.body;
      output = [{ caption: 'Synthetic private catering draft for review.', image_brief: 'Synthetic food photo direction',
        day_offset: 0, hour: 12, category: 'menu', brief_id: ['auto_omitted', 'unavailable'].includes(mode) ? null : briefId, intel_id: null, asset_requirements: null }];
    }
    return new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(output) }], usage: { input_tokens: 10, output_tokens: 10 } }));
  });
  const invoke = async (handler, path, method, body) => {
    const response = await handler({ env, request: new Request('https://anejo.test' + path, {
      method, headers: { cookie: OWNER_COOKIE, 'content-type': 'application/json' }, body: JSON.stringify(body),
    }) });
    const result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result)); return result;
  };
  const first = await invoke(previewPost, '/api/hub/owner/operator-campaign-preview', 'POST', {
    request_id: '11111111-1111-4111-8111-111111111111', idea_id: ideaId,
  });
  assert.equal(first.saved, true);
  const revision = await invoke(previewPatch, '/api/hub/owner/operator-campaign-preview', 'PATCH', {
    request_id: '22222222-2222-4222-8222-222222222222', preview_id: first.preview.id,
    expected_proposal_sha256: first.preview.proposal_sha256, proposal: reviewed,
  });
  const promoted = await invoke(promotePost, '/api/hub/owner/operator-campaign-promote', 'POST', {
    request_id: '33333333-3333-4333-8333-333333333333', preview_id: revision.preview.id,
    expected_proposal_sha256: revision.preview.proposal_sha256, acknowledge_open_questions: true,
  });
  briefId = promoted.brief_id;
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n, 0);
  assert.equal(calls.length, 1, 'revision and promotion must not generate or publish');
  stage = 'planner';
  if (mode === 'unavailable') {
    const prepare = env.DB.prepare.bind(env.DB);
    env.DB.prepare = sql => sql.includes('SELECT b.id,b.title') && sql.includes('operator_campaign_promotions p')
      ? { all: async () => { throw new Error('Synthetic campaign direction read outage'); } } : prepare(sql);
  }
  const run = await runAutomation(env, 'social_plan', { date: '2026-12-07' });
  assert.equal(run.output.campaign_review_required, true);
  assert.equal(run.output.campaign_read_status, mode === 'unavailable' ? 'unavailable' : 'ok');
  assert.ok(plannerRequest, 'actual planner reached synthetic inference');
  const inputText = JSON.parse(plannerRequest).messages[0].content;
  if (mode !== 'unavailable') {
  for (const exact of [reviewed.angle, generated.assumptions[0], generated.questions[0], productId, '[brief_id: ' + briefId + ']']) assert.ok(inputText.includes(exact), exact);
  assert.match(inputText, /UNVERIFIED ASSUMPTIONS \(never business facts\)/);
  assert.match(inputText, /OPEN QUESTIONS/);
  assert.match(inputText, /No approval to publish, schedule, send/);
  } else assert.ok(!inputText.includes(reviewed.angle));
  const posts = env.DB.rows('SELECT * FROM social_posts');
  assert.equal(posts.length, 1); assert.equal(posts[0].status, 'draft');
  assert.equal(posts[0].caption, 'Synthetic private catering draft for review.');
  assert.equal(posts[0].published_at, null);
  assert.ok(posts[0].inference_receipt_id);
  const receipt = env.DB.one('SELECT * FROM inference_receipts WHERE id=?', posts[0].inference_receipt_id);
  assert.equal(receipt.request_json, plannerRequest);
  assert.equal(env.DB.one('SELECT brief_id FROM post_provenance WHERE post_id=?', posts[0].id).brief_id, ['auto_omitted', 'unavailable'].includes(mode) ? null : briefId);
  if (mode !== 'auto_off') {
    assert.equal(posts[0].scheduled_at, null, 'planning-only input grants no scheduling authority');
    assert.equal(posts[0].original_design_snapshot, null, 'planning-only output earns no automatic trust seal');
    assert.equal(posts[0].original_caption_hash, null);
    assert.equal(env.DB.one(`SELECT ${SOCIAL_AUDIT_CURRENT} AS current FROM social_posts WHERE id=?`, posts[0].id).current, 1, 'synthetic current audit isolates scope restriction');
  }
  assert.equal(env.DB.one('SELECT angle FROM team_briefs WHERE id=?', briefId).angle, reviewed.angle);
  const storedProposal = JSON.parse(env.DB.one('SELECT proposal_json FROM operator_campaign_promotions WHERE brief_id=?', briefId).proposal_json);
  assert.deepEqual(storedProposal.assumptions, generated.assumptions);
  assert.deepEqual(storedProposal.questions, generated.questions);
  assert.equal(calls.filter(c => c.stage === 'preview').length, 1);
  assert.equal(calls.filter(c => c.stage === 'planner').length, 1);
});
