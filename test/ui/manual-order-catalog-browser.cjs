/* Local-only browser check for the real manual-order form and EN/ES draft retention. */
/* global process, Buffer, URL, localStorage, window, document, innerWidth, console */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve('public');
  const csp = fs.readFileSync(path.join(root, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
  const failures = [];
  let postedOrder = null;
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Cache-Control', 'no-store');
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        let result = { ok: true, items: [] };
        if (url.pathname === '/api/me') result = { authenticated: true, role: 'owner', email: 'synthetic@example.test' };
        if (url.pathname === '/api/hub/owner/menu') result = { ok: true, items: [
          { id: 'synthetic_exact_sku', name: 'Synthetic bowl', name_es: 'Tazón sintético', price_cents: 1999, active: 1 },
        ] };
        if (url.pathname === '/api/hub/owner/orders' && req.method === 'POST') {
          postedOrder = JSON.parse(body);
          result = { ok: true, order: { id: 'synthetic_order' } };
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result));
      });
      return;
    }
    const file = path.resolve(root, `.${url.pathname}`);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end(); return;
    }
    res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, channel: process.env.ANEJO_BROWSER_CHANNEL || 'chrome' });
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 844 } });
    await context.addInitScript(() => { localStorage.setItem('anejo:lang', 'en'); });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(`${base}/hub/owner/customers.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('.i-catalog').waitFor();
    const catalogInput = page.locator('.i-catalog').first();
    await catalogInput.fill('Synthetic bowl · SKU synthetic_exact_sku · $19.99');
    assert.equal(await page.locator('.i-sku').first().inputValue(), 'synthetic_exact_sku');
    await page.locator('.i-qty').first().fill('3');
    await page.locator('.i-price').first().fill('17.25');
    await page.locator('#o-name').fill('Synthetic customer');
    await page.locator('#o-date').fill('2026-12-01');

    await page.evaluate(() => window.AnejoLang.set('es'));
    await page.waitForFunction(() => document.querySelector('.i-catalog').value.includes('Tazón sintético'));
    assert.equal(await page.locator('.i-sku').first().inputValue(), 'synthetic_exact_sku');
    assert.equal(await page.locator('.i-qty').first().inputValue(), '3');
    assert.equal(await page.locator('.i-price').first().inputValue(), '17.25');
    assert.equal(await page.locator('.i-name').first().inputValue(), 'Synthetic bowl');
    assert.equal(await page.locator('#o-name').inputValue(), 'Synthetic customer');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '375px form fits viewport');

    await page.evaluate(() => window.AnejoLang.set('en'));
    await page.waitForFunction(() => document.querySelector('.i-catalog').value.includes('Synthetic bowl'));
    await page.locator('#o-create').click();
    await page.waitForFunction(() => document.querySelector('#o-create').disabled === false, null, { timeout: 5000 });
    assert.deepEqual(postedOrder.items[0], { name: 'Synthetic bowl', qty: 3, price_cents: 1725, id: 'synthetic_exact_sku' });
    assert.deepEqual(failures, []);
    console.log('Manual order catalog browser passed: 375px, exact SKU/price/quantity and draft survive EN↔ES.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
