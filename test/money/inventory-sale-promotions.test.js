import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { saveSaleOffer } from '../../functions/_lib/inventory_sales.js';
import { reconcileInventoryPromotion, verifyInventoryStoryReview } from '../../functions/_lib/inventory_sale_promotions.js';
import { onRequestGet as stockHighlightsGet } from '../../functions/api/stock-highlights.js';
import { onRequestGet as promotionsGet, onRequestPost as promotionsPost } from '../../functions/api/hub/kitchen/inventory-sales.js';

const SKU = 'catering_emp-cheese-10';
const root = resolve(fileURLToPath(new URL('../../public', import.meta.url)));
const OWNER = 'anejo_sess=tok-owner';
const KITCHEN = 'anejo_sess=tok-kitchen';
const NEVER_FETCH = globalThis.fetch;

function envFixture({ assetFailure = false, mediaFailure = false } = {}) {
  const media = new Map();
  const requestedAssets = [];
  const env = ownerEnv({
    ASSETS: {
      async fetch(request) {
        const path = new URL(request.url).pathname;
        requestedAssets.push(path);
        if (assetFailure) throw new Error('synthetic asset failure');
        try {
          const bytes = await readFile(resolve(root, path.replace(/^\//, '')));
          return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
        } catch { return new Response('', { status: 404 }); }
      },
    },
    MEDIA: {
      async put(key, value) {
        if (mediaFailure) throw new Error('synthetic media failure');
        media.set(key, value instanceof Uint8Array ? value.slice() : new Uint8Array(value));
      },
      async get(key) {
        const bytes = media.get(key);
        if (!bytes) return null;
        return { body: bytes, size: bytes.byteLength, async arrayBuffer() { return bytes.slice().buffer; } };
      },
    },
  });
  return { env, media, requestedAssets };
}

function request(body, cookie = OWNER, path = '/api/hub/kitchen/inventory-sales') {
  return new Request(`https://anejo.test${path}`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
async function post(env, body, cookie = OWNER) {
  return promotionsPost({ env, request: request(body, cookie) });
}
async function declare(env, { quantity = 20, enabled = true, at = Date.now(), revision = null, inventoryRevision = 0, changeId = `count-${crypto.randomUUID()}`, expiresAt = at + 24 * 60 * 60 * 1000 } = {}) {
  return saveSaleOffer(env, { itemId: SKU, quantity, enabled, expectedRevision: revision, inventoryRevision, changeId, actorId: 'stf_k', expiresAt, at });
}
async function prepared(env, options = {}) {
  const at = options.at ?? Date.now();
  const saved = await declare(env, { ...options, at });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const result = await reconcileInventoryPromotion(env, { itemId: SKU, actorId: 'stf_k', locale: 'en', at });
  return { saved, result, at };
}
async function renderAndApprove(env, hash, cookie = OWNER) {
  // Minimal JPEG marker fixture proves the server parser's 1080x1920 shape check only.
  // It is not an actual rasterized/visually inspected image.
  const jpeg = Uint8Array.from([0xff,0xd8,0xff,0xc0,0x00,0x0f,0x08,0x07,0x80,0x04,0x38,0x01,0x01,0x11,0x00,0x00,0x00,0x00,0x00,0xff,0xd9]);
  const data_url = `data:image/jpeg;base64,${Buffer.from(jpeg).toString('base64')}`;
  const response = await post(env, { op: 'render', item_id: SKU, snapshot_hash: hash, data_url }, cookie);
  const body = await response.json();
  return { response, body, jpeg };
}

test('sale-ready count drafts exact catalog Story and keeps public stock alert opt-in', async () => {
  const { env, media, requestedAssets } = envFixture();
  const { result } = await prepared(env, { quantity: 20 });
  assert.equal(result.state, 'preview_ready');
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n, 1);
  const post = env.DB.one('SELECT * FROM social_posts');
  assert.equal(post.source, 'inventory');
  assert.equal(post.status, 'draft');
  assert.equal(post.media_type, 'STORIES');
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE status='published'").n, 0);
  assert.deepEqual(requestedAssets.sort(), [
    '/assets/fonts/CormorantGaramond-Regular.ttf', '/assets/fonts/JosefinSans-Regular.ttf',
    '/assets/img/marketing/anejo-stock-story-background.png', '/assets/img/menu-launch/empanada-single.webp',
  ].sort());
  const p = env.DB.one('SELECT * FROM inventory_sale_promotions WHERE menu_item_id=?', SKU);
  const preview = await promotionsGet({ env, request: new Request(`https://anejo.test/api/hub/kitchen/inventory-sales?preview=${SKU}&snapshot=${p.snapshot_hash}`, { headers: { Cookie: KITCHEN } }) });
  assert.equal(preview.status, 200);
  const svg = await preview.text();
  assert.match(svg, /20/);
  assert.match(svg, /Cheese empanada/);
  assert.match(svg, new RegExp(`/order\\?product=${SKU}`));
  assert.ok(svg.includes(Buffer.from(await readFile(resolve(root, 'assets/img/menu-launch/empanada-single.webp'))).toString('base64')));
  assert.ok(media.size >= 1);
  const disabled = await stockHighlightsGet({ env });
  assert.deepEqual((await disabled.json()).items, []);
  assert.equal(env.DB.one('SELECT website_enabled FROM inventory_sale_settings WHERE id=1').website_enabled, 0);
});

test('story asset and MEDIA failure leave the primary finished count committed', async (t) => {
  for (const failure of ['assetFailure', 'mediaFailure']) {
    await t.test(failure, async () => {
      const { env } = envFixture({ [failure]: true });
      const { onRequestPost } = await import('../../functions/api/hub/kitchen/inventory.js');
      const req = new Request('https://anejo.test/api/hub/kitchen/inventory', { method: 'POST', headers: { Cookie: KITCHEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'menu_count', id: SKU, stock_count: 20, expected_revision: 0, for_sale: true, sale_expected_revision: null, locale: 'en', request_id: `sale-fail-${failure}` }) });
      const response = await onRequestPost({ env, request: req });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.persisted, true);
      assert.equal(body.sales_status, 'error');
      assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', SKU).stock_count, 20);
      assert.equal(env.DB.one('SELECT enabled FROM inventory_sale_offers WHERE menu_item_id=?', SKU).enabled, 1);
    });
  }
});

test('identical count request retry reuses the exact draft instead of duplicating it', async () => {
  const { env } = envFixture();
  const { onRequestPost } = await import('../../functions/api/hub/kitchen/inventory.js');
  const body = { action: 'menu_count', id: SKU, stock_count: 20, expected_revision: 0, for_sale: true, sale_expected_revision: null, locale: 'en', request_id: 'sale-retry-request-01' };
  const send = () => onRequestPost({ env, request: new Request('https://anejo.test/api/hub/kitchen/inventory', { method: 'POST', headers: { Cookie: KITCHEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const first = await (await send()).json();
  const replay = await (await send()).json();
  assert.equal(replay.replayed, true);
  assert.equal(first.change_id, replay.change_id);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 1);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n, 1);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_promotion_events WHERE action='preview_generated'").n, 1);
});

test('website activation requires owner review, and zero/disabled/expired offers withdraw public availability', async () => {
  const { env } = envFixture();
  await prepared(env, { quantity: 3 });
  let publicResponse = await stockHighlightsGet({ env });
  assert.deepEqual((await publicResponse.json()).items, []);
  assert.equal((await post(env, { op: 'website_setting', enabled: true, reviewed: true }, KITCHEN)).status, 403);
  assert.equal((await post(env, { op: 'website_setting', enabled: true, reviewed: false })).status, 400);
  assert.equal((await post(env, { op: 'website_setting', enabled: true, reviewed: true })).status, 200);
  publicResponse = await stockHighlightsGet({ env });
  const publicBody = await publicResponse.json();
  assert.equal(publicBody.items[0].id, SKU);
  assert.equal(publicBody.items[0].quantity, 3);
  assert.equal(publicBody.items[0].cta_url, `/order?product=${SKU}`);
  const p = env.DB.one('SELECT * FROM inventory_sale_promotions WHERE menu_item_id=?', SKU);
  const expiresAt = Date.now() + 30;
  env.DB.prepare('UPDATE inventory_sale_offers SET sale_expires_at=? WHERE menu_item_id=?').bind(expiresAt, SKU).run();
  await new Promise(resolve => setTimeout(resolve, 45));
  await reconcileInventoryPromotion(env, { itemId: SKU, actorId: 'stf_k', locale: 'en', at: expiresAt + 1 });
  assert.equal(env.DB.one('SELECT state FROM inventory_sale_promotions WHERE menu_item_id=?', SKU).state, 'withdrawn');
  assert.deepEqual((await (await stockHighlightsGet({ env })).json()).items, []);
  assert.equal(env.DB.one('SELECT status FROM social_posts WHERE id=?', p.post_id).status, 'draft');
  const disabledAt = expiresAt + 2;
  const disabled = await declare(env, { quantity: 0, enabled: false, revision: 1, at: disabledAt, changeId: 'disabled-zero-offer' });
  assert.equal(disabled.ok, true);
  const withdrawn = await reconcileInventoryPromotion(env, { itemId: SKU, actorId: 'stf_k', locale: 'en', at: disabledAt });
  assert.equal(withdrawn.state, 'withdrawn');
  assert.deepEqual((await (await stockHighlightsGet({ env })).json()).items, []);
});

test('render attaches managed Story media; only owner can approve the exact current SHA', async () => {
  const { env, media } = envFixture();
  const { result } = await prepared(env, { quantity: 8 });
  const p = env.DB.one('SELECT * FROM inventory_sale_promotions WHERE menu_item_id=?', SKU);
  const bad = await post(env, { op: 'render', item_id: SKU, snapshot_hash: p.snapshot_hash, data_url: 'data:image/jpeg;base64,AA==' });
  assert.equal(bad.status, 400, await bad.text());
  const rendered = await renderAndApprove(env, result.snapshot_hash, KITCHEN);
  assert.equal(rendered.response.status, 200, JSON.stringify(rendered.body));
  assert.equal(rendered.body.state, 'ready_for_review');
  const stored = env.DB.one('SELECT * FROM inventory_sale_promotions WHERE menu_item_id=?', SKU);
  assert.equal(stored.jpeg_sha256, rendered.body.jpeg_sha256);
  assert.equal(media.has(stored.jpeg_key), true);
  assert.equal(env.DB.one('SELECT media_key,origin FROM social_post_media WHERE post_id=?', p.post_id).media_key, stored.jpeg_key);
  assert.equal((await post(env, { op: 'approve', item_id: SKU, snapshot_hash: result.snapshot_hash, jpeg_sha256: stored.jpeg_sha256, reviewed: true }, KITCHEN)).status, 403);
  assert.notEqual((await post(env, { op: 'approve', item_id: SKU, snapshot_hash: result.snapshot_hash, jpeg_sha256: 'wrong', reviewed: true })).status, 200);
  assert.equal((await post(env, { op: 'approve', item_id: SKU, snapshot_hash: result.snapshot_hash, jpeg_sha256: stored.jpeg_sha256, reviewed: true })).status, 200);
  assert.deepEqual(await verifyInventoryStoryReview(env, { id: p.post_id, source: 'inventory', media_type: 'STORIES', platform: 'instagram' }), { ok: true });
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE status='published'").n, 0);
});

test('stock reservation invalidates an exact Story approval receipt', async () => {
  const { env } = envFixture();
  const { result, saved } = await prepared(env, { quantity: 8 });
  const p = env.DB.one('SELECT post_id FROM inventory_sale_promotions WHERE menu_item_id=?', SKU);
  const rendered = await renderAndApprove(env, result.snapshot_hash);
  assert.equal(rendered.response.status, 200);
  let approved = await post(env, { op: 'approve', item_id: SKU, snapshot_hash: result.snapshot_hash, jpeg_sha256: rendered.body.jpeg_sha256, reviewed: true });
  assert.equal(approved.status, 200);
  env.DB.exec(`INSERT INTO inventory_sale_reservations(order_id,menu_item_id,offer_revision,quantity,reserved_at) VALUES ('synthetic-order', '${SKU}', ${saved.revision}, 1, ${Date.now()})`);
  assert.equal((await verifyInventoryStoryReview(env, { id: p.post_id, source: 'inventory', media_type: 'STORIES', platform: 'instagram' })).ok, false);
});

test('a new count, catalog photo, or price change invalidates the exact Story approval', async (t) => {
  for (const mutation of ['count', 'photo', 'price']) {
    await t.test(mutation, async () => {
      const { env } = envFixture();
      const { result } = await prepared(env, { quantity: 8 });
      const p = env.DB.one('SELECT post_id FROM inventory_sale_promotions WHERE menu_item_id=?', SKU);
      const rendered = await renderAndApprove(env, result.snapshot_hash);
      assert.equal(rendered.response.status, 200, JSON.stringify(rendered.body));
      assert.equal((await post(env, { op: 'approve', item_id: SKU, snapshot_hash: result.snapshot_hash, jpeg_sha256: rendered.body.jpeg_sha256, reviewed: true })).status, 200);
      if (mutation === 'count') env.DB.prepare('UPDATE menu_items SET inventory_revision=inventory_revision+1,stock_count=7 WHERE id=?').bind(SKU).run();
      if (mutation === 'photo') env.DB.prepare('UPDATE menu_items SET image=? WHERE id=?').bind('menu-launch/food-salami-50.webp', SKU).run();
      if (mutation === 'price') env.DB.prepare('UPDATE menu_items SET price_cents=price_cents+1 WHERE id=?').bind(SKU).run();
      assert.equal((await verifyInventoryStoryReview(env, { id: p.post_id, source: 'inventory', media_type: 'STORIES', platform: 'instagram' })).ok, false);
    });
  }
});

test('concurrent stale generation cannot attach a superseded offer draft', async () => {
  const { env, media } = envFixture();
  const at = Date.now();
  const first = await declare(env, { quantity: 4, at, changeId: 'race-first' });
  assert.equal(first.ok, true);
  let changed = false;
  const originalPut = env.MEDIA.put;
  env.MEDIA.put = async (key, value, options) => {
    await originalPut(key, value, options);
    if (!changed && key.endsWith('.svg')) {
      changed = true;
      env.DB.exec(`UPDATE menu_items SET inventory_revision=inventory_revision+1 WHERE id='${SKU}'`);
      await saveSaleOffer(env, { itemId: SKU, quantity: 2, enabled: true, expectedRevision: 1, inventoryRevision: 1, changeId: 'race-second', actorId: 'stf_k', at: at + 1, expiresAt: at + 24 * 60 * 60 * 1000 + 1 });
    }
  };
  const stale = await reconcileInventoryPromotion(env, { itemId: SKU, actorId: 'stf_k', locale: 'en', at });
  assert.equal(stale.ok, false);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n, 0);
  env.MEDIA.put = originalPut;
  const latest = await reconcileInventoryPromotion(env, { itemId: SKU, actorId: 'stf_k', locale: 'en', at: at + 2 });
  assert.equal(latest.state, 'preview_ready');
  const row = env.DB.one('SELECT state,snapshot_json FROM inventory_sale_promotions WHERE menu_item_id=?', SKU);
  assert.equal(row.state, 'preview_ready');
  assert.equal(JSON.parse(row.snapshot_json).source.remaining, 2);
  assert.ok([...media.keys()].some(key => key.endsWith('.svg')));
});

test('no provider or public social call is made by drafting, rendering, or review checks', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('provider network access forbidden in this test'); };
  try {
    const { env } = envFixture();
    const { result } = await prepared(env, { quantity: 2 });
    const rendered = await renderAndApprove(env, result.snapshot_hash);
    assert.equal(rendered.response.status, 200, JSON.stringify(rendered.body));
    const p = env.DB.one('SELECT * FROM inventory_sale_promotions WHERE menu_item_id=?', SKU);
    assert.equal((await post(env, { op: 'approve', item_id: SKU, snapshot_hash: p.snapshot_hash, jpeg_sha256: p.jpeg_sha256, reviewed: true })).status, 200);
    assert.equal(calls, 0);
    assert.equal(env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE status='published'").n, 0);
  } finally { globalThis.fetch = NEVER_FETCH; }
});
