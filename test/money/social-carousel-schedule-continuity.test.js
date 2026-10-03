import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost as social } from '../../functions/api/hub/owner/social.js';
import { onRequestPost as tick } from '../../functions/api/hub/admin/social-tick.js';

const SOCIAL_URL = 'https://anejo.test/api/hub/owner/social';
const TICK_URL = 'https://anejo.test/api/hub/admin/social-tick';

async function post(handler, env, path, body) {
  const response = await handler({
    env,
    request: new Request(path, {
      method: 'POST',
      headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  });
  return { response, body: await response.json() };
}

test('owner-scheduled carousel waits through missing Instagram setup, then publishes in slide order', async t => {
  const env = ownerEnv();
  t.after(() => env.DB.sqlite.close());
  const caption = 'Cajita launch — owner-reviewed fixture';
  const keys = [
    'marketing-library/launch/cover.jpg',
    'marketing-library/launch/meal.jpg',
    'marketing-library/launch/cta.jpg',
  ];

  // This route sequence exercises saved rows and owner-session authorization. The fixture marks
  // the manual schedule action, but cannot establish that a human inspected any real preview.
  const draft = await post(social, env, SOCIAL_URL, { op: 'draft', caption, media_key: keys[0] });
  assert.equal(draft.response.status, 200, JSON.stringify(draft.body));
  const postId = draft.body.id;
  for (const key of keys.slice(1)) {
    const attached = await post(social, env, SOCIAL_URL, { op: 'attach', id: postId, media_key: key });
    assert.equal(attached.response.status, 200, JSON.stringify(attached.body));
  }
  const slidesBefore = env.DB.rows('SELECT id,seq,media_key,public_token FROM social_post_media WHERE post_id=? ORDER BY seq', postId);
  assert.equal(slidesBefore.length, 3);
  assert.deepEqual(slidesBefore.map(slide => slide.media_key), keys);

  const scheduledAt = Date.now() + 60 * 60 * 1000;
  const scheduled = await post(social, env, SOCIAL_URL, {
    op: 'schedule', id: postId, caption, expected_caption: caption, scheduled_at: scheduledAt,
  });
  assert.equal(scheduled.response.status, 200, JSON.stringify(scheduled.body));
  assert.equal(scheduled.body.status, 'scheduled');

  const providerCalls = [];
  const childUrls = [];
  let childNumber = 0;
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    providerCalls.push({ url: String(url), method: init.method || 'GET', body: init.body ? String(init.body) : '' });
    if (!env.IG_ACCESS_TOKEN) throw new Error('Provider must not be called before Instagram is configured');
    const parsed = new globalThis.URL(String(url));
    const path = parsed.pathname;
    const params = init.body ? new URLSearchParams(String(init.body)) : parsed.searchParams;
    if (path.endsWith('/media_publish')) return Response.json({ id: 'published-carousel-fixture' });
    if (path.endsWith('/media') && params.get('is_carousel_item') === 'true') {
      childUrls.push(params.get('image_url'));
      childNumber += 1;
      return Response.json({ id: `child-${childNumber}` });
    }
    if (path.endsWith('/media') && params.get('media_type') === 'CAROUSEL') {
      assert.equal(params.get('children'), 'child-1,child-2,child-3');
      assert.equal(params.get('caption'), caption);
      return Response.json({ id: 'parent-carousel-fixture' });
    }
    if (/\/(child-[123]|parent-carousel-fixture)$/.test(path)) return Response.json({ status_code: 'FINISHED' });
    if (path.endsWith('/published-carousel-fixture')) return Response.json({ permalink: 'https://instagram.test/p/fixture-carousel' });
    throw new Error(`Unexpected mocked provider request: ${path}`);
  });

  // Natural tick on an unconfigured account must neither claim the due row nor call the provider.
  // Move only the fixture timestamp forward to due; the route itself created the scheduled row.
  env.DB.sqlite.prepare('UPDATE social_posts SET scheduled_at=? WHERE id=?').run(Date.now() - 1000, postId);
  const skipped = await post(tick, env, TICK_URL, {});
  assert.equal(skipped.response.status, 200, JSON.stringify(skipped.body));
  assert.equal(skipped.body.skipped, 'instagram_not_configured');
  assert.deepEqual(providerCalls, []);
  let row = env.DB.one('SELECT status,caption,scheduled_at,ig_media_id,permalink,published_at FROM social_posts WHERE id=?', postId);
  assert.equal(row.status, 'scheduled');
  assert.equal(row.caption, caption);
  assert.ok(row.scheduled_at <= Date.now());
  assert.equal(row.ig_media_id, null);
  assert.equal(row.permalink, null);
  assert.equal(row.published_at, null);
  assert.deepEqual(env.DB.rows('SELECT id,seq,media_key,public_token FROM social_post_media WHERE post_id=? ORDER BY seq', postId), slidesBefore);

  // Local Graph API fixture: record actual ordered child requests and the parent payload, then
  // return FINISHED for each container. No network call is made.
  env.IG_ACCESS_TOKEN = 'local-fixture-token';
  env.IG_USER_ID = '17841400000000000';
  env.IG_API_HOST = 'facebook';
  env.IG_POLL_MS = 0;
  const published = await post(tick, env, TICK_URL, {});
  assert.equal(published.response.status, 200, JSON.stringify(published.body));
  assert.equal(published.body.published.length, 1, JSON.stringify(published.body));
  assert.equal(published.body.published[0].id, postId);
  assert.deepEqual(childUrls, slidesBefore.map(slide => `https://anejo.test/api/social/media/${slide.public_token}`));
  const parentPayload = providerCalls.find(call => call.url.includes('/media') && new URLSearchParams(call.body).get('media_type') === 'CAROUSEL');
  assert.ok(parentPayload, 'provider received a carousel parent container');
  assert.equal(providerCalls.filter(call => call.url.includes('/media_publish')).length, 1);
  row = env.DB.one('SELECT status,caption,ig_media_id,permalink,published_at,error FROM social_posts WHERE id=?', postId);
  assert.equal(row.status, 'published');
  assert.equal(row.caption, caption);
  assert.equal(row.ig_media_id, 'published-carousel-fixture');
  assert.equal(row.permalink, 'https://instagram.test/p/fixture-carousel');
  assert.ok(row.published_at);
  assert.equal(row.error, null);
  assert.deepEqual(env.DB.rows('SELECT seq,media_key FROM social_post_media WHERE post_id=? ORDER BY seq', postId).map(slide => [slide.seq, slide.media_key]), keys.map((key, seq) => [seq, key]));
});
