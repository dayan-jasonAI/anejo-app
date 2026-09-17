import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const code = read('public/hub/owner/assets/marketing-library.js');
function node() { return { value: '', dataset: {}, children: [], style: {}, append(...n) { this.children.push(...n); }, prepend(n) { this.children.unshift(n); }, replaceChildren() { this.children = []; } }; }
const tick = () => new Promise((r) => setTimeout(r, 0));
function harness(fail = false) {
  const names = ['status', 'folder', 'files', 'grid', 'empty', 'more', 'refresh', 'drop'];
  const nodes = Object.fromEntries(names.map((n) => [n, node()]));
  const root = node(); root.querySelector = (s) => nodes[s.match(/data-photo-(.*)\]/)[1]];
  root.querySelectorAll = () => Object.values(nodes);
  const calls = [], chosen = [];
  const photo = { media_key: 'marketing-library/photo.jpg', content_type: 'image/jpeg', name: '<Event>.jpg', folder: 'Birthday', url: '/api/hub/media/marketing-library/photo.jpg' };
  const context = { document: { getElementById: () => root, createElement: () => node() }, window: { MarketingTabs: { confirmPhotoDraft: () => true, pickLibraryPhoto: async (p) => chosen.push(p) } }, Hub: { api: async (path, opts) => { calls.push({ path, opts }); if (fail) return { error: 'Storage unavailable' }; return opts ? { ok: true, photo } : { ok: true, photos: [photo], cursor: null }; } }, FileReader: class { readAsDataURL() { this.result = 'data:image/jpeg;base64,/9j/'; this.onload(); } }, Set };
  vm.runInNewContext(code, context); context.window.MarketingPhotoLibrary.mount();
  return { nodes, calls, chosen };
}
test('photo selection opens existing composer without a mutation, and filenames are text', async () => {
  const h = harness(); await tick();
  const card = h.nodes.grid.children[0];
  assert.equal(card.children[1].textContent, '<Event>.jpg');
  card.children.find((n) => n.textContent === 'Start a post').onclick(); await tick();
  assert.equal(h.chosen.length, 1);
  assert.equal(h.calls.filter((c) => c.opts).length, 0);
});
test('multi-file upload preserves valid files and reports invalid ones without publishing', async () => {
  const h = harness(); await tick(); h.nodes.folder.value = 'Celebration';
  h.nodes.files.files = [{ name: 'good.jpg', type: 'image/jpeg', size: 10 }, { name: 'bad.gif', type: 'image/gif', size: 10 }];
  h.nodes.files.onchange(); await tick();
  const writes = h.calls.filter((c) => c.opts);
  assert.equal(writes.length, 1); assert.equal(writes[0].path, '/api/hub/owner/marketing-library');
  assert.equal(writes[0].opts.body.folder, 'Celebration');
  assert.match(h.nodes.status.textContent, /1 photo\(s\) saved/); assert.match(h.nodes.status.textContent, /bad.gif/);
});
test('failed library load is an error, not an empty collection', async () => {
  const h = harness(true); await tick();
  assert.equal(h.nodes.status.textContent, 'Storage unavailable'); assert.equal(h.nodes.empty.hidden, true);
});
test('workspace has photo entry, draft selection clears schedule, and caption preview requires acceptance', () => {
  const page = read('public/hub/owner/marketing.html');
  for (const m of page.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
  assert.match(page, /data-tab="photos"/);
  assert.match(read('public/hub/marketing/index.html'), /marketing.html#photos/);
  const picker = page.slice(page.indexOf('window.MarketingTabs.pickLibraryPhoto'), page.indexOf('  var WORD'));
  assert.doesNotMatch(picker, /scheduled_at|op:\s*'publish'|method:\s*'POST'/);
  assert.match(picker, /DATA = d;/);
  const preview = page.slice(page.indexOf('var captionGenerate'), page.indexOf("var save = document.getElementById('save')"));
  assert.match(preview, /marketing-caption/); assert.match(preview, /window.confirm/); assert.doesNotMatch(preview, /scheduled_at|op:\s*'draft'|op:\s*'publish'/);
});
