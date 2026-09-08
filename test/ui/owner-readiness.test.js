import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../public/hub/owner/assets/readiness.js', import.meta.url), 'utf8');
const deliveries = readFileSync(new URL('../../public/hub/owner/deliveries.html', import.meta.url), 'utf8');
function fixture() {
  let language = 'en', response = { ok:true, total:1, awaiting_driver:1, items:[{ id:'ord-1', customer_name:'María <private>', delivery_date:'2026-09-09', delivery_window:'lunch', awaiting_driver:true }] };
  const events = {}, calls = [], labels = [], root = { innerHTML:'', setAttribute(){}, querySelector:() => ({ addEventListener(){} }) };
  const listen = (name, fn) => { const prior = events[name]; events[name] = () => { if (prior) prior(); fn(); }; };
  let tick;
  const context = vm.createContext({ URLSearchParams, Date, window:{
    AnejoLang:{ get:() => language },
    Owner:{ get:async url => { calls.push(url); return response; } },
    setInterval:fn => { tick = fn; return 1; }, clearInterval(){}, addEventListener:listen,
  }, document:{ hidden:false, querySelectorAll:() => labels, getElementById:id => id === 'ready-panel' ? root : null, addEventListener:listen } });
  vm.runInContext(source, context);
  return { api:context.window.OwnerReadiness, root, calls, events, labels, tick:() => tick(), setResponse:value => { response = value; }, changeLang:value => { language = value; events['anejo:langchange'](); } };
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
  assert.match(f.root.innerHTML, /Almuerzo/);
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
  assert.match(f.root.innerHTML, /route=r2#rexisting/);
  assert.doesNotMatch(f.root.innerHTML, />Assign driver</);
});

test('language changes update assignment text without modifying selected driver values or checked state', () => {
  const f = fixture(), attributes = {};
  const driver = { textContent:'', value:'driver-original', selected:true, checked:true, setAttribute:(key,value) => { attributes[key] = value; }, getAttribute:key => attributes[key] };
  f.labels.push(driver);
  f.api.setLabel(driver, 'QA María 🟢 available', 'QA María 🟢 disponible');
  f.changeLang('es');
  assert.equal(driver.textContent, 'QA María 🟢 disponible');
  assert.equal(driver.value, 'driver-original');
  assert.equal(driver.selected, true);
  assert.equal(driver.checked, true);
  f.changeLang('en');
  assert.equal(driver.textContent, 'QA María 🟢 available');
  assert.equal(attributes.translate, 'no');
  assert.match(deliveries, /OwnerReadiness\.setLabel\(btn, 'Assign '/);
  assert.match(deliveries, /OwnerReadiness\.label\('Lunch', 'Almuerzo'\)/);
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
