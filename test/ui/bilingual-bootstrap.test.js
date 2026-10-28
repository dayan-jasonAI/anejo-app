import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../../functions/_middleware.js';

class HTMLRewriterFixture {
  on(selector, handler) { if(selector==='head') this.handler=handler; else { assert.equal(selector,'script[src]'); this.scriptHandler=handler; } return this; }
  async transform(response) {
    let insert = '';
    this.handler.element({ append(text, options) { assert.equal(options.html, true); insert += text; } });
    let html=await response.text();
    html=html.replace(/<script src="([^"]+)"><\/script>/g,(tag,src)=>{let removed=false;this.scriptHandler.element({getAttribute:k=>k==='src'?src:null,remove(){removed=true;}});return removed?'':tag;});
    return new Response(html.replace('</head>', insert + '</head>'), response);
  }
}
async function request(path, type = 'text/html', method = 'GET', disposition = '') {
  return onRequest({ request: new Request('https://anejocateringco.com' + path, { method }), env: {},
    next: async () => new Response('<html><head></head><body>Fixture<script src="/assets/js/i18n.js"></script></body></html>', { headers: { 'Content-Type': type, 'Content-Disposition': disposition } }) });
}
test('every HTML page gets first-party language bootstrap regardless of authored script tags', async () => {
  globalThis.HTMLRewriter = HTMLRewriterFixture;
  for (const path of ['/hub/owner/menu', '/hub/kitchen/recipes', '/studio/', '/client/dashboard', '/es/', '/catering/wellington', '/login']) {
    const response = await request(path);
    const html=await response.text();
    assert.match(html, /data-anejo-language-bootstrap/);
    assert.equal((html.match(/assets\/js\/i18n\.js/g)||[]).length,1);
    assert.doesNotMatch(html,/defer data-anejo-language-bootstrap/);
  }
});
test('bootstrap never rewrites API responses, file downloads, assets or POST results', async () => {
  globalThis.HTMLRewriter = HTMLRewriterFixture;
  for (const args of [['/api/quote'], ['/order', 'application/json'], ['/assets/logo.svg', 'image/svg+xml'], ['/order', 'text/html', 'POST'], ['/quote.pdf', 'text/html', 'GET', 'attachment']]) {
    assert.doesNotMatch(await (await request(...args)).text(), /data-anejo-language-bootstrap/);
  }
});
