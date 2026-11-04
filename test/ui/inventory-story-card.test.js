const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSvg, rasterize } = require('../../public/hub/assets/inventory-story-card.js');

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=';
function model(overrides = {}) {
  return {
    productId: 'reposado-12',
    productName: 'Añejo Reposado',
    quantity: 12,
    locale: 'en',
    sourceDataUrl: pixel,
    sourceWidth: 1600,
    sourceHeight: 1200,
    backgroundDataUrl: pixel,
    priceCents: 2450,
    unitLabel: 'per tray',
    unitLabelEs: 'por bandeja',
    checkedAt: 'Checked Nov 3, 2026 · 10:30 AM',
    ctaUrl: '/order?product=reposado-12',
    ...overrides,
  };
}

test('buildSvg is deterministic, embeds provided assets, and uses the requested 1080x1920 safe layout', () => {
  const input = model();
  const first = buildSvg(input);
  assert.equal(first, buildSvg(input));
  assert.match(first, /width="1080" height="1920" viewBox="0 0 1080 1920"/);
  assert.ok(first.includes(input.sourceDataUrl));
  assert.ok(first.includes(input.backgroundDataUrl));
  assert.match(first, /x="98" y="650" width="884" height="750" preserveAspectRatio="xMidYMid meet"/);
  assert.match(first, /y="1480" class="price"/);
  assert.match(first, /href="\/order\?product=reposado-12"/);
  assert.match(first, /anejocateringco\.com\/order/);
  assert.doesNotMatch(first, /<(?:script|foreignObject)\b/i);
  assert.deepEqual([...first.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]).filter((href) => !href.startsWith('data:') && !href.startsWith('/')), []);
  assert.doesNotMatch(first, /<image[^>]+(?:filter|clip-path)=/i);
});

test('English and Spanish labels are selected deterministically', () => {
  const en = buildSvg(model());
  const es = buildSvg(model({ locale: 'es' }));
  assert.match(en, /AVAILABLE NOW/);
  assert.match(en, /ORDER ONLINE/);
  assert.match(en, /\$24\.50 \/ per tray/);
  assert.match(es, /DISPONIBLE AHORA/);
  assert.match(es, /PIDE EN LÍNEA/);
  assert.match(es, /\$24\.50 \/ por bandeja/);
});

test('text is escaped and price, quantity, name and URL inputs are bounded', () => {
  const safe = buildSvg(model({ productName: 'Fish & <Rice> "Classic"' }));
  assert.match(safe, /Fish &amp; &lt;Rice&gt; &quot;Classic&quot;/);
  assert.throws(() => buildSvg(model({ quantity: 1.5 })), /exact positive integer/);
  assert.throws(() => buildSvg(model({ quantity: 0 })), /exact positive integer/);
  assert.throws(() => buildSvg(model({ priceCents: -10 })), /positive integer/);
  assert.throws(() => buildSvg(model({ productName: 'x'.repeat(160) })), /productName is invalid/);
  assert.throws(() => buildSvg(model({ productName: 'x'.repeat(33) })), /unbroken word/);
  assert.throws(() => buildSvg(model({ ctaUrl: 'https://evil.example/order?product=reposado-12' })), /same-origin/);
  assert.throws(() => buildSvg(model({ productId: '../private', ctaUrl: '/order?product=..%2Fprivate' })), /productId is invalid/);
  assert.throws(() => buildSvg(model({ sourceDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' })), /embedded PNG, JPEG, or WEBP/);
});

test('rasterize is explicitly browser-only', async () => {
  await assert.rejects(rasterize('<svg xmlns="http://www.w3.org/2000/svg"/>'), /requires a browser canvas/);
});
