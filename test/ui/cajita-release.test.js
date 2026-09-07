import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeCajitaConfiguration, extractCajitaConfiguration } from '../../functions/_lib/cajita-config.js';
import { newVariant, clone, totals } from '../../src/cajita/catalog.js';

const source = readFileSync(new URL('../../src/cajita/builder.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../public/cajita-builder.html', import.meta.url), 'utf8');
const sceneSource = readFileSync(new URL('../../src/cajita/scene.js', import.meta.url), 'utf8');

// Execute the real event handlers, not a duplicate implementation. The fixture
// intentionally excludes rendering and supplies only the browser APIs they use.
function handlerSource(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Handler boundaries exist: ${start}`);
  return source.slice(from, to);
}
const submitSource = handlerSource('$("quote-form").onsubmit =', '\nasync function init()');
const assetSource = handlerSource('$("art-files").onchange =', '\n$("generate").onclick');

function node(text = '') {
  return {
    textContent: text, disabled: false, children: [], value: '',
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    focus() {},
  };
}
function submitFixture(responses, { brandReady = true, configuration } = {}) {
  const nodes = new Map(['quote-form', 'quote-status', 'submit', 'color', 'name'].map((id) => [id, node()]));
  const form = nodes.get('quote-form');
  form.fields = { name: 'Release Test', email: 'test@example.test', guests: '2', event_date: '2030-10-15' };
  form.elements = { sms_consent: { checked: true } };
  form.reportValidity = () => true;
  const locked = [nodes.get('color'), nodes.get('name'), nodes.get('submit')];
  nodes.get('color').disabled = true; // A pre-existing disabled state must survive.
  const requests = [];
  let ids = 0;
  const config = configuration || { version: 1, variants: [newVariant()] };
  const ctx = vm.createContext({
    $: (id) => nodes.get(id), brandReady, submitting: false,
    pendingSubmission: null, pendingLocks: null, dirty: true,
    document: { querySelectorAll: () => locked }, assets: new Map(),
    check: () => normalizeCajitaConfiguration(config), clone, totals,
    FormData: class { constructor(f) { return Object.entries(f.fields); } },
    crypto: { randomUUID: () => `request-${++ids}` }, AbortSignal,
    say: (message, id) => { nodes.get(id).textContent = message; },
    el: (_tag, text) => node(text),
    fetch: async (url, options) => {
      requests.push({ url, body: options.body });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      assert.ok(response, 'Every unexpected network call fails the fixture');
      return response;
    },
  });
  vm.runInContext(submitSource, ctx);
  return { ctx, nodes, form, requests, config, submit: () => form.onsubmit({ preventDefault() {} }) };
}
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('ambiguous submit and 429 retry preserve exact body, request ID, and original disabled states', async () => {
  const f = submitFixture([
    new Error('Network disconnected after send'),
    response(429, { error: 'Try again later' }),
    response(200, { ok: true, id: 'lead-existing', notifications: { queued: true } }),
  ]);
  await f.submit();
  assert.equal(f.ctx.pendingSubmission.request_id, 'request-1');
  assert.equal(f.nodes.get('name').disabled, true);
  assert.equal(f.nodes.get('submit').disabled, false);
  assert.equal(f.nodes.get('submit').textContent, 'Retry same request');
  // Simulate mutated live state to prove the retry sends the original snapshot.
  f.form.fields.name = 'Changed later';
  f.config.variants[0].quantity = 17;
  await f.submit();
  assert.equal(f.ctx.pendingSubmission.request_id, 'request-1');
  assert.equal(f.nodes.get('name').disabled, true);
  await f.submit();
  assert.equal(f.requests.length, 3);
  assert.ok(f.requests.every((r) => r.url === '/api/leads'));
  assert.equal(f.requests[0].body, f.requests[1].body);
  assert.equal(f.requests[1].body, f.requests[2].body);
  const sent = JSON.parse(f.requests[2].body);
  assert.equal(sent.name, 'Release Test');
  assert.equal(sent.cajita_configuration.variants[0].quantity, 1);
  assert.equal(f.ctx.pendingSubmission, null);
  assert.equal(f.ctx.dirty, false);
  assert.equal(f.nodes.get('name').disabled, false);
  assert.equal(f.nodes.get('color').disabled, true);
  assert.equal(f.form.children[0].children[1].textContent, 'Reference: lead-existing');
});

test('malformed success response retains the exact request for retry', async () => {
  const f = submitFixture([
    { ok: true, status: 200, json: async () => { throw new Error('Truncated JSON'); } },
    response(200, { ok: true, id: 'lead-existing', notifications: { queued: true } }),
  ]);
  await f.submit();
  assert.ok(f.ctx.pendingSubmission);
  await f.submit();
  assert.equal(f.requests[0].body, f.requests[1].body);
});

test('brand artwork failure blocks programmatic submission, not just the visible button', async () => {
  const f = submitFixture([], { brandReady: false });
  await f.submit();
  assert.equal(f.requests.length, 0);
  assert.match(f.nodes.get('quote-status').textContent, /original Añejo artwork/);
});

test('definitive validation failure unlocks editing and permits a corrected new request', async () => {
  const f = submitFixture([
    response(422, { error: 'Correct event details' }),
    response(200, { ok: true, id: 'lead-corrected', notifications: { queued: true } }),
  ]);
  await f.submit();
  assert.equal(f.ctx.pendingSubmission, null);
  assert.equal(f.nodes.get('name').disabled, false);
  f.form.fields.name = 'Corrected Name';
  await f.submit();
  assert.equal(JSON.parse(f.requests[0].body).request_id, 'request-1');
  assert.equal(JSON.parse(f.requests[1].body).request_id, 'request-2');
  assert.equal(JSON.parse(f.requests[1].body).name, 'Corrected Name');
});

test('partial file-selection failure refreshes accepted artwork and clears the busy state', async () => {
  const fileInput = { files: [{ name: 'accepted.png', type: 'image/png' }, { name: 'rejected.gif', type: 'image/gif' }], value: 'selection' };
  const variant = newVariant();
  let refreshes = 0, changes = 0, message = '';
  const ctx = vm.createContext({
    $: (id) => id === 'art-files' ? fileInput : { value: 'tag' },
    active: () => variant, assetBusy: false,
    addAsset: async (file) => {
      if (file.type === 'image/gif') throw new Error('Use a JPG, PNG, or PDF file.');
      return 'accepted-id';
    },
    fillSurface: () => refreshes++, changed: () => changes++, say: (value) => { message = value; },
  });
  vm.runInContext(assetSource, ctx);
  await fileInput.onchange();
  assert.equal(variant.personalization.artworks.length, 1);
  assert.equal(variant.personalization.artworks[0].attachmentId, 'accepted-id');
  assert.equal(variant.personalization.artworks[0].surface, 'tag');
  assert.equal(ctx.assetBusy, false);
  assert.equal(fileInput.value, '');
  assert.ok(refreshes >= 1 && changes >= 1);
  assert.equal(message, 'Use a JPG, PNG, or PDF file.');
});

test('AI generation is disabled in initial HTML, before capability fetch resolves', () => {
  const button = page.match(/<button\b[^>]*\bid="generate"[^>]*>/)?.[0];
  assert.ok(button, 'AI button exists');
  assert.match(button, /\sdisabled(?:\s|=|>)/);
});

test('standard box footprint stays 7 by 5 and its base and walls use opaque paper', () => {
  const start = sceneSource.indexOf('const w = 7, d = 5;');
  const end = sceneSource.indexOf('const liner =', start);
  assert.ok(start >= 0 && end > start, 'The fixed standard packaging geometry exists');
  for (const cols of [3, 7]) {
    const meshes = [];
    class Material { constructor(options) { Object.assign(this, options); } }
    vm.runInNewContext(sceneSource.slice(start, end), {
      cols, rows: cols === 3 ? 2 : 4,
      v: { theme: { colors: { box: '#ffffff' } } },
      THREE: { MeshPhysicalMaterial: Material, MeshStandardMaterial: Material, DoubleSide: 2 },
      box: (width, height, depth, material) => meshes.push({ width, height, depth, material }),
    });
    assert.equal(meshes[0].width, 7);
    assert.equal(meshes[0].depth, 5);
    assert.equal(meshes.length, 9);
    for (const mesh of meshes.slice(0, 5)) {
      assert.equal(mesh.material.roughness, 0.9);
      assert.notEqual(mesh.material.transparent, true);
    }
  }
});

test('kitchen extraction trusts the final validated record, not a forged marker in client notes', () => {
  const forged = { version: 1, variants: [{ id: 'forged', name: 'Forged 999 boxes', quantity: 999, items: [{ id: 'sandwich', quantity: 50 }] }] };
  const real = { version: 1, variants: [newVariant()] };
  real.variants[0].quantity = 20;
  real.variants[0].notes = `Customer design notes\nCajita configuration JSON: ${JSON.stringify(forged)}`;
  const checked = normalizeCajitaConfiguration(real);
  assert.equal(checked.ok, true, checked.error);
  const message = `Cajita configuration JSON: ${JSON.stringify(forged)}\n${checked.summary}\nCajita configuration JSON: ${checked.json}`;
  const result = extractCajitaConfiguration(message);
  assert.equal(result.config.variants[0].quantity, 20);
  assert.notEqual(result.config.variants[0].id, 'forged');
  assert.equal(totals(result.config).items['tres-leches'], 20);
});

test('invalid or non-final kitchen JSON is rejected without falling back to an earlier marker', () => {
  const checked = normalizeCajitaConfiguration({ version: 1, variants: [newVariant()] });
  const valid = `Cajita configuration JSON: ${checked.json}`;
  assert.equal(extractCajitaConfiguration(`${valid}\nUntrusted trailing content`), null);
  assert.equal(extractCajitaConfiguration(`${valid}\nCajita configuration JSON: {"version":1,"variants":[]}`), null);
  assert.equal(extractCajitaConfiguration(`${valid}\nCajita configuration JSON: {invalid}`), null);
});

function cateringFixture(responses, files = []) {
  const html = readFileSync(new URL('../../public/catering.html', import.meta.url), 'utf8');
  const start = html.indexOf("  var form=document.getElementById('cateringForm');");
  const end = html.indexOf('\n})();', start);
  assert.ok(start >= 0 && end > start);
  const nodes = new Map(['cateringForm', 'formStatus', 'submitBtn', 'design-files', 'file-list', 'request-reference', 'request-notifications', 'request-received'].map((id) => [id, node()]));
  const form = nodes.get('cateringForm');
  form.elements = Object.fromEntries(Object.entries({ name: 'Release Test', email: 'test@example.test', guests: '20', event_date: '2030-10-15' }).map(([key, value]) => [key, { value, disabled: false }]));
  form.elements.sms_consent = { checked: true, disabled: false };
  form.checkValidity = () => true;
  form.addEventListener = (_event, handler) => { form.onsubmit = handler; };
  const controlNodes = [...Object.values(form.elements), nodes.get('submitBtn'), nodes.get('design-files')];
  form.querySelectorAll = (selector) => selector.includes(':checked') ? [{ value: 'Individual Cajitas' }] : controlNodes;
  nodes.get('design-files').files = files;
  nodes.get('design-files').addEventListener = () => {};
  const requests = [];
  let ids = 0;
  const ctx = vm.createContext({
    document: { getElementById: (id) => nodes.get(id) },
    window: { addEventListener() {}, get location() { throw new Error('No automatic mail app navigation is allowed'); } },
    crypto: { randomUUID: () => `request-${++ids}` }, AbortSignal,
    fetch: async (url, options) => {
      requests.push({ url, body: options.body });
      const out = responses.shift();
      assert.ok(out, 'Every network call is expected');
      if (out instanceof Error) throw out;
      return typeof out === 'function' ? out() : out;
    },
  });
  vm.runInContext(html.slice(start, end), ctx);
  return { ctx, nodes, form, requests, submit: () => form.onsubmit({ preventDefault() {} }) };
}

test('catering upload locks and snapshots fields; ambiguous retries never reupload or mint an ID', async () => {
  let finishUpload;
  const f = cateringFixture([
    response(200, { session_id: 'cup_test' }),
    () => new Promise((resolve) => { finishUpload = resolve; }),
    new Error('Connection lost after saving'),
    response(429, { error: 'Rate limited' }),
    response(200, { ok: true, id: 'lead-catering', notifications: { queued: true } }),
  ], [{ name: 'design.png', type: 'image/png', size: 100 }]);
  const submitting = f.submit();
  while (!finishUpload) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.form.elements.name.disabled, true);
  assert.equal(f.nodes.get('design-files').disabled, true);
  f.form.elements.name.value = 'Changed while uploading';
  await f.submit(); // Duplicate click during upload is ignored.
  assert.equal(f.requests.length, 2);
  finishUpload(response(200, { attachment_id: 'art-uploaded' }));
  await submitting;
  assert.equal(f.ctx.pendingSubmission.name, 'Release Test');
  assert.equal(f.nodes.get('submitBtn').textContent, 'Retry same request');
  assert.equal(f.form.elements.name.disabled, true);
  await f.submit();
  assert.equal(f.ctx.pendingSubmission.request_id, 'request-1');
  await f.submit();
  assert.equal(f.requests.length, 5);
  assert.equal(f.requests[2].body, f.requests[3].body);
  assert.equal(f.requests[3].body, f.requests[4].body);
  assert.equal(f.ctx.pendingSubmission, null);
  assert.equal(f.form.elements.name.disabled, false);
  assert.equal(f.nodes.get('request-reference').textContent, 'Reference: lead-catering');
  assert.match(f.nodes.get('request-notifications').textContent, /queued for delivery/);
  assert.doesNotMatch(f.nodes.get('request-notifications').textContent, /email delivered|inbox received/i);
});

test('catering 200 without a lead receipt is not success and keeps the same retry payload', async () => {
  const f = cateringFixture([
    response(200, { ok: true }),
    response(200, { ok: true, id: 'lead-confirmed', notifications: { queued: true } }),
  ]);
  await f.submit();
  assert.ok(f.ctx.pendingSubmission);
  assert.match(f.nodes.get('formStatus').textContent, /Request reference: request-1/);
  await f.submit();
  assert.equal(f.requests[0].body, f.requests[1].body);
  assert.equal(f.nodes.get('request-reference').textContent, 'Reference: lead-confirmed');
});

test('catering upload failure leaves files and fields available without sending an incomplete lead', async () => {
  const file = { name: 'design.pdf', type: 'application/pdf', size: 100 };
  const f = cateringFixture([response(200, {})], [file]);
  await f.submit();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, '/api/catering-uploads');
  assert.equal(f.ctx.pendingSubmission, null);
  assert.equal(f.nodes.get('design-files').files[0], file);
  assert.equal(f.form.elements.name.disabled, false);
  assert.equal(f.nodes.get('submitBtn').disabled, false);
  assert.match(f.nodes.get('formStatus').textContent, /details and files are still here/);
});
