import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const page = readFileSync(new URL('../../public/hub/kitchen/event.html', import.meta.url), 'utf8');
const source = page.slice(page.indexOf('  function saveTask(box)'), page.indexOf('  function wire()'));
function fixture(previous, requested, response) {
  let done = previous;
  const row = { classList: { contains: () => done, toggle: (_, value) => { done = value; } } };
  const box = { checked: requested, disabled: false, dataset: { key: 'pack' }, closest: () => row };
  let payload;
  const ctx = vm.createContext({ quoteId: 'cq_test', post: (body) => { payload = body; return response; } });
  vm.runInContext(source, ctx);
  return { box, run: () => ctx.saveTask(box), done: () => done, payload: () => payload };
}
test('completion appears only after acknowledged save', async () => {
  let resolve;
  const f = fixture(false, true, new Promise(r => { resolve = r; }));
  const pending = f.run();
  assert.equal(f.box.disabled, true); assert.equal(f.done(), false);
  assert.equal(f.payload().done, true);
  resolve({ ok: true }); await pending;
  assert.equal(f.done(), true); assert.equal(f.box.checked, true); assert.equal(f.box.disabled, false);
});
for (const previous of [false, true]) {
  for (const failure of ['server', 'network', 'empty']) test(`${failure} failure restores ${previous ? 'completed' : 'incomplete'} task`, async () => {
    const response = failure === 'network' ? Promise.reject(new Error('offline')) : Promise.resolve(failure === 'server' ? { ok: false } : undefined);
    const f = fixture(previous, !previous, response); await f.run();
    assert.equal(f.box.checked, previous); assert.equal(f.done(), previous); assert.equal(f.box.disabled, false);
  });
}
