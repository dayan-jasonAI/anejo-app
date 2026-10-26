/* Real owner API + migrated SQLite behind an isolated browser. No production/provider access. */
/* global process, Buffer, console, URL, Request, window, document, innerWidth */
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const out = path.resolve('../anejo-deliverables/instagram-30-day-2026-10-26/joined-fixture-evidence');
fs.mkdirSync(out, { recursive: true });
const publicRoot = path.resolve('public');
const stub = `window.Hub={esc:v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),api:(u,o)=>fetch(u,{method:o?.method||'GET',headers:{'Content-Type':'application/json'},body:o?.body?JSON.stringify(o.body):undefined}).then(async r=>{let d=await r.json();if(!r.ok)d._status=r.status;return d})};window.Owner={init:(_,f)=>f()};`;
(async () => {
  const { ownerEnv, OWNER_COOKIE } = await import('../helpers/sqlite-d1.js');
  const api = await import('../../functions/api/hub/owner/social-campaigns.js');
  const env = ownerEnv(), calls = [], errors = [], externalRequests = [];
  let loseSaveResponse = false;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/hub/owner/social-campaigns') {
        let body = ''; for await (const chunk of req) body += chunk;
        const b = body ? JSON.parse(body) : {};
        calls.push({ method: req.method, op: b.op || null });
        const request = new Request('https://anejo.test' + req.url, { method: req.method, headers: { cookie: OWNER_COOKIE, 'content-type': 'application/json' }, ...(body ? { body } : {}) });
        const result = await (req.method === 'GET' ? api.onRequestGet : api.onRequestPost)({ request, env });
        if (loseSaveResponse && b.op === 'save_captions') { loseSaveResponse = false; res.writeHead(504, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: 'Synthetic response lost after real commit' })); return; }
        res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text()); return;
      }
      if (url.pathname.endsWith('/hub.js') || url.pathname.endsWith('/owner.js')) { res.setHeader('content-type', 'text/javascript'); res.end(stub); return; }
      const target = path.join(publicRoot, url.pathname);
      if (!target.startsWith(publicRoot + path.sep)) throw Error('Invalid fixture path');
      res.setHeader('content-type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(target));
    } catch (error) { res.statusCode = 500; res.end(String(error)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const address = 'http://127.0.0.1:' + server.address().port;
  await page.route('**/*', route => { if (route.request().url().startsWith(address)) return route.continue(); externalRequests.push(route.request().url()); return route.abort(); });
  page.on('pageerror', e => errors.push(e.message));
  const plan = { title: 'Joined API fixture — private drafts', proposed_start_date: '2027-03-01', approval: { approved: true }, slots: Array.from({ length: 30 }, (_, i) => ['feed', 'story', 'story'].map((channel, j) => ({ slot_id: 'd' + i + 's' + j, day_offset: i, time: ['11:15', '09:30', '16:30'][j], channel, caption: 'Original caption ' + i + '-' + j, language: i % 2 ? 'es' : 'en', objective: 'Synthetic local acceptance', post_id: 'sp_injected', media: ['injected'], status: 'scheduled' }))).flat() };
  const file = { name: 'synthetic-90-slot-plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) };
  async function importPlan() { await page.locator('#campaign-plan-file').setInputFiles(file); await page.locator('#campaign-import-confirm').click(); await page.getByText(/90 caption drafts saved\./).waitFor(); }
  try {
    await page.goto(address + '/hub/owner/social-campaigns.html'); await page.getByText('No campaign has been drafted yet.').waitFor();
    await importPlan();
    assert.equal(await page.locator('[data-slot]').count(), 90);
    assert.match(await page.locator('.campaign-stats').innerText(), /90\nSaved drafts/);
    assert.match(await page.locator('.campaign-stats').innerText(), /0\nScheduled/);
    assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_campaign_cycles').n, 1);
    assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n, 90);
    assert.equal(env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE status='draft' AND scheduled_at IS NULL").n, 90);
    assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_campaign_reviews').n, 0);
    assert.equal(calls.filter(c => c.op === 'stage_captions').length, 9);
    await importPlan();
    assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n, 90, 'same plan resumes without duplicates');
    assert.equal(calls.filter(c => c.op === 'stage_captions').length, 9);
    await page.locator('[data-slot="d0s0"] summary').first().click();
    await page.locator('[data-caption="d0s0"]').fill('Actually saved through owner API');
    await page.locator('#campaign-save-captions').click(); await page.getByText(/Caption changes saved\./).waitFor();
    assert.equal(env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE caption='Actually saved through owner API'").n, 1);
    assert.equal(await page.locator('#campaign-review').isDisabled(), true, 'missing media still blocks schedule');
    await page.locator('[data-slot="d0s0"] summary').first().click();
    await page.locator('[data-caption="d0s0"]').fill('Saved despite response loss'); loseSaveResponse = true;
    await page.locator('#campaign-save-captions').click(); await page.getByText(/Save outcome needs a fresh readback/).waitFor();
    assert.equal(env.DB.one("SELECT COUNT(*) n FROM social_posts WHERE caption='Saved despite response loss'").n, 1);
    const saves = calls.filter(c => c.op === 'save_captions').length;
    assert.equal(await page.locator('#campaign-save-captions').isDisabled(), true);
    await page.locator('#campaign-discard-edits').click(); await page.waitForFunction(() => !window.CampaignReview.state.loading && !window.CampaignReview.state.busy);
    assert.equal(calls.filter(c => c.op === 'save_captions').length, saves, 'readback does not retry mutation');
    assert.equal(await page.locator('[data-caption="d0s0"]').inputValue(), 'Saved despite response loss');
    await page.locator('#campaign-next-date').fill('2027-03-31'); await page.locator('#campaign-next-create').click(); await page.getByText(/New draft cycle saved/).waitFor();
    assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_campaign_cycles').n, 2);
    assert.equal(env.DB.one('SELECT COUNT(*) n FROM social_posts').n, 90);
    assert.equal(await page.locator('[data-slot]').count(), 90); assert.equal(await page.locator('[data-caption]:enabled').count(), 0);
    await page.setViewportSize({ width: 375, height: 812 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: out + '/next-draft-mobile.png' });
    assert.deepEqual(errors, []); assert.deepEqual(externalRequests, []);
    fs.writeFileSync(out + '/validation.json', JSON.stringify({ result: 'passed', scope: 'Actual owner API and full migrated SQLite, isolated synthetic browser only', scenarios: ['90 caption drafts created in9bounded batches', 'file approvals/media/status ignored', 'idempotent unchanged-file resume', 'caption edited and persisted with exact revision', 'missing media blocks schedule', 'committed save with lost response reconciles without retry', 'next cycle contains90unfilled slots and no copiedposts', '375px no overflow'], database: { cycles: 2, posts: 90, scheduled: 0, approvals: 0 }, calls, errors, externalRequests }, null, 2));
    console.log('Joined campaign browser/API acceptance passed: ' + out);
  } finally { await browser.close(); server.close(); env.DB.sqlite.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
