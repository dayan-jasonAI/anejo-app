/* global console, process, URL, document, window, localStorage, __dirname */
'use strict';
// Synthetic records only. This serves the real dashboard and browser assets; no provider is contacted.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = process.env.ANEJO_AUDIT_CANONICAL || path.resolve(__dirname, '../..');
const out = process.env.ANEJO_OWNER_AUDIT_OUT || '/Users/aiagent/Dayan Workspace/Aether/anejo-deliverables/bilingual-owner-release-2026-10-27/OWNER_POPULATED_FINAL';
fs.mkdirSync(out, { recursive: true });
const now = Date.now(), calls = [], checks = [], errors = [], externalRequests = [], served = new Map();
let businessWrites = 0, telemetryPosts = 0;
let activityHelpers;
const helperFile = path.join(root, 'functions/_lib/activity_labels.js');
let helperHash;
const events = ['dashboard.viewed', 'user.signed_in', 'team_lead.message', 'automation.run', 'sales.prospect_scored', 'social.post_scheduled', 'social.post_drafted', 'social.post_archived', 'social.post_published', 'sales.outreach_drafted', 'sales.organization_enriched', 'agent_task.completed', 'future.synthetic_event'];
const alerts = [
  { id: 'fixture-route', alert_type: 'delivery_failed', severity: 'critical', title: 'Route unfilled — no driver accepted', body: 'No available driver accepted the route for 2026-10-31 (1 stops). Assign one manually from Deliveries.', created_at: now - 120000 },
  { id: 'fixture-catering', alert_type: 'catering_followup_due', severity: 'warning', title: 'Catering lead needs your response', body: 'English: Review the request and contact the customer.', created_at: now - 3600000 }
];
function payload(u) {
  switch (u.pathname) {
    case '/api/me': return { ok: true, authenticated: true, role: 'owner', email: 'synthetic@example.test', staff: { role: 'owner', name: 'English', lang: 'en' } };
    case '/api/hub/training/status': return { ok: true, prompt: false };
    case '/api/hub/comms/unread': return { ok: true, unread: 0 };
    case '/api/hub/kitchen/event': return { ok: true, events: [{ id: 'fixture-event', customer_name: 'English', event_date: '2026-10-31', days_out: 1, serving_time: '12:00', guests: 30, balance_status: 'paid', deposit_status: 'paid' }] };
    case '/api/hub/owner/ready-orders': return { ok: true, total: 1, awaiting_driver: 1, items: [{ id: 'fixture-order', customer_name: 'English', delivery_date: '2026-10-31', delivery_window: 'lunch', awaiting_driver: true }] };
    case '/api/hub/owner/overview': return { ok: true, tiles: { orders_open: 3, pending_checkout: 2, deliveries_today: 5, deliveries_failed: 1, on_shift: 4, eod_submitted: 1, eod_expected: 2, eod_pct: 50, tickets_open: 1, expenses_pending: 2, temp_excursions_today: 1, alerts_open: 2, alerts_critical: 1 } };
    case '/api/hub/owner/alerts': return { ok: true, items: alerts };
    case '/api/hub/owner/activity': return { ok: true, items: events.map((event, index) => {
      const row = { id: 'fixture-activity-' + index, event, actor_name: index === 1 ? 'English' : null, actor_type: index % 2 ? 'staff' : 'system', actor_role: index % 2 ? 'owner' : null, team: index === events.length - 1 ? 'English' : 'kitchen', created_at: now - 120000 };
      return { ...row, label: activityHelpers.eventLabel(event), label_es: activityHelpers.eventLabel(event, 'es'), actor: activityHelpers.actorLabel(row), actor_es: activityHelpers.actorLabel(row, 'es') };
    }) };
    default: return { ok: true };
  }
}
const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname.startsWith('/api/')) {
      calls.push({ path: u.pathname, method: req.method });
      if (req.method !== 'GET') {
        if (u.pathname === '/api/hub/track' && req.method === 'POST') telemetryPosts++;
        else { businessWrites++; res.statusCode = 405; }
        res.setHeader('Content-Type', 'application/json'); return res.end('{"ok":true}');
      }
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(payload(u)));
    }
    const file = path.resolve(root, 'public', '.' + decodeURIComponent(u.pathname));
    if (!file.startsWith(path.join(root, 'public') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.statusCode = 404; return res.end(); }
    const bytes = fs.readFileSync(file), hash = crypto.createHash('sha256').update(bytes).digest('hex');
    if (!served.has(file)) served.set(file, new Set());
    served.get(file).add(hash);
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
    res.end(bytes);
  } catch (error) { res.statusCode = 500; res.end(error.message); }
});
function normalize(s) { return s.replace(/\s+/g, ' ').trim(); }
function same(actual, expected, label) { assert.equal(normalize(actual), normalize(expected), label); }
(async () => {
  helperHash = crypto.createHash('sha256').update(fs.readFileSync(helperFile)).digest('hex');
  activityHelpers = await import(pathToFileURL(helperFile).href);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === base) return route.continue();
    externalRequests.push(route.request().url()); return route.abort();
  });
  await context.addInitScript(fixtureNow => { Date.now = () => fixtureNow; localStorage.setItem('anejo:lang', 'en'); localStorage.setItem('anejo_hub_role', 'owner'); }, now);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const snapshots = [];
  let failure = null;
  try {
    await page.goto(base + '/hub/owner/index.html');
    await page.locator('#feed > .row').nth(events.length - 1).waitFor();
    await page.locator('#ready-panel [data-ready-refresh]').waitFor();
    await page.waitForFunction(() => window.AnejoI18n && document.querySelector('#hub-i18n-coverage-js'));
    for (const lang of ['en', 'es', 'en']) {
      if (await page.evaluate(() => window.AnejoLang.get()) !== lang) await page.locator('#lang-toggle').click();
      await page.waitForFunction(wanted => document.documentElement.lang === wanted, lang);
      // Real dictionaries refresh synchronously on toggle; allow queued network-triggered refresh.
      await page.waitForTimeout(150);
      const texts = await page.evaluate(() => ({
        alerts: [...document.querySelectorAll('#alerts .list > .row')].map(e => e.innerText),
        feed: [...document.querySelectorAll('#feed > .row')].map(e => e.innerText),
        tiles: document.querySelector('#tiles').innerText,
        event: document.querySelector('#event-panel').innerText,
        readiness: document.querySelector('#ready-panel').innerText
      }));
      snapshots.push({ lang, ...texts });
      assert.equal(texts.alerts.length, 2);
      assert.equal(texts.feed.length, events.length);
      // Full cards, not chosen fragments: a hidden English suffix must fail this acceptance.
      validateCards(texts, lang);
      assert.match(texts.event, /English/);
      assert.doesNotMatch(texts.event, /Inglés/);
      assert.match(texts.event, /2026-10-31/);
      assert.match(texts.event, /12:00/);
      assert.match(texts.readiness, /English/);
      assert.doesNotMatch(texts.readiness, /Inglés/);
      assert.match(texts.readiness, /fixture-order/);
      assert.equal(await page.locator('#alerts [data-ack]').evaluateAll(es => es.map(e => e.getAttribute('data-ack')).join(',')), 'fixture-route,fixture-catering');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, '375px horizontal overflow');
      await page.screenshot({ path: path.join(out, 'owner-' + lang + '-375.png'), fullPage: true });
      checks.push(lang + ': full populated alert/feed cards, source fields, canonical actions, real assets and 375px overflow');
    }
    assert.equal(businessWrites, 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, [], 'No external/provider request attempted');
    const required = ['public/hub/owner/index.html', 'public/hub/owner/assets/owner.js', 'public/hub/owner/assets/readiness.js', 'public/hub/assets/hub.js', 'public/assets/js/i18n.js', 'public/assets/js/public-i18n-coverage.js', 'public/hub/assets/hub-i18n.js', 'public/hub/assets/hub-i18n-coverage.js'];
    for (const relative of required) assert(served.has(path.join(root, relative)), 'Required actual browser asset served: ' + relative);
    const drift = [...served].filter(([file, hashes]) => hashes.size !== 1 || !hashes.has(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'))).map(([file]) => file);
    assert.deepEqual(drift, [], 'Source changed during acceptance; rerun against a stable checkout');
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(helperFile)).digest('hex'), helperHash, 'Activity helper changed during acceptance');
    checks.push('zero business mutations/provider requests; no pageerrors; actual runtime/dictionaries served; source hashes stable');
  } catch (error) {
    failure = error;
    await page.screenshot({ path: path.join(out, 'owner-failure-375.png'), fullPage: true }).catch(() => {});
  } finally {
    const report = { at: new Date().toISOString(), status: failure ? 'local_synthetic_failed' : 'local_synthetic_pass', checks, failure: failure && failure.stack, errors, businessWrites, telemetryPosts, externalRequestsBlocked: externalRequests, calls, snapshots, activity_helper_hash: helperHash, served_source_versions: Object.fromEntries([...served].map(([file, hashes]) => [path.relative(root, file), [...hashes]])), limits: ['Synthetic local payloads/auth only; actual dashboard and runtime browser assets. Actual backend event/actor label helpers populate synthetic activity responses.', 'Telemetry POSTs are locally intercepted. External requests are blocked; no provider calls, real client records, database writes, deployment or live behavior verified.'] };
    fs.writeFileSync(path.join(out, 'BROWSER_VALIDATION.json'), JSON.stringify(report, null, 2));
    await browser.close(); await new Promise(resolve => server.close(resolve)); server.closeAllConnections();
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ checks: checks.length, errors, businessWrites, report: path.join(out, 'BROWSER_VALIDATION.json') }));
})().catch(error => { console.error(error); server.close(); server.closeAllConnections(); process.exitCode = 1; });

function validateCards(texts, lang) {
  const es = lang === 'es';
  same(texts.alerts[0], es
    ? 'Ruta sin asignar: ningún conductor aceptó Ningún conductor disponible aceptó la ruta del 2026-10-31 (1 paradas). Asigna uno manualmente desde Entregas. · hace 2 min CRÍTICO Visto'
    : 'Route unfilled — no driver accepted No available driver accepted the route for 2026-10-31 (1 stops). Assign one manually from Deliveries. · 2m ago CRITICAL Ack', 'Full route alert ' + lang);
  same(texts.alerts[1], es
    ? 'Un prospecto de catering necesita tu respuesta English: Revisa la solicitud y contacta al cliente. · hace 1 h ADVERTENCIA Visto'
    : 'Catering lead needs your response English: Review the request and contact the customer. · 1h ago WARNING Ack', 'Full catering alert ' + lang);
  // Imported real helper outputs are the API contract; independent known translations below
  // additionally reject helpers that return English or raw machine keys as Spanish labels.
  const explicit = {
    'dashboard.viewed': ['Opened the dashboard', 'Abrió el panel'],
    'user.signed_in': ['Signed in', 'Inició sesión'],
    'team_lead.message': ['Sent a team-lead message', 'Envió un mensaje al líder del equipo'],
    'automation.run': ['An automation ran', 'Se ejecutó una automatización']
  };
  const items = payload(new URL('http://127.0.0.1/api/hub/owner/activity')).items;
  items.forEach((item, index) => {
    const label = es ? item.label_es : item.label;
    if (explicit[item.event]) assert.equal(label, explicit[item.event][es ? 1 : 0]);
    assert.notEqual(item.label_es, item.label, 'Backend Spanish label exists for ' + item.event);
    assert.doesNotMatch(label, /^[a-z_]+\.[a-z_]+$/, 'Readable label replaces machine key');
    if (index === items.length - 1 && es) assert.equal(label, 'Actividad registrada');
    const actor = es ? item.actor_es : item.actor;
    const team = item.team === 'kitchen' ? (es ? 'Cocina' : 'Kitchen') : item.team;
    same(texts.feed[index], label + ' ' + actor + ' · ' + team + ' · ' + (es ? 'hace 2 min' : '2m ago'), 'Full activity card ' + item.event + ' ' + lang);
    if (es) assert.doesNotMatch(texts.feed[index], /\b(?:system|owner|kitchen|ago|Opened|Signed|Sent|automation|Scored|Scheduled|Drafted|Published|Archived|finished)\b/, 'No English dynamic prose in full Spanish activity card');
  });
  assert.match(texts.feed[1], /English/, 'Actual actor name preserved');
  assert.match(texts.feed[items.length - 1], /English/, 'Unknown team source preserved');
  assert.match(texts.tiles, es ? /PAGOS PENDIENTES/ : /UNPAID CHECKOUTS/);
  assert.match(texts.tiles, es ? /NO (?:ES )?COCINA/ : /NOT KITCHEN/);
  if (es) {
    assert.doesNotMatch(texts.tiles, /NOT KITCHEN|\bFAILED\b|\bCRIT\b/);
    assert.doesNotMatch(texts.alerts.join(' '), /No available driver|Assign one manually|Review the request|needs your response|\bago\b/);
    assert.doesNotMatch(texts.event, /guests|tap for|TOMORROW|PAID IN FULL/);
    assert.match(texts.event, /30 invitados/);
    assert.match(texts.event, /toca para ver el plan de producción/);
  } else {
    assert.match(texts.event, /30 guests/);
    assert.match(texts.event, /tap for the production plan/);
  }
}
