import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/_middleware.js';

class HTMLRewriterFixture {
  on(selector, handler) { assert.equal(selector, 'head'); this.handler = handler; return this; }
  async transform(response) {
    let insert = '';
    this.handler.element({ append(text, options) { assert.equal(options.html, true); insert += text; } });
    return new Response((await response.text()).replace('</head>', insert + '</head>'), response);
  }
}
async function request(path, type = 'text/html', method = 'GET', disposition = '') {
  return onRequest({ request: new Request('https://anejocateringco.com' + path, { method }), env: {},
    next: async () => new Response('<html><head></head><body>Fixture</body></html>', { headers: { 'Content-Type': type, 'Content-Disposition': disposition } }) });
}
test('every HTML page gets first-party language bootstrap regardless of authored script tags', async () => {
  globalThis.HTMLRewriter = HTMLRewriterFixture;
  for (const path of ['/hub/owner/menu', '/hub/kitchen/recipes', '/studio/', '/client/dashboard', '/es/', '/catering/wellington', '/login']) {
    const response = await request(path);
    assert.match(await response.text(), /data-anejo-language-bootstrap/);
  }
});
test('bootstrap never rewrites API responses, file downloads, assets or POST results', async () => {
  globalThis.HTMLRewriter = HTMLRewriterFixture;
  for (const args of [['/api/quote'], ['/order', 'application/json'], ['/assets/logo.svg', 'image/svg+xml'], ['/order', 'text/html', 'POST'], ['/quote.pdf', 'text/html', 'GET', 'attachment']]) {
    assert.doesNotMatch(await (await request(...args)).text(), /data-anejo-language-bootstrap/);
  }
});
