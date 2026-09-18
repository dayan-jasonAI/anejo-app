import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code = readFileSync(new URL('../../public/hub/owner/assets/marketing-library.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function node(tag = '') { return { tag, children: [], value: '', dataset: {}, style: {}, append(...n) { this.children.push(...n); }, prepend(n) { this.children.unshift(n); }, replaceChildren(...n) { this.children = n; }, setAttribute(k, v) { this[k] = v; } }; }
function descendants(n) { return [n, ...n.children.flatMap(descendants)]; }
async function setup({ record = null, catalog = true, unavailable = false, truncated = false, conflict = false } = {}) {
  const nodes = Object.fromEntries(['status','folder','files','grid','empty','more','refresh','drop','search','count','choose'].map(k => [k, node()]));
  const root = node(); root.querySelector = s => nodes[s.match(/data-photo-(.*)\]/)[1]]; root.querySelectorAll = () => [];
  const key = 'marketing-library/photo.jpg', calls = [];
  const context = { document: { getElementById: () => root, createElement: node }, window: {}, Hub: { api: async (path, opts) => {
    calls.push({ path, opts });
    if (opts) return conflict ? { ok: false, error: 'Review revision changed. Reload before retrying.' } : { ok: true };
    if (path.startsWith('/api/hub/owner/marketing-library')) return { ok: true, photos: [{ media_key: key, url: '/api/hub/media/'+key, name: 'Food', content_type: 'image/jpeg' }] };
    if (path === '/api/menu') return { ok: true, source: catalog ? 'd1' : 'fallback', bowls: [{ id: 'menu-real-id', name: 'Real menu bowl' }], addons: [{ id: 'tray-real-id', name: 'Actual tray' }] };
    return unavailable ? { ok: false, error: 'Asset registry unavailable' } : { ok: true, assets: record ? [{ ...record, asset_key: key }] : [], truncated };
  } } };
  vm.runInNewContext(code, context); context.window.MarketingPhotoLibrary.mount(); await tick();
  const detail = descendants(nodes.grid).find(n => n.tag === 'details'); detail.open = true; detail.ontoggle(); await tick();
  const find = text => descendants(detail).find(n => n.textContent === text);
  return { detail, find, calls, writes: () => calls.filter(c => c.opts), all: () => descendants(detail) };
}
const reviewed = { revision: 7, content_sha256: 'a'.repeat(64), reviewed_by: 'owner-id', approved_for_draft_selection: true, menu_item_ids: ['menu-real-id'], theme: 'Signature', visual_type: 'product' };
test('opening review does not approve; explicit save uses actual selected catalog IDs and opt-in', async () => {
  const h = await setup(); assert.equal(h.writes().length, 0);
  assert.ok(h.calls.some(call => call.path === '/api/hub/owner/marketing-asset-registry?asset_key=marketing-library%2Fphoto.jpg'));
  const consent = h.all().find(n => n.className === 'photo-reuse-optin').children[0]; assert.equal(consent.checked, false);
  h.find('Save reuse review').onclick(); assert.equal(h.writes().length, 0);
  h.all().find(n => n.value === 'tray-real-id').checked = true;
  h.all().find(n => n.type === 'text').value = ' Signature ';
  h.all().find(n => n.tag === 'select').value = 'combo'; consent.checked = true;
  h.find('Save reuse review').onclick(); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes()[0].opts.body)), { asset_key: 'marketing-library/photo.jpg', expected_revision: 0, menu_item_ids: ['tray-real-id'], theme: 'Signature', visual_type: 'combo', approved_for_draft_selection: true });
  assert.match(h.all().map(n => n.textContent || '').join(' '), /does not approve a public post/);
});
test('existing permission can be revoked with revision alone despite unavailable live catalog', async () => {
  const h = await setup({ record: reviewed, catalog: false });
  assert.equal(h.find('Save reuse review'), undefined);
  assert.ok(h.all().some(n => (n.textContent || '').includes(reviewed.content_sha256)));
  h.find('Stop team reuse').onclick(); await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(h.writes()[0].opts.body)), { op: 'revoke', asset_key: 'marketing-library/photo.jpg', expected_revision: 7 });
});
test('stale revision disables both mutation actions until explicit reload', async () => {
  const h = await setup({ record: reviewed, conflict: true });
  const save = h.find('Save reuse review'), revoke = h.find('Stop team reuse');
  save.onclick(); await tick(); assert.equal(h.writes()[0].opts.body.expected_revision, 7);
  assert.equal(save.disabled, true); assert.equal(revoke.disabled, true);
  revoke.onclick(); save.onclick(); assert.equal(h.writes().length, 1);
  assert.ok(h.all().some(n => (n.textContent || '').startsWith('Not saved.')));
  h.find('Reload saved review').onclick(); await tick(); assert.notEqual(h.find('Save reuse review'), save);
});
test('missing migration and incomplete registry never become an unchecked new approval', async () => {
  for (const settings of [{ unavailable: true }, { truncated: true }]) {
    const h = await setup(settings); assert.equal(h.find('Save reuse review'), undefined);
    assert.equal(h.find('Stop team reuse'), undefined); assert.equal(h.writes().length, 0);
    assert.ok(h.find('Reload saved review'));
  }
});
