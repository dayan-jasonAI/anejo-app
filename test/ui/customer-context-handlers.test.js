import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL(`../../public/hub/owner/${name}.html`, import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// A deliberately small DOM adapter for these inline modules: parse rendered controls,
// retain listeners and clear stale controls when a real render replaces the container.
// Calling listeners directly also tests the handler's duplicate guard independently
// of the browser's suppression of clicks on disabled buttons.
function element(attrs = {}) {
  let markup = '', text = '';
  return {
    attrs, children: [], listeners: {}, disabled: 'disabled' in attrs, checked: 'checked' in attrs,
    style: {}, classList: { add() {}, remove() {} }, value: '',
    getAttribute(name) { return this.attrs[name] ?? null; },
    addEventListener(name, fn) { this.listeners[name] = fn; },
    fire(name) { assert.equal(typeof this.listeners[name], 'function'); this.listeners[name].call(this); },
    querySelectorAll(selector) {
      const attribute = selector.match(/^\[([^\]]+)\]$/)?.[1];
      assert.ok(attribute, `Unsupported test selector ${selector}`);
      return this.children.filter(child => attribute in child.attrs);
    },
    get innerHTML() { return markup; },
    set innerHTML(value) {
      markup = String(value); text = ''; this.children = [];
      for (const tag of markup.matchAll(/<[a-z][a-z0-9]*\b([^>]*)>/gi)) {
        const attributes = {};
        for (const match of tag[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attributes[match[1]] = match[2] ?? '';
        this.children.push(element(attributes));
      }
    },
    get textContent() { return text; },
    set textContent(value) { text = String(value); markup = ''; this.children = []; }
  };
}

async function harness(surface) {
  const marketing = surface === 'marketing';
  const containers = marketing ? { 'training-root': element() } : { list: element(), stat: element() };
  const root = containers[marketing ? 'training-root' : 'list'];
  const document = {
    getElementById: id => containers[id] || root.children.find(node => node.attrs.id === id),
    querySelectorAll: selector => root.querySelectorAll(selector)
  };
  const reads = [], writes = [], toasts = [];
  const write = deferred(), readback = deferred();
  const row = { id: 'target', text: 'Saved guidance', title: 'Saved document', active: 1,
    status: 'ready', source_kind: 'internal', chunk_count: 1, customer_eligible: 0, updated_at: '731' };
  function response(eligible = 0, version = '731') {
    const rows = [{ ...row, id: 'other', updated_at: '19' }, { ...row, customer_eligible: eligible, updated_at: version }];
    return marketing
      ? { ok: true, trained: false, can_manage_customer_context: true, rules: rows, examples: [] }
      : { ok: true, vectorize: true, claude: true, searchable_chunks: 2, can_manage_customer_context: true, items: rows };
  }
  function get(path) { reads.push(path); return reads.length === 1 ? Promise.resolve(response()) : readback.promise; }
  function post(path, body) { writes.push({ path, body: JSON.parse(JSON.stringify(body)) }); return write.promise; }
  const context = {
    window: {}, document, esc: String, eligibilityNotice: '', $: id => document.getElementById(id),
    Owner: { get }, Hub: { esc: String, toast: value => toasts.push(value), api: (path, options) => post(path, options.body) },
    fetch: async (path, options = {}) => {
      const result = await (options.method === 'POST' ? post(path, JSON.parse(options.body)) : get(path));
      return { status: result?._status || 200, json: async () => result };
    }
  };
  const source = read(surface);
  if (marketing) {
    const module = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(match => match[1].includes('window.MarketingTabs.teachTraining ='));
    assert.ok(module, 'Training inline module exists');
    vm.runInNewContext(module[1], context);
    context.window.MarketingTabs.teachTraining();
  } else {
    const helperStart = source.indexOf('  function findByData(');
    const helperEnd = source.indexOf('  // --- upload ---', helperStart);
    const loadStart = source.indexOf('  function load(){', source.indexOf('  // --- library ---'));
    const loadEnd = source.indexOf('})();', loadStart);
    assert.ok(helperStart >= 0 && helperEnd > helperStart && loadStart >= 0 && loadEnd > loadStart);
    vm.runInNewContext(source.slice(helperStart, helperEnd) + source.slice(loadStart, loadEnd), context);
  }
  await tick();
  const toggleAttr = marketing ? 'data-rule-customer-toggle' : 'data-customer-toggle';
  const saveAttr = marketing ? 'data-save-rule-customer' : 'data-save-customer';
  const find = attr => root.querySelectorAll(`[${attr}]`).find(node => node.getAttribute(attr) === 'target');
  return {
    reads, writes, toasts, write, readback, response, root,
    input: () => find(toggleAttr), button: () => find(saveAttr),
    rendered: () => Object.values(containers).map(node => node.innerHTML + node.textContent).join('\n'),
    start() {
      const input = find(toggleAttr), button = find(saveAttr);
      assert.equal(button.disabled, true, 'unchanged eligibility cannot be submitted');
      input.checked = true; input.fire('change');
      assert.equal(button.disabled, false);
      input.checked = false; input.fire('change');
      assert.equal(button.disabled, true, 'reverting the checkbox clears the pending change');
      input.checked = true; input.fire('change'); button.fire('click');
      assert.equal(input.disabled, true); assert.equal(button.disabled, true);
      button.fire('click');
      assert.equal(writes.length, 1, 'duplicate clicks cannot submit a second write');
      assert.deepEqual(writes[0].body, { op: 'set_customer_eligibility', id: 'target', customer_eligible: true, expected_updated_at: 731 });
      assert.doesNotMatch(this.rendered(), /Enabled for customer answer context/);
    }
  };
}

for (const surface of ['marketing', 'knowledge']) {
  test(`${surface}: eligibility saves loaded row version and waits for authoritative readback`, async () => {
    const h = await harness(surface); h.start();
    h.write.resolve({ ok: true }); await tick();
    assert.equal(h.reads.length, 2);
    assert.equal(h.reads[0], `/api/hub/owner/${surface === 'marketing' ? 'team-training' : 'knowledge'}`);
    assert.equal(h.writes[0].path, h.reads[0]);
    assert.equal(h.reads[1], h.reads[0]);
    assert.equal(h.button().disabled, true, 'readback is still pending');
    assert.doesNotMatch(h.rendered(), /Enabled for customer answer context/);
    h.readback.resolve(h.response(1, '732')); await tick();
    assert.equal(h.input().checked, true);
    assert.equal(h.input().disabled, false);
    assert.equal(h.button().disabled, true);
    assert.match(h.rendered(), /Enabled for customer answer context/);
    h.input().checked = false; h.input().fire('change'); h.button().fire('click'); await tick();
    assert.equal(h.writes[1].body.expected_updated_at, 732, 'the next write uses the reread version');
    assert.equal(h.writes[1].body.customer_eligible, false);
  });

  test(`${surface}: conflict shows returned source state and preserves the conflict warning`, async () => {
    const h = await harness(surface); h.start();
    h.write.resolve({ ok: false, _status: 409, error: 'Source changed; review current content.' }); await tick();
    assert.equal(h.reads.length, 2);
    h.readback.resolve(h.response(0, '740')); await tick();
    assert.equal(h.input().checked, false);
    assert.equal(h.button().disabled, true);
    assert.match(h.rendered(), /Source changed; review current content\./);
    assert.doesNotMatch(h.rendered(), /Enabled for customer answer context/);
    assert.deepEqual(h.toasts, []);
  });

  for (const failure of ['rejected read', 'unsuccessful read']) {
    test(`${surface}: successful write followed by ${failure} never claims saved eligibility`, async () => {
      const h = await harness(surface); h.start();
      h.write.resolve({ ok: true }); await tick();
      assert.equal(h.reads.length, 2);
      if (failure === 'rejected read') h.readback.reject(new Error('Offline'));
      else h.readback.resolve({ ok: false, error: 'Read unavailable' });
      await tick();
      assert.match(h.rendered(), /Could not (?:re)?load/);
      assert.doesNotMatch(h.rendered(), /Enabled for customer answer context/);
      assert.equal(h.button(), undefined, 'unverified stale controls are removed');
      assert.deepEqual(h.toasts, []);
      assert.equal(h.writes.length, 1);
    });
  }
}
