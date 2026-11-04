/* global __dirname, Buffer, URL, process, localStorage, window, document, location, innerWidth, URLSearchParams, fetch, Event, console */
/* Local joined inventory availability + order deep-link browser probe.
 * Uses the real stock-highlights GET against isolated SQLite; all other APIs are synthetic,
 * all network outside the local fixture server is blocked, and no checkout/provider is called.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const PUBLIC = path.join(ROOT, 'public');
const SKU = 'catering_emp-cheese-10';
const NOW = Date.now();
const requests = [];
const externalRequests = [];
const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.woff2':'font/woff2' };

function send(res, status, value, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
}

(async () => {
  const [{ ownerEnv }, { saveSaleOffer }, { onRequestGet }] = await Promise.all([
    import('../helpers/sqlite-d1.js'),
    import('../../functions/_lib/inventory_sales.js'),
    import('../../functions/api/stock-highlights.js'),
  ]);
  const { DB, ...env } = ownerEnv();
  env.DB = DB;
  const source = DB.one("SELECT id,name,name_es,price_cents,image,inventory_revision FROM menu_items WHERE id=?", SKU);
  assert.ok(source, `real isolated SQLite menu row exists for ${SKU}`);
  const saved = await saveSaleOffer(env, {
    itemId: SKU, quantity: 20, enabled: true, expectedRevision: null,
    inventoryRevision: Number(source.inventory_revision || 0), changeId: 'browser-probe-initial',
    actorId: 'stf_k', at: NOW, expiresAt: NOW + 60 * 60 * 1000,
  });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  DB.prepare('UPDATE inventory_sale_settings SET website_enabled=1 WHERE id=1').run();
  const menuRows = DB.rows("SELECT id,name,name_es,price_cents,image FROM menu_items WHERE active=1 AND id LIKE 'catering_emp-%' ORDER BY id");
  const apiMenu = { ok:true, addons:menuRows.map(r => ({ id:r.id, name:r.name, name_es:r.name_es, price:r.price_cents/100, img:r.image, desc:'', desc_es:'' })), modifiers:{} };
  const state = { expired:false };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    requests.push({ method:req.method, path:url.pathname, query:url.search });
    if (url.pathname === '/api/stock-highlights') {
      if (state.expired) DB.prepare('UPDATE inventory_sale_offers SET sale_expires_at=? WHERE menu_item_id=?').bind(Date.now()-1000, SKU).run();
      const response = await onRequestGet({ env });
      send(res, response.status, await response.text());
      return;
    }
    if (url.pathname === '/api/menu') return send(res, 200, apiMenu);
    if (url.pathname === '/__fixture/state' && req.method === 'POST') {
      let raw=''; for await (const chunk of req) raw += chunk;
      const next=JSON.parse(raw);
      if (next.website_enabled != null) DB.prepare('UPDATE inventory_sale_settings SET website_enabled=? WHERE id=1').bind(next.website_enabled ? 1 : 0).run();
      if (next.reserved != null) {
        DB.prepare('DELETE FROM inventory_sale_reservations WHERE menu_item_id=?').bind(SKU).run();
        if (next.reserved > 0) DB.prepare('INSERT INTO inventory_sale_reservations(order_id,menu_item_id,offer_revision,quantity,reserved_at) VALUES(?,?,?,?,?)').bind('browser-reservation',SKU,Number(saved.revision),next.reserved,Date.now()).run();
      }
      if (next.enabled != null) DB.prepare('UPDATE inventory_sale_offers SET enabled=? WHERE menu_item_id=?').bind(next.enabled ? 1 : 0, SKU).run();
      if (next.expired != null) state.expired = !!next.expired;
      send(res,200,{ok:true}); return;
    }
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return send(res, 503, { ok:false, error:'Local fixture blocks business writes.' });
      const fixture = url.pathname === '/api/order-availability' ? { ok:true, mode:'scheduled', items:[], availability:[], remaining:{}, settings:{} }
        : url.pathname === '/api/daily-lunch' || url.pathname === '/api/ordering/daily-lunch' ? { ok:true, today:new Date().toISOString().slice(0,10), days:[], settings:{same_day_cutoff:'09:00',preorder_cutoff:'22:00'}, delivery_fee_cents:0 }
        : url.pathname === '/api/client/me' ? { ok:true, authenticated:false }
        : { ok:true, items:[], addons:[], modifiers:{}, settings:{}, days:[] };
      send(res,200,fixture); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return send(res,400,'bad path','text/plain'); }
    if (pathname === '/order' || pathname === '/order/') pathname = '/order.html';
    let filename = path.resolve(PUBLIC, `.${pathname}`);
    if (!filename.startsWith(PUBLIC + path.sep) && filename !== PUBLIC) return send(res,403,'forbidden','text/plain');
    if (fs.existsSync(filename) && fs.statSync(filename).isDirectory()) filename = path.join(filename,'index.html');
    if (!fs.existsSync(filename) && !path.extname(filename) && fs.existsSync(filename+'.html')) filename += '.html';
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) return send(res,404,`not found: ${filename}`,'text/plain');
    res.writeHead(200, {'Content-Type':mime[path.extname(filename)] || 'application/octet-stream'});
    fs.createReadStream(filename).pipe(res);
  });

  const browser = await chromium.launch({ headless:true, channel:process.env.ANEJO_BROWSER_CHANNEL || 'chrome' });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport:{width:375,height:850}, serviceWorkers:'block' });
  await context.addInitScript(() => { try { localStorage.setItem('anejo:lang','en'); } catch { /* isolated browser storage may be unavailable */ } window.confirm=()=>false; window.alert=()=>{}; });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', route => {
    const reqUrl=route.request().url();
    if (reqUrl.startsWith(base) || reqUrl.startsWith('data:') || reqUrl.startsWith('blob:')) return route.continue();
    externalRequests.push(reqUrl); return route.abort();
  });
  try {
    await page.goto(`${base}/order?category=daily`, { waitUntil:'domcontentloaded', timeout:20000 });
    try { await page.waitForFunction(() => window.AnejoShop && document.querySelector('.stock-highlight-cta'), null, { timeout:8000 }); }
    catch (error) { throw new Error(`${error.message}; state=${JSON.stringify(await page.evaluate(() => ({url:location.href,ready:document.readyState,shop:!!window.AnejoShop,root:document.querySelector('.stock-highlights')?.outerHTML,body:document.body.innerText.slice(0,500)})))}; calls=${JSON.stringify(requests)}`); }
    const first = await page.evaluate(() => {
      const root=document.querySelector('.stock-highlights'), card=root?.querySelector('.stock-highlight-card'), cta=card?.querySelector('.stock-highlight-cta');
      return { hidden:root?.hidden, name:card?.querySelector('h3')?.textContent, quantity:card?.querySelector('.stock-highlight-quantity')?.textContent, href:cta?.getAttribute('href'), defaultCategory:document.querySelector('#shopCategories .active')?.getAttribute('onclick') || document.querySelector('#shopCategories .active')?.textContent, viewport:innerWidth, documentWidth:document.documentElement.scrollWidth };
    });
    assert.equal(first.hidden,false);
    assert.match(first.href,new RegExp(`^/order\\?product=${SKU}&offer_revision=${saved.revision}&utm_source=inventory_alert$`));
    assert.equal(first.quantity,'20 packs');
    assert.ok(first.documentWidth <= first.viewport + 1, `English page horizontal overflow ${first.documentWidth}px > ${first.viewport}px`);
    const outDir = process.env.ANEJO_STOCK_AUDIT_OUT ? path.resolve(process.env.ANEJO_STOCK_AUDIT_OUT) : path.resolve(ROOT,'../anejo-deliverables/inventory-sales-recovery-2026-11-03/browser-stock');
    fs.mkdirSync(outDir,{recursive:true});
    await page.waitForFunction(() => { const photo = document.querySelector('.stock-highlight-photo'); return photo && photo.complete && photo.naturalWidth > 0; }, null, { timeout:10000 });
    assert.equal(await page.locator('.stock-highlight-photo').getAttribute('src'), '/assets/img/' + source.image, 'card loads the original catalog image');
    await page.screenshot({path:path.join(outDir,'order-stock-highlights-en-375.png'),fullPage:false});

    await page.locator('.stock-highlight-cta').click();
    await page.waitForFunction(() => document.querySelector('#shopDialog')?.open === true, null, { timeout:10000 });
    const modal = await page.evaluate(() => ({ title:document.querySelector('#shopModalTitle')?.textContent, selectedSku:document.querySelector('#shopChoices [data-shop-sku]')?.getAttribute('data-shop-sku'), selectedFlavor:document.querySelector('#shopChoices [data-shop-sku] strong')?.textContent, selectedFormat:document.querySelector('#shopFormat')?.value, formatOptions:Array.from(document.querySelectorAll('#shopFormat option')).map(x=>x.value), query:new URLSearchParams(location.search).toString() }));
    assert.equal(modal.title,'Empanadas');
    assert.equal(modal.selectedSku,SKU);
    assert.match(modal.selectedFlavor,/Cheese/i);
    assert.match(modal.selectedFormat,/10 pieces/);
    assert.ok(modal.formatOptions.some(x=>/25 pieces/.test(x)),'family exposes another package size');
    assert.equal(new URLSearchParams(modal.query).get('offer_revision'),String(saved.revision));

    const enriched = await page.evaluate(id => window.InventorySalesCheckout?.enrich([{id,qty:1},{id:'catering_emp-ham-10',qty:2}]),SKU);
    assert.ok(Array.isArray(enriched),'checkout enrichment hook loaded');
    assert.equal(enriched.find(x=>x.id===SKU)?.sale_offer_revision,saved.revision);
    assert.equal(enriched.find(x=>x.id==='catering_emp-ham-10')?.sale_offer_revision,undefined);

    await page.evaluate(() => window.AnejoLang?.set('es'));
    await page.waitForFunction(() => document.querySelector('.stock-highlights h2')?.textContent.includes('Lotes'), null, { timeout:5000 });
    const spanish = await page.evaluate(() => ({ title:document.querySelector('.stock-highlights h2')?.textContent, name:document.querySelector('.stock-highlight-card h3')?.textContent, cta:document.querySelector('.stock-highlight-cta')?.textContent.trim(), width:innerWidth, documentWidth:document.documentElement.scrollWidth }));
    assert.match(spanish.title,/Lotes/);
    assert.match(spanish.name,/Empanada de queso/);
    assert.match(spanish.cta,/entrega/i);
    assert.ok(spanish.documentWidth <= spanish.width + 1, `Spanish page horizontal overflow ${spanish.documentWidth}px > ${spanish.width}px`);

    async function setState(next) { await page.evaluate(async x => { await fetch('/__fixture/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(x)}); window.dispatchEvent(new Event('focus')); },next); await page.waitForTimeout(500); }
    await setState({website_enabled:false,reserved:0,expired:false});
    const disabledHidden = await page.locator('.stock-highlights').evaluate(el=>el.hidden);
    assert.equal(disabledHidden,true,'website flag off hides stock section');
    await setState({website_enabled:true,reserved:5,expired:false});
    await page.waitForFunction(() => !document.querySelector('.stock-highlights')?.hidden, null, { timeout:5000 });
    const remaining = await page.locator('.stock-highlight-quantity').textContent();
    assert.equal(remaining,'15 paquetes','20 declared less 5 exact-SKU reservations displays 15');
    await setState({website_enabled:true,reserved:20,expired:false});
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.stock-highlights').evaluate(el=>el.hidden),true,'fully reserved stock hides');
    await setState({website_enabled:true,reserved:0,enabled:false,expired:false});
    assert.equal(DB.one('SELECT enabled FROM inventory_sale_offers WHERE menu_item_id=?', SKU).enabled, 0);
    assert.equal(await page.locator('.stock-highlights').evaluate(el=>el.hidden),true,'off declaration is suppressed while website flag remains enabled');
    await setState({website_enabled:true,reserved:0,enabled:true,expired:true});
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.stock-highlights').evaluate(el=>el.hidden),true,'expired declaration is suppressed');

    assert.ok(externalRequests.every(url => url.startsWith('https://fonts.googleapis.com/css2?')), `unexpected external request target: ${externalRequests.join(', ')}`);
    assert.deepEqual(pageErrors,[],'order and stock scripts raised no uncaught page errors');
    assert.ok(requests.some(r=>r.path==='/api/stock-highlights'));
    const result = {
      local_only:true, browser_channel:process.env.ANEJO_BROWSER_CHANNEL || 'chrome', viewport:375,
      sqlite_source:{ menu_sku:source.id, catalog_image:source.image, offer_revision:saved.revision, declared_quantity:20 },
      default_daily_to_exact_deeplink:{ ...first, resolved_modal:modal },
      checkout_revision_enrichment:{ exact_sku_revision:enriched.find(x=>x.id===SKU).sale_offer_revision, unrelated_sku_revision:enriched.find(x=>x.id==='catering_emp-ham-10').sale_offer_revision ?? null },
      spanish_render:spanish, visibility_cases:{ website_off:disabledHidden, after_five_reservations:remaining, fully_reserved_hidden:true, disabled_hidden:true, expired_hidden:true },
      browser_page_errors:pageErrors, provider_requests_sent:0, blocked_external_requests:externalRequests, api_paths:[...new Set(requests.map(r=>r.path))],
      limits:'Checkout enrichment hook validated with its actual item-array input. Checkout POST/payment flow was intentionally not submitted. Non-stock APIs used minimal synthetic fixture responses; stock-highlights GET ran against real isolated SQLite migrations and offer/reservation rows.',
    };
    const out = path.join(outDir,'inventory-stock-browser.evidence.json');
    fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({ evidence:out, visibility_cases:result.visibility_cases, selected_sku:modal.selectedSku, external_requests_blocked:externalRequests.length, page_errors:pageErrors.length }));
  } finally {
    await context.close(); await browser.close(); server.closeAllConnections(); server.close();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
