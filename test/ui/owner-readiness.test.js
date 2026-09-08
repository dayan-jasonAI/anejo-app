import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../public/hub/owner/assets/readiness.js', import.meta.url), 'utf8');
const deliveries = readFileSync(new URL('../../public/hub/owner/deliveries.html', import.meta.url), 'utf8');
function fixture() {
  let language = 'en', response = { ok:true, total:1, awaiting_driver:1, items:[{ id:'ord-1', customer_name:'María <private>', delivery_date:'2026-09-09', awaiting_driver:true }] };
  const events = {}, calls = [], root = { innerHTML:'', setAttribute(){}, querySelector:() => ({ addEventListener(){} }) };
  let tick;
  const context = vm.createContext({ URLSearchParams, Date, window:{
    AnejoLang:{ get:() => language },
    Owner:{ get:async url => { calls.push(url); return response; } },
    setInterval:fn => { tick = fn; return 1; }, clearInterval(){}, addEventListener:(name, fn) => { events[name] = fn; },
  }, document:{ hidden:false, querySelectorAll:() => [], getElementById:id => id === 'ready-panel' ? root : null, addEventListener:(name, fn) => { events[name] = fn; } } });
  vm.runInContext(source, context);
  return { api:context.window.OwnerReadiness, root, calls, events, tick:() => tick(), setResponse:value => { response = value; }, changeLang:value => { language = value; events['anejo:langchange'](); } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('ready panel shows actionable assignment state, exact escaped customer copy and safe date/order link', async () => {
  const f = fixture(); f.api.mount('ready-panel'); await flush();
  assert.match(f.root.innerHTML, /1 awaiting a driver/);
  assert.match(f.root.innerHTML, /María &lt;private&gt;/);
  assert.match(f.root.innerHTML, /order=ord-1&amp;date=2026-09-09#assign/);
  assert.match(f.root.innerHTML, /Ready · assign a driver/);
  f.changeLang('es');
  assert.match(f.root.innerHTML, /esperando conductor/);
  assert.match(f.root.innerHTML, /Listo · asignar conductor/);
  assert.match(f.root.innerHTML, /María &lt;private&gt;/);
});

test('readiness failure retains successful snapshot and labels it unverified instead of reporting no orders', async () => {
  const f = fixture(); f.api.mount('ready-panel'); await flush();
  f.setResponse({ error:'offline' }); f.tick(); await flush();
  assert.match(f.root.innerHTML, /Readiness is unverified/);
  assert.match(f.root.innerHTML, /ord-1/);
  assert.doesNotMatch(f.root.innerHTML, /No orders currently/);
});

test('initial readiness failure never claims a zero count', async () => {
  const f = fixture(); f.setResponse({ ok:false }); f.api.mount('ready-panel'); await flush();
  assert.match(f.root.innerHTML, /Could not refresh/);
  assert.doesNotMatch(f.root.innerHTML, /0 ready|No orders currently/);
});

test('a ready order with an unfilled existing route opens the route rather than inviting duplicate assignment', async () => {
  const f = fixture(); f.setResponse({ ok:true, total:1, awaiting_driver:1, items:[{ id:'o2', route_id:'r2', awaiting_driver:true }] });
  f.api.mount('ready-panel'); await flush();
  assert.match(f.root.innerHTML, /Ready · awaiting driver/);
  assert.match(f.root.innerHTML, /View route/);
  assert.doesNotMatch(f.root.innerHTML, />Assign driver</);
});

test('feed refresh is read-only, scoped to panel, and focus refreshes without replacing assignment controls', async () => {
  const f = fixture(); f.api.mount('ready-panel'); await flush(); f.events.focus(); await flush();
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(url => url === '/api/hub/owner/ready-orders'));
  assert.doesNotMatch(source, /rdriver|rorders|\.value\s*=|method:\s*['"]POST|fetch\(/);
  assert.match(deliveries, /dsel\.value = selectedDriver/);
  assert.match(deliveries, /selectedOrders\.indexOf\(o\.id\) >= 0/);
  assert.match(deliveries, /requestNumber !== assignmentRequest/);
  assert.doesNotMatch(deliveries, /setInterval\(loadAssign/);
});

test('deep links highlight without selecting or assigning orders; malformed date is omitted', () => {
  const f = fixture();
  assert.equal(f.api.deliveryUrl({ id:'abc&other=1', delivery_date:'"bad' }), '/hub/owner/deliveries.html?order=abc%26other%3D1#assign');
  assert.match(deliveries, /linkedOrder === o\.id \? ';outline/);
  assert.doesNotMatch(deliveries, /linkedOrder === o\.id \? ' checked'/);
  assert.match(deliveries, /linkedDate \|\| localToday\(\)/);
});

test('all three owner surfaces load the shared live readiness panel', () => {
  for (const page of ['index','orders','deliveries']) {
    const html = readFileSync(new URL('../../public/hub/owner/' + page + '.html', import.meta.url), 'utf8');
    assert.match(html, /\/hub\/owner\/assets\/readiness\.js/);
    assert.match(html, /OwnerReadiness\.mount\('ready-panel'\)/);
    for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  }
});
