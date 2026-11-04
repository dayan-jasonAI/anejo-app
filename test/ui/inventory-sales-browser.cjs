/* Joined local browser/API test: real inventory pages, handlers, migrated SQLite, local media only. */
/* global process, Buffer, console, URL, Request, Response, setTimeout */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

(async () => {
  const { ownerEnv, OWNER_COOKIE } = await import('../helpers/sqlite-d1.js');
  const { onRequestGet: inventoryGet, onRequestPost: inventoryPost } = await import('../../functions/api/hub/kitchen/inventory.js');
  const { onRequestGet: salesGet, onRequestPost: salesPost } = await import('../../functions/api/hub/kitchen/inventory-sales.js');
  const { onRequestGet: meGet } = await import('../../functions/api/me.js');
  const root = path.resolve('public');
  const evidence = process.env.INVENTORY_SALES_BROWSER_EVIDENCE || path.resolve('../anejo-deliverables/inventory-sales-recovery-2026-11-03/browser-joined');
  fs.mkdirSync(evidence, { recursive: true });
  const bytes = new Map();
  const metadata = new Map();
  const external = [];
  const pageErrors = [];
  const requestFailures = [];
  const browserApiCalls = [];
  const media = {
    async put(key, value, options = {}) { bytes.set(key, Buffer.from(value)); metadata.set(key, options); },
    async get(key) {
      const body = bytes.get(key);
      if (!body) return null;
      const copy = Buffer.from(body);
      return {
        size: copy.length,
        httpMetadata: metadata.get(key)?.httpMetadata,
        arrayBuffer: async () => copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength),
        body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(copy)); controller.close(); } }),
      };
    },
  };
  const assets = {
    async fetch(request) {
      const url = new URL(request.url);
      const target = path.resolve(root, `.${url.pathname}`);
      if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) return new Response('', { status: 404 });
      const type = target.endsWith('.png') ? 'image/png' : target.endsWith('.ttf') ? 'font/ttf' : target.endsWith('.webp') ? 'image/webp' : target.endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg';
      return new Response(fs.readFileSync(target), { status: 200, headers: { 'content-type': type, 'content-length': String(fs.statSync(target).size) } });
    },
  };
  const env = ownerEnv({ MEDIA: media, ASSETS: assets });
  const syntheticNow = Date.now();
  env.DB.prepare("INSERT INTO inventory_items(id,name,unit,on_hand,par_level,active,revision,created_at,updated_at) VALUES('synthetic_dirty','Synthetic dry goods','oz',4,2,1,0,?,?)").bind(syntheticNow, syntheticNow).run();
  const kitchenCookie = 'anejo_sess=tok-kitchen';
  let currentRole = 'owner';

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const cookie = String(req.headers.cookie || '');
      const role = cookie.includes('tok-kitchen') ? 'kitchen' : currentRole;
      const sessionCookie = role === 'kitchen' ? kitchenCookie : OWNER_COOKIE;
      const headers = new Headers({ cookie: sessionCookie, 'content-type': req.headers['content-type'] || 'application/json' });
      let bodyBytes = Buffer.alloc(0);
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        bodyBytes = Buffer.concat(chunks);
      }
      if (url.pathname.startsWith('/api/')) {
        browserApiCalls.push({ method: req.method, path: url.pathname });
        const request = new Request(`${base}${url.pathname}${url.search}`, {
          method: req.method,
          headers,
          ...(bodyBytes.length ? { body: bodyBytes } : {}),
        });
        let result;
        if (url.pathname === '/api/me') result = await meGet({ request, env });
        else if (url.pathname === '/api/hub/kitchen/inventory') result = req.method === 'GET' ? await inventoryGet({ request, env }) : await inventoryPost({ request, env });
        else if (url.pathname === '/api/hub/kitchen/inventory-sales') result = req.method === 'GET' ? await salesGet({ request, env }) : await salesPost({ request, env });
        else if (url.pathname === '/api/hub/track') result = Response.json({ ok: true });
        else result = Response.json({ ok: false, error: 'Synthetic test route not available.' }, { status: 404 });
        res.statusCode = result.status;
        result.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(await result.text());
        return;
      }
      const relative = url.pathname === '/' ? '/hub/kitchen/inventory.html' : url.pathname;
      const target = path.resolve(root, `.${relative}`);
      if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) { res.writeHead(404).end(); return; }
      const type = target.endsWith('.html') ? 'text/html; charset=utf-8' : target.endsWith('.js') ? 'text/javascript; charset=utf-8' : target.endsWith('.css') ? 'text/css; charset=utf-8' : target.endsWith('.png') ? 'image/png' : target.endsWith('.ttf') ? 'font/ttf' : target.endsWith('.webp') ? 'image/webp' : target.endsWith('.jpg') || target.endsWith('.jpeg') ? 'image/jpeg' : 'application/octet-stream';
      res.setHeader('content-type', type);
      res.setHeader('cache-control', 'no-store');
      res.end(fs.readFileSync(target));
    } catch (error) {
      res.statusCode = 500;
      res.end(String(error?.stack || error));
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1050 }, reducedMotion: 'reduce' });
  await context.addCookies([{ name: 'anejo_sess', value: 'tok-owner', domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await context.addInitScript(() => { try { localStorage.setItem('anejo:lang', 'en'); localStorage.setItem('anejo_hub_role', 'owner'); } catch { /* local app origin has storage */ } });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.route('**/*', route => {
    if (route.request().url().startsWith(base)) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });

  try {
    await page.goto(`${base}/hub/kitchen/inventory.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('#pq-vida').waitFor();
    await page.locator('#inventory-sales-promotions').waitFor();
    await page.locator('[data-ivs-sale="vida"] [data-ivs-enabled]').waitFor();
    assert.equal(env.DB.one("SELECT image FROM menu_items WHERE id='vida'").image, 'bowl_vida.jpg');
    assert.equal(fs.existsSync(path.join(root, 'assets/img/bowl_vida.jpg')), true, 'original catalog photo exists locally');

    const dirty = page.locator('#onhand-synthetic_dirty');
    await dirty.fill('29');
    await page.evaluate(() => window.AnejoLang.set('es'));
    assert.equal(await dirty.inputValue(), '29', 'language change retains unrelated unsaved ingredient edit');
    assert.match(await page.locator('#inventory-search-status').innerText(), /Sin guardar|Unsaved/i);

    await page.locator('#pq-vida').fill('20');
    await page.locator('[data-ivs-sale="vida"] [data-ivs-enabled]').check();
    await page.locator('[data-ivs-sale="vida"] [data-ivs-locale]').selectOption('es');
    await page.locator('[data-prep="vida"]').click();
    await page.getByText('Cantidad guardada y confirmada al volver a leer.', { exact: true }).waitFor({ timeout: 15000 });
    assert.equal(await page.locator('#onhand-synthetic_dirty').inputValue(), '29', 'count readback retains unrelated dirty field');
    assert.equal(await page.locator('#onhand-synthetic_dirty').isVisible(), true);

    await page.locator('.ivs-promo[data-ivs-promo="vida"] .ivs-story-preview').waitFor({ timeout: 30000 });
    const preview = page.locator('.ivs-promo[data-ivs-promo="vida"] .ivs-story-preview');
    await page.waitForFunction(() => {
      const image = document.querySelector('.ivs-promo[data-ivs-promo="vida"] .ivs-story-preview');
      return !!image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    }, null, { timeout: 20000 });
    const promotion = env.DB.one("SELECT * FROM inventory_sale_promotions WHERE menu_item_id='vida'");
    const offer = env.DB.one("SELECT * FROM inventory_sale_offers WHERE menu_item_id='vida'");
    assert.equal(offer.quantity, 20);
    assert.equal(offer.enabled, 1);
    assert.equal(promotion.state, 'ready_for_review');
    assert.equal(promotion.locale, 'es');
    assert.match(await page.locator('.ivs-promo[data-ivs-promo="vida"] .ivs-photo').getAttribute('src'), /bowl_vida\.jpg$/);
    const jpeg = bytes.get(promotion.jpeg_key);
    assert.ok(jpeg && jpeg.length > 1000, 'actual browser-rasterized JPEG persisted to isolated media store');
    assert.equal(jpeg[0], 0xff);
    assert.equal(jpeg[1], 0xd8);
    assert.equal(await preview.evaluate(image => image.naturalWidth > 0), true, 'JPEG endpoint readback loaded in browser');

    const checkbox = page.locator('.ivs-promo[data-ivs-promo="vida"] [data-ivs-review]');
    await checkbox.waitFor();
    assert.equal(await checkbox.isEnabled(), true, 'owner review waits for actual loaded JPEG readback');
    await checkbox.check();
    await page.locator('.ivs-promo[data-ivs-promo="vida"] [data-ivs-approve]').click();
    await page.getByText('Aprobada para programar', { exact: true }).waitFor({ timeout: 12000 });
    assert.equal(env.DB.one("SELECT state FROM inventory_sale_promotions WHERE menu_item_id='vida'").state, 'reviewed');
    assert.equal(env.DB.one("SELECT reviewed_by FROM inventory_sale_promotions WHERE menu_item_id='vida'").reviewed_by, 'stf_owner');

    await page.screenshot({ path: path.join(evidence, 'owner-reviewed-story.png'), fullPage: true });
    const itemRevision = env.DB.one("SELECT inventory_revision,stock_count,availability FROM menu_items WHERE id='vida'");
    assert.deepEqual({ revision: itemRevision.inventory_revision, quantity: itemRevision.stock_count, availability: itemRevision.availability }, { revision: 1, quantity: 20, availability: 'available' });
    assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_changes WHERE action='menu_count'").n, 1);
    assert.equal(env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE source='inventory' AND media_type='STORIES'").n, 1);

    // Role switch is performed in the browser cookie, then the owner-only approval action is denied.
    await context.clearCookies();
    await context.addCookies([{ name: 'anejo_sess', value: 'tok-kitchen', domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' }]);
    currentRole = 'kitchen';
    const kitchenRead = await page.evaluate(async () => (await fetch('/api/me', { cache: 'no-store' })).json());
    assert.equal(kitchenRead.role, 'kitchen');
    const denied = await page.evaluate(async data => {
      const response = await fetch('/api/hub/kitchen/inventory-sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      return { status: response.status, body: await response.json() };
    }, { op: 'approve', item_id: 'vida', snapshot_hash: promotion.snapshot_hash, jpeg_sha256: promotion.jpeg_sha256, reviewed: true });
    assert.equal(denied.status, 403);
    assert.equal(env.DB.one("SELECT state FROM inventory_sale_promotions WHERE menu_item_id='vida'").state, 'reviewed');
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(external, []);
    fs.writeFileSync(path.join(evidence, 'validation.json'), JSON.stringify({
      status: 'passed', scope: 'Actual local inventory HTML and browser assets + API handlers + migrated SQLite + local catalog artwork/font reads + isolated media byte store',
      scenarios: ['saved finished quantity 20 with for-sale intent', 'original VIDA catalog photo in SVG and generated JPEG', 'JPEG media-store readback loaded in browser before owner approval', 'kitchen role blocked from owner-only approval', 'unrelated dirty ingredient edit persisted across language change and finished-count readback'],
      menu_item: 'vida', catalog_image: 'bowl_vida.jpg', count: itemRevision.stock_count, inventory_revision: itemRevision.inventory_revision,
      offer_revision: offer.revision, promotion_state: env.DB.one("SELECT state FROM inventory_sale_promotions WHERE menu_item_id='vida'").state,
      jpeg_bytes: jpeg.length, page_errors: pageErrors, external_requests: external,
      api_calls: browserApiCalls.filter(call => call.path.includes('inventory')),
      production_writes: 0, provider_calls: 0,
    }, null, 2));
    console.log(`Inventory sales joined browser passed: ${evidence}`);
  } catch (error) {
    console.error('Prepared row:', env.DB.one("SELECT stock_count,inventory_revision,availability,last_inventory_change_id FROM menu_items WHERE id='vida'"));
    console.error('Offer:', env.DB.one("SELECT * FROM inventory_sale_offers WHERE menu_item_id='vida'"));
    console.error('Promotion:', env.DB.one("SELECT state,error,svg_key,jpeg_key FROM inventory_sale_promotions WHERE menu_item_id='vida'"));
    console.error('Stored media keys:', [...bytes.keys()]);
    const failedPromo = env.DB.one("SELECT jpeg_key FROM inventory_sale_promotions WHERE menu_item_id='vida'");
    if (failedPromo?.jpeg_key && bytes.has(failedPromo.jpeg_key)) fs.writeFileSync(path.join(evidence, 'debug-render.jpg'), bytes.get(failedPromo.jpeg_key));
    console.error('Promotion UI:', await page.locator('#inventory-sales-promotions').innerText().catch(() => '<missing>'));
    console.error('Preview image:', await page.locator('.ivs-story-preview').evaluateAll(images => images.map(image => ({ src:image.src, complete:image.complete, width:image.naturalWidth, height:image.naturalHeight }))).catch(() => []));
    console.error('Request failures:', requestFailures);
    await page.screenshot({ path: path.join(evidence, 'failure.png'), fullPage: true }).catch(() => {});
    console.error('Browser errors:', pageErrors);
    console.error('External requests:', external);
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    env.DB.sqlite.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
