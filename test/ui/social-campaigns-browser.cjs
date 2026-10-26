/* Isolated synthetic browser acceptance. No account, database, or provider is contacted. */
/* global URL, setTimeout, scrollTo, requestAnimationFrame, document, innerWidth, getComputedStyle, window, console, process, Event, MediaRecorder, Blob */
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const output = path.resolve('../anejo-deliverables/instagram-30-day-2026-10-26/ui-fixture-evidence');
fs.mkdirSync(output, { recursive: true });
const root = path.resolve('public'), calls = [], errors = [];
const posts = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10);
  return { slot_id: 'slot-' + index, day_offset: index, date, time: '11:30', scheduled_at: Date.parse(date + 'T16:30:00Z'), channel: 'instagram', post_id: index === 29 ? null : 'post-' + index, caption: index % 2 ? 'Tu pausa sabe mejor con Añejo.\nHecho con cariño, compartido con gusto.\nExplora el menú en el enlace de la biografía.' : 'A little more flavor in your everyday.\nThoughtfully prepared food, ready for your table.\nExplore the menu through the link in our bio.', media_type: index === 4 ? 'REELS' : 'IMAGE', post_status: 'draft', audit_status: index < 24 ? 'pass' : 'flagged', audit_current: index < 24, ready: index < 24, blockers: index >= 25 ? ['Current visual audit required'] : [], media: index === 29 ? [] : [{ id: 'asset-' + index, seq: 0, key: 'fixture-' + index, preview_url: index === 4 ? '/fixture-video.webm' : '/fixture-image.svg' }], offer: 'Catering & shared meals', cta: 'Explore the menu', cta_url: 'https://example.test/menu', language: index % 2 ? 'es' : 'en' };
});
const campaign = { id: 'synthetic-review', title: '30 days of Añejo · fixture', start_date: '2026-11-01', end_date: '2026-11-30', timezone: 'America/New_York', version: 3, state: 'draft', slot_count: 30, validation: { state: 'pending', cursor: 0, total: 30, errors: ['5 posts need current review'] } };
const stub = `window.Hub={esc:v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),api:(u,o)=>fetch(u,{method:o?.method||'GET',headers:{'Content-Type':'application/json'},body:o?.body?JSON.stringify(o.body):undefined}).then(async r=>{let d=await r.json();if(!r.ok)d._status=r.status;return d})};window.Owner={init:(_,f)=>f()};`;
let mode = 'normal', held = false, staleSchedule = false, fixtureVideo;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let body = {}; if (req.method === 'POST') { let text = ''; for await (const chunk of req) text += chunk; body = JSON.parse(text); }
    calls.push({ path: url.pathname, method: req.method, body });
    if (held) await new Promise(resolve => setTimeout(resolve, 400));
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      if (body.op === 'validate') { campaign.validation.cursor = Math.min(30, campaign.validation.cursor + 3); campaign.validation.total = 30; campaign.validation.state = campaign.validation.cursor === 30 ? 'complete' : 'in_progress'; }
      if (body.op === 'approve_schedule') {
        if (staleSchedule) { res.statusCode = 409; campaign.version++; staleSchedule = false; return res.end(JSON.stringify({ ok: false, error: 'Version changed', review_required: true })); }
        campaign.state = 'scheduled'; campaign.approval = { id: 'approval-fixture', owner_id: 'owner-fixture', approved_at: Date.now(), review_mode: body.review_mode, approved_manifest_hash: body.expected_manifest_hash, scope: 'exact_manifest_only' }; posts.forEach(p => { p.post_status = 'scheduled'; });
      }
      if (body.op === 'pause') { campaign.state = 'paused'; campaign.version++; posts.forEach(p => { p.post_status = 'draft'; }); }
      return res.end(JSON.stringify({ ok: true }));
    }
    return res.end(JSON.stringify(mode === 'error' ? { ok: false, error: 'Synthetic storage failure' } : url.searchParams.has('id') ? { ok: true, campaign, posts: mode === 'no-posts' ? [] : mode === 'ninety' ? posts.flatMap(p => [p, ...[1, 2].map(n => ({ ...p, slot_id: p.slot_id + '-story-' + n, channel: 'instagram_story', media_type: 'STORIES', media: [{ id: p.slot_id + '-story-asset-' + n, seq: 0, key: 'fixture-story', preview_url: '/fixture-image.svg' }] }))]) : posts, readiness: { counts: { slots: 30, filled: 29, ready: 24, blocked: 5 }, blockers: ['Review unfinished assets'], strict_ready: false, owner_review_ready: campaign.validation.state === 'complete', warnings: [{ id: 'warning-video', post_id: 'post-4', code: 'manual_video_review', detail: 'Watch the full video before approving this version' }] }, manifest_hash: 'fixture-sha256-exact-preview' } : { ok: true, campaigns: mode === 'empty' ? [] : [campaign] }));
  }
  if (url.pathname.endsWith('/hub.js') || url.pathname.endsWith('/owner.js')) { res.setHeader('Content-Type', 'text/javascript'); return res.end(stub); }
  if (url.pathname === '/fixture-video.webm') { res.setHeader('Content-Type', 'video/webm'); return res.end(fixtureVideo); }
  if (url.pathname === '/fixture-image.svg') { res.setHeader('Content-Type', 'image/svg+xml'); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#ddccae"/><ellipse cx="320" cy="260" rx="190" ry="135" fill="#fffdf8"/><ellipse cx="320" cy="260" rx="125" ry="85" fill="#a06336"/><circle cx="280" cy="230" r="35" fill="#58744b"/><circle cx="350" cy="290" r="26" fill="#b94e36"/><text x="24" y="40" font-size="19" fill="#1b3a2b">SYNTHETIC MEDIA FIXTURE</text></svg>'); }
  try { const file = path.join(root, url.pathname); res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(file)); } catch { res.statusCode = 404; res.end('Not found'); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.dismiss());
  const url = 'http://127.0.0.1:' + server.address().port + '/hub/owner/social-campaigns.html';
  try {
    const videoBytes = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240; const ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(10), recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }), chunks = [];
      const done = new Promise(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))); });
      recorder.start(); ctx.fillStyle = '#1b3a2b'; ctx.fillRect(0, 0, 320, 240); ctx.fillStyle = '#f5f2ec'; ctx.font = '18px sans-serif'; ctx.fillText('Synthetic video fixture', 20, 120);
      await new Promise(resolve => setTimeout(resolve, 800)); ctx.fillStyle = '#C6A85B'; ctx.fillRect(20, 150, 80, 20); await new Promise(resolve => setTimeout(resolve, 200)); recorder.stop();
      return done;
    }); fixtureVideo = Buffer.from(videoBytes);
    held = true; await page.goto(url); await page.getByText('Loading campaign…', { exact: true }).waitFor();
    await page.locator('[data-slot]').first().waitFor(); held = false;
    assert.equal(await page.locator('[data-slot]').count(), 30);
    assert.equal(await page.locator('#campaign-select').isEnabled(), true);
    assert.match(await page.locator('.campaign-stats').innerText(), /24\nReady for review/);
    assert.equal(await page.locator('.campaign-visual video[controls]').count(), 1);
    await page.locator('.campaign-visual video').evaluate(async video => { await video.play(); });
    await page.waitForFunction(() => document.querySelector('.campaign-visual video').currentTime > 0); await page.locator('.campaign-visual video').evaluate(video => video.pause());
    await page.locator('[data-slot="slot-1"] > .campaign-card-content > details > summary').click();
    const spanish = await page.locator('#caption-slot-1').inputValue(); assert.match(spanish, /Tu pausa/);
    await page.locator('#caption-slot-1').fill(spanish + '\nSugerencia sin guardar.');
    await page.locator('#campaign-filter').selectOption('blocked'); assert.equal(await page.locator('[data-slot]').count(), 5);
    await page.locator('#campaign-filter').selectOption('all');
    assert.match(await page.locator('#caption-slot-1').inputValue(), /Sugerencia sin guardar/);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click(); assert.match(await page.locator('#campaign-feedback').innerText(), /unsaved caption/);
    const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export review manifest' }).click();
    const download = await downloadEvent; await download.saveAs(output + '/synthetic-review-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(output + '/synthetic-review-manifest.json'));
    assert.equal(manifest.approval, null); assert.equal(manifest.requires_new_server_preview, true); assert.match(manifest.slots[1].caption, /Sugerencia/); assert.equal(manifest.source_preview_digest, 'fixture-sha256-exact-preview');
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    assert.equal(await page.locator('.campaign-calendar-day').count(), 30);
    await page.locator('[data-open="slot-1"]').click();
    assert.equal(await page.locator('[data-slot="slot-1"] details').first().getAttribute('open'), '');
    assert.equal(await page.locator('[data-view="list"]').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => { scrollTo(0, 0); return new Promise(requestAnimationFrame); }); await page.screenshot({ path: output + '/campaign-desktop.png', fullPage: false });
    for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
      await page.setViewportSize(viewport); await page.evaluate(() => scrollTo(0, 0));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      const targets = await page.locator('button:visible,select:visible,summary:visible').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent.trim(), height: node.getBoundingClientRect().height })));
      assert.equal(targets.some(t => t.height < 44), false, JSON.stringify(targets.filter(t => t.height < 44)));
    }
    await page.setViewportSize({ width: 375, height: 812 }); await page.evaluate(() => new Promise(requestAnimationFrame)); await page.screenshot({ path: output + '/campaign-mobile.png' });
    await page.locator('[data-slot="slot-0"]').scrollIntoViewIfNeeded(); await page.evaluate(() => new Promise(requestAnimationFrame)); await page.screenshot({ path: output + '/campaign-mobile-post.png' });
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: output + '/campaign-calendar-mobile.png' });
    await page.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await page.locator('#campaign-reload').evaluate(n => getComputedStyle(n).transitionDuration), '0s');
    await page.evaluate(() => { window.CampaignReview.state.edits = {}; });
    mode = 'ninety'; await page.goto(url); await page.waitForFunction(() => document.querySelectorAll('[data-slot]').length === 90);
    assert.equal(await page.locator('.campaign-day-group').count(), 30); assert.equal(await page.locator('.campaign-day-group').first().locator('[data-slot]').count(), 3);
    await page.getByRole('button', { name: 'Calendar', exact: true }).click(); assert.equal(await page.locator('.campaign-calendar-day').count(), 30);
    assert.match(await page.locator('.campaign-calendar-day').first().innerText(), /3/); await page.locator('.campaign-calendar-day button').first().click();
    assert.equal(await page.locator('.campaign-day-group').first().locator('[data-slot]').count(), 3);
    mode = 'normal';
    await page.goto(url + '?id=synthetic-review'); await page.locator('[data-slot]').first().waitFor();
    await page.keyboard.press('Tab'); assert.equal(await page.locator('.campaign-skip').evaluate(n => n === document.activeElement), true);
    await page.keyboard.press('Enter'); assert.equal(await page.locator('#campaign-main').evaluate(n => n === document.activeElement), true);
    assert.equal(await page.locator('#campaign-review').isDisabled(), true);
    await page.locator('#campaign-validate').click(); await page.getByText('Resume validation', { exact: true }).waitFor();
    assert.equal(calls.filter(c => c.body.op === 'validate').length, 1); assert.equal(campaign.validation.cursor, 3);
    for (let n = 1; n < 10; n++) { await page.locator('#campaign-validate').click(); await page.waitForFunction(() => !window.CampaignReview.state.busy); }
    assert.equal(campaign.validation.state, 'complete'); assert.equal(await page.locator('#campaign-review').isDisabled(), false);
    staleSchedule = true; await page.locator('#campaign-review').click();
    await page.waitForFunction(() => { const img = document.querySelector('.campaign-review-media img'); return img && img.naturalWidth > 0; });
    await page.screenshot({ path: output + '/campaign-exact-review.png' });
    assert.equal(await page.locator('#campaign-confirm').isDisabled(), true); assert.equal(await page.locator('[value="automated_pass"]').isDisabled(), true);
    await page.locator('#campaign-exact-ack').check(); assert.equal(await page.locator('#campaign-confirm').isDisabled(), true);
    await page.locator('#campaign-exact-ack').scrollIntoViewIfNeeded(); await page.screenshot({ path: output + '/campaign-review-acknowledgements.png' });
    await page.locator('[data-warning-id="warning-video"]').check(); await page.locator('#campaign-confirm').click();
    await page.getByText(/Campaign changed. Refresh and review/).waitFor(); assert.equal(await page.locator('#campaign-confirm').isDisabled(), true);
    await page.locator('#campaign-review-close').click(); await page.locator('#campaign-reload').click(); await page.waitForFunction(() => !window.CampaignReview.state.loading);
    await page.locator('#campaign-review').click(); await page.locator('#campaign-exact-ack').check(); await page.locator('[data-warning-id="warning-video"]').check();
    const beforeSchedule = calls.filter(c => c.body.op === 'approve_schedule').length;
    await page.locator('#campaign-review-form').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await page.waitForFunction(() => window.CampaignReview.state.cycle.state === 'scheduled' && !window.CampaignReview.state.busy);
    assert.equal(calls.filter(c => c.body.op === 'approve_schedule').length, beforeSchedule + 1);
    const approved = calls.filter(c => c.body.op === 'approve_schedule').at(-1).body; assert.equal(approved.expected_manifest_hash, 'fixture-sha256-exact-preview'); assert.equal(approved.expected_version, 4); assert.deepEqual(approved.acknowledged_warning_ids, ['warning-video']); assert.equal(approved.acknowledge_exact_preview, true); assert.equal(approved.review_mode, 'owner_reviewed_with_warnings');
    assert.match(await page.locator('#campaign-approval').innerText(), /Owner approval recorded/);
    await page.locator('#campaign-pause').click(); await page.waitForFunction(() => window.CampaignReview.state.cycle.state === 'paused' && !window.CampaignReview.state.busy); assert.equal(calls.filter(c => c.body.op === 'pause').length, 1);
    mode = 'empty'; await page.goto(url); await page.getByText('No campaign has been drafted yet.').waitFor();
    mode = 'error'; await page.goto(url); await page.getByText('Campaign could not load').waitFor(); assert.match(await page.locator('[role="alert"]').innerText(), /Synthetic storage failure/);
    assert.equal(calls.some(c => c.method === 'POST' && !['validate', 'approve_schedule', 'pause'].includes(c.body.op)), false); assert.deepEqual(errors, []);
    fs.writeFileSync(output + '/validation.json', JSON.stringify({ kind: 'synthetic local fixture only', result: 'passed', scenarios: ['cold navigation', 'loading', '30 media/caption slots', 'Spanish preservation', 'server-grounded counts', 'unsaved local edits across filters and calendar', 'exact source manifest digest', 'no fabricated approval', 'mobile and landscape overflow', '44px controls', 'keyboard skip navigation', 'reduced motion', 'empty versus error', 'validation cursor resume in 3-asset steps', 'unavailable automated review', 'exact human preview acknowledgement', 'all warning IDs required', '409 stale version blocks retry until refresh', 'duplicate submit issues one POST', 'server receipt required', 'pause only from scheduled', 'no publish requests'], calls, errors }, null, 2));
    console.log('Campaign UI fixture acceptance passed: ' + output);
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
